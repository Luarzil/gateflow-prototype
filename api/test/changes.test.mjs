// CR-V17-AWS-CONNECT-001 — drivers, vehicles, authorizations and override switches, shared.
//
// The database is a fake that answers what changes.mjs asks and records what it was told to write.
// These check the decisions: what is refused, what wins when two devices disagree, and that an
// authorization, once shared, can only ever end.

import assert from "node:assert/strict";
import { test } from "node:test";
import { groupsFrom, readAuthorization, readChangeBody, readDriver, readVehicle, recordChange } from "../src/changes.mjs";
import { createHandler } from "../src/handler.mjs";

const NOW = new Date("2026-09-19T15:00:00.000Z");
const now = () => NOW;

// answers: [substring, rows] pairs, first match wins. Anything unmatched answers no rows.
function fakeDb(answers = []) {
  const writes = [];
  const db = {
    writes,
    async query(sql, params = {}) {
      writes.push({ sql, params });
      if (sql.includes("insert into reference_changes")) return [{ id: 501 }];
      const hit = answers.find(([needle, , when]) => sql.includes(needle) && (!when || when(params)));
      return hit ? hit[1] : [];
    },
    async execute(sql, params = {}) {
      writes.push({ sql, params });
      return { updated: 1 };
    },
    async transaction(work) { return work("tx-1"); }
  };
  return db;
}

const wrote = (db, needle) => db.writes.filter((entry) => entry.sql.includes(needle));

const change = (kind, data, overrides = {}) => ({ clientId: `c-${kind}-1`, kind, occurredAt: "2026-09-19T14:00:00.000Z", data, ...overrides });
const driverData = (overrides = {}) => ({ employeeNumber: "e2001", name: "Dana Fox", licenseExpires: "2027-03-01", active: true, ...overrides });
const authData = (overrides = {}) => ({
  id: "auth-77", driverEmployee: "E1001", type: "9_hours", validFrom: "2026-09-19T13:00:00.000Z", expiresAt: "2026-09-19T22:00:00.000Z",
  status: "active", authorizedBy: "Supervisor Console", authorizedRole: "Supervisor", location: "Division Street", ...overrides
});

// --- the envelope -----------------------------------------------------------

test("a change with no id, an unknown kind or no record is refused", () => {
  assert.throws(() => readChangeBody(change("driver", driverData(), { clientId: "" }), NOW), /clientId is required/);
  assert.throws(() => readChangeBody(change("devices", driverData()), NOW), /kind must be one of/);
  assert.throws(() => readChangeBody(change("driver", null), NOW), /data must be the record/);
  assert.throws(() => readChangeBody(change("driver", []), NOW), /data must be the record/);
});

test("a device clock a day ahead is refused, and a fast clock never makes an edit newer than its arrival", () => {
  assert.throws(() => readChangeBody(change("driver", driverData(), { occurredAt: "2026-09-21T15:00:00.000Z" }), NOW), /more than 24 hours in the future/);
  const fast = readChangeBody(change("driver", driverData(), { occurredAt: "2026-09-19T18:00:00.000Z" }), NOW);
  assert.equal(fast.effectiveAt, NOW.toISOString());
  assert.equal(fast.occurredAt, "2026-09-19T18:00:00.000Z", "what the device said is still what is kept");
});

test("the groups claim is read however API Gateway passes it", () => {
  assert.deepEqual(groupsFrom({ "cognito:groups": "[Admin]" }), ["Admin"]);
  assert.deepEqual(groupsFrom({ "cognito:groups": "[Admin Supervisor]" }), ["Admin", "Supervisor"]);
  assert.deepEqual(groupsFrom({ "cognito:groups": ["Admin"] }), ["Admin"]);
  assert.deepEqual(groupsFrom({}), []);
});

// --- drivers ----------------------------------------------------------------

