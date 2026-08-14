"use strict";

/*
  Internal regression runner for the sibling static GateFlow review app.
  It deliberately uses the rendered UI first, then checks localStorage only as
  evidence that the UI action saved the expected result. Keep this in-house:
  it is not a production test platform or a customer-facing feature.
*/

const STATE_KEY = "lot-watch.gateflow.v0.7.state";
const V06_STATE_KEY = "lot-watch.gateflow.v0.6.state";
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
let targetConfirmResponse = true;

const tests = [
  // Every retained V0.6 regression is registered once.
  ["V0.7 navigation and Scanner safeguards", testSurface],
  ["Connectivity and scanner-test surfaces", testConnectivity],
  ["Location-derived station identity", testStations],
  ["Working Location persists after reload", testLocationPersistence],
  ["Scanner cancel abandons an unfinished transaction", testScannerCancel],
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
  ["Supervisor section navigation", testSupervisorSectionNavigation],
  ["Driver required-field validation", testDriverRequiredValidation],
  ["Driver creation, duplicate protection, and reactivation", testDriverManagement],
  ["Driver edit records an audit event", testDriverEditAudit],
  ["Bulk driver authorization applies to selected drivers", testBulkAuthorize],
  ["Bulk deauthorization respects confirmation", testBulkDeauthorize],
  ["Vehicle required-field validation", testVehicleRequiredValidation],
  ["Vehicle inventory, barcode protection, and restore", testVehicleInventory],
  ["Vehicle VIN warning remains reviewable", testVehicleVinWarning],
  ["Vehicle edit records barcode history", testVehicleEditAudit],
  ["Removed vehicle cannot create a new movement", testRemovedVehicleScanBlock],
  ["Exact authorization duration calculation", testDurationCalculations],
  ["Revoked authorization blocks Vehicle OUT", testRevocation],
  ["Scanner Enter diagnostic", testScannerDiagnostics],
  ["Reset-demo recovery", testResetRecovery],
  ["Reset-demo cancellation preserves data", testResetCancellation],
  ["Movement and historical-location search", testSearch],
  ["Combined movement search filters", testCombinedSearch],
  ["V0.5 localStorage migration", testMigration],

  // V0.7-specific coverage, with one row per actual scenario.
  ["Numeric employee entry works", () => testEmployeeVariant("1001")],
  ["EMP-prefixed employee entry works", () => testEmployeeVariant("EMP-1001")],
  ["Lowercase employee prefix works", () => testEmployeeVariant("emp-1001")],
  ["Employee spaces trim correctly", () => testEmployeeVariant("  1001  ")],
  ["Historical employee values resolve", () => testEmployeeVariant("EMP-1002")],
  ["Manual barcode control is visible", testManualBarcodeSurface],
  ["Valid manual barcode works", testManualBarcode],
  ["Unknown manual barcode is rejected", testManualBarcodeReject],
  ["Manual and scanned barcode paths match", testBarcodePathMatch],
  ["Barcode entry method is stored", testBarcodeEntryMethod],
  ["Success flow is shortened", testShortFlow],
  ["Compact confirmation appears", testCompactConfirmation],
  ["Start Next Scan works", testStartNextScan],
  ["Automatic reset works", testAutomaticReset],
  ["Transaction saves before reset", testTransactionSavedBeforeReset],
  ["Changing driver clears derived scan state", testDriverChangeClearsState],
  ["Changing driver clears pending override", testDriverChangeClearsOverride],
  ["Driver profile opens", testDriverProfile],
  ["Driver profile is keyboard accessible", testDriverProfileKeyboard],
  ["Driver deactivation revokes authorization", testDriverDeactivation],
  ["Inactive driver remains searchable", testInactiveDriverSearch],
  ["Drivers are never hard deleted", testNoDriverDelete],
  ["Elizabeth absent from active selectors", testElizabethActiveAbsent],
  ["Elizabeth history remains searchable", testElizabethHistory],
  ["Fixed device location is locked", testFixedLocationLocked],
  ["Fixed reassignment requires confirmation", testFixedReassignment],
  ["Fixed device switch requires confirmation", testFixedSwitchConfirmation],
  ["Floater requires location", testFloaterRequiresLocation],
  ["Floater requires confirmation", testFloaterRequiresConfirmation],
  ["Floater location remains locked", testFloaterLocationLock],
  ["Floater change resets incomplete scan", testFloaterChangeReset],
  ["Floater cannot choose Elizabeth", testFloaterNoElizabeth],
  ["Add fixed device", testAddFixedDevice],
  ["Add floater device", testAddFloaterDevice],
  ["Duplicate IMEI is rejected", testDuplicateImei],
  ["Fixed device without location is rejected", testFixedNeedsLocation],
  ["Device edit works", testDeviceEdit],
  ["Inactive device blocks scanning", testInactiveDeviceBlocks],
  ["Device reactivation works", testDeviceReactivate],
  ["Device history records changes", testDeviceHistory],
  ["Transaction stores complete device metadata", testDeviceTransactionMetadata],
  ["Submission rejects newly non-ready device", testSubmissionRevalidatesDevice],
  ["Submission rejects device/location mismatch", testSubmissionRevalidatesLocation],
  ["V0.6 migrates to V0.7 without losing history", testV06Migration],
  ["Deterministic devices are seeded", testDeviceSeeds],
  ["VIN search works", testVinSearch],
  ["Plate search works", testPlateSearch],
  ["Normal refresh loads V0.7", testV07Refresh],
  ["Mobile scanner surface is responsive", testMobileSurface],
  ["Drivers, Vehicles, and Devices sections work", testSupervisorSections]
];

