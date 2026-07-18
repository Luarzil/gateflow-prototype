"use strict";

/*
  Lot Watch / GateFlow V0.5 Patrick response review prototype integration notes:
  - This is still a static HTML/CSS/JS prototype. It uses normal focused text inputs
    so typed values and future Zebra DataWedge keyboard-wedge scans exercise the same
    validation flow.
  - A production Zebra TC-series build may use DataWedge profile output, Android
    Intents, Zebra Enterprise Browser, or a native Android/EMDK wrapper to call the
    same driver/VIN/supervisor transaction rules.
  - Production needs customer-owned or customer-approved hosted data storage
    (Postgres, Supabase/Postgres, or enterprise-hosted database), server-side role
    enforcement, reversible migrations, audit immutability, and offline sync queues.
  - Scanner users, Supervisors, Managers, and Owner/System Administrators are shown
    here as UI/business-rule placeholders only. No real authentication is included.
  - TODO: Individual operator identification is a future requirement. A station identity
    identifies the device/location only; it is not individual accountability.
  - Photo capture is intentionally not included because the client said photos are
    not needed for this workflow.
*/

const STORAGE_KEY = "lot-watch.gateflow.v0.5.state";
const LEGACY_STORAGE_KEY = "lot-watch.gateflow.v0.4.state";
const VIEWS = ["scannerView", "adminView", "searchView"];
const BUSINESS_TIMEZONE = "America/New_York";
const LICENSE_VALID_THROUGH_PRINTED_DATE = true;

let storageAvailable = true;

const el = {};
const ui = {
  direction: null,
  step: 0,
  activeFlow: null,
  pendingOverride: null,
  searchResults: [],
  lastRawScan: "No scan received",
  lastScanField: "-",
  scanTerminator: "No",
  lastSavedAt: null
};

const state = loadState();

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  expireAuthorizations("system");
  populateLocationControls();
  renderAll();
  updateClock();
  setInterval(updateClock, 30000);

  if (!storageAvailable) {
    setSaveStatus("Not saved (storage unavailable)");
    el.saveStatus.classList.add("warn");
    setNotice("This browser blocks local storage. The prototype still works for this session, but data will not persist after reload.", "warning");
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch(() => setSaveStatus("Offline cache unavailable"));
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
    "searchResultCount", "searchResultsBody",
    "directionOut", "directionIn", "movementBack", "onlineStatus", "lastSavedLocal",
    "syncQueueCount", "lastRawScan", "lastScanField", "scanTerminator",
    "openManualEmployeeButton", "manualEmployeeModal", "manualEmployeeInput", "manualEmployeeStatus",
    "submitManualEmployeeButton", "closeManualEmployeeButton", "cancelManualEmployeeButton",
    "driverRosterSearch", "authorizationDuration", "selectVisibleDriversButton", "bulkAuthorizeButton",
    "license30Count", "license15Count", "license5Count", "licenseExpiredCount", "bulkActionStatus",
    "stationIdentity", "supervisorDuration"
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
    el.stationIdentity.textContent = currentStationIdentity();
    saveState();
    renderAll();
  });

  el.driverInput.addEventListener("input", () => handleScanInput("driverInput"));
  el.vinInput.addEventListener("input", () => handleScanInput("vinInput"));
  el.supervisorInput.addEventListener("input", () => recordScannerInput("supervisorInput", el.supervisorInput.value, "Input"));

  document.querySelectorAll("[data-demo-field]").forEach((button) => {
    button.addEventListener("click", () => setScannerValue(button.dataset.demoField, button.dataset.demoValue));
  });

  ["driverInput", "vinInput", "supervisorInput", "manualEmployeeInput"].forEach((id) => {
    el[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== "Tab") return;
      recordScannerInput(id, el[id].value, event.key);
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (id === "supervisorInput") approveSupervisorOverride();
      else if (id === "vinInput") validateVinStep();
      else if (id === "manualEmployeeInput") submitManualEmployee();
      else validateDriverStep();
    });
  });

  el.openManualEmployeeButton.addEventListener("click", openManualEmployeeModal);
  el.closeManualEmployeeButton.addEventListener("click", closeManualEmployeeModal);
  el.cancelManualEmployeeButton.addEventListener("click", closeManualEmployeeModal);
  el.submitManualEmployeeButton.addEventListener("click", submitManualEmployee);
  el.manualEmployeeModal.addEventListener("click", (event) => {
    if (event.target === el.manualEmployeeModal) closeManualEmployeeModal();
  });

  el.driversTableBody.addEventListener("click", handleDriverTableAction);
  el.authorizedDriversBody.addEventListener("click", handleDriverTableAction);
  el.deauthorizeAllButton.addEventListener("click", deauthorizeAllDrivers);
  el.driverRosterSearch.addEventListener("input", renderAdmin);
  el.selectVisibleDriversButton.addEventListener("click", selectVisibleDrivers);
  el.bulkAuthorizeButton.addEventListener("click", bulkAuthorizeDrivers);

  el.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.searchResults = filterTransactions();
    renderSearchResults();
  });
  el.clearSearchButton.addEventListener("click", clearSearch);
  el.resetDemoButton.addEventListener("click", resetDemo);
  window.addEventListener("online", renderConnectivityStatus);
  window.addEventListener("offline", renderConnectivityStatus);
}

