// CR-V17-AWS-CONNECT-001 step 3 — recording a movement in the shared database.
//
// The database is stood in for by a small fake that answers the queries this module asks and
// records what it was told to write, so these check the decisions: what is rejected, what is
// stored, what is flagged, and above all that sending the same movement twice records it once.

import assert from "node:assert/strict";
import { test } from "node:test";
import { findConflict, readMovementBody, recordMovement } from "../src/writes.mjs";
import { createHandler } from "../src/handler.mjs";

const NOW = new Date("2026-09-18T20:00:00.000Z");

const goodBody = (overrides = {}) => ({
  clientId: "m-1234",
  direction: "OUT",
  driverEmployee: "E1001",
  vehicleBarcode: "G0001",
  location: "Division Street",
  authorizationStatus: "Authorized",
  driverEntryMethod: "scanner_field",
  vehicleEntryMethod: "scanner_field",
  submittedBy: "Division Street Scanner",
  deviceId: "D0001",
  note: "Customer delivery",
  occurredAt: "2026-09-18T19:58:00.000Z",
  ...overrides
});

// driver: the roster row, or null for an employee number nobody has heard of.
// vehicle: the inventory row, or null for a barcode never seen before.
function fakeDb({ driver = { employee_number: "E1001", name: "Nina Patel", active: true, license_expires: "2026-12-11", license_expired: false, authorized_now: true },
                  vehicle = { id: 11, assigned_barcode: "G0001", vin: "1HGCM82633A004352", plate: "TRK-8877", active: true },
                  device = { id: "D0001", name: "Division Gate Scanner", type: "Fixed", assigned_location: "Division Street" },
                  existing = null, nextId = 77 } = {}) {
  const writes = [];
  let stored = existing;
  const db = {
    writes,
    async query(sql, params = {}, transactionId) {
      writes.push({ sql, params, transactionId });
      if (sql.includes("from movements where client_id")) return stored ? [stored] : [];
      if (sql.includes("from drivers d")) return driver ? [driver] : [];
      if (sql.includes("from vehicles where assigned_barcode")) return vehicle ? [vehicle] : [];
      if (sql.includes("from devices where id")) return device ? [device] : [];
      if (sql.includes("insert into vehicles")) return [{ id: 99 }];
      if (sql.includes("insert into movements")) {
        stored = { id: nextId, conflict: null, delayed: false };
        return [{ id: nextId }];
      }
      return [];
    },
    async execute(sql, params = {}, transactionId) {
      writes.push({ sql, params, transactionId });
      return { updated: 1 };
    },
    async transaction(work) { return work("tx-1"); }
  };
  return db;
}

const wrote = (db, needle) => db.writes.filter((entry) => entry.sql.includes(needle));
const params = (db, needle) => (wrote(db, needle)[0] || {}).params || {};

// --- what is rejected -----------------------------------------------------

test("a movement with no device-made id is refused", () => {
  assert.throws(() => readMovementBody(goodBody({ clientId: "" }), NOW), /clientId is required/);
});

test("a direction the gate cannot record is refused", () => {
  assert.throws(() => readMovementBody(goodBody({ direction: "SIDEWAYS" }), NOW), /direction must be one of IN, OUT/);
});

test("an authorization status the app never produces is refused", () => {
  assert.throws(() => readMovementBody(goodBody({ authorizationStatus: "Approved" }), NOW), /authorizationStatus must be one of/);
});

test("a movement timed hours ahead of the server is refused, minutes is not", () => {
  assert.throws(() => readMovementBody(goodBody({ occurredAt: "2026-09-18T23:00:00.000Z" }), NOW), /in the future/);
  assert.ok(readMovementBody(goodBody({ occurredAt: "2026-09-18T20:05:00.000Z" }), NOW));
});

test("an unreadable time is refused rather than stored as nothing", () => {
  assert.throws(() => readMovementBody(goodBody({ occurredAt: "last Tuesday" }), NOW), /not a time this API can read/);
});

test("an employee number that is not on the shared roster is refused, and nothing is written", async () => {
  const db = fakeDb({ driver: null });
  await assert.rejects(() => recordMovement(db, goodBody(), { now: () => NOW }), (error) => {
    assert.equal(error.status, 422);
    assert.match(error.message, /E1001 is not in the shared roster/);
    return true;
  });
  assert.equal(wrote(db, "insert into movements").length, 0);
});

