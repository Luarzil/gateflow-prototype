// CR-V17-AWS-CONNECT-001 step 5 — who may do what, enforced by the server.

import assert from "node:assert/strict";
import { test } from "node:test";
import { rankOf, roleOf } from "../src/roles.mjs";
import { recordChange } from "../src/changes.mjs";
import { createHandler } from "../src/handler.mjs";

const NOW = new Date("2026-09-19T15:00:00.000Z");
const now = () => NOW;

function fakeDb(answers = []) {
  const writes = [];
  return {
    writes,
    async query(sql, params = {}) {
      writes.push({ sql, params });
      if (sql.includes("insert into reference_changes")) return [{ id: 501 }];
      if (sql.includes("insert into movements")) return [{ id: 77 }];
      if (sql.includes("insert into audit_events")) return JSON.parse(params.rows || "[]").map((row) => ({ client_id: row.client_id }));
      if (sql.includes("from drivers d")) return [{ employee_number: "E1001", name: "Nina Patel", active: true, license_expired: false, authorized_then: true }];
      if (sql.includes("select id, assigned_barcode, vin, plate, active from vehicles")) return [{ id: 11, assigned_barcode: "G0001", active: true }];
      const hit = answers.find(([needle]) => sql.includes(needle));
      return hit ? hit[1] : [];
    },
    async execute(sql, params = {}) { writes.push({ sql, params }); return { updated: 1 }; },
    async transaction(work) { return work("tx-1"); }
  };
}
const wrote = (db, needle) => db.writes.filter((entry) => entry.sql.includes(needle));
const as = (group) => ({ actor: "someone", groups: group ? [group] : [], now });
const change = (kind, data) => ({ clientId: `c-${kind}`, kind, occurredAt: "2026-09-19T14:00:00.000Z", data });
const driver = { employeeNumber: "E2001", name: "Dana Fox", licenseExpires: "2027-03-01", active: true };
const auth = (overrides = {}) => ({ id: "auth-1", driverEmployee: "E1001", type: "9_hours", validFrom: "2026-09-19T13:00:00.000Z", expiresAt: "2026-09-19T22:00:00.000Z", status: "active", authorizedBy: "Supervisor Console", ...overrides });
const withDriver = () => fakeDb([["from drivers where employee_number", [{ employee_number: "E1001" }]]]);
const forbidden = (error) => error.status === 403;

test("the most senior group is the role, and a login with none has no rank", () => {
  assert.equal(roleOf(["Scanner", "Supervisor"]), "Supervisor");
  assert.equal(rankOf(["Device"]), rankOf(["Scanner"]));
  assert.equal(rankOf([]), 0);
  assert.equal(rankOf(["Everyone"]), 0);
});

test("a login with no role can do nothing, and is told to ask the Admin", async () => {
  await assert.rejects(() => recordChange(fakeDb(), change("driver", driver), as("")), (error) => error.status === 403 && /no role yet/.test(error.message));
});

test("drivers are a Supervisor's: a Fleet Lead and a gate phone are refused", async () => {
  await assert.rejects(() => recordChange(fakeDb(), change("driver", driver), as("FleetLead")), forbidden);
  await assert.rejects(() => recordChange(fakeDb(), change("driver", driver), as("Device")), forbidden);
  const result = await recordChange(fakeDb(), change("driver", driver), as("Supervisor"));
  assert.equal(result.outcome, "applied");
});

test("a gate phone may add a vehicle it met at the gate, but not a vehicle of its own making", async () => {
  const scanned = await recordChange(fakeDb(), change("vehicle", { id: "veh-x", assignedBarcode: "G0777", createdSource: "inbound_scan" }), as("Device"));
  assert.equal(scanned.outcome, "applied");
  await assert.rejects(() => recordChange(fakeDb(), change("vehicle", { id: "veh-y", assignedBarcode: "G0778", vin: "1ABC", createdSource: "supervisor" }), as("Device")), forbidden);
});

test("a gate phone never edits a vehicle the shared records hold; theirs stands, quietly", async () => {
  const db = fakeDb([["client_id = :value", [{ id: 5, client_id: null, assigned_barcode: "G0005", active: true, newer: false }]]]);
  const result = await recordChange(db, change("vehicle", { id: "veh-005", assignedBarcode: "G0005", make: "Changed", createdSource: "inbound_scan" }), as("Device"));
  assert.equal(result.outcome, "superseded", "not a refusal: the operator did nothing wrong");
  assert.equal(wrote(db, "set client_id = :clientId").length, 1, "the phone's id for it is remembered");
  assert.equal(wrote(db, "assigned_barcode = :barcode, vin").length, 0, "nothing else is written");
});