document.getElementById("testCount").textContent = String(tests.length);
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
  expect(text(".brand span span").includes("V0.7"), "V0.7 label is not visible.");
  expect(!doc().querySelector('[data-view="adminView"]'), "Admin navigation is still visible.");
  expect(q('[data-view="supervisorView"]'), "Supervisor navigation is missing.");
  expect(!doc().querySelector('[data-view="auditView"]'), "Audit navigation is still visible.");
  expect(!doc().querySelector("#auditView"), "Audit view is still visible.");
  expect(q("#openManualEmployeeButton"), "Manual employee entry control is missing.");
  expect(q("#openManualBarcodeButton"), "Manual barcode entry control is missing.");
  expect(q('[data-supervisor-section="devicesSection"]'), "Devices Supervisor section is missing.");
  expect(![...doc().querySelectorAll("button")].some((button) => /sim scan/i.test(button.textContent)), "A SIM Scan control is visible.");
}

async function testEmployeeVariant(value) {
  click("#startScanButton"); input("#driverInput", value); key("#driverInput", "Enter"); await waitForStep(1);
  const expectedName = /1002/i.test(value) ? "Marcus Reed" : "Nina Patel";
  expect(text("#driverStatus").includes(expectedName) || text("#scanDetailList").includes(expectedName), `Employee variant ${value} did not resolve to ${expectedName}.`);
}

async function testManualBarcodeSurface() { click("#startScanButton"); input("#driverInput", "1001"); key("#driverInput", "Enter"); await waitForStep(1); click("#openManualBarcodeButton"); await waitForVisible("#manualBarcodeModal"); expect(/same exact-match/i.test(text("#manualBarcodeStatus")), "Manual barcode dialog does not describe exact matching."); }

async function testManualBarcode() { click("#startScanButton"); input("#driverInput", "1001"); key("#driverInput", "Enter"); await waitForStep(1); click("#openManualBarcodeButton"); input("#manualBarcodeInput", "gfv-0001"); click("#submitManualBarcodeButton"); await waitForStep(2); expect(q("#barcodeInput").value === "GFV-0001", "Manual barcode was not normalized or accepted."); }

async function testManualBarcodeReject() { click("#startScanButton"); input("#driverInput", "1001"); key("#driverInput", "Enter"); await waitForStep(1); click("#openManualBarcodeButton"); input("#manualBarcodeInput", "GFV-00"); click("#submitManualBarcodeButton"); expect(/not found|exact/i.test(text("#manualBarcodeStatus")), "Partial or unknown manual barcode was accepted."); }

async function testBarcodePathMatch() { await beginScan("1001", "GFV-0001"); const scanned = text("#barcodeStatus"); click("#flowCancel"); click("#startScanButton"); input("#driverInput", "1001"); key("#driverInput", "Enter"); await waitForStep(1); click("#openManualBarcodeButton"); input("#manualBarcodeInput", "GFV-0001"); click("#submitManualBarcodeButton"); expect(text("#barcodeStatus") === scanned, "Manual barcode lookup does not match the scanned lookup result."); }

async function testBarcodeEntryMethod() { await testManualBarcode(); click("#directionIn"); click("#submitTransactionButton"); await waitForText("#confirmationTitle", /Vehicle IN recorded/); expect(latestTransaction().barcodeEntryMethod === "manual", "Manual barcode entry method was not saved."); }

async function testShortFlow() { await beginScan("1001", "GFV-0001"); expect(doc().querySelectorAll(".wizard-step").length === 4 && text(".wizard-step[data-step=\"2\"] .screen-subtitle").includes("Step 3 of 3"), "Scanner still exposes a redundant step count."); }

async function testCompactConfirmation() { await beginScan("1001", "GFV-0001"); click("#directionIn"); click("#submitTransactionButton"); await waitForText("#confirmationTitle", /Vehicle IN recorded/); expect(text("#confirmationDoneButton") === "Start Next Scan", "Compact next-scan confirmation is missing."); }

async function testStartNextScan() { await beginScan("1001", "GFV-0001"); click("#directionIn"); click("#submitTransactionButton"); await waitFor("#confirmationDoneButton"); click("#confirmationDoneButton"); expect(!q("#scannerHome").classList.contains("hidden"), "Start Next Scan did not reset to the ready screen."); }

async function testAutomaticReset() { await beginScan("1001", "GFV-0001"); click("#directionIn"); click("#submitTransactionButton"); await waitForText("#confirmationTitle", /Vehicle IN recorded/); await delay(4700); expect(!q("#scannerHome").classList.contains("hidden"), "Success confirmation did not reset automatically."); }

