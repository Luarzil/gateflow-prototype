"use strict";

/*
  Lot Watch / GateFlow V0.3 production integration notes:
  - This prototype uses normal text inputs so typed values and Zebra DataWedge keyboard
    wedge scans use the same flow. No Zebra hardware is required in V0.3.
  - A Zebra DataWedge profile can later target the focused driver, VIN, or supervisor
    field. Android Intents can call setScannerValue() from a native wrapper instead.
  - Zebra Enterprise Browser or a native Android app can retain these transaction rules
    while adding EMDK, RFID, NFC, or device-management APIs.
  - Replace localStorage with a secured customer-owned or customer-approved hosted database
    (for example, Postgres) when production access is available. Queue small transaction
    packets for offline sync and resolve on reconnect.
  - Role-based permissions, user management, reporting, and approved customer data hosting
    are future work only. Photo capture is intentionally excluded because it is not required.
*/

const STORAGE_KEY = "lot-watch.gateflow.v0.3.state";
const VIEWS = ["scannerView", "adminView", "searchView", "auditView"];
const CURRENT_GUARD = "Gate Guard 01";

// Set by loadState() at startup; guards every later localStorage call.
// Some contexts (most commonly opening this file directly via
// file:// rather than serving it over http) block localStorage with
// a thrown SecurityError. Without this guard that error aborts
// whichever handler triggered it mid-execution, which makes the app
// look broken/frozen on any action that saves state.
let storageAvailable = true;

const el = {};
const ui = {
  direction: null,
  step: 0,
  activeFlow: null,
  pendingOverride: null,
  lastRawScan: "No scan received",
  lastScanField: "-",
  scanTerminator: "No",
  lastSavedAt: null
};

const state = loadState();

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  populateLocationControls();
  renderAll();
  updateClock();
  setInterval(updateClock, 30000);

  if (!storageAvailable) {
    setSaveStatus("Not saved (storage unavailable in this browser)");
    el.saveStatus.classList.add("warn");
    setNotice("This browser/context blocks local storage (common when opening the file directly). The app still works, but nothing will be saved between reloads. Try a different browser or serve the folder over http(s) to enable saving.", "warning");
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      setSaveStatus("Offline cache unavailable");
    });
  }
});

function cacheElements() {
  [
    "saveStatus", "resetDemoButton", "deviceClock", "scannerHeading", "scannerNotice",
    "scannerHome", "scanWizard", "supervisorPanel", "transactionConfirmation", "startScanButton",
    "flowCancel", "wizardDots", "scannerLocation", "driverInput", "driverStatus", "driverNext", "vinInput",
    "vinStatus", "vinBack", "vinNext", "transactionNote", "reviewStepTitle", "reviewBack",
    "scanSummary", "submitTransactionButton", "supervisorReason", "supervisorInput",
    "supervisorStatus", "cancelSupervisorButton", "approveSupervisorButton", "confirmationTitle",
    "confirmationSummary", "confirmationDoneButton", "gateMiniFeed", "currentScanTitle",
    "scanDetailList", "todayOutCount", "todayInCount", "todayBlockCount", "contextOutCount",
    "contextInCount", "contextBlockCount", "contextAuthorizedCount",
    "adminAuthorizedCount", "authorizedDriversBody", "driversTableBody",
    "deauthorizeAllButton", "locationList", "searchForm", "filterVin", "filterPlate",
    "filterDriver", "filterLocation", "filterDate", "filterType", "clearSearchButton",
    "searchResultCount", "searchResultsBody", "auditTypeFilter", "auditTextFilter", "auditList",
    "directionOut", "directionIn", "movementBack", "onlineStatus", "lastSavedLocal",
    "syncQueueCount", "lastRawScan", "lastScanField", "scanTerminator"
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  el.startScanButton.addEventListener("click", startFlow);
  el.flowCancel.addEventListener("click", showScannerHome);
  el.driverNext.addEventListener("click", validateDriverStep);
  el.vinBack.addEventListener("click", () => showWizardStep(0));
  el.vinNext.addEventListener("click", validateVinStep);
  el.directionOut.addEventListener("click", () => chooseDirection("OUT"));
  el.directionIn.addEventListener("click", () => chooseDirection("IN"));
  el.movementBack.addEventListener("click", () => showWizardStep(1));
  el.reviewBack.addEventListener("click", () => showWizardStep(2));
  el.submitTransactionButton.addEventListener("click", startTransaction);
  el.cancelSupervisorButton.addEventListener("click", cancelSupervisorOverride);
  el.approveSupervisorButton.addEventListener("click", approveSupervisorOverride);
  el.confirmationDoneButton.addEventListener("click", showScannerHome);
  el.scannerLocation.addEventListener("change", () => {
    state.workingLocation = el.scannerLocation.value;
    saveState();
    renderAll();
  });
  el.driverInput.addEventListener("input", () => handleScanInput("driverInput"));
  el.vinInput.addEventListener("input", () => handleScanInput("vinInput"));

  document.querySelectorAll("[data-demo-field]").forEach((button) => {
    button.addEventListener("click", () => setScannerValue(button.dataset.demoField, button.dataset.demoValue));
  });
  document.querySelectorAll("[data-scan-target]").forEach((button) => {
    button.addEventListener("click", () => simulateScan(button.dataset.scanTarget));
  });

  ["driverInput", "vinInput", "supervisorInput"].forEach((id) => {
    el[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== "Tab") return;
      recordScannerInput(id, el[id].value, event.key);
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (id === "supervisorInput") approveSupervisorOverride();
      else if (id === "vinInput") validateVinStep();
      else validateDriverStep();
    });
  });

  el.driversTableBody.addEventListener("click", handleDriverTableAction);
  el.authorizedDriversBody.addEventListener("click", handleDriverTableAction);
  el.deauthorizeAllButton.addEventListener("click", deauthorizeAllDrivers);

  el.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.searchResults = filterTransactions();
    renderSearchResults();
  });
  el.clearSearchButton.addEventListener("click", clearSearch);
  el.auditTypeFilter.addEventListener("change", renderAuditLog);
  el.auditTextFilter.addEventListener("input", renderAuditLog);
  el.resetDemoButton.addEventListener("click", resetDemo);
  window.addEventListener("online", renderConnectivityStatus);
  window.addEventListener("offline", renderConnectivityStatus);
}

