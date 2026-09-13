// Assembles build/api for `aws cloudformation package`: the Lambda source plus the schema
// migrations the migrate function applies. build/ is not committed.
//
// Usage: node tools/build-api.mjs

import { cpSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "build", "api");

rmSync(out, { recursive: true, force: true });
mkdirSync(join(out, "migrations"), { recursive: true });

const sources = readdirSync(join(root, "api", "src")).filter((name) => name.endsWith(".mjs"));
sources.forEach((name) => cpSync(join(root, "api", "src", name), join(out, name)));

const migrations = readdirSync(join(root, "infra", "schema")).filter((name) => /^\d{3}_.*\.sql$/.test(name));
migrations.forEach((name) => cpSync(join(root, "infra", "schema", name), join(out, "migrations", name)));

writeFileSync(join(out, "package.json"), JSON.stringify({ name: "veri-gate-api", private: true, type: "module" }, null, 2));
console.log(`build/api: ${sources.length} source files, ${migrations.length} migrations`);
