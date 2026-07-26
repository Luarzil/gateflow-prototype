"use strict";

/*
  Internal regression runner for the sibling static GateFlow review app.
  It deliberately uses the rendered UI first, then checks localStorage only as
  evidence that the UI action saved the expected result. Keep this in-house:
  it is not a production test platform or a customer-facing feature.
*/

const STATE_KEY = "lot-watch.gateflow.v0.6.state";
const V05_STATE_KEY = "lot-watch.gateflow.v0.5.state";
const LEGACY_STATE_KEY = "lot-watch.gateflow.v0.4.state";
const frame = document.getElementById("targetFrame");
const runAllButton = document.getElementById("runAllButton");
const resetTargetButton = document.getElementById("resetTargetButton");
const runnerStatus = document.getElementById("runnerStatus");
const targetStatus = document.getElementById("targetStatus");
const testList = document.getElementById("testList");
const runLog = document.getElementById("runLog");
const summaryBox = document.getElementById("summaryBox");

let running = false;
let savedStorage = null;

const tests = [
  ["V0.6 navigation and Audit removal", testSurface],
  ["Connectivity and scanner-test surfaces", testConnectivity],
  ["Location-derived station identity", testStations],
  ["Working Location persists after reload", testLocationPersistence],
  ["Invalid and inactive driver blocks", testInvalidDriver],
  ["Vehicle barcode lookup and inactive block", testBarcodeRules],
  ["Authorized Vehicle OUT", testAuthorizedOut],
  ["Unauthorized Vehicle IN review", testUnauthorizedIn],
  ["Unauthorized Vehicle OUT is blocked", testUnauthorizedOutBlock],
  ["Invalid supervisor cannot approve", testInvalidSupervisor],
  ["Supervisor temporary OUT override", testSupervisorOverride],
  ["Expired license blocks Vehicle OUT", testExpiredLicenseBlock],
  ["Manual employee rejection", testManualEntry],
  ["Supervisor drivers layout and license warnings", testSupervisor],
  ["Driver creation, duplicate protection, and reactivation", testDriverManagement],
  ["Vehicle inventory, barcode protection, and restore", testVehicleInventory],
  ["Exact authorization duration calculations", testDurationCalculations],
  ["Revoked authorization blocks Vehicle OUT", testRevocation],
  ["Scanner Enter diagnostic", testScannerDiagnostics],
  ["Reset-demo recovery", testResetRecovery],
  ["Movement and historical-location search", testSearch],
  ["V0.5 localStorage migration", testMigration]
];

renderTests();
frame.addEventListener("load", () => {
  targetStatus.textContent = "Loaded";
  installTargetSafetyHooks();
});
runAllButton.addEventListener("click", runAll);
resetTargetButton.addEventListener("click", async () => {
  const snapshot = captureStorage();
  await freshTarget();
  restoreStorage(snapshot);
  await reloadTarget();
  log("Target data restored from the pre-reset snapshot.");
});
document.getElementById("clearLogButton").addEventListener("click", () => { runLog.textContent = "Log cleared."; });

function renderTests(results = []) {
  testList.innerHTML = tests.map(([name], index) => {
    const result = results[index] || { status: "pending", detail: "Not run" };
    const icon = result.status === "passed" ? "OK" : result.status === "failed" ? "!" : result.status === "running" ? "..." : "-";
    return `<li class="test-item ${result.status}"><span class="result-icon">${icon}</span><div><strong>${escapeHtml(name)}</strong><span>${escapeHtml(result.detail)}</span></div><em>${result.elapsed || ""}</em></li>`;
  }).join("");
}