function createSeedState() {
  const now = new Date();
  const today = dateKey(now);
  const isoMinutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();

  return {
    version: "0.3",
    workingLocation: "Division Street",
    drivers: [
      { employeeNumber: "EMP-1001", name: "Nina Patel" },
      { employeeNumber: "EMP-1002", name: "Marcus Reed" },
      { employeeNumber: "EMP-1003", name: "Tyrone Brooks" },
      { employeeNumber: "EMP-1004", name: "Maria Torres" },
      { employeeNumber: "EMP-1005", name: "Phil Grant" }
    ],
    vehicles: [
      { vin: "1HGCM82633A004352", plate: "TRK-8877" },
      { vin: "2T1BURHE5JC034789", plate: "NJK-2214" },
      { vin: "3FA6P0H75HR123456", plate: "YARD-104" },
      { vin: "5NPE24AF8FH001234", plate: "EWR-5521" },
      { vin: "1FTFW1EF1EFA00001", plate: "LIND-7710" }
    ],
    locations: ["Division Street", "North Ave", "EWR", "Linden", "Elizabeth Repair Facility"],
    supervisors: [
      { id: "SUP-1001", name: "Morgan Lee" },
      { id: "SUP-2040", name: "Jordan Wells" }
    ],
    dailyAuthorizations: [
      { driverEmployee: "EMP-1001", date: today, actor: "System seed" },
      { driverEmployee: "EMP-1002", date: today, actor: "System seed" },
      { driverEmployee: "EMP-1004", date: today, actor: "System seed" }
    ],
    transactions: [
      seedTransaction("tx-001", isoMinutesAgo(16), "OUT", "EMP-1001", "Nina Patel", "1HGCM82633A004352", "TRK-8877", "Division Street", "Authorized", "Customer delivery", CURRENT_GUARD),
      seedTransaction("tx-002", isoMinutesAgo(41), "IN", "EMP-1003", "Tyrone Brooks", "3FA6P0H75HR123456", "YARD-104", "EWR", "Unauthorized", "Returned from service", CURRENT_GUARD),
      seedTransaction("tx-003", isoMinutesAgo(68), "OUT", "EMP-1004", "Maria Torres", "5NPE24AF8FH001234", "EWR-5521", "Linden", "Authorized", "", CURRENT_GUARD)
    ],
    auditEvents: [
      seedAudit("audit-001", isoMinutesAgo(16), "out_transaction", "Vehicle OUT recorded for EMP-1001 / TRK-8877.", CURRENT_GUARD, "Division Street"),
      seedAudit("audit-002", isoMinutesAgo(41), "in_transaction", "Vehicle IN recorded for EMP-1003 / YARD-104.", CURRENT_GUARD, "EWR"),
      seedAudit("audit-003", isoMinutesAgo(41), "unauthorized_in_review", "Unauthorized IN activity flagged for audit review.", CURRENT_GUARD, "EWR"),
      seedAudit("audit-004", isoMinutesAgo(68), "out_transaction", "Vehicle OUT recorded for EMP-1004 / EWR-5521.", CURRENT_GUARD, "Linden"),
      seedAudit("audit-005", isoMinutesAgo(130), "driver_authorized", "Driver EMP-1001 authorized for today.", "System seed", "")
    ]
  };
}

