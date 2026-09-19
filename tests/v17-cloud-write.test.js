// CR-V17-AWS-CONNECT-001 step 3 — the scanner sends its movements to the shared database.
//
// The client half: what goes on the wire, and what the app does with the answer. The server half
// is in api/test/writes.test.mjs.

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
    },
    crypto: { randomUUID: () => "0000-1111-2222" }
  };
  global.fetch = (url, options = {}) => {
    calls.push({ url, options, body: options.body ? JSON.parse(options.body) : null });
    const next = responses.shift();
    if (!next) return Promise.reject(new Error("no stubbed response"));
    if (next.networkError) return Promise.reject(new Error("offline"));
    return Promise.resolve({
      ok: next.status === undefined || (next.status >= 200 && next.status < 300),
      status: next.status || 200,
      text: () => Promise.resolve(JSON.stringify(next.body || {})),
      json: () => Promise.resolve(next.body || {})
    });
  };
  delete require.cache[require.resolve("../cloud.js")];
  return { cloud: require("../cloud.js"), calls };
}

const authResult = { AuthenticationResult: { IdToken: "id-token", RefreshToken: "r", ExpiresIn: 3600 } };

const movement = {
  clientId: "m-1234", direction: "OUT", driverEmployee: "E1001", vehicleBarcode: "G0001",
  location: "Division Street", authorizationStatus: "Authorized", driverEntryMethod: "scanner_field",
  vehicleEntryMethod: "scanner_field", submittedBy: "Division Street Scanner", deviceId: "D0001",
  occurredAt: "2026-09-18T19:58:00.000Z"
};

test("a movement is posted as JSON with the sign-in token", async () => {
  const { cloud, calls } = loadCloud({ responses: [{ body: authResult }, { status: 201, body: { id: 7, clientId: "m-1234" } }] });
  await cloud.signIn("raul", "a-password");
  await cloud.recordMovement(movement);
  const sent = calls[calls.length - 1];
  assert.match(sent.url, /\/v1\/movements$/);
  assert.equal(sent.options.method, "POST");
  assert.equal(sent.options.headers["content-type"], "application/json");
  assert.equal(sent.options.headers.authorization, "id-token");
  assert.deepEqual(sent.body, movement);
});

test("the id is made on the device, so a retry is recognised rather than recorded twice", () => {
  const { cloud } = loadCloud();
  assert.equal(cloud.movementId(), "m-0000-1111-2222");
});

test("an id is still made where the browser has no randomUUID", () => {
  const { cloud } = loadCloud();
  delete global.window.crypto;
  const first = cloud.movementId();
  const second = cloud.movementId();
  assert.match(first, /^m-/);
  assert.notEqual(first, second);
});

test("a movement the database already had is reported as already recorded, not as an error", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult }, { status: 200, body: { id: 7, clientId: "m-1234", duplicate: true } }] });
  await cloud.signIn("raul", "a-password");
  const result = await cloud.recordMovement(movement);
  assert.equal(result.alreadyRecorded, true);
  assert.equal(result.id, 7);
});

test("a flag from the server comes back with the movement", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult }, { status: 201, body: { id: 8, conflict: "authorization_expired", delayed: true, vehicleAdded: true } }] });
  await cloud.signIn("raul", "a-password");
  const result = await cloud.recordMovement(movement);
  assert.equal(result.conflict, "authorization_expired");
  assert.equal(result.delayed, true);
  assert.equal(result.vehicleAdded, true);
});

test("a refused movement says why, in words a supervisor can act on", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult }, { status: 422, body: { error: "unknown_driver", message: "Employee E9999 is not in the shared roster." } }] });
  await cloud.signIn("raul", "a-password");
  await assert.rejects(() => cloud.recordMovement(movement), /not in the shared roster/);
});

test("each flag reads as a sentence, and an unknown one still reads as something", () => {
  const { cloud } = loadCloud();
  assert.equal(cloud.conflictText("license_expired"), "the driver's license has expired");
  assert.equal(cloud.conflictText("authorization_expired"), "the records show no authorization for that driver now");
  assert.equal(cloud.conflictText("override_needs_scan"), "the location override covers scanned badges only");
  assert.equal(cloud.conflictText("something_new"), "the records disagree with what the gate recorded");
  assert.equal(cloud.conflictText(""), "");
});

// --- the app around it ----------------------------------------------------

test("every movement is saved with a device-made id and a sharing state", () => {
  assert.ok(app.includes("clientId: window.VeriGateCloud ? window.VeriGateCloud.movementId() : makeId(\"m\")"));
  assert.ok(app.includes('sync: "local"'));
});

test("the movement is saved on the device before it is sent", () => {
  const saved = app.indexOf("state.transactions.unshift(transaction);");
  const sent = app.search(/ui\.lastSubmittedClientId = transaction\.clientId;\r?\n\s*syncDevice\(\);/);
  assert.ok(saved > 0 && sent > saved, "the local record must not depend on the upload");
});

test("a failed upload leaves the movement on the device and says it is not shared yet", () => {
  assert.ok(app.includes('item.sync = "pending";'));
  assert.ok(app.includes("Saved on this device. Not in the shared records yet:"));
});

test("a flagged movement is written into the audit trail as well as shown", () => {
  assert.ok(app.includes('addAudit("movement_flagged_by_records"'));
  assert.ok(app.includes("Saved and shared, but flagged for review:"));
});

test("nothing is uploaded when nobody is signed in", () => {
  assert.ok(app.includes("if (syncRunning || !cloudReady()) {"));
});