async function runAll() {
  if (running) return;
  running = true;
  savedStorage = captureStorage();
  const results = tests.map(() => ({ status: "pending", detail: "Waiting" }));
  setRunnerStatus("Running", "running");
  runAllButton.disabled = true;
  runAllButton.textContent = "Validation running";
  log("Starting full GateFlow validation. Existing local data was snapshotted.");
  let passed = 0;
  try {
    for (let index = 0; index < tests.length; index += 1) {
      const [name, test] = tests[index];
      results[index] = { status: "running", detail: "Driving target UI" };
      renderTests(results);
      const started = performance.now();
      try {
        await freshTarget();
        await test();
        results[index] = { status: "passed", detail: "Passed", elapsed: `${Math.round(performance.now() - started)} ms` };
        passed += 1;
        log(`PASS ${name}`);
      } catch (error) {
        results[index] = { status: "failed", detail: error.message, elapsed: `${Math.round(performance.now() - started)} ms` };
        log(`FAIL ${name}: ${error.message}`);
      }
      renderTests(results);
    }
  } finally {
    restoreStorage(savedStorage);
    await reloadTarget();
    running = false;
    runAllButton.disabled = false;
    runAllButton.textContent = "Run full validation";
  }
  const allPassed = passed === tests.length;
  setRunnerStatus(allPassed ? "Passed" : "Needs review", allPassed ? "passed" : "failed");
  summaryBox.classList.toggle("failed", !allPassed);
  summaryBox.innerHTML = allPassed
    ? `<strong>${passed}/${tests.length} tests passed</strong><span>GateFlow data was restored after the run.</span>`
    : `<strong>${passed}/${tests.length} tests passed</strong><span>Review the failed checkpoints before sharing a customer build.</span>`;
  log(`Validation complete: ${passed}/${tests.length} passed. Target state restored.`);
}

async function testSurface() {
  expect(text(".brand span span").includes("V0.6"), "V0.6 label is not visible.");
  expect(!doc().querySelector('[data-view="adminView"]'), "Admin navigation is still visible.");
  expect(q('[data-view="supervisorView"]'), "Supervisor navigation is missing.");
  expect(!doc().querySelector('[data-view="auditView"]'), "Audit navigation is still visible.");
  expect(!doc().querySelector("#auditView"), "Audit view is still visible.");
  expect(q("#openManualEmployeeButton"), "Manual employee entry control is missing.");
  expect(![...doc().querySelectorAll("button")].some((button) => /sim scan/i.test(button.textContent)), "A SIM Scan control is visible.");
}

async function testConnectivity() {
  expect(text("#onlineStatus").length > 0, "Online/offline status is missing.");
  expect(text("#lastSavedLocal").length > 0, "Local-save status is missing.");
  expect(/Sync queue:/i.test(text("#syncQueueCount")), "Sync queue placeholder is missing.");
  expect(doc().body.textContent.includes("5G / Wi-Fi: future"), "5G/Wi-Fi placeholder is missing.");
  expect(q("#scannerInputTest"), "Scanner input test panel is missing.");
}

async function testStations() {
  const selector = q("#scannerLocation");
  const expected = ["Division Street", "North Ave", "EWR", "Linden"];
  expect([...selector.options].map((option) => option.value).join("|") === expected.join("|"), "Active scanner locations do not match the approved four.");
  for (const location of expected) {
    select(selector, location);
    expect(text("#stationIdentity") === `${location} Scanner`, `${location} station identity did not update.`);
  }
  expect(![...selector.options].some((option) => option.value === "Elizabeth Repair Facility"), "Historical Elizabeth location can be selected for new scans.");
}

async function testLocationPersistence() {
  select(q("#scannerLocation"), "North Ave");
  await reloadTarget();
  expect(q("#scannerLocation").value === "North Ave", "Working Location did not persist after reload.");
  expect(text("#stationIdentity") === "North Ave Scanner", "Persisted location did not restore station identity.");
}

async function testInvalidDriver() {
  click("#startScanButton");
  input("#driverInput", "EMP-NOT-REAL");
  key("#driverInput", "Enter");
  expect(/valid active Driver Employee/i.test(text("#scannerNotice")), "Unknown driver advanced past validation.");
  expect(q('.wizard-step[data-step="1"]').classList.contains("hidden"), "Unknown driver reached VIN step.");
  input("#driverInput", "EMP-1006");
  key("#driverInput", "Enter");
  expect(/valid active Driver Employee/i.test(text("#scannerNotice")), "Inactive driver advanced past validation.");
  expect(q('.wizard-step[data-step="1"]').classList.contains("hidden"), "Inactive driver reached VIN step.");
}

async function testBarcodeRules() {
  click("#startScanButton");
  input("#driverInput", "EMP-1001");
  key("#driverInput", "Enter");
  await waitForStep(1);
  input("#barcodeInput", "missing-vehicle");
  key("#barcodeInput", "Enter");
  expect(/not found/i.test(text("#scannerNotice")), "Unknown barcode was not blocked.");
  input("#barcodeInput", "GFV-0001");
  expect(q("#barcodeInput").value === "GFV-0001", "Barcode was not normalized to uppercase.");
  key("#barcodeInput", "Enter");
  await waitForStep(2);
}