function seedTransaction(id, timestamp, direction, driverEmployee, driverName, vin, plate, location, authorizationStatus, note, submittedBy) {
  return { id, timestamp, direction, driverEmployee, driverName, vin, plate, location, authorizationStatus, note, submittedBy };
}

function seedAudit(id, timestamp, type, description, actor, location) {
  return { id, timestamp, type, description, actor, location };
}

function isStorageUsable() {
  try {
    const testKey = "lot-watch.gateflow.storage-check";
    localStorage.setItem(testKey, "1");
    localStorage.removeItem(testKey);
    return true;
  } catch (error) {
    return false;
  }
}

function loadState() {
  storageAvailable = isStorageUsable();
  if (!storageAvailable) {
    console.warn("localStorage is not available in this context (often happens when opening the file directly via file://). Lot Watch / GateFlow will run with in-memory data only for this session.");
    return createSeedState();
  }
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.version === "0.3" && Array.isArray(saved.transactions)) return saved;
  } catch (error) {
    console.warn("Could not load Lot Watch state", error);
  }
  return createSeedState();
}

function saveState() {
  if (!storageAvailable) return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    ui.lastSavedAt = new Date();
    setSaveStatus("Saved locally");
    renderConnectivityStatus();
  } catch (error) {
    storageAvailable = false;
    console.warn("Could not save Lot Watch state locally; continuing in-memory only for this session.", error);
    setSaveStatus("Not saved (storage unavailable in this browser)");
    el.saveStatus.classList.add("warn");
  }
}

function showView(viewId) {
  if (!VIEWS.includes(viewId)) return;
  VIEWS.forEach((id) => {
    const section = document.getElementById(id);
    const isActive = id === viewId;
    section.classList.toggle("is-active", isActive);
    if (isActive) animateIn(section);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });
  renderAll();
}

function populateLocationControls() {
  const selectedScannerLocation = state.workingLocation || el.scannerLocation.value || state.locations[0];
  const selectedSearchLocation = el.filterLocation.value;
  el.scannerLocation.innerHTML = state.locations.map((location) => optionHtml(location, location === selectedScannerLocation)).join("");
  el.filterLocation.innerHTML = `<option value="">All locations</option>${state.locations.map((location) => optionHtml(location, location === selectedSearchLocation)).join("")}`;
  state.workingLocation = el.scannerLocation.value || state.locations[0];
}

function optionHtml(value, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
}

function startFlow() {
  resetFlow();
  ui.direction = null;
  ui.activeFlow = "scan";
  el.scannerHeading.textContent = "Vehicle Scan";
  setNotice("Scan the driver employee #, then the vehicle VIN.", "neutral");
  showWizardStep(0);
}

function showScannerHome() {
  resetFlow();
  ui.activeFlow = null;
  ui.direction = null;
  el.scannerHeading.textContent = "Lot Watch / GateFlow";
  setScannerScreen("home");
  setNotice("Ready. Working location stays selected for this session.", "neutral");
  renderAll();
}

function setScannerScreen(name) {
  const screens = {
    home: el.scannerHome,
    wizard: el.scanWizard,
    override: el.supervisorPanel,
    confirm: el.transactionConfirmation
  };
  Object.values(screens).forEach((screen) => screen.classList.add("hidden"));
  screens[name].classList.remove("hidden");
  animateIn(screens[name]);
}

// Restarts a short fade/slide-in animation on an element — used any
// time a scanner screen, wizard step, or tab becomes visible so the
// UI feels responsive instead of snapping instantly between states.
function animateIn(target) {
  if (!target) return;
  target.classList.remove("enter-anim");
  void target.offsetWidth; // force reflow so the animation restarts
  target.classList.add("enter-anim");
}

// Briefly shakes a field to draw the eye to an invalid value, paired
// with the existing field-status text and scanner-alert tone.
function shake(target) {
  if (!target) return;
  target.classList.remove("shake");
  void target.offsetWidth;
  target.classList.add("shake");
}