// --- what is stored -------------------------------------------------------

test("the movement is stored with the driver, vehicle and device as they were at the gate", async () => {
  const db = fakeDb();
  const result = await recordMovement(db, goodBody(), { now: () => NOW });
  assert.equal(result.id, 77);
  assert.equal(result.duplicate, false);
  const written = params(db, "insert into movements");
  assert.equal(written.driverName, "Nina Patel");
  assert.equal(written.vehicleId, 11);
  assert.equal(written.vin, "1HGCM82633A004352");
  assert.equal(written.plate, "TRK-8877");
  assert.equal(written.deviceName, "Division Gate Scanner");
  assert.equal(written.authorizationStatus, "Authorized");
  assert.equal(written.submittedBy, "Division Street Scanner");
});

test("an audit entry is written with the movement, in the same transaction", async () => {
  const db = fakeDb();
  await recordMovement(db, goodBody(), { now: () => NOW });
  const audit = wrote(db, "insert into audit_events")[0];
  assert.equal(audit.transactionId, "tx-1");
  assert.match(audit.params.description, /Vehicle OUT recorded for E1001 \/ G0001 as Authorized\./);
  // Its own id, derived from the movement's, so a retry cannot double the trail either.
  assert.equal(audit.params.clientId, "m-1234:movement");
});

test("a movement recorded minutes ago is not marked delayed; one queued for hours is", async () => {
  const fresh = fakeDb();
  await recordMovement(fresh, goodBody(), { now: () => NOW });
  assert.equal(params(fresh, "insert into movements").delayed, false);

  const queued = fakeDb();
  const result = await recordMovement(queued, goodBody({ occurredAt: "2026-09-18T16:00:00.000Z" }), { now: () => NOW });
  assert.equal(params(queued, "insert into movements").delayed, true);
  assert.equal(result.delayed, true);
});

test("a barcode nobody has seen becomes a vehicle, tied back to the scan that created it", async () => {
  const db = fakeDb({ vehicle: null });
  const result = await recordMovement(db, goodBody({ vehicleBarcode: "G0042" }), { now: () => NOW });
  assert.equal(result.vehicleAdded, true);
  const vehicle = params(db, "insert into vehicles");
  assert.equal(vehicle.barcode, "G0042");
  assert.equal(vehicle.needsReview, false, "a scanned barcode needs no review");
  assert.equal(params(db, "update vehicles set added_from_movement").movementId, 77);
});

test("a typed unknown barcode is flagged for a supervisor, because a typo invents a vehicle", async () => {
  const db = fakeDb({ vehicle: null });
  await recordMovement(db, goodBody({ vehicleBarcode: "G0042", vehicleEntryMethod: "manual" }), { now: () => NOW });
  assert.equal(params(db, "insert into vehicles").needsReview, true);
});

// --- sending the same movement twice --------------------------------------

test("a movement already recorded is not written again, and nothing is created for it", async () => {
  const db = fakeDb({ existing: { id: 55, conflict: "license_expired", delayed: true } });
  const result = await recordMovement(db, goodBody(), { now: () => NOW });
  assert.deepEqual(result, { id: 55, clientId: "m-1234", duplicate: true, conflict: "license_expired", delayed: true });
  assert.equal(wrote(db, "insert into movements").length, 0);
  assert.equal(wrote(db, "insert into vehicles").length, 0);
});

test("two uploads of one movement racing each other still record it once", async () => {
  // The insert is refused by the unique client_id, so the other upload's row is returned.
  const db = fakeDb();
  db.query = async (sql, p = {}, transactionId) => {
    db.writes.push({ sql, params: p, transactionId });
    if (sql.includes("from movements where client_id") && !sql.includes("select id, conflict")) return [];
    if (sql.includes("from drivers d")) return [{ employee_number: "E1001", name: "Nina Patel", active: true, license_expired: false, authorized_now: true }];
    if (sql.includes("from vehicles where assigned_barcode")) return [{ id: 11, active: true }];
    if (sql.includes("from devices where id")) return [];
    if (sql.includes("insert into movements")) return [];
    if (sql.includes("select id, conflict, delayed from movements")) return [{ id: 42, conflict: null, delayed: false }];
    return [];
  };
  const result = await recordMovement(db, goodBody(), { now: () => NOW });
  assert.equal(result.duplicate, true);
  assert.equal(result.id, 42);
});

