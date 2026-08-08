const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

assert.match(app, /const ENTRY_METHODS = \["scan", "manual"\];/, "new entry methods need an explicit allowlist");
assert.match(app, /const LEGACY_ENTRY_METHOD = "legacy_unknown";/, "legacy provenance must remain unknown");
assert.match(app, /transaction\.vehicleEntryMethod === undefined \? transaction\.barcodeEntryMethod : transaction\.vehicleEntryMethod/, "prior barcode method must migrate only when vehicle method is missing");
assert.match(app, /const normalized = normalizeV07State\(saved\);[\s\S]*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(normalized\)\);/, "normalized V0.7 provenance must persist across reloads");
assert.match(app, /if \(method === "scanner" \|\| method === "scan"\) return "scan";/, "prior scanner value must normalize to scan");
assert.match(app, /return LEGACY_ENTRY_METHOD;/, "missing methods must never infer scan");
assert.match(app, /ui\.driverEntryMethod = "manual";/, "manual employee dialog must record manual");
assert.match(app, /ui\.vehicleEntryMethod = "manual";/, "manual vehicle dialog must record manual");
assert.match(app, /ui\.driverEntryMethod !== "manual"\) ui\.driverEntryMethod = "scan";/, "standard employee acceptance must record scan");
assert.match(app, /ui\.vehicleEntryMethod !== "manual"\) ui\.vehicleEntryMethod = "scan";/, "standard vehicle acceptance must record scan");
assert.match(app, /driverEntryMethod: draft\.driverEntryMethod,[\s\S]*vehicleEntryMethod: draft\.vehicleEntryMethod/, "new transactions must persist separate methods");
assert.match(app, /\["Driver entry", entryMethodLabel\(ui\.driverEntryMethod\)\][\s\S]*\["Vehicle entry", entryMethodLabel\(ui\.vehicleEntryMethod\)\]/, "review must show separate methods");
assert.match(app, /\["Driver entry", entryMethodLabel\(transaction\.driverEntryMethod\)\][\s\S]*\["Vehicle entry", entryMethodLabel\(transaction\.vehicleEntryMethod\)\]/, "confirmation must show separate methods");
assert.match(html, /<th>Driver entry<\/th>[\s\S]*<th>Vehicle entry<\/th>/, "Search needs separate provenance columns");
assert.doesNotMatch(`${app}\n${html}`, /immutable provenance|trusted provenance/i, "client UI must not claim provenance is immutable or trusted");

console.log("V0.7 provenance structural regression checks passed.");
