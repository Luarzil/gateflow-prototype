// The gate log names the login that recorded a movement, not only the gate it came from.
//
// The service has stored this since migration 004 (uploaded_by), and the movements query returns
// it, but cloud.js was dropping it when it mapped a row. So the console could say a movement came
// from "Division Street Scanner" and never which login recorded it - which is the question an audit
// actually asks. Found while writing the shot list for the service video: the script called for a
// shot the app could not produce.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const cloudSource = fs.readFileSync(path.join(root, "cloud.js"), "utf8");

const KEY = "veri-gate.cloud.session.v1";
const token = (claims) => `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;

function store() {
  const box = new Map();
  return {
    box,
    getItem: (key) => (box.has(key) ? box.get(key) : null),
    setItem: (key, value) => box.set(key, String(value)),
    removeItem: (key) => box.delete(key)
  };
}

function loadCloud(rows) {
  const session = store();
  // An unexpired sign-in, so the read happens instead of being refused.
  session.setItem(KEY, JSON.stringify({
    username: "raul",
    idToken: token({ "cognito:groups": ["Admin"], name: "Raul Hernandez" }),
    refreshToken: "r",
    expiresAt: new Date(Date.now() + 3600 * 1000).toISOString()
  }));
  global.window = { sessionStorage: session, localStorage: store() };
  global.fetch = () => Promise.resolve({
    ok: true, status: 200,
    text: () => Promise.resolve(JSON.stringify({ movements: rows, next: null, total: rows.length }))
  });
  delete require.cache[require.resolve("../cloud.js")];
  const cloud = require("../cloud.js");
  cloud.start();
  return cloud;
}

test("a movement carries the login that recorded it, through to the app", async () => {
  const cloud = loadCloud([{
    id: 102, client_id: "m-1", direction: "IN", driver_employee: "E1003", driver_name: "Tyrone Brooks",
    vehicle_barcode: "G0901", vin: "", plate: "", location: "Division Street",
    authorization_status: "Authorized", note: "", submitted_by: "Division Street Scanner",
    occurred_at: "2026-09-19T19:07:55.134Z", received_at: "2026-09-19T19:07:56.000Z",
    uploaded_by: "d0001"
  }]);
  const page = await cloud.movements({});
  const row = page.movements[0];
  assert.equal(row.uploadedBy, "d0001", "the login must survive the mapping");
  assert.equal(row.submittedBy, "Division Street Scanner", "and the gate it came from is still there");
});

test("a movement with no login recorded is left empty, never guessed", async () => {
  const cloud = loadCloud([{
    id: 7, client_id: "m-old", direction: "OUT", driver_employee: "E1001", driver_name: "Nina Patel",
    vehicle_barcode: "G0001", vin: "", plate: "", location: "Division Street",
    authorization_status: "Authorized", note: "", submitted_by: "Division Street Scanner",
    occurred_at: "2026-09-01T10:00:00.000Z", received_at: "2026-09-01T10:00:01.000Z"
  }]);
  const page = await cloud.movements({});
  assert.equal(page.movements[0].uploadedBy, "", "movements from before sign-in have no login to name");
});

test("the gate log shows the gate and the login as two separate columns", () => {
  assert.match(html, /<th>Gate device<\/th><th>Recorded by<\/th>/);
  assert.ok(app.includes('<td>${escapeHtml(item.submittedBy)}</td><td>${escapeHtml(item.uploadedBy || "-")}</td>'));
});

test("the empty-log row still spans every column", () => {
  const headers = (html.match(/<th>[^<]*<\/th>/g) || []).length;
  assert.ok(app.includes('colspan="14"'), "the empty message must span all 14 columns");
  assert.ok(!app.includes('colspan="13"'), "the old 13-column span is gone");
  assert.ok(headers >= 14, "and the table really does have that many headers");
});

test("the login is escaped like every other column", () => {
  assert.ok(app.includes('${escapeHtml(item.uploadedBy || "-")}'), "never interpolated raw");
});

test("cloud.js reads the field the service actually sends", () => {
  // The service column is uploaded_by; a mapping to any other name silently yields blanks.
  assert.ok(cloudSource.includes("uploadedBy: item.uploaded_by || \"\","));
});