async function testAuthorizedOut() {
  await beginScan("EMP-1001", "GFV-0001");
  click("#directionOut");
  await waitFor("#submitTransactionButton");
  click("#submitTransactionButton");
  await waitForText("#confirmationTitle", /Vehicle OUT recorded/);
  expect(text("#confirmationTitle").includes("OUT"), "Authorized OUT did not reach confirmation.");
  const transaction = latestTransaction();
  expect(transaction.direction === "OUT" && transaction.authorizationStatus === "Authorized", "Authorized OUT was not saved as authorized.");
  expect(transaction.submittedBy === "Division Street Scanner", "OUT did not record the active station account.");
}

async function testUnauthorizedIn() {
  await beginScan("EMP-1003", "GFV-0003");
  click("#directionIn");
  await waitFor("#submitTransactionButton");
  click("#submitTransactionButton");
  await waitForText("#confirmationTitle", /Vehicle IN recorded/);
  const transaction = latestTransaction();
  expect(transaction.direction === "IN" && transaction.authorizationStatus === "Unauthorized", "Unauthorized IN was blocked or saved with the wrong status.");
  expect(/operational review/i.test(transaction.note), "Unauthorized IN is not flagged for operational review.");
  expect(events().some((event) => event.type === "unauthorized_in_review"), "Unauthorized IN internal event is missing.");
}

async function testUnauthorizedOutBlock() {
  await beginScan("EMP-1003", "GFV-0003");
  click("#directionOut");
  click("#submitTransactionButton");
  await waitForVisible("#supervisorPanel");
  expect(state().transactions.length === 4, "Unauthorized OUT created a transaction before approval.");
  expect(events().some((event) => event.type === "blocked_out"), "Blocked OUT event is missing.");
}

async function testInvalidSupervisor() {
  await beginScan("EMP-1003", "GFV-0003");
  click("#directionOut");
  click("#submitTransactionButton");
  await waitForVisible("#supervisorPanel");
  input("#supervisorInput", "SUP-BAD");
  click("#approveSupervisorButton");
  expect(/invalid supervisor ID/i.test(text("#supervisorStatus")), "Invalid supervisor ID was accepted.");
  expect(!state().authorizations.some((item) => item.driverEmployee === "EMP-1003" && item.status === "active"), "Invalid supervisor created an authorization.");
}

async function testSupervisorOverride() {
  await beginScan("EMP-1003", "GFV-0003");
  click("#directionOut");
  await waitFor("#submitTransactionButton");
  click("#submitTransactionButton");
  await waitFor("#supervisorInput");
  input("#supervisorInput", "SUP-1001");
  select(q("#supervisorDuration"), "9_hours");
  click("#approveSupervisorButton");
  await waitFor("#submitTransactionButton");
  click("#submitTransactionButton");
  await waitForText("#confirmationTitle", /Vehicle OUT recorded/);
  const authorization = state().authorizations.find((item) => item.driverEmployee === "EMP-1003" && item.status === "active");
  expect(authorization && authorization.type === "9_hours", "Supervisor override did not create a 9-hour authorization.");
  expect(authorization.scopeType === "all_current_locations" && authorization.scopeIds.length === 0, "Supervisor authorization is not global.");
  expect(events().some((event) => event.type === "supervisor_approval" && /9 Hours/.test(event.description)), "Supervisor approval event does not record duration.");
  click("#confirmationDoneButton");
  select(q("#scannerLocation"), "EWR");
  await beginScan("EMP-1003", "GFV-0003");
  click("#directionOut");
  click("#submitTransactionButton");
  await waitForText("#confirmationTitle", /Vehicle OUT recorded/);
  expect(latestTransaction().location === "EWR", "Global authorization did not permit OUT at EWR.");
}

async function testExpiredLicenseBlock() {
  await beginScan("EMP-1005", "GFV-0005");
  click("#directionOut");
  click("#submitTransactionButton");
  expect(/license is expired/i.test(text("#scannerNotice")), "Expired license did not block Vehicle OUT.");
  expect(q("#supervisorPanel").classList.contains("hidden"), "Expired license incorrectly reached supervisor override.");
  expect(events().some((event) => event.type === "authorization_blocked_expired_license"), "Expired license block event is missing.");
}