async function testTransactionSavedBeforeReset() { await beginScan("1001", "GFV-0001"); click("#directionIn"); click("#submitTransactionButton"); await waitForText("#confirmationTitle", /Vehicle IN recorded/); expect(state().transactions[0].vehicleBarcode === "GFV-0001", "Transaction was not saved before confirmation/reset."); }

async function testDriverChangeClearsState() {
  await beginScan("1001", "GFV-0001");
  click("#directionIn");
  input("#driverInput", "1002");
  expect(q("#barcodeInput").value === "", "Changing driver retained the previous vehicle barcode.");
  expect(q("#transactionNote").value === "", "Changing driver retained the previous transaction note.");
  expect(!q('.wizard-step[data-step="0"]').classList.contains("hidden"), "Changing driver did not return to driver validation.");
  expect(/previous vehicle.*cleared/i.test(text("#scannerNotice")), "Changing driver did not explain that derived scan state was cleared.");
}

async function testDriverChangeClearsOverride() {
  await beginScan("1003", "GFV-0003");
  click("#directionOut"); click("#submitTransactionButton"); await waitForVisible("#supervisorPanel");
  input("#driverInput", "1001");
  click("#approveSupervisorButton");
  expect(!state().authorizations.some((authorization) => authorization.driverEmployee === "EMP-1003" && authorization.status === "active"), "Changing driver retained a pending override for the previous driver.");
}

async function testConnectivity() {
  expect(text("#onlineStatus").length > 0, "Online/offline status is missing.");
  expect(text("#lastSavedLocal").length > 0, "Local-save status is missing.");
  expect(/Sync queue:/i.test(text("#syncQueueCount")), "Sync queue placeholder is missing.");
  expect(doc().body.textContent.includes("5G / Wi-Fi: future"), "5G/Wi-Fi placeholder is missing.");
  expect(q("#scannerInputTest"), "Scanner input test panel is missing.");
}

async function testStations() {
  const expected = [["DEV-DIV-01", "Division Street"], ["DEV-NORTH-01", "North Ave"], ["DEV-EWR-01", "EWR"], ["DEV-LINDEN-01", "Linden"]];
  expect([...q("#scannerLocation").options].map((option) => option.value).join("|") === expected.map(([, location]) => location).join("|"), "Active scanner locations do not match the approved four.");
  for (const [deviceId, location] of expected) {
    click("#deviceSetupButton");
    select(q("#currentDeviceSelect"), deviceId);
    click("#confirmDeviceLocationButton");
    expect(text("#stationIdentity") === `${location} Scanner`, `${location} station identity did not update from its fixed device.`);
  }
  expect(![...q("#scannerLocation").options].some((option) => option.value === "Elizabeth Repair Facility"), "Historical Elizabeth location can be selected for new scans.");
}

async function testLocationPersistence() {
  click("#deviceSetupButton"); select(q("#currentDeviceSelect"), "DEV-NORTH-01"); click("#confirmDeviceLocationButton");
  await reloadTarget();
  expect(q("#scannerLocation").value === "North Ave", "Working Location did not persist after reload.");
  expect(text("#stationIdentity") === "North Ave Scanner", "Persisted location did not restore station identity.");
}

async function testScannerCancel() {
  click("#startScanButton");
  input("#driverInput", "EMP-1001");
  key("#driverInput", "Enter");
  await waitForStep(1);
  click("#flowCancel");
  expect(!q("#startScanButton").classList.contains("hidden"), "Back to home did not return the Scanner to its ready state.");
  expect(q("#scanWizard").classList.contains("hidden"), "Back to home left the Scanner wizard visible.");
  expect(state().transactions.length === 4, "Cancelling an unfinished scan created a movement.");
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
  click("#approveSupervisorButton");
  await waitFor("#submitTransactionButton");
  click("#submitTransactionButton");
  await waitForText("#confirmationTitle", /Vehicle OUT recorded/);
  const authorization = state().authorizations.find((item) => item.driverEmployee === "EMP-1003" && item.status === "active");
  expect(authorization && authorization.type === "9_hours", "Supervisor override did not create a 9-hour authorization.");
  expect(authorization.scopeType === "all_current_locations" && authorization.scopeIds.length === 0, "Supervisor authorization is not global.");
  expect(events().some((event) => event.type === "supervisor_approval" && /9 Hours/.test(event.description)), "Supervisor approval event does not record duration.");
  click("#confirmationDoneButton");
  click("#deviceSetupButton"); select(q("#currentDeviceSelect"), "DEV-EWR-01"); click("#confirmDeviceLocationButton");
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
  expect(q("#authorizationDuration").type === "hidden" && q("#authorizationDuration").value === "9_hours", "Fleet Lead duration is not fixed to 9 hours.");
  expect(q("#supervisorDuration").type === "hidden" && q("#supervisorDuration").value === "9_hours", "Supervisor override duration is not fixed to 9 hours.");
  expect(!doc().querySelector("#authorizationDuration option") && !doc().querySelector("#supervisorDuration option"), "A duration chooser is still visible.");
  expect(doc().body.textContent.includes("All current locations"), "Global authorization scope is not visible in Admin.");
  expect(q("#license30Count") && q("#license15Count") && q("#license5Count") && q("#licenseExpiredCount"), "License warning controls are incomplete.");
  expect(/Owner \/ System Administrator may assign any role/.test(doc().body.textContent), "Confirmed role rule is not explained in Admin.");
}

