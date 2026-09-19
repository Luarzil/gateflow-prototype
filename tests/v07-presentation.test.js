const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

assert.equal((html.match(/class="wizard-step(?: hidden)?" data-step="[0-3]"/g) || []).length, 4, "scanner must have four steps");
assert.match(html, /example E1003/, "employee example must use E####");
assert.match(html, /placeholder="G0001"/, "vehicle example must use G####");
assert.match(html, /id="openScannerFeedbackButton"/, "scanner feedback must be available");
assert.match(html, /id="usersSection"/, "desktop Users tab must be present");
assert.match(html, /id="openDeviceSetupButton"/, "device setup must be in Supervisor controls");
assert.doesNotMatch(html, /id="deviceSetupButton"/, "scanner must not offer device setup");
assert.doesNotMatch(html, />Network available</, "scanner must not show connectivity diagnostics");
assert.doesNotMatch(html, />Saved locally</, "scanner must not show local-save diagnostics");
assert.doesNotMatch(html, /Keyboard-wedge|Zebra/, "scanner must not expose hardware terminology");
assert.match(css, /\.scanner-layout \{ grid-template-columns: minmax\(320px, 620px\); \}/, "desktop scanner layout must be one column");
assert.match(app, /\{ name: "EWR North", active: true \}/, "EWR North must be configured");
assert.doesNotMatch(app, /\{ name: "Elizabeth Repair Facility"/, "removed yard must not be seeded");
assert.match(app, /\["Movement", `Vehicle \$\{ui\.direction\}`\][\s\S]*?\["Authorization", authorization\]/, "review must contain only movement, location, driver, vehicle, and authorization");

console.log("Patrick call scanner presentation checks passed.");