function createSeedState() {
  const now = new Date();
  const isoMinutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
  const todayAuth = createAuthorization("auth-001", "EMP-1001", "9_hours", "System seed", "Division Street", now);
  const twoDayAuth = createAuthorization("auth-002", "EMP-1002", "48_hours", "System seed", "North Ave", now);
  const threeDayAuth = createAuthorization("auth-003", "EMP-1004", "3_days", "System seed", "Linden", now);

  return {
    version: "0.5",
    migrationVersion: 5,
    businessTimezone: BUSINESS_TIMEZONE,
    workingLocation: "Division Street",
    drivers: [
      seedDriver("EMP-1001", "Nina Patel", 84, true),
      seedDriver("EMP-1002", "Marcus Reed", 30, true),
      seedDriver("EMP-1003", "Tyrone Brooks", 4, true),
      seedDriver("EMP-1004", "Maria Torres", 14, true),
      seedDriver("EMP-1005", "Phil Grant", -3, true),
      seedDriver("EMP-1006", "Angela Cruz", 180, false)
    ],
    vehicles: [
      { vin: "1HGCM82633A004352", plate: "TRK-8877" },
      { vin: "2T1BURHE5JC034789", plate: "NJK-2214" },
      { vin: "3FA6P0H75HR123456", plate: "YARD-104" },
      { vin: "5NPE24AF8FH001234", plate: "EWR-5521" },
      { vin: "1FTFW1EF1EFA00001", plate: "LIND-7710" }
    ],
    locations: [
      { name: "Division Street", active: true },
      { name: "North Ave", active: true },
      { name: "EWR", active: true },
      { name: "Linden", active: true },
      { name: "Elizabeth Repair Facility", active: false, historicalOnly: true }
    ],
    supervisors: [
      { id: "SUP-1001", name: "Morgan Lee" },
      { id: "SUP-2040", name: "Jordan Wells" }
    ],
    authorizations: [todayAuth, twoDayAuth, threeDayAuth].filter(Boolean),
    transactions: [
      seedTransaction("tx-001", isoMinutesAgo(16), "OUT", "EMP-1001", "Nina Patel", "1HGCM82633A004352", "TRK-8877", "Division Street", "Authorized", "Customer delivery", "Division Street Scanner"),
      seedTransaction("tx-002", isoMinutesAgo(41), "IN", "EMP-1003", "Tyrone Brooks", "3FA6P0H75HR123456", "YARD-104", "EWR", "Unauthorized", "Unauthorized IN - operational review", "EWR Scanner"),
      seedTransaction("tx-003", isoMinutesAgo(68), "OUT", "EMP-1004", "Maria Torres", "5NPE24AF8FH001234", "EWR-5521", "Linden", "Authorized", "", "Linden Scanner"),
      seedTransaction("tx-004", isoMinutesAgo(210), "IN", "EMP-1002", "Marcus Reed", "2T1BURHE5JC034789", "NJK-2214", "Elizabeth Repair Facility", "Authorized", "Historical location still visible", "Division Street Scanner")
    ],
    auditEvents: [
      seedAudit("audit-001", isoMinutesAgo(16), "out_transaction", "Vehicle OUT recorded for EMP-1001 / TRK-8877.", "Division Street Scanner", "Division Street"),
      seedAudit("audit-002", isoMinutesAgo(41), "in_transaction", "Vehicle IN recorded for EMP-1003 / YARD-104.", "EWR Scanner", "EWR"),
      seedAudit("audit-003", isoMinutesAgo(41), "unauthorized_in_review", "Unauthorized IN - operational review.", "EWR Scanner", "EWR"),
      seedAudit("audit-004", isoMinutesAgo(68), "out_transaction", "Vehicle OUT recorded for EMP-1004 / EWR-5521.", "Linden Scanner", "Linden"),
      seedAudit("audit-005", isoMinutesAgo(130), "driver_authorized", "Driver EMP-1001 authorized for Today.", "System seed", "Division Street"),
      seedAudit("audit-006", isoMinutesAgo(240), "location_deactivated", "Elizabeth Repair Facility removed from active scanner choices; historical records remain visible.", "System seed", "Elizabeth Repair Facility")
    ]
  };
}

function seedDriver(employeeNumber, name, licenseOffsetDays, active) {
  const licenseExpires = addDays(startOfLocalDay(new Date()), licenseOffsetDays).toISOString();
  return {
    employeeNumber,
    name,
    licenseExpires,
    active,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    createdBy: "System seed",
    updatedBy: "System seed"
  };
}

