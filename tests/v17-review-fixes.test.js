// CR-V17-AWS-CONNECT-001 — faults found in the review after step 4, on the device side.
//
// Each of these was demonstrated before it was fixed: storage filling up and saving switching itself
// off, two tabs erasing each other's unsent movements, flags that blamed the driver for what the
// device simply had not shared yet, an unescaped column, a refresh race and a crash on sign-out.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function loadCloud({ responses = [] } = {}) {
  const calls = [];
  const box = new Map();
  global.window = {
    sessionStorage: {
      getItem: (key) => (box.has(key) ? box.get(key) : null),
      setItem: (key, value) => box.set(key, String(value)),
      removeItem: (key) => box.delete(key)
    }
  };
  global.fetch = (url, options = {}) => {
    calls.push({ url, target: (options.headers || {})["x-amz-target"] || "" });
    const next = responses.shift();
    if (!next) return Promise.reject(new Error("no stubbed response"));
    return new Promise((resolve) => setTimeout(() => resolve({
      ok: true, status: 200,
      text: () => Promise.resolve(JSON.stringify(next)),
      json: () => Promise.resolve(next)
    }), 5));
  };
  delete require.cache[require.resolve("../cloud.js")];
  return { cloud: require("../cloud.js"), calls, box };
}

// --- storage filling up ---------------------------------------------------

test("a failed save no longer switches saving off for the rest of the session", () => {
  const save = app.slice(app.indexOf("function saveState() {"), app.indexOf("function writeState() {"));
  assert.ok(!save.includes("storageAvailable = false"), "every later save must still be attempted");
});

test("when storage is full, confirmed history is trimmed and the save tried again", () => {
  assert.ok(app.includes("if (pruneSharedHistory(1) && writeState()) return true;"));
});

test("only movements the shared database has confirmed are ever trimmed", () => {
  assert.ok(app.includes('const confirmedAndOld = item.clientId && item.sync === "shared" && new Date(item.timestamp).getTime() < cutoff;'));
});

test("a movement's audit entries are tied to it, and trimmed with it and never before it", () => {
  assert.ok(app.includes("event.movementClientId = transaction.clientId;"));
  assert.ok(app.includes("if (event.movementClientId && trimmed.has(event.movementClientId)) return false;"));
  assert.ok(app.includes("flagged.movementClientId = transaction.clientId;"));
  assert.ok(app.includes("refusal.movementClientId = transaction.clientId;"));
});

test("a device that cannot save says so, and stops saying 'saved' for anything after", () => {
  assert.ok(app.includes('const SAVE_FAILED_NOTICE = "This device could not save. The latest movements are NOT stored on it. Do not close the app - call a supervisor.";'));
  assert.ok(app.includes('if (ui.saveFailed && tone !== "danger") { message = SAVE_FAILED_NOTICE; tone = "danger"; }'));
});

// --- two tabs -------------------------------------------------------------

test("each save first takes in what another tab saved", () => {
  const save = app.slice(app.indexOf("function saveState() {"), app.indexOf("function writeState() {"));
  const merge = save.indexOf("mergeFromStorage();");
  const write = save.indexOf("writeState()");
  // Both must be present: a missing call reads as position -1, which is "before" everything.
  assert.ok(merge >= 0, "saveState must merge another tab's records");
  assert.ok(write >= 0, "saveState must write");
  assert.ok(merge < write, "merge must come before the write");
});

test("another tab's save is taken in as it happens, not only at the next save", () => {
  assert.ok(app.includes('window.addEventListener("storage", (event) => {'));
  assert.ok(app.includes("if (mergeFromStorage()) renderAll();"));
});

test("a movement another tab already sent is not sent again", () => {
  assert.ok(app.includes('const SYNC_RANK = { local: 0, pending: 1, sending: 2, refused: 3, shared: 3 };'));
  assert.ok(app.includes("(SYNC_RANK[item.sync] || 0) > (SYNC_RANK[mine.sync] || 0)"));
});

test("resetting the demo starts a new epoch, so another tab cannot merge the old records back", () => {
  assert.ok(app.includes("fresh.resetEpoch = Date.now();"));
  assert.ok(app.includes("(stored.resetEpoch || 0) !== (state.resetEpoch || 0)"));
});

// --- truthful flags -------------------------------------------------------