function showWizardStep(step) {
  ui.step = step;
  setScannerScreen("wizard");
  document.querySelectorAll(".wizard-step").forEach((panel) => {
    const isActive = Number(panel.dataset.step) === step;
    panel.classList.toggle("hidden", !isActive);
    if (isActive) animateIn(panel);
  });
  updateWizardDots();
  if (step === 3) renderScanSummary();
  if (step === 0) el.driverInput.focus();
  if (step === 1) el.vinInput.focus();
  if (step === 2) el.directionOut.focus();
  renderScanDetails();
}

function updateWizardDots() {
  el.wizardDots.querySelectorAll(".dot").forEach((dot, index) => {
    dot.classList.toggle("done", index < ui.step);
    dot.classList.toggle("active", index === ui.step);
  });
}

function resetFlow() {
  ui.step = 0;
  ui.pendingOverride = null;
  el.driverInput.value = "";
  el.vinInput.value = "";
  el.transactionNote.value = "";
  el.supervisorInput.value = "";
  el.driverStatus.textContent = "Awaiting employee number scan.";
  el.vinStatus.textContent = "Awaiting VIN scan.";
  el.supervisorStatus.textContent = "Awaiting a valid supervisor ID.";
  renderScanDetails();
}

function setScannerValue(fieldId, value) {
  const input = el[fieldId];
  if (!input) return;
  input.value = value;
  recordScannerInput(fieldId, value, "Simulated scan");
  if (fieldId === "driverInput") updateDriverStatus();
  if (fieldId === "vinInput") {
    input.value = normalize(value);
    updateVinStatus();
  }
  if (fieldId === "supervisorInput") input.focus();
}

function simulateScan(fieldId) {
  const samples = {
    driverInput: ["EMP-1001", "EMP-1003", "EMP-1004"],
    vinInput: ["1HGCM82633A004352", "3FA6P0H75HR123456", "1FTFW1EF1EFA00001"],
    supervisorInput: ["SUP-1001", "SUP-2040", "SUP-BAD"]
  };
  const values = samples[fieldId] || [];
  const next = values.find((value) => value !== el[fieldId].value) || values[0];
  setScannerValue(fieldId, next);
}

function updateDriverStatus() {
  const driver = findDriver(el.driverInput.value);
  if (!driver) el.driverStatus.textContent = "Employee number not found in the demo roster.";
  else if (isAuthorizedToday(driver.employeeNumber)) el.driverStatus.textContent = `${driver.name} - Authorized today.`;
  else el.driverStatus.textContent = `${driver.name} - Not authorized today. Vehicle OUT requires supervisor approval.`;
  renderScanDetails();
}

function updateVinStatus() {
  const value = normalize(el.vinInput.value);
  const vehicle = findVehicle(value);
  if (!value) el.vinStatus.textContent = "Awaiting VIN scan.";
  else {
    const lengthNote = value.length === 17 ? "" : ` VIN is ${value.length} characters; 17 expected. Allowed for demo.`;
    el.vinStatus.textContent = vehicle ? `${vehicle.vin} / ${vehicle.plate || "No plate"} found.${lengthNote}` : `VIN not found in the demo list.${lengthNote}`;
  }
  renderScanDetails();
}

function validateDriverStep() {
  const driver = findDriver(el.driverInput.value);
  if (!driver) {
    setNotice("Scan or enter a valid Driver Employee #.", "warning");
    shake(el.driverInput);
    el.driverInput.focus();
    return;
  }
  showWizardStep(1);
}

function validateVinStep() {
  const vin = normalize(el.vinInput.value);
  el.vinInput.value = vin;
  if (!vin) {
    setNotice("Scan or enter a vehicle VIN.", "warning");
    shake(el.vinInput);
    el.vinInput.focus();
    return;
  }
  showWizardStep(2);
}

function chooseDirection(direction) {
  ui.direction = direction;
  el.reviewStepTitle.textContent = `Review Vehicle ${direction}`;
  el.submitTransactionButton.textContent = `Submit ${direction}`;
  showWizardStep(3);
}

function blockOutForSupervisor(driver) {
  ui.pendingOverride = { driverEmployee: driver.employeeNumber, location: el.scannerLocation.value };
  el.supervisorReason.textContent = `${driver.employeeNumber} / ${driver.name} is not authorized for today. Vehicle OUT is blocked until a supervisor approves.`;
  el.supervisorInput.value = "";
  el.supervisorStatus.textContent = "Awaiting a valid supervisor ID.";
  setScannerScreen("override");
  const vehicle = readVehicleInput();
  addAudit("blocked_out", `Blocked Vehicle OUT attempt for ${driver.employeeNumber} / ${vehicle ? vehicle.plate || vehicle.vin : "vehicle pending"}.`, CURRENT_GUARD, el.scannerLocation.value);
  saveState();
  renderAll();
  setNotice("Vehicle OUT blocked. Supervisor authorization required.", "warning");
  el.supervisorInput.focus();
}