// --- where the gate and the records disagree ------------------------------

test("agreement is flagged as nothing at all", () => {
  assert.equal(findConflict(readMovementBody(goodBody(), NOW), { driver: { active: true, authorized_now: true }, vehicle: { active: true } }), "");
});

test("an authorized movement by a driver the records show as unauthorized is flagged", () => {
  const movement = readMovementBody(goodBody(), NOW);
  assert.equal(findConflict(movement, { driver: { active: true, authorized_now: false } }), "authorization_expired");
});

test("an inactive driver and an expired license are each flagged", () => {
  const movement = readMovementBody(goodBody(), NOW);
  assert.equal(findConflict(movement, { driver: { active: false, authorized_now: true } }), "driver_inactive");
  assert.equal(findConflict(movement, { driver: { active: true, license_expired: true, authorized_now: true } }), "license_expired");
});

test("an override recorded against a typed employee number is flagged", () => {
  const scanned = readMovementBody(goodBody({ authorizationStatus: "Location override" }), NOW);
  assert.equal(findConflict(scanned, { driver: { active: true, authorized_now: false } }), "");
  const typed = readMovementBody(goodBody({ authorizationStatus: "Location override", driverEntryMethod: "manual" }), NOW);
  assert.equal(findConflict(typed, { driver: { active: true, authorized_now: false } }), "override_needs_scan");
});

test("an unauthorized movement is never flagged: it already says what it is", () => {
  const movement = readMovementBody(goodBody({ direction: "IN", authorizationStatus: "Unauthorized" }), NOW);
  assert.equal(findConflict(movement, { driver: { active: false, license_expired: true, authorized_now: false } }), "");
});

test("a flag is stored on the movement and returned to the scanner", async () => {
  const db = fakeDb({ driver: { employee_number: "E1001", name: "Nina Patel", active: true, license_expired: false, authorized_now: false } });
  const result = await recordMovement(db, goodBody(), { now: () => NOW });
  assert.equal(result.conflict, "authorization_expired");
  assert.equal(params(db, "insert into movements").conflict, "authorization_expired");
  assert.match(params(db, "insert into audit_events").description, /Flagged for review: authorization_expired/);
});

// --- through the handler --------------------------------------------------

const signedIn = { requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "abc", "cognito:username": "raul" } } } }, rawPath: "/v1/movements" };

test("a new movement answers 201, one already recorded answers 200", async () => {
  const handler = createHandler({ db: fakeDb(), now: () => NOW });
  const created = await handler({ ...signedIn, body: JSON.stringify(goodBody()) });
  assert.equal(created.statusCode, 201);

  const again = createHandler({ db: fakeDb({ existing: { id: 55, conflict: null, delayed: false } }), now: () => NOW });
  const duplicate = await again({ ...signedIn, body: JSON.stringify(goodBody()) });
  assert.equal(duplicate.statusCode, 200);
  assert.equal(JSON.parse(duplicate.body).duplicate, true);
});

test("recording a movement without a sign-in is refused", async () => {
  const handler = createHandler({ db: fakeDb(), now: () => NOW });
  const response = await handler({ requestContext: { http: { method: "POST" } }, rawPath: "/v1/movements", body: JSON.stringify(goodBody()) });
  assert.equal(response.statusCode, 401);
});

test("the signed-in username is recorded when the device sent no operator name", async () => {
  const db = fakeDb();
  const handler = createHandler({ db, now: () => NOW });
  await handler({ ...signedIn, body: JSON.stringify(goodBody({ submittedBy: "" })) });
  assert.equal(params(db, "insert into movements").submittedBy, "raul");
});

test("a body that is not JSON is a bad request, not a server fault", async () => {
  const handler = createHandler({ db: fakeDb(), now: () => NOW });
  const response = await handler({ ...signedIn, body: "not json at all" });
  assert.equal(response.statusCode, 400);
  assert.match(JSON.parse(response.body).message, /not JSON/);
});

test("a base64 body is decoded", async () => {
  const db = fakeDb();
  const handler = createHandler({ db, now: () => NOW });
  const response = await handler({ ...signedIn, body: Buffer.from(JSON.stringify(goodBody())).toString("base64"), isBase64Encoded: true });
  assert.equal(response.statusCode, 201);
});
