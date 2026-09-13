// Applies database migrations: every infra/schema/NNN_*.sql not yet recorded in schema_migrations,
// in order, each file in one transaction, so a failure part-way leaves nothing behind.
//
// It runs inside AWS as its own Lambda, invoked on demand, so a migration is one command and the
// same in Dev and Prod. Before this, 001 and 002 went in by pasting SQL into CloudShell.

import { readdir, readFile } from "node:fs/promises";
import { createDb } from "./db.mjs";
import { splitSql } from "./sql-split.mjs";

export function createMigrator({ db, loadMigrations }) {
  // A dry run only reads: it does not even create the tracking table.
  return async function migrate({ dryRun = false } = {}) {
    const [{ tracking }] = await db.query("select to_regclass('public.schema_migrations')::text as tracking");
    if (!tracking && !dryRun) {
      await db.execute(`CREATE TABLE schema_migrations (
        version     text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now(),
        statements  integer,
        note        text
      )`);
    }
    const applied = new Set(tracking ? (await db.query("select version from schema_migrations")).map((row) => row.version) : []);
    const baselined = await handAppliedMigrations(db, applied);
    for (const version of baselined) {
      if (!dryRun) await db.execute("insert into schema_migrations (version, note) values (:version, 'applied by hand before tracking')", { version });
      applied.add(version);
    }
    const migrations = (await loadMigrations()).sort((a, b) => a.version.localeCompare(b.version));
    const results = [];

    for (const migration of migrations.filter((item) => !applied.has(item.version))) {
      const statements = splitSql(migration.sql);
      if (dryRun) {
        results.push({ version: migration.version, statements: statements.length, applied: false });
        continue;
      }
      await db.transaction(async (transactionId) => {
        for (const statement of statements) await db.execute(statement, {}, transactionId);
        await db.execute("insert into schema_migrations (version, statements) values (:version, :statements)",
          { version: migration.version, statements: statements.length }, transactionId);
      });
      results.push({ version: migration.version, statements: statements.length, applied: true });
    }

    return { dryRun, baselined, alreadyApplied: [...applied].sort(), results };
  };
}

// The Veri-Gate Dev database received 001 and 002 by hand on 2026-09-13, before this table
// existed. Their effects are checked, not assumed, so an empty database still gets 001 and 002.
async function handAppliedMigrations(db, applied) {
  if (applied.size > 0) return [];
  const [{ vehicles }] = await db.query("select to_regclass('public.vehicles')::text as vehicles");
  if (vehicles !== "vehicles") return [];
  const [{ old }] = await db.query("select count(*) as old from information_schema.columns where table_name = 'vehicles' and column_name = 'inventory_status'");
  return Number(old) === 0 ? ["001_initial", "002_scan_created_inventory"] : ["001_initial"];
}

export function migrationsFrom(directoryUrl) {
  return async () => {
    const names = (await readdir(directoryUrl)).filter((name) => /^\d{3}_.*\.sql$/.test(name));
    return Promise.all(names.map(async (name) => ({ version: name.replace(/\.sql$/, ""), sql: await readFile(new URL(name, directoryUrl), "utf8") })));
  };
}

export async function handler(event = {}) {
  const migrate = createMigrator({ db: createDb(process.env), loadMigrations: migrationsFrom(new URL("./migrations/", import.meta.url)) });
  const result = await migrate({ dryRun: event.dryRun === true });
  console.log(JSON.stringify({ level: "info", ...result }));
  return result;
}
