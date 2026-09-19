// CR-V17: routing, sign-in enforcement and the movement search query.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createHandler } from "../src/handler.mjs";
import { buildMovementQuery, decodeCursor, encodeCursor, movementPage, referenceData, utc, MAX_PAGE_SIZE, PAGE_SIZE } from "../src/queries.mjs";

const signedIn = { sub: "user-1", "cognito:groups": ["Supervisor"] };
const request = (method, rawPath, { claims, query } = {}) => ({
  rawPath,
  queryStringParameters: query,
  requestContext: { http: { method }, authorizer: claims ? { jwt: { claims } } : undefined }
});
const body = (response) => JSON.parse(response.body);

function recordingDb(answer = () => []) {
  const calls = [];
  return { calls, async query(sql, params) { calls.push({ sql, params }); return answer(sql, params); } };
}

test("health is public and lists the applied migrations", async () => {
  const db = recordingDb(() => [{ version: "001_initial" }, { version: "002_scan_created_inventory" }]);
  const response = await createHandler({ db, stage: "dev", now: () => new Date("2026-09-13T20:00:00Z") })(request("GET", "/health"));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(body(response), { service: "veri-gate-api", stage: "dev", database: "up", migrations: ["001_initial", "002_scan_created_inventory"], checkedAt: "2026-09-13T20:00:00.000Z" });
  assert.equal(response.headers["cache-control"], "no-store");
});

// API Gateway already refuses a request with no token. This is the second lock.
test("everything under /v1 refuses a request that is not signed in", async () => {
  const db = recordingDb();
  const response = await createHandler({ db })(request("GET", "/v1/reference"));
  assert.equal(response.statusCode, 401);
  assert.equal(db.calls.length, 0, "the database is not touched");
});

test("a signed-in request gets the reference lists", async () => {
  const db = recordingDb();
  const response = await createHandler({ db })(request("GET", "/v1/reference", { claims: signedIn }));
  assert.equal(response.statusCode, 200);
  assert.deepEqual(Object.keys(body(response)).sort(), ["approvers", "authorizations", "devices", "drivers", "generatedAt", "locations", "vehicles"]);
});

test("an unknown route is a 404, not a crash", async () => {
  const response = await createHandler({ db: recordingDb() })(request("POST", "/v1/nothing", { claims: signedIn }));
  assert.equal(response.statusCode, 404);
});

test("a sleeping database is a 503 with a retry hint", async () => {
  const db = { async query() { throw Object.assign(new Error("resuming"), { name: "DatabaseResumingException" }); } };
  const response = await createHandler({ db })(request("GET", "/health"));
  assert.equal(response.statusCode, 503);
  assert.equal(response.headers["retry-after"], "20");
});

test("an unexpected failure is logged and reported without internals", async () => {
  const db = { async query() { throw new Error("relation secret_table does not exist"); } };
  const original = console.error;
  console.error = () => {};
  try {
    const response = await createHandler({ db })(request("GET", "/health"));
    assert.equal(response.statusCode, 500);
    assert.ok(!response.body.includes("secret_table"));
  } finally {
    console.error = original;
  }
});

test("search pages at 50 by default and never beyond the cap", () => {
  assert.equal(buildMovementQuery({}).limit, PAGE_SIZE);
  assert.match(buildMovementQuery({}).sql, /limit 51$/);
  assert.equal(buildMovementQuery({ limit: "5000" }).limit, MAX_PAGE_SIZE);
  assert.equal(buildMovementQuery({ limit: "nonsense" }).limit, PAGE_SIZE);
});

test("filters become parameters, never SQL text", () => {
  const { sql, params } = buildMovementQuery({ vehicle: "G0001'; drop table movements; --", driver: "E1001", location: "Linden", date: "2026-09-13", direction: "out" });
  assert.ok(!sql.includes("drop table"));
  assert.equal(params.vehicle, "%G0001'; drop table movements; --%");
  assert.equal(params.direction, "OUT");
  assert.match(sql, /AT TIME ZONE 'America\/New_York'/);
});

test("LIKE wildcards typed by a person are searched for literally", () => {
  assert.equal(buildMovementQuery({ driver: "50%_off" }).params.driver, "%50\\%\\_off%");
});

