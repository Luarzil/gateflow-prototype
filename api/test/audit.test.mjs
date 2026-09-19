// CR-V17-AWS-CONNECT-001 — the history entries a device writes, shared.

import assert from "node:assert/strict";
import { test } from "node:test";
import { MAX_BATCH, readAuditEntry, recordAuditEntries } from "../src/audit.mjs";
import { createHandler } from "../src/handler.mjs";

const NOW = new Date("2026-09-19T18:00:00.000Z");
const now = () => NOW;
const entry = (overrides = {}) => ({ clientId: "audit-1", type: "blocked_out", description: "Vehicle OUT blocked for E1003.", actor: "Linden Scanner", location: "Linden", source: "user action", occurredAt: "2026-09-19T17:55:00.000Z", ...overrides });

function fakeDb(alreadyThere = []) {
  const calls = [];
  return {
    calls,
    async query(sql, params) {
      calls.push({ sql, params });
      const rows = JSON.parse(params.rows);
      const seen = new Set(alreadyThere);
      return rows.filter((row) => { if (seen.has(row.client_id)) return false; seen.add(row.client_id); return true; }).map((row) => ({ client_id: row.client_id }));
    }
  };
}

test("an entry keeps what the device wrote, and the time it happened", () => {
  const row = readAuditEntry(entry(), NOW);
  assert.equal(row.type, "blocked_out");
  assert.equal(row.actor, "Linden Scanner");
  assert.equal(row.occurred_at, "2026-09-19T17:55:00.000Z");
  assert.equal(row.description, "Vehicle OUT blocked for E1003.");
});

test("an odd field is trimmed or defaulted rather than losing the entry", () => {
  const row = readAuditEntry(entry({ type: "Blocked OUT!", description: "x".repeat(5000), actor: "", location: "" }), NOW);
  assert.equal(row.type, "blocked_out_");
  assert.equal(row.description.length, 1000);
  assert.equal(row.actor, "device");
  assert.equal(row.location, null);
});

test("a device clock a day ahead is recorded at arrival, and the entry says so", () => {
  const row = readAuditEntry(entry({ occurredAt: "2026-09-22T18:00:00.000Z" }), NOW);
  assert.equal(row.occurred_at, NOW.toISOString());
  assert.match(row.description, /Device clock was ahead: it said 2026-09-22T18:00:00.000Z/);
  const unreadable = readAuditEntry(entry({ occurredAt: "yesterday-ish" }), NOW);
  assert.equal(unreadable.occurred_at, NOW.toISOString());
  assert.match(unreadable.description, /Device time unreadable/);
});

test("an entry without its id is refused, since a resend could then double it", () => {
  assert.throws(() => readAuditEntry(entry({ clientId: "" }), NOW), /needs its clientId/);
});

test("a batch is one statement, carries who uploaded it, and skips what is already there", async () => {
  const db = fakeDb(["audit-1"]);
  const result = await recordAuditEntries(db, { entries: [entry(), entry({ clientId: "audit-2" })] }, { actor: "raul", now });
  assert.equal(db.calls.length, 1);
  assert.deepEqual(result, { received: 2, recorded: 1, alreadyRecorded: 1 });
  assert.ok(JSON.parse(db.calls[0].params.rows).every((row) => row.uploaded_by === "raul"));
  assert.match(db.calls[0].sql, /on conflict \(client_id\) do nothing/);
});

test("an empty or oversized batch is refused", async () => {
  await assert.rejects(() => recordAuditEntries(fakeDb(), { entries: [] }, { now }), /must be a list/);
  await assert.rejects(() => recordAuditEntries(fakeDb(), {}, { now }), /must be a list/);
  const many = Array.from({ length: MAX_BATCH + 1 }, (_, index) => entry({ clientId: `a-${index}` }));
  await assert.rejects(() => recordAuditEntries(fakeDb(), { entries: many }, { now }), /at most 50/);
});

test("POST /v1/audit-events answers 201 with what was recorded", async () => {
  const response = await createHandler({ db: fakeDb(), now })({
    requestContext: { http: { method: "POST" }, authorizer: { jwt: { claims: { sub: "abc", "cognito:username": "raul" } } } },
    rawPath: "/v1/audit-events",
    body: JSON.stringify({ entries: [entry()] })
  });
  assert.equal(response.statusCode, 201);
  assert.equal(JSON.parse(response.body).recorded, 1);
});