function seedTransaction(id, timestamp, direction, driverEmployee, driverName, vin, plate, location, authorizationStatus, note, submittedBy) {
  return { id, timestamp, direction, driverEmployee, driverName, vin, plate, location, authorizationStatus, note, submittedBy };
}

function seedAudit(id, timestamp, type, description, actor, location) {
  return { id, timestamp, type, description, actor, location, source: "seed" };
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
  if (!storageAvailable) return createSeedState();
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.version === "0.5" && Array.isArray(saved.transactions)) return normalizeV05State(saved);
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy && legacy.version === "0.4" && Array.isArray(legacy.transactions)) {
      const migrated = migrateV04State(legacy);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
  } catch (error) {
    console.warn("Could not load or migrate Lot Watch state", error);
  }
  return createSeedState();
}

function normalizeV05State(saved) {
  saved.version = "0.5";
  saved.migrationVersion = 5;
  saved.authorizations = (saved.authorizations || []).map((auth) => ({
    ...auth,
    scopeType: auth.scopeType || "all_current_locations",
    scopeIds: Array.isArray(auth.scopeIds) ? auth.scopeIds : [],
    actionLocation: auth.actionLocation || auth.location || ""
  }));
  return saved;
}

function migrateV04State(legacy) {
  const migrated = normalizeV05State(JSON.parse(JSON.stringify(legacy)));
  migrated.businessTimezone = BUSINESS_TIMEZONE;
  migrated.migratedFrom = "0.4";
  migrated.migratedAt = new Date().toISOString();
  return migrated;
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
    setSaveStatus("Not saved (storage unavailable)");
    el.saveStatus.classList.add("warn");
  }
}

function showView(viewId) {
  if (!VIEWS.includes(viewId)) return;
  expireAuthorizations("system");
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

function activeLocations() {
  return state.locations.filter((location) => location.active);
}

function stationIdentityFor(locationName) {
  return `${locationName || "Unassigned"} Scanner`;
}

function currentStationIdentity() {
  const locationName = el.scannerLocation ? el.scannerLocation.value : state.workingLocation;
  return stationIdentityFor(locationName);
}

function populateLocationControls() {
  const scannerChoices = activeLocations();
  const selectedScannerLocation = scannerChoices.some((location) => location.name === state.workingLocation)
    ? state.workingLocation
    : scannerChoices[0].name;
  const selectedSearchLocation = el.filterLocation.value;
  el.scannerLocation.innerHTML = scannerChoices.map((location) => optionHtml(location.name, location.name === selectedScannerLocation)).join("");
  el.filterLocation.innerHTML = `<option value="">All locations</option>${state.locations.map((location) => optionHtml(location.name, location.name === selectedSearchLocation)).join("")}`;
  state.workingLocation = el.scannerLocation.value || scannerChoices[0].name;
  if (el.stationIdentity) el.stationIdentity.textContent = currentStationIdentity();
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

function animateIn(target) {
  if (!target) return;
  target.classList.remove("enter-anim");
  void target.offsetWidth;
  target.classList.add("enter-anim");
}

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
  input.value = fieldId === "vinInput" ? normalize(value) : value;
  recordScannerInput(fieldId, value, "Demo value");
  if (fieldId === "driverInput") updateDriverStatus();
  if (fieldId === "vinInput") updateVinStatus();
  input.focus();
}

function handleScanInput(fieldId) {
  const input = el[fieldId];
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
    supervisorInput: "Supervisor ID",
    manualEmployeeInput: "Manual Employee #"
  };
  ui.lastRawScan = rawValue || "No scan received";
  ui.lastScanField = labels[fieldId] || fieldId;
  ui.scanTerminator = terminator === "Enter" || terminator === "Tab" ? `${terminator} detected` : terminator;
  renderScannerTestPanel();
}

function openManualEmployeeModal() {
  addAudit("manual_employee_attempted", "Manual employee-number entry attempted.", currentStationIdentity(), el.scannerLocation.value);
  saveState();
  el.manualEmployeeInput.value = el.driverInput.value;
  el.manualEmployeeStatus.textContent = "Manual entries follow the same validation as scans.";
  el.manualEmployeeModal.classList.remove("hidden");
  window.setTimeout(() => el.manualEmployeeInput.focus(), 30);
}

function closeManualEmployeeModal() {
  el.manualEmployeeModal.classList.add("hidden");
  el.driverInput.focus();
}

