// CR-V17: the statement splitter and the migration runner.

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { splitSql } from "../src/sql-split.mjs";
import { createMigrator } from "../src/migrate.mjs";

const schema = (name) => readFileSync(new URL(`../../infra/schema/${name}`, import.meta.url), "utf8");

test("001 splits into its 24 statements", () => {
  assert.equal(splitSql(schema("001_initial.sql")).length, 24);
});

test("002 splits into its 21 statements", () => {
  assert.equal(splitSql(schema("002_scan_created_inventory.sql")).length, 21);
});

// The comment that cut app_users in half on the way into Veri-Gate Dev.
test("a semicolon inside a trailing comment does not end the statement", () => {
  const app = splitSql(schema("001_initial.sql")).find((statement) => statement.startsWith("CREATE TABLE app_users"));
  assert.ok(app.includes("purge_after"), "app_users must arrive whole");
  assert.ok(!app.includes("soft delete"), "comments are dropped");
});

test("a dollar-quoted function body stays in one piece", () => {
  const fn = splitSql(schema("001_initial.sql")).find((statement) => statement.startsWith("CREATE OR REPLACE FUNCTION"));
  assert.ok(fn.includes("RETURN NEW;") && fn.trimEnd().endsWith("LANGUAGE plpgsql"));
});

test("strings keep their semicolons, dashes and doubled quotes", () => {
  const [statement] = splitSql("insert into t values ('a; b -- c ''d''');");
  assert.equal(statement, "insert into t values ('a; b -- c ''d''')");
});

test("tagged dollar quotes are honoured", () => {
  assert.equal(splitSql("select $fn$ one; two $fn$; select 2;").length, 2);
});

test("BEGIN and COMMIT are left to the runner", () => {
  assert.deepEqual(splitSql("BEGIN;\nselect 1;\nCOMMIT;\n"), ["select 1"]);
});

test("adjacent string literals keep the line break PostgreSQL needs", () => {
  const comment = splitSql(schema("002_scan_created_inventory.sql")).find((statement) => statement.startsWith("COMMENT ON COLUMN"));
  // The schema files are checked out with Windows line endings; either break is a newline to SQL.
  assert.match(comment, /'\r?\n\s*'/);
});

test("003 carries both append-only guards whole", () => {
  const statements = splitSql(schema("003_application_fields.sql"));
  const audit = statements.find((statement) => statement.startsWith("CREATE OR REPLACE FUNCTION forbid_audit_change"));
  const movement = statements.find((statement) => statement.startsWith("CREATE OR REPLACE FUNCTION guard_movement_change"));
  assert.ok(audit && audit.includes("RAISE EXCEPTION"));
  assert.ok(movement && movement.includes("IS DISTINCT FROM"));
  assert.ok(statements.some((statement) => statement.startsWith("CREATE TRIGGER movements_append_only")));
});

// A fake database good enough to watch the runner's decisions.
function fakeDb({ tracked = [], trackingTable = tracked.length > 0, vehiclesExists = true, oldColumns = 0 } = {}) {
  const log = [];
  const versions = new Set(tracked);
  let tableExists = trackingTable;
  return {
    log,
    async execute(sql, params = {}, transactionId) {
      log.push({ sql, params, transactionId });
      if (sql.includes("CREATE TABLE schema_migrations")) tableExists = true;
      if (params.version) versions.add(params.version);
      return { updated: 1 };
    },
    async query(sql) {
      if (sql.includes("to_regclass('public.schema_migrations')")) return [{ tracking: tableExists ? "schema_migrations" : null }];
      if (sql.includes("to_regclass('public.vehicles')")) return [{ vehicles: vehiclesExists ? "vehicles" : null }];
      if (sql.includes("information_schema.columns")) return [{ old: oldColumns }];
      if (sql.includes("select version from schema_migrations")) return [...versions].map((version) => ({ version }));
      return [];
    },
    async transaction(work) { return work("tx-1"); }
  };
}

const three = async () => ["001_initial", "002_scan_created_inventory", "003_application_fields"].map((version) => ({ version, sql: schema(`${version}.sql`) }));

test("a database migrated by hand is recognised, and only 003 runs", async () => {
  const db = fakeDb();
  const result = await createMigrator({ db, loadMigrations: three })();
  assert.deepEqual(result.baselined, ["001_initial", "002_scan_created_inventory"]);
  assert.deepEqual(result.results.map((item) => item.version), ["003_application_fields"]);
  assert.ok(db.log.filter((entry) => entry.transactionId === "tx-1").length > 10, "003 runs inside the transaction");
});

test("an empty database gets every migration", async () => {
  const result = await createMigrator({ db: fakeDb({ vehiclesExists: false }), loadMigrations: three })();
  assert.deepEqual(result.baselined, []);
  assert.deepEqual(result.results.map((item) => item.version), ["001_initial", "002_scan_created_inventory", "003_application_fields"]);
});

// Veri-Gate Dev as it stood before the runner first ran: 001 and 002 in, no tracking table.
test("a dry run writes nothing at all, but says what would run", async () => {
  const db = fakeDb();
  const result = await createMigrator({ db, loadMigrations: three })({ dryRun: true });
  assert.deepEqual(result.baselined, ["001_initial", "002_scan_created_inventory"]);
  assert.deepEqual(result.results, [{ version: "003_application_fields", statements: splitSql(schema("003_application_fields.sql")).length, applied: false }]);
  assert.equal(db.log.length, 0, "not even the tracking table is created");
});

test("the first real run creates the tracking table and records the hand-applied files", async () => {
  const db = fakeDb();
  await createMigrator({ db, loadMigrations: three })();
  assert.ok(db.log[0].sql.includes("CREATE TABLE schema_migrations"));
  assert.deepEqual(db.log.slice(1, 3).map((entry) => entry.params.version), ["001_initial", "002_scan_created_inventory"]);
});

test("running again applies nothing", async () => {
  const db = fakeDb({ tracked: ["001_initial", "002_scan_created_inventory", "003_application_fields"] });
  const result = await createMigrator({ db, loadMigrations: three })();
  assert.deepEqual(result.results, []);
});