test("a driver is stored upper-case, with a real licence date", () => {
  assert.equal(readDriver(driverData()).employeeNumber, "E2001");
  assert.throws(() => readDriver(driverData({ licenseExpires: "2027-02-30" })), /real date/);
  assert.throws(() => readDriver(driverData({ name: " " })), /needs a name/);
  assert.throws(() => readDriver(driverData({ employeeNumber: "E-20" })), /letters and digits/);
});

test("a new driver is added to the shared roster, with who uploaded it", async () => {
  const db = fakeDb();
  const result = await recordChange(db, change("driver", driverData()), { actor: "raul", now });
  assert.equal(result.outcome, "applied");
  const insert = wrote(db, "insert into drivers")[0];
  assert.equal(insert.params.employee, "E2001");
  assert.equal(insert.params.actor, "raul");
  assert.match(result.summary, /Driver E2001 added/);
  assert.equal(wrote(db, "insert into reference_changes")[0].params.outcome, "applied");
  assert.match(wrote(db, "insert into audit_events")[0].params.description, /Uploaded by raul/);
});

test("an older edit arriving late does not overwrite a newer one; it is kept as superseded", async () => {
  const db = fakeDb([["from drivers where employee_number", [{ newer: true }]]]);
  const result = await recordChange(db, change("driver", driverData({ name: "Old Name" })), { actor: "raul", now });
  assert.equal(result.outcome, "superseded");
  assert.equal(wrote(db, "insert into drivers").length, 0, "the roster is not touched");
  assert.equal(wrote(db, "insert into reference_changes")[0].params.outcome, "superseded", "but the change itself is kept");
});

test("the same change sent twice is applied once", async () => {
  const db = fakeDb([["from reference_changes where client_id", [{ id: 12, outcome: "applied" }]]]);
  const result = await recordChange(db, change("driver", driverData()), { actor: "raul", now });
  assert.equal(result.duplicate, true);
  assert.equal(wrote(db, "insert into drivers").length, 0);
  assert.equal(wrote(db, "insert into reference_changes").length, 0);
});

// --- vehicles ---------------------------------------------------------------

const vehicleData = (overrides = {}) => ({ id: "veh-9", assignedBarcode: "g0099", vin: "1abc", make: "Ford", model: "", year: "", color: "", active: true, createdSource: "supervisor", ...overrides });