function submitManualEmployee() {
  const employeeNumber = normalize(el.manualEmployeeInput.value);
  recordScannerInput("manualEmployeeInput", employeeNumber, "Enter");
  if (!employeeNumber) {
    el.manualEmployeeStatus.textContent = "Employee number is required.";
    addAudit("manual_employee_rejected", "Manual employee-number entry rejected: empty value.", currentStationIdentity(), el.scannerLocation.value);
    saveState();
    shake(el.manualEmployeeInput);
    return;
  }
  const driver = findDriver(employeeNumber);
  if (!driver) {
    el.manualEmployeeStatus.textContent = "Employee number was not found in the active demo roster.";
    addAudit("manual_employee_rejected", `Manual employee-number entry rejected for ${employeeNumber}.`, currentStationIdentity(), el.scannerLocation.value);
    saveState();
    shake(el.manualEmployeeInput);
    return;
  }
  el.driverInput.value = employeeNumber;
  addAudit("manual_employee_accepted", `Manual employee-number entry accepted for ${employeeNumber}.`, currentStationIdentity(), el.scannerLocation.value);
  saveState();
  closeManualEmployeeModal();
  updateDriverStatus();
  setNotice("Manual employee number accepted. Continue to VIN.", "success");
  showWizardStep(1);
}

function updateDriverStatus() {
  const driver = findDriver(el.driverInput.value);
  if (!driver) {
    el.driverStatus.textContent = "Employee number not found in the active demo roster.";
  } else {
    const auth = findActiveAuthorization(driver.employeeNumber);
    const license = licenseStatus(driver);
    const authorizationText = auth ? `Authorized through ${formatTimestamp(auth.expiresAt)}` : "Not authorized";
    el.driverStatus.textContent = `${driver.name} - ${authorizationText}. ${license.label}.`;
  }
  renderScanDetails();
}

function updateVinStatus() {
  const value = normalize(el.vinInput.value);
  const vehicle = findVehicle(value);
  if (!value) {
    el.vinStatus.textContent = "Awaiting VIN scan.";
  } else {
    const lengthNote = value.length === 17 ? "17 characters." : `Warning: VIN is ${value.length} characters; 17 expected. Demo submission is still allowed.`;
    el.vinStatus.textContent = vehicle ? `${vehicle.vin} / ${vehicle.plate || "No plate"} found. ${lengthNote}` : `VIN not found in demo vehicles. ${lengthNote}`;
  }
  renderScanDetails();
}

function validateDriverStep() {
  const driver = findDriver(el.driverInput.value);
  if (!driver) {
    setNotice("Scan or enter a valid active Driver Employee #.", "warning");
    shake(el.driverInput);
    el.driverInput.focus();
    return;
  }
  updateDriverStatus();
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
  updateVinStatus();
  showWizardStep(2);
}

function chooseDirection(direction) {
  ui.direction = direction;
  el.reviewStepTitle.textContent = `Review Vehicle ${direction}`;
  el.submitTransactionButton.textContent = `Submit ${direction}`;
  showWizardStep(3);
}

function startTransaction() {
  const draft = readTransactionDraft();
  if (!draft) return;

  const license = licenseStatus(draft.driver);
  const auth = findActiveAuthorization(draft.driver.employeeNumber);
  if (draft.direction === "OUT" && license.tone === "expired") {
    addAudit("authorization_blocked_expired_license", `Vehicle OUT blocked for ${draft.driver.employeeNumber}: driver's license expired.`, currentStationIdentity(), draft.location);
    saveState();
    setNotice("Vehicle OUT blocked. Driver's license is expired.", "danger");
    renderAll();
    return;
  }
  if (draft.direction === "OUT" && !auth) {
    blockOutForSupervisor(draft.driver);
    return;
  }
  completeTransaction(draft);
}

function blockOutForSupervisor(driver) {
  ui.pendingOverride = { driverEmployee: driver.employeeNumber, location: el.scannerLocation.value };
  el.supervisorReason.textContent = `${driver.employeeNumber} / ${driver.name} is not authorized for this gate movement. Vehicle OUT is blocked until a supervisor approves a temporary authorization.`;
  el.supervisorInput.value = "";
  el.supervisorStatus.textContent = "Awaiting a valid supervisor ID.";
  setScannerScreen("override");
  const vehicle = readVehicleInput();
  addAudit("blocked_out", `Blocked Vehicle OUT attempt for ${driver.employeeNumber} / ${vehicle ? vehicle.plate || vehicle.vin : "vehicle pending"}.`, currentStationIdentity(), el.scannerLocation.value);
  saveState();
  renderAll();
  setNotice("Vehicle OUT blocked. Supervisor authorization required.", "warning");
  el.supervisorInput.focus();
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
  const driver = findDriver(ui.pendingOverride.driverEmployee);
  const duration = el.supervisorDuration.value;
  const result = authorizeDriver(driver, duration, `${supervisor.id} / ${supervisor.name}`, ui.pendingOverride.location, "supervisor");
  if (!result.ok) {
    el.supervisorStatus.textContent = result.reason;
    setNotice(result.reason, "danger");
    return;
  }
  addAudit("supervisor_approval", `Supervisor approved ${humanDuration(duration)} temporary authorization for Vehicle OUT across all current locations.`, `${supervisor.id} / ${supervisor.name}`, ui.pendingOverride.location);
  saveState();
  ui.pendingOverride = null;
  renderAll();
  setNotice(`Supervisor approved ${humanDuration(duration)} across all current locations. Vehicle OUT can continue.`, "success");
  chooseDirection("OUT");
}