test("bad filters are refused with a reason", async () => {
  const handler = createHandler({ db: recordingDb() });
  const badDate = await handler(request("GET", "/v1/movements", { claims: signedIn, query: { date: "09/13/26" } }));
  assert.equal(badDate.statusCode, 400);
  const badDirection = await handler(request("GET", "/v1/movements", { claims: signedIn, query: { direction: "SIDEWAYS" } }));
  assert.equal(badDirection.statusCode, 400);
  const badCursor = await handler(request("GET", "/v1/movements", { claims: signedIn, query: { before: "not-a-cursor" } }));
  assert.equal(badCursor.statusCode, 400);
});

// Cursors are built from the API's own timestamps, which since the UTC fix are always explicit
// instants like "2026-09-13T19:35:00.123456Z".
test("the next-page cursor round-trips", () => {
  const cursor = encodeCursor({ occurred_at: "2026-09-13T19:35:00.123456Z", id: 42 });
  assert.deepEqual(decodeCursor(cursor), { at: "2026-09-13T19:35:00.123456Z", id: 42 });
});

test("a full page carries a cursor and the first page carries the total", async () => {
  const rows = Array.from({ length: 51 }, (_, index) => ({ id: 100 - index, occurred_at: `2026-09-13T19:${String(59 - index % 60).padStart(2, "0")}:00.000000Z` }));
  const db = recordingDb((sql) => (sql.includes("count(*)") ? [{ total: 132 }] : rows));
  const page = await movementPage(db, {});
  assert.equal(page.movements.length, 50);
  assert.equal(page.total, 132);
  assert.deepEqual(decodeCursor(page.next), { at: rows[49].occurred_at, id: rows[49].id });
  const later = await movementPage(recordingDb(() => rows.slice(0, 3)), { before: page.next });
  assert.equal(later.next, null);
  assert.equal(later.total, undefined, "later pages do not recount");
});

// The Data API renders a timestamptz as "2026-09-18 22:59:47.718031": the right instant, in UTC,
// with nothing to say so. A browser reads that as local time, so the first movements read back
// four hours out of place. Every timestamp must leave the API as an explicit instant.
test("every timestamp the API returns says it is UTC", () => {
  const { sql } = buildMovementQuery({});
  assert.match(sql, /to_char\(m\.occurred_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS\.US"Z"'\) as occurred_at/);
  assert.match(sql, /as received_at/);
  assert.equal(utc("x.created_at", "created_at"), `to_char(x.created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as created_at`);
});

test("the reference lists carry the same explicit instants", async () => {
  const seen = [];
  await referenceData({ query: async (sql) => { seen.push(sql); return []; } });
  const stamped = seen.filter((sql) => sql.includes("AT TIME ZONE 'UTC'"));
  // locations, drivers, vehicles, devices and authorizations all carry a timestamp; approvers do not.
  assert.equal(stamped.length, 5);
});

// --- bad input is the caller's mistake, not a server fault (review after step 4) ---

test("an impossible date is refused with a 400 before it reaches the database", () => {
  assert.throws(() => buildMovementQuery({ date: "2026-02-30" }), /real date/);
  assert.throws(() => buildMovementQuery({ date: "2026-13-01" }), /real date/);
  assert.ok(buildMovementQuery({ date: "2028-02-29" }), "a leap day is a real date");
});

test("a forged cursor is refused with a 400 before it reaches the database", () => {
  const forge = (value) => Buffer.from(JSON.stringify(value)).toString("base64url");
  assert.throws(() => decodeCursor(forge({ at: "not-a-time", id: 5 })), /not a cursor this API issued/);
  assert.throws(() => decodeCursor(forge({ at: "2026-09-18T22:59:47.718031Z", id: -1 })), /not a cursor/);
  assert.throws(() => decodeCursor("%%%"), /not a cursor/);
  assert.deepEqual(decodeCursor(forge({ at: "2026-09-18T22:59:47.718031Z", id: 5 })), { at: "2026-09-18T22:59:47.718031Z", id: 5 });
});

test("the paging cursor keeps the microseconds, so no row in the same millisecond is skipped", () => {
  const cursor = encodeCursor({ occurred_at: "2026-09-18T22:59:47.718031Z", id: 10 });
  assert.equal(decodeCursor(cursor).at, "2026-09-18T22:59:47.718031Z");
});

test("the search reports who uploaded each movement", () => {
  assert.match(buildMovementQuery({}).sql, /m\.uploaded_by/);
});
