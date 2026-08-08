const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function count(pattern, source) {
  return (source.match(pattern) || []).length;
}

assert.equal(count(/class="wizard-step(?: hidden)?" data-step="[0-3]"/g, html), 4, "wizard must contain four steps");
for (let step = 1; step <= 4; step += 1) {
  assert.match(html, new RegExp(`Step ${step} of 4\\.`), `step ${step} must use four-step wording`);
  assert.match(html, new RegExp(`aria-label="Step ${step} of 4"`), `progress marker ${step} must be labelled`);
}
assert.doesNotMatch(html, /Step [1-4] of 3/, "obsolete three-step wording must be removed");

assert.match(html, /id="driverNext"/, "step 1 action must remain present");
assert.match(html, /id="submitTransactionButton"/, "step 4 action must remain present");
assert.ok(count(/wizard-actions/g, html) >= 2, "steps 1 and 4 must use the mobile-safe action treatment");
assert.match(css, /\.wizard-actions\s*\{[^}]*position:\s*sticky;[^}]*bottom:\s*calc\(8px \+ env\(safe-area-inset-bottom\)\);/s, "wizard action bar must remain sticky above the device safe area");
assert.match(css, /safe-area-inset-bottom/, "wizard action bar must account for the device safe area");
assert.match(css, /@media \(max-width: 760px\)[\s\S]*?\.wizard-actions \{ position: fixed; left: 12px; right: 12px;/, "mobile primary actions must be docked to the viewport at 360x800 and 412x915");
assert.match(css, /\.scanner-stage:has\(#scanWizard:not\(\.hidden\)\) \{ padding-bottom: calc\(86px \+ env\(safe-area-inset-bottom\)\); \}/, "mobile content must reserve room for the action dock");

assert.doesNotMatch(html, /Scanner ready|Zebra TC-series input|No Zebra hardware is required/, "unverified scanner readiness claims must not appear");
assert.match(html, /Hardware connection status is not reported on this screen\./, "scanner status limitation must be truthful");
assert.doesNotMatch(html, /Reset demo|data-demo-field|Scanner input test|5G \/ Wi-Fi: future/, "operating screen must not expose demo or development controls");
assert.doesNotMatch(app, /active demo roster|prototype flexibility|prototype still works for this session/, "runtime messages must not expose development wording");

assert.match(app, /Elizabeth Repair Facility"\s*,\s*active:\s*false\s*,\s*historicalOnly:\s*true/, "Elizabeth must remain historical only");
assert.match(app, /function activeLocations\(\) \{\s*return state\.locations\.filter\(\(location\) => location\.active\);\s*\}/s, "scanner choices must include active locations only");
assert.doesNotMatch(app, /if \(step === 3\) el\.submitTransactionButton\.focus\(\);/, "step 4 must not auto-focus Submit or jump to the end");
assert.match(app, /if \(step === 3\) el\.reviewStepTitle\.focus\(\);/, "step 4 must open at its heading");
assert.match(app, /el\.driverInput\.focus\(\{ preventScroll: true \}\);[\s\S]*?el\.driverInput\.scrollIntoView\(\{ block: "center", inline: "nearest" \}\);/, "step 1 must position the focused input clear of the action dock");
assert.match(html, /id="reviewStepTitle" tabindex="-1"/, "step 4 heading must accept programmatic focus");
assert.match(html, />Network available</, "initial connectivity wording must be precise");
assert.match(app, /isOnline \? "Network available" : "Network unavailable"/, "connectivity updates must avoid ambiguous online wording");
assert.match(app, /location\.historicalOnly \? `\$\{location\.name\} \(history only\)`/, "historical search filter must label historical-only locations");
assert.match(app, /isHistoricalOnlyLocation\(item\.location\)[\s\S]*?History only/, "historical search rows must show historical-only status");

console.log("V0.7 presentation regression checks passed (four steps, mobile actions, scanner wording, historical-only location).");