async function testManualEntry() {
  click("#startScanButton");
  await waitFor("#openManualEmployeeButton");
  click("#openManualEmployeeButton");
  await waitFor("#manualEmployeeInput");
  input("#manualEmployeeInput", "EMP-NOT-REAL");
  click("#submitManualEmployeeButton");
  expect(/not found/i.test(text("#manualEmployeeStatus")), "Invalid manual entry was not rejected in the UI.");
  expect(events().some((event) => event.type === "manual_employee_attempted"), "Manual entry attempt event is missing.");
  expect(events().some((event) => event.type === "manual_employee_rejected"), "Manual entry rejection event is missing.");
}

async function testSupervisor() {
  click('[data-view="supervisorView"]');
  await waitFor("#authorizationDuration");
  const durations = [...q("#authorizationDuration").options].map((option) => option.value);
  expect(durations.join("|") === "9_hours|12_hours|today|48_hours|3_days", "Admin duration choices are incomplete.");
  expect(doc().body.textContent.includes("All current locations"), "Global authorization scope is not visible in Admin.");
  expect(q("#license30Count") && q("#license15Count") && q("#license5Count") && q("#licenseExpiredCount"), "License warning controls are incomplete.");
  expect(/Owner \/ System Administrator may assign any role/.test(doc().body.textContent), "Confirmed role rule is not explained in Admin.");
}

async function testDriverManagement() {
  click('[data-view="supervisorView"]');
  click("#addDriverButton");
  input("#driverEmployeeNumber", "emp-2002");
  input("#driverName", "Validator Driver");
  input("#driverLicenseExpires", "2030-12-31");
  click('#driverForm button[type="submit"]');
  expect(state().drivers.some((driver) => driver.employeeNumber === "EMP-2002"), "Valid driver was not created.");
  click("#addDriverButton");
  input("#driverEmployeeNumber", "emp-2002");
  input("#driverName", "Duplicate Driver");
  input("#driverLicenseExpires", "2030-12-31");
  click('#driverForm button[type="submit"]');
  expect(/unique/i.test(text("#driverEmployeeError")), "Duplicate Employee Number was accepted.");
  click("#cancelDriverButton");
  click('[data-driver-action="toggle"][data-driver-employee="EMP-2002"]');
  expect(state().drivers.find((driver) => driver.employeeNumber === "EMP-2002").active === false, "Driver was not deactivated.");
  click('[data-driver-action="toggle"][data-driver-employee="EMP-2002"]');
  expect(state().drivers.find((driver) => driver.employeeNumber === "EMP-2002").active === true, "Driver was not reactivated.");
}

async function testVehicleInventory() {
  click('[data-view="supervisorView"]');
  click('[data-supervisor-section="vehiclesSection"]');
  await waitFor("#addVehicleButton");
  click("#addVehicleButton");
  input("#vehicleMake", "Ford"); input("#vehicleModel", "Maverick"); input("#vehicleYear", "2024"); input("#vehicleColor", "Green"); input("#vehicleVin", "TESTVIN1234567890"); input("#vehicleBarcode", "GFV-0999"); input("#vehiclePlate", "VAL-999");
  click('#vehicleForm button[type="submit"]');
  expect(state().vehicles.some((vehicle) => vehicle.assignedBarcode === "GFV-0999"), "Valid vehicle was not created.");
  click("#addVehicleButton");
  input("#vehicleMake", "Ford"); input("#vehicleModel", "Duplicate"); input("#vehicleYear", "2024"); input("#vehicleColor", "Green"); input("#vehicleVin", "TESTVIN1234567891"); input("#vehicleBarcode", "gfv-0999");
  click('#vehicleForm button[type="submit"]');
  expect(/unique/i.test(text("#vehicleBarcodeError")), "Duplicate barcode was accepted.");
  click("#cancelVehicleButton");
  const vehicle = state().vehicles.find((item) => item.assignedBarcode === "GFV-0999");
  click(`[data-vehicle-action="remove"][data-vehicle-id="${vehicle.id}"]`);
  expect(state().vehicles.find((item) => item.id === vehicle.id).active === false, "Vehicle was not removed from inventory.");
  select(q("#vehicleStatusFilter"), "all");
  expect(text("#vehiclesTableBody").includes("GFV-0999"), "Inactive vehicle is not searchable in inventory.");
  click(`[data-vehicle-action="restore"][data-vehicle-id="${vehicle.id}"]`);
  expect(state().vehicles.find((item) => item.id === vehicle.id).active === true, "Vehicle was not restored to inventory.");
}

