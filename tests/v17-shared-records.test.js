// CR-V17-AWS-CONNECT-001 — drivers, vehicles, authorizations and override switches, shared.
//
// These run the app's own functions, lifted out of app.js into a sandbox, rather than checking the
// source for wording: what is queued when something changes, what is taken in from the shared
// records, and above all what is left alone.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `app.js has no function ${name}`);
  let depth = 0;
  for (let index = app.indexOf("{", start); index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") { depth -= 1; if (depth === 0) return app.slice(start, index + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}

function constantSource(name) {
  const match = new RegExp(`const ${name} = [^;]+;`).exec(app);
  assert.ok(match, `app.js has no const ${name}`);
  return match[0];
}

const SECTION_START = app.indexOf("// --- CR-V17: drivers, vehicles, authorizations and override switches, shared");
const SECTION_END = app.indexOf("function findDriver(value) {");

function sandbox({ harness = false } = {}) {
  let ids = 0;
  const notices = [];
  const context = {
    console, Date, JSON, Math, Number, String, Object, Array, Set, Map, Promise,
    window: { VeriGateCloud: { changeId: () => `c-${++ids}`, status: () => ({ signedIn: true, username: "raul" }) } },
    document: { visibilityState: "visible" },
    navigator: { onLine: true },
    IN_TEST_HARNESS: harness,
    notices,
    ui: {},
    state: null
  };
  vm.createContext(context);
  const helpers = [
    "dateKey", "normalize", "normalizeScanOverride", "canonicalEmployeeId", "canonicalVehicleBarcode", "normalizeLocationName",
    "canonicalSupervisorId", "findDriverAny", "normalizeEmployee", "normalizeVehicle", "queuedMovements", "refusedMovements"
  ].map(functionSource).join("\n");
  const constants = ["SCAN_CREATED_SOURCE", "COMPLETE_STATUS", "SYNC_WAITING", "SYNC_RANK", "TEMP_AUTHORIZATION_DURATION", "AUTHORIZATION_DURATIONS", "DESKTOP_USER_ROLES", "OVERRIDE_MIN_ROLE"].map(constantSource).join("\n");
  vm.runInContext(`${constants}
    ${helpers}
    function addAudit(type, description) { const event = { type, description }; state.auditEvents.unshift(event); return event; }
    function setNotice(message, tone) { notices.push({ message, tone }); }
    function cloudReady() { return true; }
    function saveState() { recordLocalChanges(); }
    function renderAll() {}
    ${app.slice(SECTION_START, SECTION_END)}
    this.api = { recordLocalChanges, syncQueue, applyReference, mergeChanges, queuedChanges, changePayload, markChangeRefused, normalizeVehicle, differs };`, context);
  return context;
}

const HOUR = 3600000;

function seedState() {
  const now = Date.now();
  return {
    drivers: [
      { employeeNumber: "E1001", name: "Nina Patel", licenseExpires: new Date("2027-01-10T12:00:00").toISOString(), active: true },
      { employeeNumber: "E1003", name: "Tyrone Brooks", licenseExpires: new Date("2026-12-01T12:00:00").toISOString(), active: true }
    ],
    vehicles: [
      { id: "veh-001", assignedBarcode: "G0001", vin: "1HGCM82633A004352", plate: "TRK-8877", make: "Ford", model: "Transit", year: 2022, color: "White", active: true, createdSource: "seed", barcodeNeedsReview: false }
    ],
    authorizations: [
      { id: "auth-001", driverEmployee: "E1001", type: "9_hours", validFrom: new Date(now - HOUR).toISOString(), expiresAt: new Date(now + 8 * HOUR).toISOString(), status: "active", authorizedBy: "System seed", location: "Division Street" }
    ],
    locations: [{ name: "Division Street", active: true, scanOverride: { enabled: false, changedBy: "", changedAt: "" } }],
    supervisors: [{ id: "S2040", name: "Jordan Wells", role: "Fleet Lead" }],
    transactions: [],
    auditEvents: [],
    outbox: []
  };
}

function started(options) {
  const box = sandbox(options);
  box.state = seedState();
  box.api.recordLocalChanges();
  return box;
}

const serverReference = (overrides = {}) => ({
  drivers: [
    { employee_number: "E1001", name: "Nina Patel", license_expires: "2027-01-10", active: true },
    { employee_number: "E2001", name: "Dana Fox", license_expires: "2027-03-01", active: true }
  ],
  vehicles: [{ id: 1, client_id: null, assigned_barcode: "G0001", vin: "1HGCM82633A004352", plate: "TRK-8877", make: "Ford", model: "Transit", year: 2022, color: "White", active: true, created_source: "seed", barcode_needs_review: false }],
  authorizations: [],
  locations: [{ name: "Division Street", active: true, historical_only: false, scan_override_enabled: false, scan_override_changed_by: null, scan_override_changed_at: null }],
  approvers: [{ badge_id: "S2040", name: "Jordan Wells", role: "Fleet Lead" }],
  ...overrides
});

// --- going out ------------------------------------------------------------------------

test("what a device already holds when sharing begins is not sent; the first read settles it", () => {
  const box = started();
  assert.equal(box.api.queuedChanges().length, 0);
  assert.ok(box.state.refShadow["driver:E1001"], "but it is remembered, so a later edit is noticed");
});

test("editing a driver queues exactly one change, with the licence as a date", () => {
  const box = started();
  box.state.drivers[1].name = "Tyrone K. Brooks";
  assert.equal(box.api.recordLocalChanges(), 1);
  assert.equal(box.api.recordLocalChanges(), 0, "saving again with nothing changed sends nothing");
  const [change] = box.api.queuedChanges();
  assert.equal(change.kind, "driver");
  assert.equal(change.key, "driver:E1003");
  assert.equal(change.data.licenseExpires, "2026-12-01");
  assert.equal(change.data.name, "Tyrone K. Brooks");
});

test("a vehicle whose barcode changes says which barcode it had, and which shared vehicle it is", () => {
  const box = started();
  box.state.vehicles[0].serverId = 1;
  box.state.vehicles[0].assignedBarcode = "G0101";
  box.api.recordLocalChanges();
  const [change] = box.api.queuedChanges();
  assert.equal(change.data.previousBarcode, "G0001");
  assert.equal(change.data.serverId, 1);
});

test("an authorization running out is not sent, but one somebody revokes is", () => {
  const box = started();
  box.state.authorizations[0].status = "expired";
  assert.equal(box.api.recordLocalChanges(), 0, "every device works out expiry from the clock");
  box.state.authorizations[0].status = "revoked";
  box.state.authorizations[0].revokedAt = new Date().toISOString();
  box.state.authorizations[0].revokedBy = "Supervisor Console";
  assert.equal(box.api.recordLocalChanges(), 1);
  assert.equal(box.api.queuedChanges()[0].data.status, "revoked");
});

test("a gate approval names the approver's badge and rank for the server to check", () => {
  const box = started();
  box.state.authorizations.unshift({ id: "auth-9", driverEmployee: "E1003", type: "9_hours", validFrom: new Date().toISOString(), expiresAt: new Date(Date.now() + 9 * HOUR).toISOString(), status: "active", authorizedBy: "S2040 / Jordan Wells", location: "Linden" });
  box.api.recordLocalChanges();
  const [change] = box.api.queuedChanges();
  assert.equal(change.data.approverBadge, "S2040");
  assert.equal(change.data.authorizedRole, "Fleet Lead");
});

test("the authorization a Fleet Lead gave goes before the OUT it allowed", () => {
  const box = started();
  box.state.authorizations.unshift({ id: "auth-9", driverEmployee: "E1003", type: "9_hours", validFrom: new Date().toISOString(), expiresAt: new Date(Date.now() + 9 * HOUR).toISOString(), status: "active", authorizedBy: "S2040 / Jordan Wells" });
  box.api.recordLocalChanges();
  box.state.transactions.unshift({ id: "tx-1", clientId: "m-1", sync: "local", timestamp: new Date(Date.now() + 5).toISOString() });
  // And a movement recorded earlier, still waiting, goes before both.
  box.state.transactions.push({ id: "tx-0", clientId: "m-0", sync: "pending", timestamp: new Date(Date.now() - HOUR).toISOString() });
  assert.deepEqual(box.api.syncQueue().map((item) => item.clientId || item.kind), ["m-0", "authorization", "m-1"]);
});

test("inside the validator nothing is ever queued", () => {
  const box = started({ harness: true });
  box.state.drivers[0].name = "Changed";
  assert.equal(box.api.recordLocalChanges(), 0);
  assert.equal(box.state.outbox.length, 0);
});

test("a refused change says so, loudly, and names the record", () => {
  const box = started();
  box.state.locations[0].scanOverride = { enabled: true, changedBy: "Admin Console", changedAt: new Date().toISOString() };
  box.api.recordLocalChanges();
  const [change] = box.api.queuedChanges();
  box.api.markChangeRefused(change, { message: "Only an Admin can change a location's override switch." });
  assert.equal(change.sync, "refused");
  assert.equal(box.notices[0].tone, "danger");
  assert.match(box.notices[0].message, /override switch at Division Street/);
  assert.equal(box.state.auditEvents[0].type, "change_refused_by_records");
});

// --- coming in ------------------------------------------------------------------------

test("a driver added on another device arrives, and one the shared records never had goes", () => {
  const box = started();
  const changed = box.api.applyReference(serverReference(), Date.now());
  assert.ok(changed > 0);
  assert.deepEqual(box.state.drivers.map((driver) => driver.employeeNumber).sort(), ["E1001", "E2001"]);
  assert.equal(box.api.recordLocalChanges(), 0, "what was taken in is not sent straight back");
});

test("a record with a change still waiting to be sent is left as this device has it", () => {
  const box = started();
  box.state.drivers[0].name = "Nina P. (edited offline)";
  box.api.recordLocalChanges();
  box.api.applyReference(serverReference(), Date.now());
  assert.equal(box.state.drivers.find((driver) => driver.employeeNumber === "E1001").name, "Nina P. (edited offline)");
});

test("a record whose change arrived while the read was under way is left for the next read", () => {
  const box = started();
  box.state.drivers[0].name = "Nina P.";
  box.api.recordLocalChanges();
  const startedAt = Date.now() - 1000;
  Object.assign(box.state.outbox[0], { sync: "shared", sharedAt: new Date().toISOString() });
  box.api.applyReference(serverReference(), startedAt);
  assert.equal(box.state.drivers.find((driver) => driver.employeeNumber === "E1001").name, "Nina P.", "the read may predate the change");
});

test("an empty shared roster is not taken as an order to delete this device's", () => {
  const box = started();
  box.api.applyReference(serverReference({ drivers: [], vehicles: [] }), Date.now());
  assert.equal(box.state.drivers.length, 2);
  assert.equal(box.state.vehicles.length, 1);
});

test("a shared vehicle is matched to this device's copy by barcode and learns its server id", () => {
  const box = started();
  box.api.applyReference(serverReference(), Date.now());
  assert.equal(box.state.vehicles.length, 1);
  assert.equal(box.state.vehicles[0].id, "veh-001", "the device's id is kept until the shared records name one");
  assert.equal(box.state.vehicles[0].serverId, 1);
  box.api.applyReference(serverReference({ vehicles: [{ ...serverReference().vehicles[0], client_id: "veh-XYZ" }] }), Date.now());
  assert.equal(box.state.vehicles[0].id, "veh-XYZ", "then every device calls it the same");
  assert.equal(box.api.recordLocalChanges(), 0);
});

test("a vehicle met at the gate and not yet sent stays, even though the shared records lack it", () => {
  const box = started();
  box.state.vehicles.push({ id: "veh-new", assignedBarcode: "G0777", vin: "", plate: "", make: "", model: "", year: "", color: "", active: true, createdSource: "inbound_scan" });
  box.api.recordLocalChanges();
  box.api.applyReference(serverReference(), Date.now());
  assert.ok(box.state.vehicles.some((vehicle) => vehicle.assignedBarcode === "G0777"));
});

test("a revocation made on another device today reaches this one, so the override stops that driver here too", () => {
  const box = started();
  const now = Date.now();
  box.api.applyReference(serverReference({
    authorizations: [{ id: 40, client_id: "auth-001", driver_employee: "E1001", duration: "9_hours", status: "revoked", valid_from: new Date(now - HOUR).toISOString(), authorized_at: new Date(now - HOUR).toISOString(), expires_at: new Date(now + 8 * HOUR).toISOString(), authorized_by: "System seed", revoked_by: "Supervisor Console", revoked_at: new Date(now - 60000).toISOString(), revocation_reason: "Manual revocation", location: "Division Street", action_location: "Division Street" }]
  }), now);
  const auth = box.state.authorizations.find((item) => item.id === "auth-001");
  assert.equal(auth.status, "revoked");
  assert.ok(auth.revokedAt);
});

test("an active authorization the shared records never had is dropped; this device's ended ones are kept as history", () => {
  const box = started();
  box.state.authorizations.push({ id: "auth-old", driverEmployee: "E1003", type: "9_hours", validFrom: new Date(Date.now() - 50 * HOUR).toISOString(), expiresAt: new Date(Date.now() - 41 * HOUR).toISOString(), status: "revoked", authorizedBy: "Supervisor Console" });
  box.api.recordLocalChanges();
  box.state.outbox.forEach((item) => { item.sync = "shared"; item.sharedAt = new Date(Date.now() - 60000).toISOString(); });
  box.api.applyReference(serverReference({ authorizations: [] }), Date.now());
  assert.deepEqual(box.state.authorizations.map((auth) => auth.id), ["auth-old"]);
});

test("the override switch and the approver list come from the shared records", () => {
  const box = started();
  const changedAt = new Date().toISOString();
  box.api.applyReference(serverReference({
    locations: [{ name: "Division Street", active: true, historical_only: false, scan_override_enabled: true, scan_override_changed_by: "raul", scan_override_changed_at: changedAt }],
    approvers: [{ badge_id: "S2040", name: "Jordan Wells", role: "Fleet Lead" }, { badge_id: "S5000", name: "New Lead", role: "Fleet Lead" }]
  }), Date.now());
  assert.equal(box.state.locations[0].scanOverride.enabled, true);
  assert.equal(box.state.locations[0].scanOverride.changedBy, "raul");
  assert.equal(box.state.supervisors.length, 2);
  assert.equal(box.api.recordLocalChanges(), 0);
});

test("reading the same shared records twice changes nothing the second time", () => {
  const box = started();
  box.api.applyReference(serverReference(), Date.now());
  assert.equal(box.api.applyReference(serverReference(), Date.now()), 0);
});

// --- between tabs ------------------------------------------------------------------------

test("a change another tab has not sent yet is applied here too; one it already sent is left to the next read", () => {
  const box = started();
  const waiting = { id: "c-other-1", change: true, kind: "driver", key: "driver:E1003", queuedAt: new Date().toISOString(), sync: "local", data: { employeeNumber: "E1003", name: "From tab A", licenseExpires: "2026-12-01", active: true } };
  const sent = { id: "c-other-2", change: true, kind: "driver", key: "driver:E1001", queuedAt: new Date().toISOString(), sync: "shared", data: { employeeNumber: "E1001", name: "Old news", licenseExpires: "2027-01-10", active: true } };
  assert.equal(box.api.mergeChanges([waiting, sent]), 2);
  assert.equal(box.state.drivers.find((driver) => driver.employeeNumber === "E1003").name, "From tab A");
  assert.equal(box.state.drivers.find((driver) => driver.employeeNumber === "E1001").name, "Nina Patel");
  assert.equal(box.api.recordLocalChanges(), 0, "and this tab does not send it a second time");
});

// --- the vehicle details bug found on the way -------------------------------------------------

test("a vehicle with blank details keeps them blank when the app loads, rather than becoming a made-up car", () => {
  const box = started();
  const scanned = box.api.normalizeVehicle({ id: "veh-x", assignedBarcode: "G0777", vin: "", plate: "", make: "", model: "", year: 0, color: "", createdSource: "inbound_scan" }, 6);
  assert.equal(scanned.make, "");
  assert.equal(scanned.model, "");
  assert.equal(scanned.year, "");
  assert.equal(scanned.color, "");
  // Records from before V0.6 had no such fields at all; they still get the demo details.
  const legacy = box.api.normalizeVehicle({ id: "veh-y", assignedBarcode: "G0002" }, 1);
  assert.equal(legacy.make, "Toyota");
});