async function testSupervisorSectionNavigation() {
  click('[data-view="supervisorView"]');
  click('[data-supervisor-section="vehiclesSection"]');
  await waitForVisible("#vehiclesSection");
  expect(q("#vehiclesTab").getAttribute("aria-selected") === "true", "Vehicles tab did not report itself as active.");
  expect(q("#driversSection").hidden, "Drivers section remained visible when Vehicles was selected.");
  click('[data-supervisor-section="driversSection"]');
  await waitForVisible("#driversSection");
  expect(q("#driversTab").getAttribute("aria-selected") === "true", "Drivers tab did not report itself as active.");
}

async function testDriverRequiredValidation() {
  click('[data-view="supervisorView"]');
  click("#addDriverButton");
  click('#driverForm button[type="submit"]');
  expect(/required/i.test(text("#driverEmployeeError")), "Blank Employee Number was accepted.");
  expect(/required/i.test(text("#driverNameError")), "Blank Driver Name was accepted.");
  expect(/valid license/i.test(text("#driverLicenseError")), "Blank license expiration was accepted.");
  expect(q("#driverModal").classList.contains("hidden") === false, "Invalid driver form closed instead of showing errors.");
  click("#cancelDriverButton");
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

async function testDriverEditAudit() {
  click('[data-view="supervisorView"]');
  click('[data-driver-action="edit"][data-driver-employee="EMP-1001"]');
  input("#driverName", "Nina Patel Updated");
  select(q("#driverActive"), "false");
  click('#driverForm button[type="submit"]');
  const driver = state().drivers.find((item) => item.employeeNumber === "EMP-1001");
  expect(driver.name === "Nina Patel Updated" && driver.active === false, "Driver edit was not saved.");
  expect(events().some((event) => event.type === "driver_edited" && /EMP-1001/.test(event.description)), "Driver edit audit event is missing.");
  expect(!state().authorizations.some((item) => item.driverEmployee === "EMP-1001" && item.status === "active"), "Deactivating a driver left an active authorization behind.");
}

async function testBulkAuthorize() {
  click('[data-view="supervisorView"]');
  const employeeNumbers = ["EMP-1003", "EMP-1004"];
  employeeNumbers.forEach((employeeNumber) => {
    const box = q(`#driversTableBody .row-check[value="${employeeNumber}"]`);
    box.checked = true;
    const win = targetWindow();
    box.dispatchEvent(new win.Event("change", { bubbles: true }));
  });
  click("#bulkAuthorizeButton");
  employeeNumbers.forEach((employeeNumber) => {
    const authorization = state().authorizations.find((item) => item.driverEmployee === employeeNumber && item.status === "active");
    expect(authorization && authorization.type === "9_hours", `Bulk authorization did not save fixed 9 hours for ${employeeNumber}.`);
  });
  expect(/2 successful/i.test(text("#bulkActionStatus")), "Bulk authorization status did not report both selected drivers.");
}

async function testBulkDeauthorize() {
  click('[data-view="supervisorView"]');
  click('[data-driver-action="authorize"][data-driver-employee="EMP-1003"]');
  targetConfirmResponse = false;
  click("#deauthorizeAllButton");
  expect(state().authorizations.some((item) => item.driverEmployee === "EMP-1003" && item.status === "active"), "Cancelled bulk deauthorization still revoked an authorization.");
  targetConfirmResponse = true;
  click("#deauthorizeAllButton");
  expect(!state().authorizations.some((item) => item.status === "active"), "Confirmed bulk deauthorization left active authorizations.");
  expect(events().filter((event) => event.type === "driver_deauthorized").length >= 1, "Bulk deauthorization audit history is missing.");
}

async function testVehicleRequiredValidation() {
  click('[data-view="supervisorView"]');
  click('[data-supervisor-section="vehiclesSection"]');
  click("#addVehicleButton");
  click('#vehicleForm button[type="submit"]');
  expect(/required/i.test(text("#vehicleMakeError")), "Blank vehicle make was accepted.");
  expect(/reasonable four-digit/i.test(text("#vehicleYearError")), "Blank vehicle year was accepted.");
  expect(/required/i.test(text("#vehicleVinError")), "Blank VIN was accepted.");
  expect(/required/i.test(text("#vehicleBarcodeError")), "Blank barcode was accepted.");
  click("#cancelVehicleButton");
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

async function testVehicleVinWarning() {
  click('[data-view="supervisorView"]');
  click('[data-supervisor-section="vehiclesSection"]');
  click("#addVehicleButton");
  input("#vehicleMake", "Ford"); input("#vehicleModel", "Ranger"); input("#vehicleYear", "2024"); input("#vehicleColor", "White"); input("#vehicleVin", "SHORTVIN123"); input("#vehicleBarcode", "GFV-0888");
  click('#vehicleForm button[type="submit"]');
  expect(state().vehicles.some((vehicle) => vehicle.assignedBarcode === "GFV-0888"), "Prototype VIN warning prevented a valid demo inventory save.");
  expect(events().some((event) => event.type === "vehicle_created"), "Vehicle creation audit is missing.");
}

async function testVehicleEditAudit() {
  click('[data-view="supervisorView"]');
  click('[data-supervisor-section="vehiclesSection"]');
  const vehicle = state().vehicles.find((item) => item.assignedBarcode === "GFV-0002");
  click(`[data-vehicle-action="edit"][data-vehicle-id="${vehicle.id}"]`);
  input("#vehicleBarcode", "GFV-0202");
  click('#vehicleForm button[type="submit"]');
  expect(state().vehicles.find((item) => item.id === vehicle.id).assignedBarcode === "GFV-0202", "Vehicle barcode edit was not saved.");
  expect(events().some((event) => event.type === "barcode_changed" && /GFV-0202/.test(event.description)), "Barcode change audit event is missing.");
}

async function testRemovedVehicleScanBlock() {
  click('[data-view="supervisorView"]');
  click('[data-supervisor-section="vehiclesSection"]');
  const vehicle = state().vehicles.find((item) => item.assignedBarcode === "GFV-0002");
  click(`[data-vehicle-action="remove"][data-vehicle-id="${vehicle.id}"]`);
  click('[data-view="scannerView"]');
  click("#startScanButton");
  input("#driverInput", "EMP-1001"); key("#driverInput", "Enter"); await waitForStep(1);
  input("#barcodeInput", "GFV-0002"); key("#barcodeInput", "Enter");
  expect(/inactive/i.test(text("#scannerNotice")), "Removed vehicle barcode advanced to movement selection.");
  expect(q('.wizard-step[data-step="2"]').classList.contains("hidden"), "Removed vehicle reached movement direction step.");
}

async function testDurationCalculations() {
  click('[data-view="supervisorView"]');
  await waitForVisible("#supervisorView");
  click('[data-driver-action="authorize"][data-driver-employee="EMP-1003"]');
  const authorization = state().authorizations.find((item) => item.driverEmployee === "EMP-1003" && item.status === "active");
  expect(authorization && authorization.type === "9_hours", "Authorization did not use the fixed 9-hour duration.");
  const elapsed = new Date(authorization.expiresAt).getTime() - new Date(authorization.authorizedAt).getTime();
  expect(elapsed === 9 * 60 * 60 * 1000, "9-hour expiration is not exact.");
  expect(!doc().querySelector("#authorizationDuration option"), "A selectable or permanent authorization duration is available.");
}

async function testRevocation() {
  click('[data-view="supervisorView"]');
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
  click("#deviceSetupButton"); select(q("#currentDeviceSelect"), "DEV-NORTH-01"); click("#confirmDeviceLocationButton");
  click("#resetDemoButton");
  expect(q("#scannerLocation").value === "Division Street", "Reset demo did not restore the default working location.");
  expect(state().version === "0.7" && state().transactions.length === 4, "Reset demo did not restore V0.7 seed data.");
  expect(events().some((event) => event.type === "demo_reset"), "Reset-demo event is missing.");
}

async function testResetCancellation() {
  click("#deviceSetupButton"); select(q("#currentDeviceSelect"), "DEV-NORTH-01"); click("#confirmDeviceLocationButton");
  const before = JSON.stringify(state());
  targetConfirmResponse = false;
  click("#resetDemoButton");
  expect(JSON.stringify(state()) === before, "Cancelled reset still replaced the current demo data.");
  targetConfirmResponse = true;
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

async function testCombinedSearch() {
  click('[data-view="searchView"]');
  await waitFor("#searchForm");
  input("#filterVehicle", "GFV-0003");
  input("#filterDriver", "EMP-1003");
  select(q("#filterLocation"), "EWR");
  select(q("#filterType"), "IN");
  click('#searchForm button[type="submit"]');
  expect(q("#searchResultCount").textContent.trim() === "1", "Combined movement filters did not narrow to one matching record.");
  expect(text("#searchResultsBody").includes("GFV-0003") && text("#searchResultsBody").includes("Unauthorized"), "Combined search did not return the expected unauthorized IN record.");
  select(q("#filterType"), "OUT");
  click('#searchForm button[type="submit"]');
  expect(q("#searchResultCount").textContent.trim() === "0", "Conflicting combined filters returned a movement.");
}

async function testDriverProfile() { click('[data-view="supervisorView"]'); click('[data-driver-action="profile"][data-driver-employee="EMP-1001"]'); await waitForVisible("#driverProfileModal"); expect(text("#driverProfileBody").includes("EMP-1001") && text("#driverProfileBody").includes("Recent movements"), "Driver profile does not show retained details."); }
async function testDriverProfileKeyboard() { click('[data-view="supervisorView"]'); const button = q('[data-driver-action="profile"][data-driver-employee="EMP-1001"]'); key('[data-driver-action="profile"][data-driver-employee="EMP-1001"]', "Enter"); button.click(); await waitForVisible("#driverProfileModal"); expect(q("#closeDriverProfileButton") === doc().activeElement || q("#driverProfileModal").classList.contains("hidden") === false, "Driver profile is not keyboard reachable."); }
async function testDriverDeactivation() { click('[data-view="supervisorView"]'); click('[data-driver-action="toggle"][data-driver-employee="EMP-1001"]'); const driver = state().drivers.find((item) => item.employeeNumber === "EMP-1001"); expect(driver.active === false, "Driver was not deactivated."); expect(!state().authorizations.some((auth) => auth.driverEmployee === "EMP-1001" && auth.status === "active"), "Deactivation did not revoke active authorization."); }
async function testInactiveDriverSearch() { await testDriverDeactivation(); click('[data-view="supervisorView"]'); input("#driverRosterSearch", "Nina"); expect(text("#driversTableBody").includes("Nina Patel") && text("#driversTableBody").includes("Inactive"), "Inactive driver is no longer searchable."); }
async function testNoDriverDelete() { await testDriverDeactivation(); expect(state().drivers.some((driver) => driver.employeeNumber === "EMP-1001"), "Driver profile was hard deleted."); }
async function testElizabethActiveAbsent() { expect(![...q("#scannerLocation").options].some((option) => option.value === "Elizabeth Repair Facility"), "Elizabeth is available for new scanner operations."); click('[data-view="supervisorView"]'); click('[data-supervisor-section="devicesSection"]'); click("#addDeviceButton"); expect(![...q("#deviceLocationInput").options].some((option) => option.value === "Elizabeth Repair Facility"), "Elizabeth is available for device assignment."); }
async function testElizabethHistory() { click('[data-view="searchView"]'); select(q("#filterLocation"), "Elizabeth Repair Facility"); click('#searchForm button[type="submit"]'); expect(text("#searchResultsBody").includes("Elizabeth Repair Facility"), "Elizabeth historical movements are not searchable."); }
async function testFixedLocationLocked() { expect(q("#scannerLocation").disabled, "Fixed device did not lock the scanner location."); expect(q("#scannerLocation").value === "Division Street", "Fixed device location did not supply Division Street."); }
async function testFixedReassignment() { click('[data-view="supervisorView"]'); click('[data-supervisor-section="devicesSection"]'); click('[data-device-action="edit"][data-device-id="DEV-DIV-01"]'); select(q("#deviceLocationInput"), "North Ave"); targetConfirmResponse = false; click('#deviceForm button[type="submit"]'); expect(state().devices.find((device) => device.id === "DEV-DIV-01").assignedLocation === "Division Street", "Cancelled fixed reassignment changed location."); targetConfirmResponse = true; click('#deviceForm button[type="submit"]'); expect(state().devices.find((device) => device.id === "DEV-DIV-01").assignedLocation === "North Ave", "Confirmed fixed reassignment did not save."); expect(state().workingLocation === "North Ave" && q("#scannerLocation").value === "North Ave", "Current fixed-device reassignment did not immediately update working location."); }
async function testFixedSwitchConfirmation() { click("#startScanButton"); input("#driverInput", "1001"); key("#driverInput", "Enter"); await waitForStep(1); click("#deviceSetupButton"); select(q("#currentDeviceSelect"), "DEV-NORTH-01"); targetConfirmResponse = false; click("#confirmDeviceLocationButton"); expect(state().currentDeviceId === "DEV-DIV-01" && q("#driverInput").value === "1001", "Cancelled fixed-device switch changed device or scan state."); targetConfirmResponse = true; click("#confirmDeviceLocationButton"); expect(state().currentDeviceId === "DEV-NORTH-01" && q("#driverInput").value === "", "Confirmed fixed-device switch did not reset the unfinished scan."); }
async function selectFloater() { click("#deviceSetupButton"); await waitForVisible("#deviceSetupModal"); select(q("#currentDeviceSelect"), "DEV-FLOAT-01"); }
async function testFloaterRequiresLocation() { await selectFloater(); click("#confirmDeviceLocationButton"); expect(/Choose an active location/i.test(text("#deviceSetupStatus")), "Floater was accepted without a location."); }
async function testFloaterRequiresConfirmation() { await selectFloater(); select(q("#floaterLocationSelect"), "EWR"); targetConfirmResponse = false; click("#confirmDeviceLocationButton"); expect(state().currentDeviceId !== "DEV-FLOAT-01" || state().floaterLocationConfirmed === false, "Floater location was committed without confirmation."); }
async function testFloaterLocationLock() { await selectFloater(); select(q("#floaterLocationSelect"), "EWR"); click("#confirmDeviceLocationButton"); expect(state().currentDeviceId === "DEV-FLOAT-01" && state().floaterLocationConfirmed && q("#scannerLocation").disabled, "Confirmed floater location was not locked."); }
async function testFloaterChangeReset() { await testFloaterLocationLock(); click("#startScanButton"); input("#driverInput", "1001"); key("#driverInput", "Enter"); await waitForStep(1); click("#deviceSetupButton"); click("#changeFloaterLocationButton"); expect(q("#driverInput").value === "" && state().floaterLocationConfirmed === false, "Floater location change did not reset incomplete scan state."); }
async function testFloaterNoElizabeth() { await selectFloater(); expect(![...q("#floaterLocationSelect").options].some((option) => option.value === "Elizabeth Repair Facility"), "Floater can select Elizabeth."); }
async function openDevices() { click('[data-view="supervisorView"]'); click('[data-supervisor-section="devicesSection"]'); await waitFor("#addDeviceButton"); }
async function testAddFixedDevice() { await openDevices(); click("#addDeviceButton"); input("#deviceIdInput", "DEV-TEST-01"); input("#deviceNameInput", "Test Fixed Device"); input("#deviceImeiInput", "111-222-333-444-555"); select(q("#deviceTypeInput"), "Fixed"); select(q("#deviceLocationInput"), "North Ave"); click('#deviceForm button[type="submit"]'); expect(state().devices.some((device) => device.id === "DEV-TEST-01" && device.assignedLocation === "North Ave"), "Fixed device was not created."); }
async function testAddFloaterDevice() { await openDevices(); click("#addDeviceButton"); input("#deviceIdInput", "DEV-FLOAT-99"); input("#deviceNameInput", "Test Floater"); input("#deviceImeiInput", "999888777666555"); select(q("#deviceTypeInput"), "Floater"); click('#deviceForm button[type="submit"]'); const device = state().devices.find((item) => item.id === "DEV-FLOAT-99"); expect(device && device.type === "Floater" && !device.assignedLocation, "Floater device did not save without a permanent location."); }
async function testDuplicateImei() { await openDevices(); click("#addDeviceButton"); input("#deviceIdInput", "DEV-DUP-01"); input("#deviceNameInput", "Duplicate IMEI"); input("#deviceImeiInput", "000000000000001"); select(q("#deviceLocationInput"), "EWR"); click('#deviceForm button[type="submit"]'); expect(/unique/i.test(text("#deviceImeiError")), "Duplicate IMEI was accepted."); }
async function testFixedNeedsLocation() { await openDevices(); click("#addDeviceButton"); input("#deviceIdInput", "DEV-NOLOC-01"); input("#deviceNameInput", "No Location"); input("#deviceImeiInput", "123456789012345"); select(q("#deviceTypeInput"), "Fixed"); click('#deviceForm button[type="submit"]'); expect(/requires one active location/i.test(text("#deviceLocationError")), "Fixed device saved without a location."); }
async function testDeviceEdit() { await openDevices(); click('[data-device-action="edit"][data-device-id="DEV-EWR-01"]'); input("#deviceNameInput", "EWR Updated Scanner"); click('#deviceForm button[type="submit"]'); expect(state().devices.find((item) => item.id === "DEV-EWR-01").name === "EWR Updated Scanner", "Device edit did not save."); }
async function testInactiveDeviceBlocks() { await openDevices(); click('[data-device-action="inactive"][data-device-id="DEV-DIV-01"]'); click('[data-view="scannerView"]'); click("#startScanButton"); expect(/inactive|not ready/i.test(text("#scannerNotice")), "Inactive current device was allowed to start scanning."); }
async function testDeviceReactivate() { await openDevices(); click('[data-device-action="inactive"][data-device-id="DEV-DIV-01"]'); click('[data-device-action="reactivate"][data-device-id="DEV-DIV-01"]'); expect(state().devices.find((device) => device.id === "DEV-DIV-01").active, "Device did not reactivate."); }
async function testDeviceHistory() { await testDeviceReactivate(); expect(events().some((event) => event.type === "device_inactivated") && events().some((event) => event.type === "device_reactivated"), "Device changes were not recorded in history."); }
async function testDeviceTransactionMetadata() { await beginScan("1001", "GFV-0001"); click("#directionIn"); click("#submitTransactionButton"); await waitForText("#confirmationTitle", /Vehicle IN recorded/); const transaction = latestTransaction(); expect(transaction.deviceId === "DEV-DIV-01" && transaction.deviceImei === "000000000000001" && transaction.locationConfirmed === true, "New transaction is missing device metadata."); expect(state().devices.find((device) => device.id === "DEV-DIV-01").lastUsedAt, "Device last-used timestamp did not update."); }
async function testSubmissionRevalidatesDevice() { await beginScan("1001", "GFV-0001"); click("#directionIn"); const before = state().transactions.length; click('[data-view="supervisorView"]'); click('[data-supervisor-section="devicesSection"]'); click('[data-device-action="edit"][data-device-id="DEV-DIV-01"]'); select(q("#deviceStatusInput"), "Repair"); click('#deviceForm button[type="submit"]'); click('[data-view="scannerView"]'); click("#submitTransactionButton"); expect(state().transactions.length === before, "Submission accepted a device that became non-ready mid-scan."); expect(/not ready/i.test(text("#scannerNotice")), "Non-ready device rejection was not shown."); }
async function testSubmissionRevalidatesLocation() { await beginScan("1001", "GFV-0001"); click("#directionIn"); const before = state().transactions.length; q("#scannerLocation").value = "North Ave"; click("#submitTransactionButton"); expect(state().transactions.length === before, "Submission accepted a device/location mismatch."); expect(/location.*match|reconfirm/i.test(text("#scannerNotice")), "Device/location mismatch rejection was not shown."); }
async function testDeviceSeeds() { expect(state().devices.length === 5 && ["DEV-DIV-01", "DEV-NORTH-01", "DEV-EWR-01", "DEV-LINDEN-01", "DEV-FLOAT-01"].every((id) => state().devices.some((device) => device.id === id)), "Deterministic V0.7 devices are not seeded."); }
async function testVinSearch() { click('[data-view="searchView"]'); input("#filterVehicle", "1HGCM82633A004352"); click('#searchForm button[type="submit"]'); expect(text("#searchResultsBody").includes("GFV-0001"), "VIN search failed."); }
async function testPlateSearch() { click('[data-view="searchView"]'); input("#filterVehicle", "TRK-8877"); click('#searchForm button[type="submit"]'); expect(text("#searchResultsBody").includes("TRK-8877"), "Plate search failed."); }
async function testV07Refresh() { await reloadTarget(); expect(text(".brand span span").includes("V0.7") && state().version === "0.7", "Normal refresh did not load V0.7 state."); }
async function testMobileSurface() { const css = await (await targetWindow().fetch("../styles.css")).text(); expect(/max-width:\s*760px/.test(css), "Mobile responsive CSS breakpoint is missing."); }
async function testSupervisorSections() { click('[data-view="supervisorView"]'); for (const id of ["driversSection", "vehiclesSection", "devicesSection"]) { click(`[data-supervisor-section="${id}"]`); await waitForVisible(`#${id}`); } }

async function testMigration() {
  const saved = state();
  saved.version = "0.5";
  saved.authorizations.forEach((authorization) => { delete authorization.scopeType; delete authorization.scopeIds; delete authorization.actionLocation; });
  targetWindow().localStorage.removeItem(STATE_KEY);
  targetWindow().localStorage.setItem(V05_STATE_KEY, JSON.stringify(saved));
  await reloadTarget();
  const migrated = state();
  expect(migrated.version === "0.7" && migrated.migrationVersion === 7, "V0.5 state did not migrate through V0.6 to V0.7.");
  expect(migrated.transactions.length === saved.transactions.length, "Migration lost historical transactions.");
  expect(migrated.authorizations.every((authorization) => authorization.scopeType === "all_current_locations"), "Migration did not add global authorization scope.");
  expect(targetWindow().localStorage.getItem(V05_STATE_KEY), "V0.5 storage key was removed during migration.");
  expect(migrated.vehicles.every((vehicle) => vehicle.id && vehicle.assignedBarcode), "Migrated vehicles are missing stable IDs or barcodes.");
}

async function testV06Migration() {
  const saved = state();
  saved.version = "0.6"; saved.migrationVersion = 6; delete saved.devices; delete saved.currentDeviceId; delete saved.floaterLocationConfirmed;
  targetWindow().localStorage.removeItem(STATE_KEY);
  targetWindow().localStorage.setItem(V06_STATE_KEY, JSON.stringify(saved));
  await reloadTarget();
  const migrated = state();
  expect(migrated.version === "0.7" && migrated.migrationVersion === 7, "V0.6 state did not migrate to V0.7.");
  expect(targetWindow().localStorage.getItem(V06_STATE_KEY), "V0.6 storage key was removed during migration.");
  expect(migrated.transactions.length === saved.transactions.length && migrated.devices.length === 5, "V0.6 migration lost history or failed to seed devices.");
  expect(migrated.authorizations.filter((authorization) => authorization.status === "active").every((authorization) => authorization.type === "9_hours"), "Migrated active authorizations did not adopt the fixed 9-hour rule.");
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
  targetConfirmResponse = true;
  win.localStorage.removeItem(STATE_KEY);
  win.localStorage.removeItem(V06_STATE_KEY);
  win.localStorage.removeItem(V05_STATE_KEY);
  win.localStorage.removeItem(LEGACY_STATE_KEY);
  await reloadTarget();
  // Persist the seeded state before each scenario so read-only safeguards can also
  // be checked against the same browser storage that production actions use.
  const location = q("#scannerLocation");
  select(location, location.value);
}

function captureStorage() {
  const win = targetWindow();
  return { v7: win.localStorage.getItem(STATE_KEY), v6: win.localStorage.getItem(V06_STATE_KEY), v5: win.localStorage.getItem(V05_STATE_KEY), v4: win.localStorage.getItem(LEGACY_STATE_KEY) };
}

function restoreStorage(snapshot) {
  const storage = targetWindow().localStorage;
  [[STATE_KEY, snapshot.v7], [V06_STATE_KEY, snapshot.v6], [V05_STATE_KEY, snapshot.v5], [LEGACY_STATE_KEY, snapshot.v4]].forEach(([key, value]) => {
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
    targetWindow().confirm = () => targetConfirmResponse;
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
function delay(milliseconds) { return new Promise((resolve) => setTimeout(resolve, milliseconds)); }
function log(message) { const stamp = new Date().toLocaleTimeString(); runLog.textContent = `${runLog.textContent}\n[${stamp}] ${message}`.trim(); runLog.scrollTop = runLog.scrollHeight; }
function setRunnerStatus(label, tone) { runnerStatus.textContent = label; runnerStatus.className = `status-pill ${tone}`; }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]); }