async function testDurationCalculations() {
  click('[data-view="supervisorView"]');
  await waitForVisible("#supervisorView");
  for (const [type, expectedMilliseconds] of [["9_hours", 9 * 60 * 60 * 1000], ["12_hours", 12 * 60 * 60 * 1000], ["48_hours", 48 * 60 * 60 * 1000]]) {
    select(q("#authorizationDuration"), type);
    click('[data-driver-action="authorize"][data-driver-employee="EMP-1003"]');
    const authorization = state().authorizations.find((item) => item.driverEmployee === "EMP-1003" && item.status === "active");
    expect(authorization && authorization.type === type, `${type} authorization was not saved.`);
    const elapsed = new Date(authorization.expiresAt).getTime() - new Date(authorization.authorizedAt).getTime();
    expect(elapsed === expectedMilliseconds, `${type} expiration is not exact.`);
    click('[data-driver-action="deauthorize"][data-driver-employee="EMP-1003"]');
  }
  expect(![...q("#authorizationDuration").options].some((option) => /permanent/i.test(option.textContent)), "Permanent authorization is available.");
}

async function testRevocation() {
  click('[data-view="supervisorView"]');
  select(q("#authorizationDuration"), "9_hours");
  click('[data-driver-action="authorize"][data-driver-employee="EMP-1003"]');
  expect(state().authorizations.some((item) => item.driverEmployee === "EMP-1003" && item.status === "active"), "Setup authorization was not created.");
  click('[data-driver-action="deauthorize"][data-driver-employee="EMP-1003"]');
  expect(!state().authorizations.some((item) => item.driverEmployee === "EMP-1003" && item.status === "active"), "Authorization was not revoked.");
  click('[data-view="scannerView"]');
  await beginScan("EMP-1003", "GFV-0003");
  click("#directionOut");
  click("#submitTransactionButton");
  await waitForVisible("#supervisorPanel");
  expect(events().some((event) => event.type === "driver_deauthorized"), "Revocation event is missing.");
}

async function testScannerDiagnostics() {
  click("#startScanButton");
  input("#driverInput", "EMP-1001");
  key("#driverInput", "Enter");
  await waitForStep(1);
  expect(text("#lastRawScan") === "EMP-1001", "Scanner test panel did not record the raw value.");
  expect(text("#lastScanField") === "Driver Employee #", "Scanner test panel did not identify the receiving field.");
  expect(text("#scanTerminator") === "Enter detected", "Scanner test panel did not identify Enter.");
}

async function testResetRecovery() {
  select(q("#scannerLocation"), "North Ave");
  click("#resetDemoButton");
  expect(q("#scannerLocation").value === "Division Street", "Reset demo did not restore the default working location.");
  expect(state().version === "0.6" && state().transactions.length === 4, "Reset demo did not restore V0.6 seed data.");
  expect(events().some((event) => event.type === "demo_reset"), "Reset-demo event is missing.");
}

async function testSearch() {
  await beginScan("EMP-1001", "GFV-0001");
  click("#directionIn");
  await waitFor("#submitTransactionButton");
  click("#submitTransactionButton");
  await waitForText("#confirmationTitle", /Vehicle IN recorded/);
  click('[data-view="searchView"]');
  await waitFor("#searchForm");
  input("#filterVehicle", "GFV-0001");
  click('#searchForm button[type="submit"]');
  await waitFor("#searchResultsBody tr");
  expect(doc().querySelectorAll("#searchResultsBody tr").length > 0, "Search returned no VIN results.");
  expect(text("#searchResultsBody").includes("1HGCM82633A004352"), "Search result does not include the matching VIN.");
  click("#clearSearchButton");
  select(q("#filterLocation"), "Elizabeth Repair Facility");
  click('#searchForm button[type="submit"]');
  expect(text("#searchResultsBody").includes("Elizabeth Repair Facility"), "Historical Elizabeth location is not searchable.");
}

async function testMigration() {
  select(q("#scannerLocation"), "Division Street");
  const saved = state();
  saved.version = "0.5";
  saved.authorizations.forEach((authorization) => { delete authorization.scopeType; delete authorization.scopeIds; delete authorization.actionLocation; });
  targetWindow().localStorage.removeItem(STATE_KEY);
  targetWindow().localStorage.setItem(V05_STATE_KEY, JSON.stringify(saved));
  await reloadTarget();
  const migrated = state();
  expect(migrated.version === "0.6" && migrated.migrationVersion === 6, "V0.5 state did not migrate to V0.6.");
  expect(migrated.transactions.length === saved.transactions.length, "Migration lost historical transactions.");
  expect(migrated.authorizations.every((authorization) => authorization.scopeType === "all_current_locations"), "Migration did not add global authorization scope.");
  expect(targetWindow().localStorage.getItem(V05_STATE_KEY), "V0.5 storage key was removed during migration.");
  expect(migrated.vehicles.every((vehicle) => vehicle.id && vehicle.assignedBarcode), "Migrated vehicles are missing stable IDs or barcodes.");
}