function startTransaction() {
  const draft = readTransactionDraft();
  if (!draft) return;
  if (draft.direction === "OUT" && !isAuthorizedToday(draft.driver.employeeNumber)) {
    blockOutForSupervisor(draft.driver);
    return;
  }
  completeTransaction(draft);
}

function readTransactionDraft() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  if (!driver || !vehicle || !el.scannerLocation.value || !ui.direction) return null;
  return { driver, vehicle, location: el.scannerLocation.value, direction: ui.direction, note: el.transactionNote.value.trim() };
}

function approveSupervisorOverride() {
  if (!ui.pendingOverride) return;
  const supervisor = state.supervisors.find((item) => item.id === normalize(el.supervisorInput.value));
  if (!supervisor) {
    el.supervisorStatus.textContent = "Invalid supervisor ID. Approval was not granted.";
    setNotice("Supervisor ID is not valid.", "danger");
    shake(el.supervisorInput);
    return;
  }

  const pending = ui.pendingOverride;
  addAuthorization(pending.driverEmployee, supervisor.id, pending.location, true);
  addAudit("supervisor_approval", "Supervisor approved unauthorized driver for today.", `${supervisor.id} / ${supervisor.name}`, pending.location);
  saveState();
  ui.pendingOverride = null;
  renderAll();
  setNotice("Supervisor approved this driver for today. Vehicle OUT can continue.", "success");
  chooseDirection("OUT");
}

function cancelSupervisorOverride() {
  showScannerHome();
  setNotice("Blocked OUT transaction cancelled.", "neutral");
}

function completeTransaction(draft) {
  const authorizationStatus = isAuthorizedToday(draft.driver.employeeNumber) ? "Authorized" : "Unauthorized";
  const transaction = {
    id: makeId("tx"),
    timestamp: new Date().toISOString(),
    direction: draft.direction,
    driverEmployee: draft.driver.employeeNumber,
    driverName: draft.driver.name,
    vin: draft.vehicle.vin,
    plate: draft.vehicle.plate || "",
    location: draft.location,
    authorizationStatus,
    note: draft.note,
    submittedBy: CURRENT_GUARD
  };
  state.transactions.unshift(transaction);
  addAudit(
    draft.direction === "OUT" ? "out_transaction" : "in_transaction",
    `Vehicle ${draft.direction} recorded for ${draft.driver.employeeNumber} / ${draft.vehicle.plate || draft.vehicle.vin}.`,
    CURRENT_GUARD,
    draft.location
  );
  if (draft.direction === "IN" && authorizationStatus === "Unauthorized") {
    addAudit("unauthorized_in_review", "Unauthorized IN activity flagged for audit review.", CURRENT_GUARD, draft.location);
  }
  saveState();
  renderAll();
  showTransactionConfirmation(transaction);
  setNotice(`Vehicle ${draft.direction} saved.`, "success");
}

function showTransactionConfirmation(transaction) {
  setScannerScreen("confirm");
  window.setTimeout(() => el.confirmationDoneButton.focus(), 30);
  el.confirmationTitle.textContent = `Vehicle ${transaction.direction} recorded`;
  el.confirmationSummary.innerHTML = summaryRows([
    ["Movement", `Vehicle ${transaction.direction}`],
    ["Location", transaction.location],
    ["Driver", `${transaction.driverEmployee} - ${transaction.driverName}`],
    ["Vehicle", `${transaction.vin}${transaction.plate ? ` / ${transaction.plate}` : ""}`],
    ["Authorization", `${transaction.authorizationStatus} today`]
  ]);
}

function findDriver(value) {
  const needle = normalize(value);
  return state.drivers.find((driver) => driver.employeeNumber === needle) || null;
}

function findVehicle(value) {
  const needle = normalize(value);
  return state.vehicles.find((vehicle) => vehicle.vin === needle || vehicle.plate === needle) || null;
}

function readVehicleInput() {
  const vin = normalize(el.vinInput.value);
  if (!vin) return null;
  return findVehicle(vin) || { vin, plate: "" };
}

