const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");

assert.match(app, /const ENTRY_METHODS = \["scanner_field", "manual"\];/, "new entry paths need an explicit allowlist");
assert.match(app, /const LEGACY_ENTRY_METHOD = "legacy_unknown";/, "legacy provenance must remain unknown");
assert.match(app, /transaction\.vehicleEntryMethod === undefined \? transaction\.barcodeEntryMethod : transaction\.vehicleEntryMethod/, "prior barcode method must migrate only when vehicle method is missing");
assert.match(app, /const normalized = normalizeV07State\(saved\);[\s\S]*localStorage\.setItem\(STORAGE_KEY, JSON\.stringify\(normalized\)\);/, "normalized V0.7 provenance must persist across reloads");
assert.match(app, /if \(method === "scanner_field" \|\| method === "standard_input"\) return "scanner_field";/, "explicit standard-field values may normalize to scanner_field");
assert.doesNotMatch(app, /method === "scanner"[^\n]*return "scanner_field"|method === "scan"[^\n]*return "scanner_field"/, "ambiguous legacy scanner values must not become verified scanner paths");
assert.match(app, /return LEGACY_ENTRY_METHOD;/, "missing or ambiguous methods must remain unknown");
assert.match(app, /ui\.driverEntryMethod = "manual";/, "manual employee dialog must record manual");
assert.match(app, /ui\.vehicleEntryMethod = "manual";/, "manual vehicle dialog must record manual");
assert.match(app, /ui\.driverEntryMethod !== "manual"\) ui\.driverEntryMethod = "scanner_field";/, "standard employee acceptance must record the scanner field path");
assert.match(app, /ui\.vehicleEntryMethod !== "manual"\) ui\.vehicleEntryMethod = "scanner_field";/, "standard vehicle acceptance must record the scanner field path");
assert.match(app, /driverEntryMethod: draft\.driverEntryMethod,[\s\S]*vehicleEntryMethod: draft\.vehicleEntryMethod/, "new transactions must persist separate methods");
assert.match(app, /\["Driver entry path", entryMethodLabel\(ui\.driverEntryMethod\)\][\s\S]*\["Vehicle entry path", entryMethodLabel\(ui\.vehicleEntryMethod\)\]/, "review must show separate entry paths");
assert.match(app, /\["Driver entry path", entryMethodLabel\(transaction\.driverEntryMethod\)\][\s\S]*\["Vehicle entry path", entryMethodLabel\(transaction\.vehicleEntryMethod\)\]/, "confirmation must show separate entry paths");
assert.match(html, /<th>Driver entry path<\/th>[\s\S]*<th>Vehicle entry path<\/th>/, "Search needs separate entry-path columns");
assert.match(html, /Entry path identifies the application field used; it does not verify scanner hardware\./, "UI must disclose the entry-path limitation");
assert.match(readme, /whether each value came through the scanner field or the explicit manual-entry workflow\. This entry-path metadata does not verify scanner hardware\./, "README must describe conservative entry-path metadata");
assert.doesNotMatch(`${app}\n${html}`, /return "Scan"|entry path:\s*Scan(?:[.;<]|$)/i, "entry-path UI must not label ordinary typing as a verified scan");
assert.doesNotMatch(readme, /barcode was scanned|verified (?:scanner|scan)|scanner hardware (?:was|is) verified/i, "README must not claim verified scanner hardware use");
assert.doesNotMatch(`${app}\n${html}`, /immutable provenance|trusted provenance/i, "client UI must not claim provenance is immutable or trusted");

console.log("V0.7 provenance structural regression checks passed.");