async function beginScan(employeeNumber, barcode) {
  click("#startScanButton");
  await waitFor("#driverInput");
  input("#driverInput", employeeNumber);
  key("#driverInput", "Enter");
  await waitFor("#barcodeInput");
  input("#barcodeInput", barcode);
  key("#barcodeInput", "Enter");
  await waitFor("#directionOut");
}

async function freshTarget() {
  const win = targetWindow();
  win.localStorage.removeItem(STATE_KEY);
  win.localStorage.removeItem(LEGACY_STATE_KEY);
  await reloadTarget();
}

function captureStorage() {
  const win = targetWindow();
  return { v5: win.localStorage.getItem(STATE_KEY), v4: win.localStorage.getItem(LEGACY_STATE_KEY) };
}

function restoreStorage(snapshot) {
  const storage = targetWindow().localStorage;
  [[STATE_KEY, snapshot.v5], [LEGACY_STATE_KEY, snapshot.v4]].forEach(([key, value]) => {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, value);
  });
}

function reloadTarget() {
  return new Promise((resolve) => {
    frame.addEventListener("load", resolve, { once: true });
    frame.src = `../index.html?validator=${Date.now()}`;
  });
}

function installTargetSafetyHooks() {
  try {
    targetWindow().confirm = () => true;
  } catch (error) {
    targetStatus.textContent = "Blocked: use HTTP server";
  }
}

function targetWindow() { return frame.contentWindow; }
function doc() { return frame.contentDocument; }
function q(selector) { const node = doc().querySelector(selector); expect(node, `Missing target element: ${selector}`); return node; }
function text(selector) { return q(selector).textContent.trim(); }
function click(selector) { q(selector).click(); }
function input(selector, value) { const node = q(selector); const win = targetWindow(); node.value = value; node.dispatchEvent(new win.Event("input", { bubbles: true })); }
function key(selector, keyName) { const win = targetWindow(); q(selector).dispatchEvent(new win.KeyboardEvent("keydown", { key: keyName, bubbles: true })); }
function select(node, value) { const win = targetWindow(); node.value = value; node.dispatchEvent(new win.Event("change", { bubbles: true })); }
function state() { const raw = targetWindow().localStorage.getItem(STATE_KEY); expect(raw, "Target state was not saved."); return JSON.parse(raw); }
function events() { return state().auditEvents || []; }
function latestTransaction() { const transaction = state().transactions[0]; expect(transaction, "No transaction was saved."); return transaction; }
function expect(condition, message) { if (!condition) throw new Error(message); }
function waitFor(selector, timeout = 1600) { return new Promise((resolve, reject) => { const started = performance.now(); const check = () => { if (doc().querySelector(selector)) return resolve(); if (performance.now() - started > timeout) return reject(new Error(`Timed out waiting for ${selector}`)); setTimeout(check, 20); }; check(); }); }
function waitForVisible(selector, timeout = 1600) { return new Promise((resolve, reject) => { const started = performance.now(); const check = () => { const node = q(selector); if (!node.classList.contains("hidden")) return resolve(); if (performance.now() - started > timeout) return reject(new Error(`Timed out waiting for visible ${selector}`)); setTimeout(check, 20); }; check(); }); }
function waitForStep(step) { return waitForVisible(`.wizard-step[data-step="${step}"]`); }
function waitForText(selector, pattern, timeout = 1600) { return new Promise((resolve, reject) => { const started = performance.now(); const check = () => { if (pattern.test(text(selector))) return resolve(); if (performance.now() - started > timeout) return reject(new Error(`Timed out waiting for ${selector} text`)); setTimeout(check, 20); }; check(); }); }
function log(message) { const stamp = new Date().toLocaleTimeString(); runLog.textContent = `${runLog.textContent}\n[${stamp}] ${message}`.trim(); runLog.scrollTop = runLog.scrollHeight; }
function setRunnerStatus(label, tone) { runnerStatus.textContent = label; runnerStatus.className = `status-pill ${tone}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