function handleScanInput(fieldId) {
  const input = el[fieldId];
  if (!input) return;
  const rawValue = input.value;
  recordScannerInput(fieldId, rawValue, "Input");
  if (fieldId === "vinInput") input.value = normalize(rawValue);
  if (fieldId === "driverInput") updateDriverStatus();
  if (fieldId === "vinInput") updateVinStatus();
}

function recordScannerInput(fieldId, rawValue, terminator) {
  const labels = {
    driverInput: "Driver Employee #",
    vinInput: "Vehicle VIN",
    supervisorInput: "Supervisor ID"
  };
  ui.lastRawScan = rawValue || "No scan received";
  ui.lastScanField = labels[fieldId] || fieldId;
  ui.scanTerminator = terminator === "Enter" || terminator === "Tab" ? `${terminator} detected` : terminator;
  renderScannerTestPanel();
}

function isAuthorizedToday(employeeNumber) {
  return state.dailyAuthorizations.some((entry) => entry.driverEmployee === employeeNumber && entry.date === dateKey(new Date()));
}

function addAuthorization(employeeNumber, actor, location, fromSupervisor) {
  if (isAuthorizedToday(employeeNumber)) return;
  state.dailyAuthorizations.unshift({ driverEmployee: employeeNumber, date: dateKey(new Date()), actor });
  addAudit("driver_authorized", `Driver ${employeeNumber} authorized for today.${fromSupervisor ? " Supervisor override recorded." : ""}`, actor, location);
}

function removeAuthorization(employeeNumber, actor) {
  state.dailyAuthorizations = state.dailyAuthorizations.filter((entry) => !(entry.driverEmployee === employeeNumber && entry.date === dateKey(new Date())));
  addAudit("driver_deauthorized", `Driver ${employeeNumber} deauthorized for today.`, actor, "");
}

function handleDriverTableAction(event) {
  const button = event.target.closest("[data-driver-action]");
  if (!button) return;
  const employeeNumber = button.dataset.driverEmployee;
  if (button.dataset.driverAction === "authorize") addAuthorization(employeeNumber, "Admin Console", "", false);
  if (button.dataset.driverAction === "deauthorize") removeAuthorization(employeeNumber, "Admin Console");
  saveState();
  renderAll();
}

function deauthorizeAllDrivers() {
  const authorized = state.dailyAuthorizations.filter((entry) => entry.date === dateKey(new Date()));
  if (!authorized.length) {
    setNotice("No drivers are authorized today.", "neutral");
    return;
  }
  state.dailyAuthorizations = state.dailyAuthorizations.filter((entry) => entry.date !== dateKey(new Date()));
  addAudit("driver_deauthorized", `All ${authorized.length} drivers were deauthorized for today.`, "Admin Console", "");
  saveState();
  renderAll();
  setNotice("All daily driver authorizations removed.", "warning");
}

function addAudit(type, description, actor, location) {
  state.auditEvents.unshift({
    id: makeId("audit"),
    timestamp: new Date().toISOString(),
    type,
    description,
    actor,
    location
  });
}

function renderAll() {
  renderConnectivityStatus();
  renderScannerTestPanel();
  renderScannerContext();
  renderScanDetails();
  renderRecentActivity();
  renderAdmin();
  ui.searchResults = filterTransactions();
  renderSearchResults();
  renderAuditLog();
}

function renderScannerContext() {
  const today = dateKey(new Date());
  const transactionsToday = state.transactions.filter((item) => dateKey(new Date(item.timestamp)) === today);
  const auditToday = state.auditEvents.filter((item) => dateKey(new Date(item.timestamp)) === today);
  el.todayOutCount.textContent = transactionsToday.filter((item) => item.direction === "OUT").length;
  el.todayInCount.textContent = transactionsToday.filter((item) => item.direction === "IN").length;
  el.todayBlockCount.textContent = auditToday.filter((item) => item.type === "blocked_out").length;
  el.contextOutCount.textContent = el.todayOutCount.textContent;
  el.contextInCount.textContent = el.todayInCount.textContent;
  el.contextBlockCount.textContent = el.todayBlockCount.textContent;
  el.contextAuthorizedCount.textContent = state.drivers.filter((driver) => isAuthorizedToday(driver.employeeNumber)).length;
}

function renderScanDetails() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  const location = el.scannerLocation.value || "No location selected";
  const authorization = driver ? (isAuthorizedToday(driver.employeeNumber) ? "Authorized today" : "Not authorized today") : "Awaiting driver";
  const title = ui.activeFlow ? (ui.direction ? `Vehicle ${ui.direction}` : "Scan in progress") : "No transaction selected";
  el.currentScanTitle.textContent = title;
  el.scanDetailList.innerHTML = summaryRows([
    ["Location", location],
    ["Driver", driver ? `${driver.employeeNumber} - ${driver.name}` : "Awaiting employee #"],
    ["Vehicle", vehicle ? `${vehicle.vin}${vehicle.plate ? ` / ${vehicle.plate}` : ""}` : "Awaiting VIN"],
    ["Authorization", authorization]
  ]);
}