function cancelSupervisorOverride() {
  showScannerHome();
  setNotice("Blocked OUT transaction cancelled.", "neutral");
}

function readTransactionDraft() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  if (!driver) {
    setNotice("Driver must be scanned or entered before submitting.", "warning");
    return null;
  }
  if (!vehicle) {
    setNotice("Vehicle VIN must be scanned or entered before submitting.", "warning");
    return null;
  }
  if (!el.scannerLocation.value || !ui.direction) return null;
  return { driver, vehicle, location: el.scannerLocation.value, direction: ui.direction, note: el.transactionNote.value.trim() };
}

function completeTransaction(draft) {
  const auth = findActiveAuthorization(draft.driver.employeeNumber);
  const authorizationStatus = auth ? "Authorized" : "Unauthorized";
  const note = draft.direction === "IN" && !auth
    ? [draft.note, "Unauthorized IN - operational review"].filter(Boolean).join(" | ")
    : draft.note;
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
    note,
    submittedBy: currentStationIdentity()
  };
  state.transactions.unshift(transaction);
  addAudit(
    draft.direction === "OUT" ? "out_transaction" : "in_transaction",
    `Vehicle ${draft.direction} recorded for ${draft.driver.employeeNumber} / ${draft.vehicle.plate || draft.vehicle.vin}.`,
    currentStationIdentity(),
    draft.location
  );
  if (draft.direction === "IN" && authorizationStatus === "Unauthorized") {
    addAudit("unauthorized_in_review", "Unauthorized IN - operational review.", currentStationIdentity(), draft.location);
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
    ["Authorization", transaction.authorizationStatus],
    ["Note", transaction.note || "-"]
  ]);
}

function findDriver(value) {
  const needle = normalize(value);
  return state.drivers.find((driver) => driver.employeeNumber === needle && driver.active) || null;
}

