// CR-V17-AWS-CONNECT-001 step 4 — the offline queue.
//
// Patrick: outages "could be minutes or days", and "Enterprise will not tolerate a pause". So the
// gate never waits for the network; movements wait on the device and go when they can. These check
// the queue's decisions for real, against a stubbed sender: order, what stops it, what it sets
// aside, and that nothing is ever dropped.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function loadCloud() {
  global.window = { sessionStorage: { getItem: () => null, setItem() {}, removeItem() {} } };
  global.fetch = () => Promise.reject(new Error("no network in this test"));
  delete require.cache[require.resolve("../cloud.js")];
  return require("../cloud.js");
}

const CloudError = () => loadCloud().internals.CloudError;
const failure = (kind, status) => { const E = CloudError(); return new E(`${kind} ${status || ""}`.trim(), kind, status); };

// A sender that answers from a script, one entry per call, and records what it was asked.
function scriptedSender(script) {
  const sent = [];
  return {
    sent,
    send(item) {
      sent.push(item.id);
      const next = script.shift();
      if (next instanceof Error) return Promise.reject(next);
      return Promise.resolve(next || { id: item.id });
    }
  };
}

const items = (...ids) => ids.map((id) => ({ id }));

// --- order and completeness -----------------------------------------------

test("the queue sends everything, one at a time, in the order given", async () => {
  const cloud = loadCloud();
  const sender = scriptedSender([]);
  const done = [];
  const summary = await cloud.drainQueue(items("a", "b", "c"), sender.send, { sent: (item) => done.push(item.id) });
  assert.deepEqual(sender.sent, ["a", "b", "c"]);
  assert.deepEqual(done, ["a", "b", "c"]);
  assert.deepEqual(summary, { sent: 3, refused: 0, stopped: null });
});

test("one at a time means the second is not sent before the first has answered", async () => {
  const cloud = loadCloud();
  const log = [];
  let release;
  const first = new Promise((resolve) => { release = resolve; });
  const pending = cloud.drainQueue(items("a", "b"), (item) => {
    log.push(`start ${item.id}`);
    return item.id === "a" ? first.then(() => { log.push("end a"); return {}; }) : Promise.resolve({});
  });
  await new Promise((resolve) => setTimeout(resolve, 10));
  assert.deepEqual(log, ["start a"], "b must wait for a");
  release();
  await pending;
  assert.deepEqual(log, ["start a", "end a", "start b"]);
});

test("an empty queue finishes at once and sends nothing", async () => {
  const cloud = loadCloud();
  const sender = scriptedSender([]);
  assert.deepEqual(await cloud.drainQueue([], sender.send), { sent: 0, refused: 0, stopped: null });
  assert.deepEqual(sender.sent, []);
});

// --- what stops it --------------------------------------------------------

test("no signal stops the queue, and nothing after it is attempted", async () => {
  const cloud = loadCloud();
  const sender = scriptedSender([{}, failure("offline")]);
  const summary = await cloud.drainQueue(items("a", "b", "c"), sender.send);
  assert.deepEqual(sender.sent, ["a", "b"], "c must not be tried once the signal is gone");
  assert.equal(summary.sent, 1);
  assert.equal(summary.stopped.action, "retry");
  assert.equal(summary.stopped.item.id, "b");
});

test("a waking database stops the queue to be tried again, not refused", async () => {
  const cloud = loadCloud();
  const summary = await cloud.drainQueue(items("a"), scriptedSender([failure("waking", 503)]).send);
  assert.equal(summary.stopped.action, "retry");
  assert.equal(summary.refused, 0);
});

test("an expired sign-in stops the queue until somebody signs in", async () => {
  const cloud = loadCloud();
  const summary = await cloud.drainQueue(items("a", "b"), scriptedSender([failure("auth", 401)]).send);
  assert.equal(summary.stopped.action, "signin");
  assert.equal(summary.refused, 0);
});

test("a server fault or rate limit is retried, never refused", () => {
  const cloud = loadCloud();
  assert.equal(cloud.failureAction(failure("request", 500)), "retry");
  assert.equal(cloud.failureAction(failure("request", 502)), "retry");
  assert.equal(cloud.failureAction(failure("request", 429)), "retry");
  assert.equal(cloud.failureAction(failure("request", 408)), "retry");
  // A failure with no status at all is treated as the network, not as a verdict.
  assert.equal(cloud.failureAction(failure("request", 0)), "retry");
  assert.equal(cloud.failureAction(new Error("something odd")), "retry");
});