test("a console authorization is a Fleet Lead's, and is recorded with the signed-in person's role", async () => {
  await assert.rejects(() => recordChange(withDriver(), change("authorization", auth()), as("Device")), forbidden);
  const db = withDriver();
  await recordChange(db, change("authorization", auth({ authorizedRole: "Admin" })), as("FleetLead"));
  assert.equal(wrote(db, "insert into authorizations")[0].params.role, "Fleet Lead", "not the Admin the device claimed");
});

test("at the gate a phone sends a badge approval, whose rank the server checks", async () => {
  const db = fakeDb([["from drivers where employee_number", [{ employee_number: "E1001" }]], ["from approvers where badge_id", [{ role: "Fleet Lead", active: true }]]]);
  const result = await recordChange(db, change("authorization", auth({ authorizedBy: "S2040 / Jordan Wells", approverBadge: "S2040" })), as("Device"));
  assert.equal(result.outcome, "applied");
  assert.equal(wrote(db, "insert into authorizations")[0].params.role, "Fleet Lead");
});

test("a gate phone cannot revoke, but may mark replaced the authorization its badge approval superseded", async () => {
  await assert.rejects(() => recordChange(withDriver(), change("authorization", auth({ status: "revoked", revokedAt: "2026-09-19T14:00:00.000Z" })), as("Device")), forbidden);
  const unknown = await recordChange(withDriver(), change("authorization", auth({ status: "replaced" })), as("Device"));
  assert.equal(unknown.outcome, "superseded", "nothing to replace in the shared records, and no Scanner-ranked row written");
});

test("the override switch is the Admin's alone", async () => {
  const location = { name: "Linden", scanOverride: { enabled: true, changedBy: "x", changedAt: "2026-09-19T14:00:00.000Z" } };
  const db = fakeDb([["from locations where name", [{ name: "Linden", newer: false }]]]);
  await assert.rejects(() => recordChange(db, change("location", location), as("Supervisor")), forbidden);
  assert.equal((await recordChange(db, change("location", location), as("Admin"))).outcome, "applied");
});

// --- through the handler: reads and recording ---------------------------------------------------

const event = (method, rawPath, group, body) => ({
  requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: "abc", "cognito:username": "someone", ...(group ? { "cognito:groups": `[${group}]` } : {}) } } } },
  rawPath,
  queryStringParameters: {},
  body: body ? JSON.stringify(body) : undefined
});

test("searching the gate log needs a Fleet Lead or above; a gate phone cannot", async () => {
  const handler = createHandler({ db: fakeDb(), now });
  assert.equal((await handler(event("GET", "/v1/movements", "Device"))).statusCode, 403);
  assert.equal((await handler(event("GET", "/v1/movements", "FleetLead"))).statusCode, 200);
});

test("every role reads the shared records it needs at the gate, and records movements and history", async () => {
  const handler = createHandler({ db: fakeDb(), now });
  assert.equal((await handler(event("GET", "/v1/reference", "Device"))).statusCode, 200);
  const movement = { clientId: "m-1", direction: "IN", driverEmployee: "E1001", vehicleBarcode: "G0001", location: "Linden", authorizationStatus: "Authorized", occurredAt: "2026-09-19T14:59:00.000Z" };
  assert.equal((await handler(event("POST", "/v1/movements", "Device", movement))).statusCode, 201);
  assert.equal((await handler(event("POST", "/v1/audit-events", "Device", { entries: [{ clientId: "a-1", type: "blocked_out", occurredAt: "2026-09-19T14:59:00.000Z" }] }))).statusCode, 201);
});

test("a login with no role cannot even read", async () => {
  const handler = createHandler({ db: fakeDb(), now });
  const response = await handler(event("GET", "/v1/reference", ""));
  assert.equal(response.statusCode, 403);
  assert.match(JSON.parse(response.body).message, /no role yet/);
});

test("a gate phone cannot revoke an authorization the shared records already hold", async () => {
  const db = fakeDb([["from drivers where employee_number", [{ employee_number: "E1001" }]], ["from authorizations where client_id", [{ id: 40, status: "active" }]]]);
  await assert.rejects(() => recordChange(db, change("authorization", auth({ status: "revoked", revokedAt: "2026-09-19T14:00:00.000Z" })), as("Device")), forbidden);
  assert.equal(wrote(db, "update authorizations").length, 0, "nothing ended");
});