function renderScanSummary() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  const authorization = driver && isAuthorizedToday(driver.employeeNumber) ? "Authorized today" : (ui.direction === "OUT" ? "Supervisor approval required" : "Unauthorized IN - audit review");
  const vinValue = normalize(el.vinInput.value);
  el.scanSummary.innerHTML = summaryRows([
    ["Movement", `Vehicle ${ui.direction}`],
    ["Location", el.scannerLocation.value],
    ["Driver", driver ? `${driver.employeeNumber} - ${driver.name}` : "Awaiting employee #"],
    ["Vehicle", vehicle ? `${vehicle.vin}${vehicle.plate ? ` / ${vehicle.plate}` : ""}` : "Awaiting VIN"],
    ["VIN validation", vinValue.length === 17 ? "17 characters" : `${vinValue.length} characters - allowed for demo`],
    ["Authorization", authorization]
  ]);
}

function renderScannerTestPanel() {
  if (!el.lastRawScan) return;
  el.lastRawScan.textContent = ui.lastRawScan;
  el.lastScanField.textContent = ui.lastScanField;
  el.scanTerminator.textContent = ui.scanTerminator;
}

function renderConnectivityStatus() {
  if (!el.onlineStatus) return;
  const isOnline = typeof navigator === "undefined" || navigator.onLine;
  el.onlineStatus.textContent = isOnline ? "Online" : "Offline";
  el.onlineStatus.classList.toggle("offline", !isOnline);
  if (!storageAvailable) el.lastSavedLocal.textContent = "Local save unavailable";
  else if (ui.lastSavedAt) el.lastSavedLocal.textContent = `Saved locally ${formatTime(ui.lastSavedAt)}`;
  else el.lastSavedLocal.textContent = "Saved locally";
  el.syncQueueCount.textContent = "Sync queue: 0";
}

function summaryRows(rows) {
  return rows.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join("");
}

function renderRecentActivity() {
  const transactions = state.transactions.slice(0, 5);
  el.gateMiniFeed.innerHTML = transactions.length ? transactions.map((item) => `
    <article class="feed-item">
      <span class="movement-chip ${item.direction.toLowerCase()}">${item.direction}</span>
      <div><strong>${escapeHtml(item.plate || item.vin)}</strong><span>${escapeHtml(item.driverEmployee)} - ${escapeHtml(item.location)}</span></div>
      <time datetime="${item.timestamp}">${formatTime(item.timestamp)}</time>
    </article>
  `).join("") : emptyState("No gate activity recorded yet.");
}

function renderAdmin() {
  const authorized = state.drivers.filter((driver) => isAuthorizedToday(driver.employeeNumber));
  el.adminAuthorizedCount.textContent = authorized.length;
  el.authorizedDriversBody.innerHTML = authorized.length ? authorized.map((driver) => {
    const entry = state.dailyAuthorizations.find((item) => item.driverEmployee === driver.employeeNumber && item.date === dateKey(new Date()));
    return `<tr><td>${escapeHtml(driver.employeeNumber)}</td><td>${escapeHtml(driver.name)}</td><td>${escapeHtml(entry ? entry.actor : "")}</td><td><button class="table-action" type="button" data-driver-action="deauthorize" data-driver-employee="${escapeHtml(driver.employeeNumber)}">Deauthorize</button></td></tr>`;
  }).join("") : `<tr><td colspan="4" class="empty-cell">No drivers are authorized today.</td></tr>`;

  el.driversTableBody.innerHTML = state.drivers.map((driver) => {
    const authorizedToday = isAuthorizedToday(driver.employeeNumber);
    return `<tr><td>${escapeHtml(driver.employeeNumber)}</td><td>${escapeHtml(driver.name)}</td><td><span class="status-badge ${authorizedToday ? "authorized" : "unauthorized"}">${authorizedToday ? "Authorized" : "Not authorized"}</span></td><td><button class="table-action ${authorizedToday ? "danger-text" : "success-text"}" type="button" data-driver-action="${authorizedToday ? "deauthorize" : "authorize"}" data-driver-employee="${escapeHtml(driver.employeeNumber)}">${authorizedToday ? "Deauthorize for today" : "Authorize for today"}</button></td></tr>`;
  }).join("");

  el.locationList.innerHTML = state.locations.map((location) => `<li>${escapeHtml(location)}<span>Gate location</span></li>`).join("");
}