// --- what it sets aside ---------------------------------------------------

test("a movement the server will never accept is set aside, and the queue carries on", async () => {
  const cloud = loadCloud();
  const refused = [];
  const sender = scriptedSender([{}, failure("request", 422), {}]);
  const summary = await cloud.drainQueue(items("a", "b", "c"), sender.send, { refused: (item, error) => refused.push([item.id, error.status]) });
  assert.deepEqual(sender.sent, ["a", "b", "c"], "one bad record must not hold up everything behind it");
  assert.deepEqual(refused, [["b", 422]]);
  assert.deepEqual({ sent: summary.sent, refused: summary.refused, stopped: summary.stopped }, { sent: 2, refused: 1, stopped: null });
});

test("a malformed record (400) is refused; so is a forbidden one (403 is sign-in, not refusal)", () => {
  const cloud = loadCloud();
  assert.equal(cloud.failureAction(failure("request", 400)), "refuse");
  assert.equal(cloud.failureAction(failure("request", 422)), "refuse");
  assert.equal(cloud.failureAction(failure("auth", 403)), "signin");
});

// --- the app around it ----------------------------------------------------

test("every movement is saved on the device before the queue is asked to send anything", () => {
  const saved = app.indexOf("state.transactions.unshift(transaction);");
  const queued = app.search(/ui\.lastSubmittedClientId = transaction\.clientId;\r?\n\s*syncDevice\(\);/);
  assert.ok(saved > 0 && queued > saved);
});

test("only movements with a device id are queued, so the demo seed is never sent", () => {
  assert.ok(app.includes("state.transactions.filter((item) => item.clientId && SYNC_WAITING.includes(item.sync)).reverse()"));
});

test("the queue is sent oldest first", () => {
  // state.transactions is newest first, so the queue reverses it.
  assert.match(app, /SYNC_WAITING\.includes\(item\.sync\)\)\.reverse\(\)/);
});

test("a movement caught mid-send when the app closed is sent again on the next start", () => {
  assert.ok(app.includes('if (item.sync === "sending") { item.sync = "pending"; recovered += 1; }'));
});

test("anything the queue did not reach goes back to waiting, with the reason", () => {
  assert.ok(app.includes('if (item.sync !== "sending") return;'));
  assert.ok(app.includes("item.syncError = reason;"));
});

test("a fault inside the queue itself can never lose a movement", () => {
  assert.ok(app.includes('waiting.forEach((item) => { if (item.sync === "sending") item.sync = "pending"; });'));
});

test("the queue runs when the signal returns, on sign-in, after a scan, and every minute", () => {
  assert.ok(app.includes('window.addEventListener("online", () => { syncDevice(); });'));
  assert.ok(app.includes("if (status.signedIn) syncDevice().then(() => pullReference());"));
  // Since the shared drivers and vehicles: the minute check sends movements and changes alike.
  assert.match(app, /setInterval\(\(\) => \{\r?\n\s*if \(syncQueue\(\)\.length\) syncDevice\(\);/);
  assert.ok(app.includes("const SYNC_RETRY_MS = 60000;"));
});

test("two runs of the queue cannot overlap and send the same movement twice at once", () => {
  assert.ok(app.includes("if (syncRunning || !cloudReady()) {"));
  assert.ok(app.includes("syncRunning = false;"));
});

test("with no signal the queue does not even try", () => {
  assert.ok(app.includes("navigator.onLine === false"));
});

test("a refused movement is kept on the device and written into the audit trail", () => {
  assert.ok(app.includes('transaction.sync = "refused";'));
  assert.ok(app.includes('addAudit("movement_refused_by_records"'));
  assert.ok(app.includes("The movement is kept on this device."));
});

test("the operator hears only about the movement they just recorded", () => {
  assert.ok(app.includes("return Boolean(ui.lastSubmittedClientId) && transaction.clientId === ui.lastSubmittedClientId;"));
});

test("the scanner shows how many movements are waiting, and hides the line at zero", () => {
  assert.ok(html.includes('<p class="sync-status hidden" id="syncStatus" role="status"></p>'));
  assert.ok(app.includes('el.syncStatus.classList.toggle("hidden", parts.length === 0);'));
  assert.ok(app.includes("waiting to reach the shared records."));
});
