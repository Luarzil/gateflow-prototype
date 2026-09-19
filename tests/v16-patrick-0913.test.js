// CR-V16-PATRICK-0913-001
//
// Patrick's 2026-09-13 list. Source assertions in the style of the other static suites; the
// behaviour is exercised by the click-path validator and by hand in the browser.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const includes = (source, needle) => () => assert.ok(source.includes(needle), `Missing: ${needle}`);
const excludes = (source, needle) => () => assert.ok(!source.includes(needle), `Should be gone: ${needle}`);

// --- supervisor right-hand panels -----------------------------------------

test("license warnings use the short label, like the roster", includes(app, 'title="${escapeHtml(license.label)}">${escapeHtml(license.short)}</span></td><td>${driver.active'));

test("the authorizations panel states its own cross-check", includes(html, 'id="authorizationCrossCheck"'));

test("the cross-check recounts from the roster", includes(app, "const rosterAuthorized = state.drivers.filter((driver) => findActiveAuthorization(driver.employeeNumber)).length;"));

test("a disagreement between the two counts is reported, not hidden", includes(app, "Check: this list has ${activeAuths.length}, but the roster shows ${rosterAuthorized} authorized."));

// --- supervisor main area -------------------------------------------------

test("the Locations placeholder is gone", excludes(html, 'id="locationList"'));

test("the Label printer placeholder is gone", excludes(html, "Future label printer settings"));

test("drivers are sorted by recent activity", includes(app, ".sort((a, b) => lastMoved(b) - lastMoved(a) || a.name.localeCompare(b.name));"));

test("vehicles are sorted by recent activity", includes(app, "vehicles.sort((a, b) => lastMoved(b) - lastMoved(a) || a.assignedBarcode.localeCompare(b.assignedBarcode));"));

// An employee # may contain letters since CR-V14, so G0001 could be a driver or a barcode.
test("activity keys cannot collide across drivers and vehicles", () => {
  for (const key of ["`driver:${item.driverEmployee}`", "`vehicle:${item.vehicleId}`", "`barcode:${item.vehicleBarcode}`"]) {
    assert.ok(app.includes(key), `Missing prefixed key ${key}`);
  }
});

// --- scanner: no identities an operator could copy -------------------------

test("the Gate activity feed is gone from the scanner", () => {
  assert.ok(!html.includes('id="gateMiniFeed"'), "feed markup must be removed");
  assert.ok(!app.includes("function renderRecentActivity"), "feed renderer must be removed");
});

test("the review step names the driver without the employee #", includes(app, '["Driver", driver ? driver.name : "Awaiting employee #"],'));

test("the blocked-OUT screen names the driver without the employee #", includes(app, "el.supervisorReason.textContent = `${driver.name} is not authorized"));

test("the approver is named, not shown by ID", () => {
  assert.ok(!app.includes("el.supervisorStatus.textContent = `${supervisor.id}"), "no supervisor status may start with the approver ID");
  assert.ok(app.includes("el.supervisorStatus.textContent = `${supervisor.name} (${supervisor.role}) is ready to approve.`"));
});

test("the saved notice names the driver without the employee #", includes(app, "saved for ${transaction.driverName} / ${transaction.vehicleBarcode}"));

test("the two ID fields start masked", () => {
  assert.ok(html.includes('<input id="driverInput" class="id-masked"'), "driver field must start masked");
  assert.ok(html.includes('<input id="supervisorInput" class="id-masked"'), "approver field must start masked");
  assert.ok(!html.includes('<input id="barcodeInput" class="id-masked"'), "a vehicle barcode is not an identity and stays readable");
});

test("the mask only changes what is drawn", includes(css, ".id-masked { -webkit-text-security: disc; }"));

test("tapping to type removes the mask", includes(app, 'input.classList.remove("id-masked");'));

test("returning to scan-first restores the mask", includes(app, 'if (input !== el.barcodeInput) input.classList.add("id-masked");'));

test("the blocked-OUT screen re-masks the approver field itself", includes(app, 'el.supervisorInput.classList.add("id-masked");'));

// --- search ---------------------------------------------------------------

test("search pages at 50", includes(app, "const SEARCH_PAGE_SIZE = 50;"));

test("only one page is rendered at a time", includes(app, "const shown = results.slice(0, ui.searchLimit || SEARCH_PAGE_SIZE);"));

test("a new search starts back at the first page", includes(app, "if (resetPage) ui.searchLimit = SEARCH_PAGE_SIZE;"));

test("there is a control for the next page", includes(html, 'id="searchMoreButton"'));

test("Print sits beside Clear", includes(html, 'id="clearSearchButton" type="button">Clear</button><button class="button secondary" id="printSearchButton" type="button">Print</button>'));

test("printing needs a name", includes(app, "Enter your name first. It is printed with the search details."));

test("the printout carries criteria, search time, row count and who printed it", () => {
  for (const label of ['["Search criteria", criteria]', '["Search run",', '["Rows printed",', '["Printed by",']) {
    assert.ok(app.includes(label), `Missing footer line ${label}`);
  }
});

test("printing is recorded", includes(app, '"search_printed"'));

test("the print stylesheet leaves only the results and footer", () => {
  assert.ok(css.includes("@media print"), "print stylesheet required");
  assert.ok(css.includes(".topbar, #scannerView, #supervisorView, #searchForm"), "chrome must be hidden on paper");
  assert.ok(css.includes(".print-only { display: block !important; }"), "the footer must print");
});

// --- dates ----------------------------------------------------------------

test("dates are MM/DD/YY", includes(app, 'new Intl.DateTimeFormat("en-US", { timeZone: BUSINESS_TIMEZONE, month: "2-digit", day: "2-digit", year: "2-digit" })'));

test("timestamps are MM/DD/YY with the time", includes(app, 'month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit"'));

test("no date is still written with a month name", excludes(app, 'month: "short"'));

// --- the location override -------------------------------------------------

test("the override is per location and defaults off", includes(app, "return { enabled: source.enabled === true,"));

test("saved locations keep their override setting", includes(app, "scanOverride: normalizeScanOverride(location.scanOverride)"));

test("a typed employee # is never covered", includes(app, 'if (draft.driverEntryMethod !== "scanner_field") return { applies: false,'));

test("an expired license still blocks under the override", includes(app, 'if (!draft.driver.active || licenseStatus(draft.driver).tone === "expired") return { applies: false,'));

test("a driver revoked today is not let out by the override", includes(app, "if (revokedToday(draft.driver.employeeNumber)) return { applies: false,"));

test("an override exit is recorded as an override, not as authorized", () => {
  assert.ok(app.includes('const LOCATION_OVERRIDE_STATUS = "Location override";'));
  assert.ok(app.includes('const authorizationStatus = auth ? "Authorized" : draft.override ? LOCATION_OVERRIDE_STATUS : "Unauthorized";'));
  assert.ok(app.includes('"location_override_exit"'));
});

test("switching the override is confirmed and recorded", () => {
  assert.ok(app.includes("if (typeof confirm === \"function\" && !confirm(question)) return;"));
  assert.ok(app.includes('turningOn ? "location_override_enabled" : "location_override_disabled"'));
});

test("the override has its own Admin tab", includes(html, 'data-supervisor-section="adminSection" data-needs="admin">Admin</button>'));

test("the Fleet Lead block is otherwise unchanged", includes(app, "blockOutForSupervisor(draft.driver, override.explanation);"));