function filterTransactions() {
  const vin = normalize(el.filterVin.value);
  const plate = normalize(el.filterPlate.value);
  const driver = normalize(el.filterDriver.value);
  const location = el.filterLocation.value;
  const date = el.filterDate.value;
  const type = el.filterType.value;

  return state.transactions.filter((item) => {
    const matchesVin = !vin || item.vin.includes(vin);
    const matchesPlate = !plate || (item.plate || "").includes(plate);
    const matchesDriver = !driver || item.driverEmployee.includes(driver) || item.driverName.toUpperCase().includes(driver);
    const matchesLocation = !location || item.location === location;
    const matchesDate = !date || dateKey(new Date(item.timestamp)) === date;
    const matchesType = !type || item.direction === type;
    return matchesVin && matchesPlate && matchesDriver && matchesLocation && matchesDate && matchesType;
  });
}

function clearSearch() {
  el.searchForm.reset();
  el.filterLocation.value = "";
  renderAll();
}

function renderSearchResults() {
  const results = ui.searchResults;
  el.searchResultCount.textContent = results.length;
  el.searchResultsBody.innerHTML = results.length ? results.map((item) => `<tr>
    <td>${formatTimestamp(item.timestamp)}</td><td><span class="movement-chip ${item.direction.toLowerCase()}">${item.direction}</span></td><td>${escapeHtml(item.driverEmployee)}</td><td>${escapeHtml(item.driverName)}</td><td class="mono">${escapeHtml(item.vin)}</td><td>${escapeHtml(item.plate || "-")}</td><td>${escapeHtml(item.location)}</td><td><span class="status-badge ${item.authorizationStatus === "Authorized" ? "authorized" : "unauthorized"}">${escapeHtml(item.authorizationStatus)}</span></td><td>${escapeHtml(item.note || "-")}</td><td>${escapeHtml(item.submittedBy)}</td>
  </tr>`).join("") : `<tr><td colspan="10" class="empty-cell">No transactions match these filters.</td></tr>`;
}

function renderAuditLog() {
  const type = el.auditTypeFilter.value;
  const text = normalize(el.auditTextFilter.value);
  const events = state.auditEvents.filter((event) => {
    const matchesType = !type || event.type === type;
    const haystack = `${event.description} ${event.actor} ${event.location}`.toUpperCase();
    return matchesType && (!text || haystack.includes(text));
  });
  el.auditList.innerHTML = events.length ? events.map((event) => `
    <article class="audit-event ${auditTone(event.type)}">
      <div class="audit-type">${escapeHtml(humanAuditType(event.type))}</div>
      <div><h2>${escapeHtml(event.description)}</h2><p>${escapeHtml(event.actor)}${event.location ? ` - ${escapeHtml(event.location)}` : ""}</p></div>
      <time datetime="${event.timestamp}">${formatTimestamp(event.timestamp)}</time>
    </article>
  `).join("") : emptyState("No audit activity matches these filters.");
}

function resetDemo() {
  const fresh = createSeedState();
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  addAudit("demo_reset", "Demo data reset to V0.3 seed data.", "System", "");
  ui.pendingOverride = null;
  populateLocationControls();
  showScannerHome();
  saveState();
  renderAll();
  setNotice("Demo data reset.", "success");
}

function setNotice(message, tone) {
  el.scannerNotice.textContent = message;
  el.scannerNotice.className = `scanner-alert ${tone}`;
}

function setSaveStatus(text) {
  el.saveStatus.lastChild.textContent = ` ${text}`;
}

function updateClock() {
  el.deviceClock.textContent = new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date());
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat([], { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function humanAuditType(type) {
  return ({
    in_transaction: "IN transaction",
    out_transaction: "OUT transaction",
    blocked_out: "Blocked unauthorized OUT",
    supervisor_approval: "Supervisor approval",
    driver_authorized: "Driver authorized for today",
    driver_deauthorized: "Driver deauthorized",
    unauthorized_in_review: "Unauthorized IN review",
    demo_reset: "Reset/demo action"
  })[type] || type;
}

function auditTone(type) {
  if (type === "blocked_out" || type === "unauthorized_in_review") return "warning";
  if (type === "supervisor_approval") return "approval";
  if (type === "driver_deauthorized") return "muted";
  return "normal";
}

function emptyState(message) {
  return `<p class="empty-state">${escapeHtml(message)}</p>`;
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" })[character]);
}
