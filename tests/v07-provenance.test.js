const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

assert.match(app, /function canonicalEmployeeId\(value\)/, "employee IDs must migrate through one canonical helper");
assert.match(app, /return digits \? `E\$\{digits\}` : ""/, "canonical employee format must be E####");
assert.match(app, /function canonicalVehicleBarcode\(value, index\)/, "vehicle IDs must migrate through one canonical helper");
assert.match(app, /return digits \? `G\$\{digits\.padStart\(4, "0"\)\}` : ""/, "canonical vehicle format must be G####");
assert.match(app, /"DEV-DIV-01": "D0001"/, "legacy device IDs require explicit mappings");
assert.match(app, /"DEV-FLOAT-01": "D0005"/, "all legacy device IDs require explicit mappings");
assert.match(app, /PRE_CALL_MIGRATION_BACKUP_KEY/, "migration must retain a browser-local backup before conversion");
assert.match(app, /state\.feedback\.unshift/, "feedback must be retained in prototype state");
assert.match(html, /Save feedback locally/, "feedback must not imply server delivery");
assert.match(html, /Drivers are not application users/, "roles must retain a prototype-only boundary");
assert.match(worker, /lot-watch-gateflow-v0\.7-call-updates-static/, "cache version must change for the call updates");
assert.doesNotMatch(`${app}\n${html}`, /return "Scan"|verified scanner hardware/i, "prototype must not claim verified scan hardware");

console.log("Patrick call ID, migration, feedback, and cache checks passed.");