test("each movement carries the authorization the device relied on", () => {
  assert.ok(app.includes("deviceAuthorization: auth ? { validFrom: auth.validFrom, expiresAt: auth.expiresAt, authorizedBy: auth.authorizedBy } : null"));
  assert.ok(app.includes("deviceAuthorization: transaction.deviceAuthorization || null"));
});

test("the new flags read as sentences a supervisor can act on", () => {
  const { cloud } = loadCloud();
  assert.match(cloud.conflictText("authorization_not_shared"), /granted on this device and is not in the shared records yet/);
  assert.match(cloud.conflictText("device_clock_ahead"), /clock is ahead/);
  assert.match(cloud.conflictText("device_clock_behind"), /weeks old/);
});

// --- smaller faults -------------------------------------------------------

test("every column of a search row is escaped, including the direction", () => {
  assert.ok(app.includes("${escapeHtml(String(item.direction).toLowerCase())}"));
  assert.ok(!app.includes('<span class="movement-chip ${item.direction.toLowerCase()}">${item.direction}</span>'));
});

test("Escape closes the sign-in panel, except while it waits for a new password", () => {
  assert.ok(app.includes('if (event.key === "Escape" && !el.cloudSignInModal.classList.contains("hidden") && !ui.cloudChallenge) closeCloudSignIn();'));
});

test("requests that find the token expired together share one refresh", async () => {
  const { cloud, calls, box } = loadCloud({
    responses: [
      { AuthenticationResult: { IdToken: "fresh", ExpiresIn: 3600 } },
      { movements: [], next: null, total: 0 },
      { movements: [], next: null, total: 0 }
    ]
  });
  // A tab reopened with a token that has just run out: start() begins a refresh, and a search and
  // the queue both ask for records before it finishes.
  box.set("veri-gate.cloud.session.v1", JSON.stringify({ username: "raul", idToken: "stale", refreshToken: "r", expiresAt: new Date(Date.now() - 1000).toISOString() }));
  cloud.start();
  await Promise.all([cloud.movements({}), cloud.movements({})]);
  const refreshes = calls.filter((call) => call.target === "AWSCognitoIdentityProviderService.InitiateAuth");
  assert.equal(refreshes.length, 1, "one refresh, shared");
});

test("signing out while a request is in flight is reported as a sign-out, not a crash", () => {
  const cloudSource = fs.readFileSync(path.join(root, "cloud.js"), "utf8");
  assert.ok(cloudSource.includes('if (!session) throw new CloudError("Sign in to read the shared records.", "auth");'));
});

// --- the test harness (found while re-running the validator) ---------------
//
// With tabs merging each other's records, a signed-in tab absorbed the validator's test movements
// and its queue uploaded 24 of them to the dev database. The harness must never feed the queue or
// another tab.

test("inside the validator, movements get no shared-records id, so nothing can upload them", () => {
  const detection = app.slice(app.indexOf("const IN_TEST_HARNESS = (() => {"), app.indexOf('const IN_TEST_HARNESS = (() => {') + 400);
  assert.ok(detection.includes("window.top !== window"), "only a framed copy can be the harness");
  assert.ok(detection.includes("gateflow-validator"), "and only inside the validator page");
  assert.ok(app.includes("clientId: IN_TEST_HARNESS ? undefined :"));
  // And a movement without an id is never queued.
  assert.ok(app.includes("state.transactions.filter((item) => item.clientId && SYNC_WAITING.includes(item.sync))"));
});

test("inside the validator, the cloud client and the queue are never started", () => {
  assert.ok(app.includes("if (!window.VeriGateCloud || IN_TEST_HARNESS) return;"));
});

test("the validator's saves carry their own epoch, so no open tab merges them in", () => {
  assert.ok(app.includes('const HARNESS_EPOCH = "test-harness";'));
  assert.ok(app.includes("if (IN_TEST_HARNESS) state.resetEpoch = HARNESS_EPOCH;"));
  const save = app.slice(app.indexOf("function saveState() {"), app.indexOf("function writeState() {"));
  const tag = save.indexOf("state.resetEpoch = HARNESS_EPOCH");
  const merge = save.indexOf("mergeFromStorage();");
  assert.ok(tag >= 0 && merge >= 0 && tag < merge, "the epoch must be set before anything is merged or written");
});

test("a frame from another origin is not mistaken for the validator", () => {
  // Reading window.top.location throws across origins; that must mean "not the harness".
  assert.match(app, /catch \(error\) \{\r?\n\s*\/\/ A frame from another origin: not our validator, and not something to trust either\.\r?\n\s*return false;/);
});