function findDriverAny(value) {
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

function createAuthorization(id, employeeNumber, type, actor, location, now = new Date()) {
  return {
    id,
    driverEmployee: employeeNumber,
    type,
    validFrom: now.toISOString(),
    expiresAt: expirationForDuration(type, now).toISOString(),
    status: "active",
    authorizedBy: actor,
    authorizedAt: now.toISOString(),
    revokedBy: "",
    revokedAt: "",
    revocationReason: "",
    actionLocation: location,
    location,
    scopeType: "all_current_locations",
    scopeIds: [],
    createdAt: now.toISOString(),
    updatedAt: now.toISOString()
  };
}

function authorizeDriver(driver, type, actor, location, source) {
  if (!driver) return { ok: false, reason: "Driver was not found." };
  if (!driver.active) return { ok: false, reason: "Driver is inactive." };
  const license = licenseStatus(driver);
  if (license.tone === "expired") {
    addAudit("authorization_blocked_expired_license", `Authorization blocked for ${driver.employeeNumber}: driver's license expired.`, actor, location);
    return { ok: false, reason: "Driver's license expired - authorization blocked." };
  }

  const replaced = state.authorizations.find((auth) => auth.driverEmployee === driver.employeeNumber && auth.status === "active");
  if (replaced) {
    replaced.status = "replaced";
    replaced.updatedAt = new Date().toISOString();
    replaced.revokedBy = actor;
    replaced.revokedAt = new Date().toISOString();
    replaced.revocationReason = "Replaced by newer authorization";
    addAudit("driver_authorization_replaced", `Driver ${driver.employeeNumber} authorization replaced with ${humanDuration(type)} across all current locations.`, actor, location);
  }

  const auth = createAuthorization(makeId("auth"), driver.employeeNumber, type, actor, location);
  state.authorizations.unshift(auth);
  addAudit("driver_authorized", `Driver ${driver.employeeNumber} authorized for ${humanDuration(type)} across all current locations.`, actor, location, source);
  return { ok: true, authorization: auth };
}

function revokeAuthorization(employeeNumber, actor, reason = "Manual revocation") {
  let revoked = false;
  state.authorizations.forEach((auth) => {
    if (auth.driverEmployee === employeeNumber && auth.status === "active") {
      auth.status = "revoked";
      auth.revokedBy = actor;
      auth.revokedAt = new Date().toISOString();
      auth.revocationReason = reason;
      auth.updatedAt = new Date().toISOString();
      revoked = true;
    }
  });
  if (revoked) addAudit("driver_deauthorized", `Driver ${employeeNumber} authorization revoked.`, actor, "");
}

function expireAuthorizations(source) {
  const now = new Date();
  state.authorizations.forEach((auth) => {
    const driver = findDriverAny(auth.driverEmployee);
    if (auth.status !== "active") return;
    const expiredByTime = new Date(auth.expiresAt) < now;
    const expiredByLicense = driver && licenseStatus(driver).tone === "expired";
    if (!expiredByTime && !expiredByLicense) return;
    auth.status = "expired";
    auth.updatedAt = now.toISOString();
    addAudit("driver_authorization_expired", `Driver ${auth.driverEmployee} authorization automatically expired${expiredByLicense ? " because the driver's license expired" : ""}.`, "System", auth.location || "", source || "system");
  });
}

function findActiveAuthorization(employeeNumber) {
  expireAuthorizations("read");
  return state.authorizations.find((auth) => auth.driverEmployee === employeeNumber && auth.status === "active" && new Date(auth.expiresAt) > new Date()) || null;
}

function isAuthorizedToday(employeeNumber) {
  return Boolean(findActiveAuthorization(employeeNumber));
}

function licenseStatus(driver) {
  const now = new Date();
  const expirationBoundary = licenseExpirationBoundary(driver.licenseExpires);
  const days = Math.floor((startOfLocalDay(new Date(driver.licenseExpires)) - startOfLocalDay(now)) / 86400000);
  if (now >= expirationBoundary) return { label: "Expired - authorization blocked", tone: "expired", days };
  if (days <= 5) return { label: "Expires within 5 days", tone: "warning5", days };
  if (days <= 15) return { label: "Expires within 15 days", tone: "warning15", days };
  if (days <= 30) return { label: "Expires within 30 days", tone: "warning30", days };
  return { label: "License current", tone: "current", days };
}

function licenseExpirationBoundary(licenseExpires) {
  // TODO: Confirm with Patrick whether a license should instead become blocked at the start of the printed expiration date.
  const printedDateEnd = addDays(startOfLocalDay(new Date(licenseExpires)), 1);
  return LICENSE_VALID_THROUGH_PRINTED_DATE ? printedDateEnd : startOfLocalDay(new Date(licenseExpires));
}

function expirationForDuration(type, fromDate) {
  const instant = new Date(fromDate);
  if (type === "9_hours") return new Date(instant.getTime() + 9 * 60 * 60 * 1000);
  if (type === "12_hours") return new Date(instant.getTime() + 12 * 60 * 60 * 1000);
  if (type === "48_hours") return new Date(instant.getTime() + 48 * 60 * 60 * 1000);
  const daysToAdd = type === "3_days" ? 3 : 0;
  const expires = addDays(startOfLocalDay(instant), daysToAdd + 1);
  expires.setMilliseconds(expires.getMilliseconds() - 1);
  return expires;
}

function handleDriverTableAction(event) {
  const button = event.target.closest("[data-driver-action]");
  if (!button) return;
  const employeeNumber = button.dataset.driverEmployee;
  const driver = findDriverAny(employeeNumber);
  if (button.dataset.driverAction === "authorize") {
    const result = authorizeDriver(driver, el.authorizationDuration.value, "Admin Console", "", "user action");
    el.bulkActionStatus.textContent = result.ok ? `Authorized ${employeeNumber}.` : result.reason;
  }
  if (button.dataset.driverAction === "deauthorize") {
    revokeAuthorization(employeeNumber, "Admin Console");
    el.bulkActionStatus.textContent = `Revoked authorization for ${employeeNumber}.`;
  }
  saveState();
  renderAll();
}

function deauthorizeAllDrivers() {
  const active = state.authorizations.filter((auth) => auth.status === "active");
  if (!active.length) {
    setNotice("No active driver authorizations found.", "neutral");
    return;
  }
  const ok = typeof confirm === "function" ? confirm(`Revoke ${active.length} active driver authorizations?`) : true;
  if (!ok) return;
  active.forEach((auth) => revokeAuthorization(auth.driverEmployee, "Admin Console", "Bulk revocation"));
  saveState();
  renderAll();
  setNotice("All active driver authorizations revoked.", "warning");
}

function selectVisibleDrivers() {
  document.querySelectorAll("#driversTableBody .row-check:not(:disabled)").forEach((checkbox) => {
    checkbox.checked = true;
  });
  el.bulkActionStatus.textContent = "Visible eligible drivers selected.";
}

function bulkAuthorizeDrivers() {
  const selected = Array.from(document.querySelectorAll("#driversTableBody .row-check:checked"));
  if (!selected.length) {
    el.bulkActionStatus.textContent = "Select at least one eligible driver first.";
    return;
  }
  const ok = typeof confirm === "function" ? confirm(`Authorize ${selected.length} selected drivers for ${humanDuration(el.authorizationDuration.value)}?`) : true;
  if (!ok) return;
  let successful = 0;
  const blocked = [];
  selected.forEach((checkbox) => {
    const driver = findDriverAny(checkbox.value);
    const result = authorizeDriver(driver, el.authorizationDuration.value, "Admin Console", "", "bulk action");
    if (result.ok) successful += 1;
    else blocked.push(`${checkbox.value}: ${result.reason}`);
  });
  saveState();
  renderAll();
  el.bulkActionStatus.textContent = `${successful} successful, ${blocked.length} blocked${blocked.length ? ` (${blocked.join("; ")})` : ""}.`;
}

function addAudit(type, description, actor, location, source = "user action") {
  state.auditEvents.unshift({
    id: makeId("audit"),
    timestamp: new Date().toISOString(),
    type,
    description,
    actor,
    location,
    source
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
  el.contextAuthorizedCount.textContent = state.drivers.filter((driver) => findActiveAuthorization(driver.employeeNumber)).length;
}

function renderScanDetails() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  const location = el.scannerLocation ? el.scannerLocation.value || "No location selected" : state.workingLocation;
  const authorization = driver ? authorizationLabel(driver) : "Awaiting driver";
  el.currentScanTitle.textContent = ui.activeFlow ? (ui.direction ? `Vehicle ${ui.direction}` : "Scan in progress") : "No transaction selected";
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
  const vinValue = normalize(el.vinInput.value);
  const authorization = driver ? authorizationLabel(driver, ui.direction) : "Awaiting driver";
  el.scanSummary.innerHTML = summaryRows([
    ["Movement", `Vehicle ${ui.direction}`],
    ["Location", el.scannerLocation.value],
    ["Driver", driver ? `${driver.employeeNumber} - ${driver.name}` : "Awaiting employee #"],
    ["Vehicle", vehicle ? `${vehicle.vin}${vehicle.plate ? ` / ${vehicle.plate}` : ""}` : "Awaiting VIN"],
    ["VIN validation", vinValue.length === 17 ? "17 characters" : `${vinValue.length} characters - warning, allowed for demo`],
    ["Authorization", authorization]
  ]);
}

function authorizationLabel(driver, direction) {
  const auth = findActiveAuthorization(driver.employeeNumber);
  const license = licenseStatus(driver);
  if (license.tone === "expired") return "Driver's license expired - authorization blocked";
  if (auth) return `Authorized until ${formatTimestamp(auth.expiresAt)}`;
  if (direction === "IN") return "Unauthorized IN - operational review";
  if (direction === "OUT") return "Supervisor approval required";
  return "Not authorized";
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
  expireAuthorizations("render");
  const activeAuths = state.authorizations.filter((auth) => auth.status === "active");
  el.adminAuthorizedCount.textContent = activeAuths.length;
  el.authorizedDriversBody.innerHTML = activeAuths.length ? activeAuths.map((auth) => {
    const driver = findDriverAny(auth.driverEmployee);
    return `<tr><td>${escapeHtml(auth.driverEmployee)}</td><td>${escapeHtml(driver ? driver.name : "Unknown driver")}</td><td>${escapeHtml(humanDuration(auth.type))}</td><td><span class="scope-label">All current locations</span></td><td>${escapeHtml(formatTimestamp(auth.expiresAt))}</td><td><button class="table-action danger-text" type="button" data-driver-action="deauthorize" data-driver-employee="${escapeHtml(auth.driverEmployee)}">Revoke</button></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="empty-cell">No active driver authorizations.</td></tr>`;

  const rosterNeedle = normalize(el.driverRosterSearch.value);
  const roster = state.drivers.filter((driver) => !rosterNeedle || driver.employeeNumber.includes(rosterNeedle) || driver.name.toUpperCase().includes(rosterNeedle));
  el.driversTableBody.innerHTML = roster.map(renderDriverRow).join("") || `<tr><td colspan="9" class="empty-cell">No drivers match this search.</td></tr>`;
  renderLicenseCounts();
  renderLocationList();
}

function renderDriverRow(driver) {
  const auth = findActiveAuthorization(driver.employeeNumber);
  const license = licenseStatus(driver);
  const eligible = driver.active && license.tone !== "expired";
  const statusClass = license.tone === "expired" ? "expired" : license.tone === "current" ? "authorized" : "unauthorized";
  return `<tr>
    <td><input class="row-check" type="checkbox" value="${escapeHtml(driver.employeeNumber)}" aria-label="Select ${escapeHtml(driver.name)}" ${eligible ? "" : "disabled"}></td>
    <td>${escapeHtml(driver.employeeNumber)}</td>
    <td>${escapeHtml(driver.name)}</td>
    <td><span class="status-badge ${driver.active ? "authorized" : "inactive"}">${driver.active ? "Active" : "Inactive"}</span></td>
    <td><span class="status-badge ${statusClass}">${escapeHtml(license.label)}</span><br><span class="muted-small">${escapeHtml(formatDate(driver.licenseExpires))}</span></td>
    <td><span class="status-badge ${auth ? "authorized" : "unauthorized"}">${auth ? "Authorized" : "Not authorized"}</span></td>
    <td>${auth ? '<span class="scope-label">All current locations</span>' : "-"}</td>
    <td>${auth ? escapeHtml(formatTimestamp(auth.expiresAt)) : "-"}</td>
    <td><button class="table-action ${auth ? "danger-text" : "success-text"}" type="button" data-driver-action="${auth ? "deauthorize" : "authorize"}" data-driver-employee="${escapeHtml(driver.employeeNumber)}" ${eligible || auth ? "" : "disabled"}>${auth ? "Revoke" : "Authorize"}</button></td>
  </tr>`;
}

function renderLicenseCounts() {
  const counts = { warning30: 0, warning15: 0, warning5: 0, expired: 0 };
  state.drivers.forEach((driver) => {
    const tone = licenseStatus(driver).tone;
    if (Object.prototype.hasOwnProperty.call(counts, tone)) counts[tone] += 1;
  });
  el.license30Count.textContent = counts.warning30;
  el.license15Count.textContent = counts.warning15;
  el.license5Count.textContent = counts.warning5;
  el.licenseExpiredCount.textContent = counts.expired;
}

function renderLocationList() {
  el.locationList.innerHTML = state.locations.map((location) => `<li>${escapeHtml(location.name)}<span>${location.active ? "Active scanner option" : "Inactive - history only"}</span></li>`).join("");
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
  const results = ui.searchResults || [];
  el.searchResultCount.textContent = results.length;
  el.searchResultsBody.innerHTML = results.length ? results.map((item) => `<tr>
    <td>${formatTimestamp(item.timestamp)}</td><td><span class="movement-chip ${item.direction.toLowerCase()}">${item.direction}</span></td><td>${escapeHtml(item.driverEmployee)}</td><td>${escapeHtml(item.driverName)}</td><td class="mono">${escapeHtml(item.vin)}</td><td>${escapeHtml(item.plate || "-")}</td><td>${escapeHtml(item.location)}</td><td><span class="status-badge ${item.authorizationStatus === "Authorized" ? "authorized" : "unauthorized"}">${escapeHtml(item.authorizationStatus)}</span></td><td>${escapeHtml(item.note || "-")}</td><td>${escapeHtml(item.submittedBy)}</td>
  </tr>`).join("") : `<tr><td colspan="10" class="empty-cell">No transactions match these filters.</td></tr>`;
}

function resetDemo() {
  const fresh = createSeedState();
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  addAudit("demo_reset", "Demo data reset to V0.5 Patrick response seed data.", "System", "");
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
  el.deviceClock.textContent = new Intl.DateTimeFormat([], { timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date());
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function dateKey(value) {
  const date = value instanceof Date ? value : new Date(value);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, "0"), String(date.getDate()).padStart(2, "0")].join("-");
}

function startOfLocalDay(value) {
  const date = value instanceof Date ? new Date(value) : new Date(value);
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value, days) {
  const date = new Date(value);
  date.setDate(date.getDate() + days);
  return date;
}

function formatTimestamp(value) {
  return new Intl.DateTimeFormat([], { timeZone: BUSINESS_TIMEZONE, month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function formatDate(value) {
  return new Intl.DateTimeFormat([], { timeZone: BUSINESS_TIMEZONE, month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function formatTime(value) {
  return new Intl.DateTimeFormat([], { timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function humanDuration(type) {
  return ({ "9_hours": "9 Hours", "12_hours": "12 Hours", today: "Today", "48_hours": "48 Hours", "3_days": "3 Days" })[type] || type;
}

function humanAuditType(type) {
  return ({
    in_transaction: "IN transaction",
    out_transaction: "OUT transaction",
    blocked_out: "Blocked unauthorized OUT",
    supervisor_approval: "Supervisor approval",
    driver_authorized: "Driver authorized",
    driver_authorization_replaced: "Authorization renewed/replaced",
    driver_authorization_expired: "Authorization expired",
    driver_deauthorized: "Driver deauthorized",
    authorization_blocked_expired_license: "Expired license block",
    unauthorized_in_review: "Unauthorized IN review",
    manual_employee_attempted: "Manual employee attempt",
    manual_employee_accepted: "Manual employee accepted",
    manual_employee_rejected: "Manual employee rejected",
    location_deactivated: "Location deactivated",
    demo_reset: "Reset/demo action"
  })[type] || type;
}

function auditTone(type) {
  if (type === "blocked_out" || type === "unauthorized_in_review" || type === "authorization_blocked_expired_license" || type === "manual_employee_rejected") return "warning";
  if (type === "supervisor_approval" || type === "driver_authorized" || type === "manual_employee_accepted") return "approval";
  if (type === "driver_deauthorized" || type === "location_deactivated") return "muted";
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