test("a vehicle's barcode is held to the same form as at the gate, and blanks are stored as empty", () => {
  const vehicle = readVehicle(vehicleData());
  assert.equal(vehicle.assignedBarcode, "G0099");
  assert.equal(vehicle.vin, "1ABC");
  assert.equal(vehicle.model, null);
  assert.equal(vehicle.year, null);
  assert.throws(() => readVehicle(vehicleData({ assignedBarcode: "g42" })), /G followed by at least four digits/);
  assert.throws(() => readVehicle(vehicleData({ id: "" })), /device's id/);
});

test("a new vehicle is inserted carrying the device's id", async () => {
  const db = fakeDb();
  const result = await recordChange(db, change("vehicle", vehicleData()), { actor: "raul", now });
  assert.equal(result.outcome, "applied");
  const insert = wrote(db, "insert into vehicles")[0];
  assert.equal(insert.params.clientId, "veh-9");
  assert.equal(insert.params.barcode, "G0099");
  assert.equal(insert.params.source, "supervisor");
});

test("an edited vehicle is found by the barcode it had, so a barcode change moves it rather than adding a second car", async () => {
  const db = fakeDb([["assigned_barcode = :value", [{ id: 5, client_id: null, assigned_barcode: "G0005", active: true, newer: false }], (p) => p.value === "G0005"]]);
  const result = await recordChange(db, change("vehicle", vehicleData({ id: "veh-005", previousBarcode: "G0005", assignedBarcode: "G0105" })), { actor: "raul", now });
  assert.equal(result.outcome, "applied");
  assert.equal(wrote(db, "insert into vehicles").length, 0);
  const update = wrote(db, "update vehicles")[0];
  assert.equal(update.params.rowId, 5);
  assert.equal(update.params.barcode, "G0105");
  assert.match(result.summary, /Barcode changed from G0005/);
});

test("a barcode already on another vehicle is refused", async () => {
  const db = fakeDb([
    ["client_id = :value", [{ id: 5, client_id: "veh-9", assigned_barcode: "G0005", active: true, newer: false }]],
    ["select id from vehicles where assigned_barcode = :barcode", [{ id: 6 }]]
  ]);
  await assert.rejects(() => recordChange(db, change("vehicle", vehicleData({ assignedBarcode: "G0006" })), { actor: "raul", now }), (error) => error.status === 409 && /already belongs to another vehicle/.test(error.message));
});

test("removing a vehicle records when and by whom", async () => {
  const db = fakeDb([["client_id = :value", [{ id: 5, client_id: "veh-9", assigned_barcode: "G0099", active: true, newer: false }]]]);
  await recordChange(db, change("vehicle", vehicleData({ active: false })), { actor: "raul", now });
  const update = wrote(db, "update vehicles")[0];
  assert.equal(update.params.removing, true);
  assert.equal(update.params.restoring, false);
});

// --- authorizations -----------------------------------------------------------

test("an authorization must have a known length and a window that ends after it begins", () => {
  assert.throws(() => readAuthorization(authData({ type: "forever" })), /type must be one of/);
  assert.throws(() => readAuthorization(authData({ expiresAt: "2026-09-19T12:00:00.000Z" })), /after validFrom/);
  assert.throws(() => readAuthorization(authData({ status: "paused" })), /status must be/);
});

test("an authorization for a driver the shared roster does not know is refused", async () => {
  const db = fakeDb();
  await assert.rejects(() => recordChange(db, change("authorization", authData())), (error) => error.status === 422 && /not in the shared roster/.test(error.message));
});

test("a new authorization is stored and replaces an earlier active one the device never saw", async () => {
  const db = fakeDb([["from drivers where employee_number", [{ employee_number: "E1001" }]]]);
  const result = await recordChange(db, change("authorization", authData()), { actor: "raul", now });
  assert.equal(result.outcome, "applied");
  const insert = wrote(db, "insert into authorizations")[0];
  assert.equal(insert.params.status, "active");
  assert.equal(insert.params.role, "Supervisor");
  assert.equal(insert.params.revokedAt, null);
  const replace = wrote(db, "set status = 'replaced'")[0];
  assert.equal(replace.params.validFrom, "2026-09-19T13:00:00.000Z", "the earlier one ends where this one begins");
});

test("a gate approval takes the approver's rank from the shared list, and a Scanner badge is refused", async () => {
  const lookup = (role) => fakeDb([
    ["from drivers where employee_number", [{ employee_number: "E1001" }]],
    ["from approvers where badge_id", [{ role, active: true }]]
  ]);
  const fleet = lookup("Fleet Lead");
  await recordChange(fleet, change("authorization", authData({ approverBadge: "s2040", authorizedRole: "Admin" })), { actor: "raul", now });
  assert.equal(wrote(fleet, "insert into authorizations")[0].params.role, "Fleet Lead", "the device's claim of Admin is not believed");
  await assert.rejects(() => recordChange(lookup("Scanner"), change("authorization", authData({ approverBadge: "S3090" })), { actor: "raul", now }), (error) => error.status === 403);
});

test("revoking ends the authorization at the time it was revoked, and every other active one for that driver", async () => {
  const db = fakeDb([
    ["from drivers where employee_number", [{ employee_number: "E1001" }]],
    ["from authorizations where client_id", [{ id: 40, status: "active" }]]
  ]);
  const revokedAt = "2026-09-19T14:30:00.000Z";
  const result = await recordChange(db, change("authorization", authData({ status: "revoked", revokedAt, revokedBy: "Supervisor Console", revocationReason: "Manual revocation" }), { occurredAt: revokedAt }), { actor: "raul", now });
  assert.equal(result.outcome, "applied");
  const ended = wrote(db, "update authorizations set status = :status")[0];
  assert.equal(ended.params.status, "revoked");
  assert.equal(ended.params.at, revokedAt);
  assert.equal(wrote(db, "set status = 'revoked'").length, 1, "the others are revoked too");
  assert.equal(wrote(db, "insert into authorizations").length, 0, "no second copy is made");
});

test("an ended authorization is never revived", async () => {
  const db = fakeDb([
    ["from drivers where employee_number", [{ employee_number: "E1001" }]],
    ["from authorizations where client_id", [{ id: 40, status: "revoked" }]]
  ]);
  const result = await recordChange(db, change("authorization", authData({ status: "active" })), { actor: "raul", now });
  assert.equal(result.outcome, "superseded");
  assert.equal(wrote(db, "update authorizations").length, 0);
});

test("a revocation time is never before the authorization began, nor after it arrived", async () => {
  const early = fakeDb([["from drivers where employee_number", [{ employee_number: "E1001" }]], ["from authorizations where client_id", [{ id: 40, status: "active" }]]]);
  await recordChange(early, change("authorization", authData({ status: "revoked", revokedAt: "2026-09-18T00:00:00.000Z" })), { actor: "raul", now });
  assert.equal(wrote(early, "update authorizations set status = :status")[0].params.at, "2026-09-19T13:00:00.000Z");
  const late = fakeDb([["from drivers where employee_number", [{ employee_number: "E1001" }]], ["from authorizations where client_id", [{ id: 40, status: "active" }]]]);
  await recordChange(late, change("authorization", authData({ status: "revoked", revokedAt: "2026-09-19T20:00:00.000Z" }), { occurredAt: "2026-09-19T14:00:00.000Z" }), { actor: "raul", now });
  assert.equal(wrote(late, "update authorizations set status = :status")[0].params.at, "2026-09-19T14:00:00.000Z");
});

// --- override switches --------------------------------------------------------------

const locationData = (enabled = true) => ({ name: "Linden", scanOverride: { enabled, changedBy: "Admin Console", changedAt: "2026-09-19T14:00:00.000Z" } });

test("only an Admin can move a location's override switch", async () => {
  const db = fakeDb([["from locations where name", [{ name: "Linden", newer: false }]]]);
  await assert.rejects(() => recordChange(db, change("location", locationData()), { actor: "raul", groups: ["Supervisor"], now }), (error) => error.status === 403);
  const result = await recordChange(db, change("location", locationData()), { actor: "raul", groups: ["Admin"], now });
  assert.equal(result.outcome, "applied");
  assert.equal(wrote(db, "update locations")[0].params.enabled, true);
});

test("a switch flipped later elsewhere is not undone by an earlier flip arriving late", async () => {
  const db = fakeDb([["from locations where name", [{ name: "Linden", newer: true }]]]);
  const result = await recordChange(db, change("location", locationData(false)), { actor: "raul", groups: ["Admin"], now });
  assert.equal(result.outcome, "superseded");
  assert.equal(wrote(db, "update locations").length, 0);
});

test("an unknown location is refused", async () => {
  const db = fakeDb();
  await assert.rejects(() => recordChange(db, change("location", locationData()), { actor: "raul", groups: ["Admin"], now }), (error) => error.status === 422);
});

// --- through the handler ------------------------------------------------------------

test("POST /v1/changes answers 201 for a new change and 200 for one already recorded, with the groups from the token", async () => {
  const event = (db) => createHandler({ db, now })({
    requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "abc", "cognito:username": "raul", "cognito:groups": "[Admin]" } } } },
    rawPath: "/v1/changes",
    body: JSON.stringify(change("location", locationData()))
  });
  const fresh = await event(fakeDb([["from locations where name", [{ name: "Linden", newer: false }]]]));
  assert.equal(fresh.statusCode, 201);
  const again = await event(fakeDb([["from reference_changes where client_id", [{ id: 12, outcome: "applied" }]]]));
  assert.equal(again.statusCode, 200);
  assert.equal(JSON.parse(again.body).duplicate, true);
});
