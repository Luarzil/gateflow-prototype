"use strict";

/*
  Lot Watch / GateFlow V0.7 Scanner and device control review prototype notes:
  - This is still a static HTML/CSS/JS prototype. It uses normal focused text inputs
    so typed values and future Zebra DataWedge keyboard-wedge scans exercise the same
    validation flow.
  - A production Zebra TC-series build may use DataWedge profile output, Android
    Intents, Zebra Enterprise Browser, or a native Android/EMDK wrapper to call the
    same driver/vehicle-barcode/supervisor transaction rules.
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

const STORAGE_KEY = "lot-watch.gateflow.v0.7.state";
const V06_STORAGE_KEY = "lot-watch.gateflow.v0.6.state";
const V05_STORAGE_KEY = "lot-watch.gateflow.v0.5.state";
const LEGACY_STORAGE_KEY = "lot-watch.gateflow.v0.4.state";
const TEMP_AUTHORIZATION_DURATION = "9_hours";
const VIEWS = ["scannerView", "supervisorView", "searchView"];
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
  lastSavedAt: null,
  activeSupervisorSection: "driversSection",
  modalTrigger: null,
  barcodeEntryMethod: "scanner",
  confirmationTimer: null,
  profileEmployee: "",
  validatedDriverEmployee: ""
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
    setNotice("This browser blocks local storage. The application still works for this session, but data will not persist after reload.", "warning");
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch(() => setSaveStatus("Offline cache unavailable"));
  }
});

function cacheElements() {
  [
    "saveStatus", "resetDemoButton", "deviceClock", "scannerHeading", "scannerNotice",
    "scannerHome", "scanWizard", "supervisorPanel", "transactionConfirmation", "startScanButton",
    "flowCancel", "wizardDots", "scannerLocation", "driverInput", "driverStatus", "driverNext", "barcodeInput",
    "barcodeStatus", "barcodeBack", "barcodeNext", "transactionNote", "reviewStepTitle", "reviewBack",
    "scanSummary", "submitTransactionButton", "supervisorReason", "supervisorInput",
    "supervisorStatus", "cancelSupervisorButton", "approveSupervisorButton", "confirmationTitle",
    "confirmationSummary", "confirmationDoneButton", "gateMiniFeed", "currentScanTitle",
    "scanDetailList", "todayOutCount", "todayInCount", "todayBlockCount", "contextOutCount",
    "contextInCount", "contextBlockCount", "contextAuthorizedCount",
    "adminAuthorizedCount", "authorizedDriversBody", "driversTableBody", "licenseWarningBody",
    "deauthorizeAllButton", "locationList", "searchForm", "filterVehicle",
    "filterDriver", "filterLocation", "filterDate", "filterType", "clearSearchButton",
    "searchResultCount", "searchResultsBody",
    "directionOut", "directionIn", "movementBack", "onlineStatus", "lastSavedLocal",
    "syncQueueCount", "lastRawScan", "lastScanField", "scanTerminator",
    "openManualEmployeeButton", "manualEmployeeModal", "manualEmployeeInput", "manualEmployeeStatus",
    "submitManualEmployeeButton", "closeManualEmployeeButton", "cancelManualEmployeeButton",
    "driverRosterSearch", "authorizationDuration", "bulkAuthorizeButton",
    "license30Count", "license15Count", "license5Count", "licenseExpiredCount", "bulkActionStatus",
    "stationIdentity", "supervisorDuration", "addDriverButton", "driverModal", "driverForm",
    "driverEditEmployee", "driverEmployeeNumber", "driverName", "driverLicenseExpires", "driverActive",
    "driverEmployeeError", "driverNameError", "driverLicenseError", "closeDriverModalButton", "cancelDriverButton",
    "addVehicleButton", "vehicleSearch", "vehicleStatusFilter", "vehiclesTableBody", "vehicleModal", "vehicleForm",
    "vehicleEditId", "vehicleMake", "vehicleModel", "vehicleYear", "vehicleColor", "vehicleVin", "vehicleBarcode",
    "vehiclePlate", "vehicleActive", "vehicleMakeError", "vehicleModelError", "vehicleYearError", "vehicleColorError",
    "vehicleVinError", "vehicleBarcodeError", "vehicleFormStatus", "closeVehicleModalButton", "cancelVehicleButton",
    "openManualBarcodeButton", "manualBarcodeModal", "manualBarcodeInput", "manualBarcodeStatus", "submitManualBarcodeButton", "closeManualBarcodeButton", "cancelManualBarcodeButton",
    "currentDeviceLabel", "deviceSetupButton", "deviceSetupModal", "closeDeviceSetupButton", "currentDeviceSelect", "floaterLocationFields", "floaterLocationSelect", "deviceSetupStatus", "confirmDeviceLocationButton", "changeFloaterLocationButton",
    "devicesTableBody", "deviceHistoryList", "addDeviceButton", "deviceModal", "deviceForm", "closeDeviceModalButton", "cancelDeviceButton", "deviceEditId", "deviceIdInput", "deviceNameInput", "deviceImeiInput", "deviceTypeInput", "deviceLocationInput", "deviceStatusInput", "devicePhoneInput", "deviceNotesInput", "deviceIdError", "deviceNameError", "deviceImeiError", "deviceLocationError", "deviceActionStatus",
    "driverProfileModal", "closeDriverProfileButton", "driverProfileHeading", "driverProfileBody", "profileEditDriverButton", "profileToggleDriverButton"
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
  el.barcodeBack.addEventListener("click", () => showWizardStep(0));
  el.barcodeNext.addEventListener("click", validateBarcodeStep);
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
  el.barcodeInput.addEventListener("input", () => handleScanInput("barcodeInput"));
  el.supervisorInput.addEventListener("input", () => recordScannerInput("supervisorInput", el.supervisorInput.value, "Input"));

  document.querySelectorAll("[data-demo-field]").forEach((button) => {
    button.addEventListener("click", () => setScannerValue(button.dataset.demoField, button.dataset.demoValue));
  });

  ["driverInput", "barcodeInput", "supervisorInput", "manualEmployeeInput", "manualBarcodeInput"].forEach((id) => {
    el[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== "Tab") return;
      recordScannerInput(id, el[id].value, event.key);
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (id === "supervisorInput") approveSupervisorOverride();
      else if (id === "barcodeInput") validateBarcodeStep();
      else if (id === "manualEmployeeInput") submitManualEmployee();
      else if (id === "manualBarcodeInput") submitManualBarcode();
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
  el.openManualBarcodeButton.addEventListener("click", openManualBarcodeModal);
  el.closeManualBarcodeButton.addEventListener("click", closeManualBarcodeModal);
  el.cancelManualBarcodeButton.addEventListener("click", closeManualBarcodeModal);
  el.submitManualBarcodeButton.addEventListener("click", submitManualBarcode);
  el.manualBarcodeModal.addEventListener("click", (event) => { if (event.target === el.manualBarcodeModal) closeManualBarcodeModal(); });

  el.driversTableBody.addEventListener("click", handleDriverTableAction);
  el.authorizedDriversBody.addEventListener("click", handleDriverTableAction);
  el.deauthorizeAllButton.addEventListener("click", deauthorizeAllDrivers);
  el.driverRosterSearch.addEventListener("input", renderSupervisor);
  el.bulkAuthorizeButton.addEventListener("click", bulkAuthorizeDrivers);

  document.querySelectorAll("[data-supervisor-section]").forEach((button) => button.addEventListener("click", () => showSupervisorSection(button.dataset.supervisorSection)));
  el.addDriverButton.addEventListener("click", () => openDriverModal());
  el.closeDriverModalButton.addEventListener("click", closeDriverModal);
  el.cancelDriverButton.addEventListener("click", closeDriverModal);
  el.driverForm.addEventListener("submit", saveDriverForm);
  el.addVehicleButton.addEventListener("click", () => openVehicleModal());
  el.closeVehicleModalButton.addEventListener("click", closeVehicleModal);
  el.cancelVehicleButton.addEventListener("click", closeVehicleModal);
  el.vehicleForm.addEventListener("submit", saveVehicleForm);
  el.vehicleSearch.addEventListener("input", renderVehicles);
  el.vehicleStatusFilter.addEventListener("change", renderVehicles);
  el.vehiclesTableBody.addEventListener("click", handleVehicleTableAction);
  el.addDeviceButton.addEventListener("click", () => openDeviceModal());
  el.closeDeviceModalButton.addEventListener("click", closeDeviceModal);
  el.cancelDeviceButton.addEventListener("click", closeDeviceModal);
  el.deviceForm.addEventListener("submit", saveDeviceForm);
  el.devicesTableBody.addEventListener("click", handleDeviceTableAction);
  el.deviceSetupButton.addEventListener("click", openDeviceSetup);
  el.closeDeviceSetupButton.addEventListener("click", closeDeviceSetup);
  el.currentDeviceSelect.addEventListener("change", updateDeviceSetupFields);
  el.confirmDeviceLocationButton.addEventListener("click", confirmDeviceLocation);
  el.changeFloaterLocationButton.addEventListener("click", prepareFloaterLocationChange);
  el.closeDriverProfileButton.addEventListener("click", closeDriverProfile);
  el.profileEditDriverButton.addEventListener("click", () => { const driver = findDriverAny(ui.profileEmployee); closeDriverProfile(); if (driver) openDriverModal(driver); });
  el.profileToggleDriverButton.addEventListener("click", () => toggleDriverFromProfile());
  [el.driverModal, el.vehicleModal, el.deviceModal, el.deviceSetupModal, el.driverProfileModal].forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeManagedModal(modal); }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { [el.driverModal, el.vehicleModal, el.deviceModal, el.deviceSetupModal, el.driverProfileModal].forEach(closeManagedModal); } });

  el.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.searchResults = filterTransactions();
    renderSearchResults();
  });
  el.clearSearchButton.addEventListener("click", clearSearch);
  if (el.resetDemoButton) el.resetDemoButton.addEventListener("click", resetDemo);
  window.addEventListener("online", renderConnectivityStatus);
  window.addEventListener("offline", renderConnectivityStatus);
}

function createSeedState() {
  const now = new Date();
  const isoMinutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
  const todayAuth = createAuthorization("auth-001", "EMP-1001", "9_hours", "System seed", "Division Street", now);
  const secondNineHourAuth = createAuthorization("auth-002", "EMP-1002", TEMP_AUTHORIZATION_DURATION, "System seed", "North Ave", now);
  const thirdNineHourAuth = createAuthorization("auth-003", "EMP-1004", TEMP_AUTHORIZATION_DURATION, "System seed", "Linden", now);

  return {
    version: "0.7",
    migrationVersion: 7,
    businessTimezone: BUSINESS_TIMEZONE,
    workingLocation: "Division Street",
    currentDeviceId: "DEV-DIV-01",
    floaterLocationConfirmed: false,
    drivers: [
      seedDriver("EMP-1001", "Nina Patel", 84, true),
      seedDriver("EMP-1002", "Marcus Reed", 30, true),
      seedDriver("EMP-1003", "Tyrone Brooks", 4, true),
      seedDriver("EMP-1004", "Maria Torres", 14, true),
      seedDriver("EMP-1005", "Phil Grant", -3, true),
      seedDriver("EMP-1006", "Angela Cruz", 180, false)
    ],
    vehicles: [
      seedVehicle("veh-001", "GFV-0001", "1HGCM82633A004352", "TRK-8877", "Ford", "Transit", 2022, "White"),
      seedVehicle("veh-002", "GFV-0002", "2T1BURHE5JC034789", "NJK-2214", "Toyota", "Camry", 2021, "Silver"),
      seedVehicle("veh-003", "GFV-0003", "3FA6P0H75HR123456", "YARD-104", "Ford", "Fusion", 2019, "Blue"),
      seedVehicle("veh-004", "GFV-0004", "5NPE24AF8FH001234", "EWR-5521", "Hyundai", "Sonata", 2020, "Gray"),
      seedVehicle("veh-005", "GFV-0005", "1FTFW1EF1EFA00001", "LIND-7710", "Ford", "F-150", 2023, "Black")
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
    devices: [
      seedDevice("DEV-DIV-01", "Division Gate Scanner", "000000000000001", "Fixed", "Division Street"),
      seedDevice("DEV-NORTH-01", "North Ave Gate Scanner", "000000000000002", "Fixed", "North Ave"),
      seedDevice("DEV-EWR-01", "EWR Gate Scanner", "000000000000003", "Fixed", "EWR"),
      seedDevice("DEV-LINDEN-01", "Linden Gate Scanner", "000000000000004", "Fixed", "Linden"),
      seedDevice("DEV-FLOAT-01", "Floater Gate Scanner", "000000000000005", "Floater", "")
    ],
    authorizations: [todayAuth, secondNineHourAuth, thirdNineHourAuth].filter(Boolean),
    transactions: [
      seedTransaction("tx-001", isoMinutesAgo(16), "OUT", "EMP-1001", "Nina Patel", "veh-001", "GFV-0001", "1HGCM82633A004352", "TRK-8877", "Division Street", "Authorized", "Customer delivery", "Division Street Scanner"),
      seedTransaction("tx-002", isoMinutesAgo(41), "IN", "EMP-1003", "Tyrone Brooks", "veh-003", "GFV-0003", "3FA6P0H75HR123456", "YARD-104", "EWR", "Unauthorized", "Unauthorized IN - operational review", "EWR Scanner"),
      seedTransaction("tx-003", isoMinutesAgo(68), "OUT", "EMP-1004", "Maria Torres", "veh-004", "GFV-0004", "5NPE24AF8FH001234", "EWR-5521", "Linden", "Authorized", "", "Linden Scanner"),
      seedTransaction("tx-004", isoMinutesAgo(210), "IN", "EMP-1002", "Marcus Reed", "veh-002", "GFV-0002", "2T1BURHE5JC034789", "NJK-2214", "Elizabeth Repair Facility", "Authorized", "Historical location still visible", "Division Street Scanner")
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

function seedVehicle(id, barcode, vin, plate, make, model, year, color) {
  const now = new Date().toISOString();
  return { id, assignedBarcode: barcode, vin, plate, make, model, year, color, active: true, createdAt: now, updatedAt: now, createdBy: "System seed", updatedBy: "System seed", removedAt: "", removedBy: "", reactivatedAt: "" };
}

function seedDevice(id, name, imei, type, assignedLocation) {
  const now = new Date().toISOString();
  return { id, name, imei, type, assignedLocation, status: "Active", phone: "", notes: "", active: true, createdAt: now, updatedAt: now, lastUsedAt: "", lastTransactionLocation: "", createdBy: "System seed", updatedBy: "System seed" };
}

function seedTransaction(id, timestamp, direction, driverEmployee, driverName, vehicleId, vehicleBarcode, vin, plate, location, authorizationStatus, note, submittedBy) {
  return { id, timestamp, direction, driverEmployee, driverName, vehicleId, vehicleBarcode, vin, plate, location, authorizationStatus, note, submittedBy };
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
    if (saved && saved.version === "0.7" && Array.isArray(saved.transactions)) return normalizeV07State(saved);
    const v06 = JSON.parse(localStorage.getItem(V06_STORAGE_KEY));
    if (v06 && v06.version === "0.6" && Array.isArray(v06.transactions)) {
      const migrated = migrateV06State(v06);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const v05 = JSON.parse(localStorage.getItem(V05_STORAGE_KEY));
    if (v05 && v05.version === "0.5" && Array.isArray(v05.transactions)) {
      const migrated = migrateV06State(migrateV05State(v05));
      localStorage.setItem(STORAGE_KEY, JSON.stringify(migrated));
      return migrated;
    }
    const legacy = JSON.parse(localStorage.getItem(LEGACY_STORAGE_KEY));
    if (legacy && legacy.version === "0.4" && Array.isArray(legacy.transactions)) {
      const migrated = migrateV06State(migrateV05State(migrateV04State(legacy)));
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

function normalizeV06State(saved) {
  saved.version = "0.6";
  saved.migrationVersion = 6;
  saved.businessTimezone = BUSINESS_TIMEZONE;
  saved.vehicles = (saved.vehicles || []).map((vehicle, index) => normalizeVehicle(vehicle, index));
  saved.transactions = (saved.transactions || []).map((transaction) => mapTransactionVehicle(transaction, saved.vehicles));
  return saved;
}

function normalizeV07State(saved) {
  const normalized = JSON.parse(JSON.stringify(saved));
  normalized.version = "0.7";
  normalized.migrationVersion = 7;
  normalized.businessTimezone = BUSINESS_TIMEZONE;
  normalized.locations = (normalized.locations || []).map((location) => location.name === "Elizabeth Repair Facility" ? { ...location, active: false, historicalOnly: true } : location);
  normalized.vehicles = (normalized.vehicles || []).map((vehicle, index) => normalizeVehicle(vehicle, index));
  normalized.transactions = (normalized.transactions || []).map((transaction) => mapTransactionVehicle(transaction, normalized.vehicles));
  normalized.authorizations = (normalized.authorizations || []).map((authorization) => {
    if (authorization.status !== "active") return authorization;
    const authorizedAt = new Date(authorization.authorizedAt || authorization.validFrom || Date.now());
    return { ...authorization, type: TEMP_AUTHORIZATION_DURATION, expiresAt: expirationForDuration(TEMP_AUTHORIZATION_DURATION, authorizedAt).toISOString() };
  });
  normalized.devices = (normalized.devices || createSeedState().devices).map(normalizeDevice);
  normalized.currentDeviceId = normalized.currentDeviceId || "DEV-DIV-01";
  normalized.floaterLocationConfirmed = Boolean(normalized.floaterLocationConfirmed);
  return normalized;
}

function migrateV06State(v06) {
  const migrated = normalizeV07State(JSON.parse(JSON.stringify(v06)));
  migrated.migratedFrom = v06.version || "0.6";
  migrated.migratedAt = new Date().toISOString();
  return migrated;
}

function normalizeDevice(device) {
  const now = new Date().toISOString();
  const type = device.type === "Floater" ? "Floater" : "Fixed";
  return { id: normalize(device.id), name: String(device.name || device.id || "Unnamed device").trim(), imei: normalizeImei(device.imei), type, assignedLocation: type === "Fixed" ? String(device.assignedLocation || "").trim() : "", status: device.status || (device.active === false ? "Inactive" : "Active"), phone: device.phone || "", notes: device.notes || "", active: device.active !== false && device.status !== "Inactive", createdAt: device.createdAt || now, updatedAt: device.updatedAt || now, lastUsedAt: device.lastUsedAt || "", lastTransactionLocation: device.lastTransactionLocation || "", createdBy: device.createdBy || "V0.7 migration", updatedBy: device.updatedBy || "V0.7 migration" };
}

function migrateV05State(v05) {
  const migrated = JSON.parse(JSON.stringify(v05));
  migrated.version = "0.6";
  migrated.migrationVersion = 6;
  migrated.businessTimezone = migrated.businessTimezone || BUSINESS_TIMEZONE;
  migrated.authorizations = (migrated.authorizations || []).map((auth) => ({
    ...auth,
    scopeType: auth.scopeType || "all_current_locations",
    scopeIds: Array.isArray(auth.scopeIds) ? auth.scopeIds : [],
    actionLocation: auth.actionLocation || auth.location || ""
  }));
  migrated.vehicles = (migrated.vehicles || []).map((vehicle, index) => normalizeVehicle(vehicle, index));
  migrated.transactions = (migrated.transactions || []).map((transaction) => mapTransactionVehicle(transaction, migrated.vehicles));
  migrated.migratedFrom = v05.version || "0.5";
  migrated.migratedAt = new Date().toISOString();
  return migrated;
}

function normalizeVehicle(vehicle, index) {
  const demo = [
    ["Ford", "Transit", 2022, "White"], ["Toyota", "Camry", 2021, "Silver"], ["Ford", "Fusion", 2019, "Blue"], ["Hyundai", "Sonata", 2020, "Gray"], ["Ford", "F-150", 2023, "Black"]
  ][index % 5];
  const now = new Date().toISOString();
  return {
    id: vehicle.id || `veh-${String(index + 1).padStart(3, "0")}`,
    assignedBarcode: normalize(vehicle.assignedBarcode || `GFV-${String(index + 1).padStart(4, "0")}`),
    vin: normalize(vehicle.vin), plate: normalize(vehicle.plate), make: vehicle.make || demo[0], model: vehicle.model || demo[1], year: Number(vehicle.year || demo[2]), color: vehicle.color || demo[3], active: vehicle.active !== false,
    createdAt: vehicle.createdAt || now, updatedAt: vehicle.updatedAt || now, createdBy: vehicle.createdBy || "V0.5 migration", updatedBy: vehicle.updatedBy || "V0.5 migration", removedAt: vehicle.removedAt || "", removedBy: vehicle.removedBy || "", reactivatedAt: vehicle.reactivatedAt || ""
  };
}

function mapTransactionVehicle(transaction, vehicles) {
  const vehicle = vehicles.find((item) => item.id === transaction.vehicleId || item.vin === normalize(transaction.vin) || (transaction.plate && item.plate === normalize(transaction.plate)));
  return { ...transaction, vehicleId: transaction.vehicleId || (vehicle ? vehicle.id : ""), vehicleBarcode: transaction.vehicleBarcode || (vehicle ? vehicle.assignedBarcode : "") };
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

function currentDevice() {
  return (state.devices || []).find((device) => device.id === state.currentDeviceId) || null;
}

function isDeviceReady() {
  const device = currentDevice();
  if (!device || !device.active || device.status !== "Active") return { ok: false, reason: "Current device is not ready. Select a device with Active status in Device setup." };
  const activeLocationNames = activeLocations().map((location) => location.name);
  if (device.type === "Fixed" && (!device.assignedLocation || !activeLocationNames.includes(device.assignedLocation))) return { ok: false, reason: "Fixed device does not have an active assigned location." };
  if (device.type === "Fixed" && (state.workingLocation !== device.assignedLocation || (el.scannerLocation && el.scannerLocation.value !== device.assignedLocation))) return { ok: false, reason: "Fixed device location no longer matches the working location. Reconfirm Device setup." };
  if (device.type === "Floater" && (!state.floaterLocationConfirmed || !activeLocationNames.includes(state.workingLocation))) return { ok: false, reason: "Floater device requires a confirmed active working location before scanning." };
  if (el.scannerLocation && el.scannerLocation.value !== state.workingLocation) return { ok: false, reason: "Device and scanner locations do not match. Reconfirm Device setup." };
  return { ok: true, device };
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
  const device = currentDevice();
  if (device && device.type === "Fixed" && device.assignedLocation) state.workingLocation = device.assignedLocation;
  const selectedScannerLocation = scannerChoices.some((location) => location.name === state.workingLocation)
    ? state.workingLocation
    : scannerChoices[0].name;
  const selectedSearchLocation = el.filterLocation.value;
  el.scannerLocation.innerHTML = scannerChoices.map((location) => optionHtml(location.name, location.name === selectedScannerLocation)).join("");
  el.scannerLocation.disabled = Boolean(device);
  el.filterLocation.innerHTML = `<option value="">All locations</option>${state.locations.map((location) => optionHtml(location.name, location.name === selectedSearchLocation, location.historicalOnly ? `${location.name} (history only)` : location.name)).join("")}`;
  state.workingLocation = el.scannerLocation.value || scannerChoices[0].name;
  if (el.stationIdentity) el.stationIdentity.textContent = currentStationIdentity();
  if (el.currentDeviceLabel) el.currentDeviceLabel.textContent = device ? `${device.id} - ${device.type}` : "No device";
}

function optionHtml(value, selected, label = value) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function startFlow() {
  const deviceCheck = isDeviceReady();
  if (!deviceCheck.ok) { setNotice(deviceCheck.reason, "warning"); openDeviceSetup(); return; }
  resetFlow();
  ui.direction = null;
  ui.activeFlow = "scan";
  el.scannerHeading.textContent = "Vehicle Scan";
  setNotice("Scan the driver employee #, then the assigned vehicle barcode.", "neutral");
  showWizardStep(0);
}

function showScannerHome() {
  if (ui.confirmationTimer) { window.clearTimeout(ui.confirmationTimer); ui.confirmationTimer = null; }
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
  if (step === 1) el.barcodeInput.focus();
  if (step === 2) el.directionOut.focus();
  if (step === 3) el.submitTransactionButton.focus();
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
  el.barcodeInput.value = "";
  el.transactionNote.value = "";
  el.supervisorInput.value = "";
  el.driverStatus.textContent = "Awaiting employee number scan.";
  el.barcodeStatus.textContent = "Awaiting vehicle barcode scan.";
  el.supervisorStatus.textContent = "Awaiting a valid supervisor ID.";
  ui.barcodeEntryMethod = "scanner";
  ui.validatedDriverEmployee = "";
  renderScanDetails();
}

function clearDriverDerivedStateIfChanged(rawValue) {
  const employeeNumber = normalizeEmployee(rawValue);
  if (!ui.validatedDriverEmployee || employeeNumber === ui.validatedDriverEmployee) return;
  ui.validatedDriverEmployee = "";
  ui.pendingOverride = null;
  ui.direction = null;
  ui.barcodeEntryMethod = "scanner";
  el.barcodeInput.value = "";
  el.transactionNote.value = "";
  el.supervisorInput.value = "";
  el.barcodeStatus.textContent = "Awaiting vehicle barcode scan.";
  el.supervisorStatus.textContent = "Awaiting a valid supervisor ID.";
  setNotice("Driver changed. Previous vehicle, authorization review, and pending approval were cleared.", "warning");
  if (ui.activeFlow === "scan" && ui.step !== 0) showWizardStep(0);
}

function setScannerValue(fieldId, value) {
  const input = el[fieldId];
  if (!input) return;
  input.value = fieldId === "barcodeInput" ? normalize(value) : value;
  recordScannerInput(fieldId, value, "Demo value");
  if (fieldId === "driverInput") { clearDriverDerivedStateIfChanged(value); updateDriverStatus(); }
  if (fieldId === "barcodeInput") updateBarcodeStatus();
  input.focus();
}

function handleScanInput(fieldId) {
  const input = el[fieldId];
  const rawValue = input.value;
  recordScannerInput(fieldId, rawValue, "Input");
  if (fieldId === "barcodeInput") { input.value = normalize(rawValue); ui.barcodeEntryMethod = "scanner"; }
  if (fieldId === "driverInput") { clearDriverDerivedStateIfChanged(rawValue); updateDriverStatus(); }
  if (fieldId === "barcodeInput") updateBarcodeStatus();
}

function recordScannerInput(fieldId, rawValue, terminator) {
  const labels = {
    driverInput: "Driver Employee #",
    barcodeInput: "Vehicle Barcode",
    manualBarcodeInput: "Manual Vehicle Barcode",
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
  const employeeNumber = normalizeEmployee(el.manualEmployeeInput.value);
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
    el.manualEmployeeStatus.textContent = "Employee number was not found in the active driver roster.";
    addAudit("manual_employee_rejected", `Manual employee-number entry rejected for ${employeeNumber}.`, currentStationIdentity(), el.scannerLocation.value);
    saveState();
    shake(el.manualEmployeeInput);
    return;
  }
  el.driverInput.value = employeeNumber;
  clearDriverDerivedStateIfChanged(employeeNumber);
  ui.validatedDriverEmployee = employeeNumber;
  addAudit("manual_employee_accepted", `Manual employee-number entry accepted for ${employeeNumber}.`, currentStationIdentity(), el.scannerLocation.value);
  saveState();
  closeManualEmployeeModal();
  updateDriverStatus();
  setNotice("Manual employee number accepted. Continue to vehicle barcode.", "success");
  showWizardStep(1);
}

function openManualBarcodeModal() {
  ui.modalTrigger = document.activeElement;
  el.manualBarcodeInput.value = el.barcodeInput.value;
  el.manualBarcodeStatus.textContent = "Manual barcode entries use the same exact-match checks as scans.";
  el.manualBarcodeModal.classList.remove("hidden");
  window.setTimeout(() => el.manualBarcodeInput.focus(), 20);
}

function closeManualBarcodeModal() { closeManagedModal(el.manualBarcodeModal); }

function submitManualBarcode() {
  const barcode = normalize(el.manualBarcodeInput.value);
  recordScannerInput("manualBarcodeInput", barcode, "Enter");
  if (!barcode) { el.manualBarcodeStatus.textContent = "Vehicle barcode is required."; shake(el.manualBarcodeInput); return; }
  const vehicle = findVehicleByBarcode(barcode);
  if (!vehicle) { el.manualBarcodeStatus.textContent = "Vehicle barcode was not found. Enter the exact assigned barcode."; shake(el.manualBarcodeInput); return; }
  if (!vehicle.active) { el.manualBarcodeStatus.textContent = "Vehicle is inactive and cannot be used for a new movement."; shake(el.manualBarcodeInput); return; }
  el.barcodeInput.value = barcode;
  ui.barcodeEntryMethod = "manual";
  addAudit("manual_barcode_accepted", `Manual vehicle barcode entry accepted for ${barcode}.`, currentStationIdentity(), state.workingLocation);
  saveState();
  closeManualBarcodeModal();
  updateBarcodeStatus();
  setNotice("Manual barcode accepted. Choose the vehicle movement.", "success");
  showWizardStep(2);
}

function updateDriverStatus() {
  const driver = findDriver(el.driverInput.value);
  if (!driver) {
    el.driverStatus.textContent = "Employee number not found in the active driver roster.";
  } else {
    const auth = findActiveAuthorization(driver.employeeNumber);
    const license = licenseStatus(driver);
    const authorizationText = auth ? `Authorized through ${formatTimestamp(auth.expiresAt)}` : "Not authorized";
    el.driverStatus.textContent = `${driver.name} - ${authorizationText}. ${license.label}.`;
  }
  renderScanDetails();
}

function updateBarcodeStatus() {
  const value = normalize(el.barcodeInput.value);
  const vehicle = findVehicleByBarcode(value);
  if (!value) {
    el.barcodeStatus.textContent = "Awaiting vehicle barcode scan.";
  } else if (!vehicle) {
    el.barcodeStatus.textContent = "Vehicle barcode was not found. Scan an assigned inventory barcode.";
  } else if (!vehicle.active) {
    el.barcodeStatus.textContent = "Vehicle is inactive and cannot be used for a new movement.";
  } else {
    const vinWarning = vehicle.vin.length === 17 ? "VIN is 17 characters." : `VIN warning: ${vehicle.vin.length} characters.`;
    el.barcodeStatus.textContent = `${vehicle.assignedBarcode}: ${vehicle.year} ${vehicle.make} ${vehicle.model}, ${vehicle.color}. VIN ${vehicle.vin}; ${vehicle.plate || "No plate"}. ${vinWarning}`;
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
  if (ui.validatedDriverEmployee && ui.validatedDriverEmployee !== driver.employeeNumber) clearDriverDerivedStateIfChanged(driver.employeeNumber);
  ui.validatedDriverEmployee = driver.employeeNumber;
  updateDriverStatus();
  showWizardStep(1);
}

function validateBarcodeStep() {
  const barcode = normalize(el.barcodeInput.value);
  el.barcodeInput.value = barcode;
  if (!barcode) {
    setNotice("Scan or enter an assigned vehicle barcode.", "warning");
    shake(el.barcodeInput);
    el.barcodeInput.focus();
    return;
  }
  const vehicle = findVehicleByBarcode(barcode);
  if (!vehicle) {
    setNotice("Vehicle barcode was not found. New movements require an assigned inventory barcode.", "danger");
    shake(el.barcodeInput);
    return;
  }
  if (!vehicle.active) {
    setNotice("Vehicle is inactive and cannot be used for a new movement.", "danger");
    shake(el.barcodeInput);
    return;
  }
  updateBarcodeStatus();
  showWizardStep(2);
}

function chooseDirection(direction) {
  ui.direction = direction;
  el.reviewStepTitle.textContent = `Review Vehicle ${direction}`;
  el.submitTransactionButton.textContent = `Submit ${direction}`;
  showWizardStep(3);
}

function startTransaction() {
  const deviceCheck = isDeviceReady();
  if (!deviceCheck.ok) {
    addAudit("transaction_blocked_device_not_ready", deviceCheck.reason, currentStationIdentity(), el.scannerLocation.value);
    saveState();
    setNotice(`Movement blocked. ${deviceCheck.reason}`, "danger");
    return;
  }
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
  addAudit("blocked_out", `Blocked Vehicle OUT attempt for ${driver.employeeNumber} / ${vehicle ? vehicle.assignedBarcode : "vehicle pending"}.`, currentStationIdentity(), el.scannerLocation.value);
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
  const duration = TEMP_AUTHORIZATION_DURATION;
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
  if (!vehicle || !vehicle.active) {
    setNotice("An active vehicle barcode must be scanned before submitting.", "warning");
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
  const device = currentDevice();
  const transaction = {
    id: makeId("tx"),
    timestamp: new Date().toISOString(),
    direction: draft.direction,
    driverEmployee: draft.driver.employeeNumber,
    driverName: draft.driver.name,
    vehicleId: draft.vehicle.id,
    vehicleBarcode: draft.vehicle.assignedBarcode,
    vin: draft.vehicle.vin,
    plate: draft.vehicle.plate || "",
    location: draft.location,
    authorizationStatus,
    note,
    submittedBy: currentStationIdentity(),
    deviceId: device ? device.id : "",
    deviceName: device ? device.name : "",
    deviceType: device ? device.type : "",
    deviceImei: device ? device.imei : "",
    deviceAssignedLocation: device ? device.assignedLocation : "",
    workingLocation: draft.location,
    locationConfirmed: device ? (device.type === "Fixed" || state.floaterLocationConfirmed) : false,
    barcodeEntryMethod: ui.barcodeEntryMethod
  };
  if (device) { device.lastUsedAt = transaction.timestamp; device.lastTransactionLocation = draft.location; device.updatedAt = transaction.timestamp; }
  state.transactions.unshift(transaction);
  addAudit(
    draft.direction === "OUT" ? "out_transaction" : "in_transaction",
    `Vehicle ${draft.direction} recorded for ${draft.driver.employeeNumber} / ${draft.vehicle.assignedBarcode}.`,
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
    ["Vehicle", `${transaction.vehicleBarcode || "No barcode"} - ${transaction.vin}${transaction.plate ? ` / ${transaction.plate}` : ""}`],
    ["Authorization", transaction.authorizationStatus],
    ["Barcode entry", transaction.barcodeEntryMethod || "scanner"],
    ["Note", transaction.note || "-"]
  ]);
  if (ui.confirmationTimer) window.clearTimeout(ui.confirmationTimer);
  ui.confirmationTimer = window.setTimeout(showScannerHome, 4500);
}

function findDriver(value) {
  const needle = normalizeEmployee(value);
  return state.drivers.find((driver) => normalizeEmployee(driver.employeeNumber) === needle && driver.active) || null;
}

function findDriverAny(value) {
  const needle = normalizeEmployee(value);
  return state.drivers.find((driver) => normalizeEmployee(driver.employeeNumber) === needle) || null;
}

function findVehicle(value) {
  const needle = normalize(value);
  return state.vehicles.find((vehicle) => vehicle.vin === needle || vehicle.plate === needle || vehicle.assignedBarcode === needle) || null;
}

function findVehicleByBarcode(value) {
  const needle = normalize(value);
  return state.vehicles.find((vehicle) => vehicle.assignedBarcode === needle) || null;
}

function readVehicleInput() {
  const barcode = normalize(el.barcodeInput.value);
  if (!barcode) return null;
  return findVehicleByBarcode(barcode);
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
  if (!driver) return;
  if (button.dataset.driverAction === "authorize") {
    const result = authorizeDriver(driver, TEMP_AUTHORIZATION_DURATION, "Supervisor Console", "", "user action");
    el.bulkActionStatus.textContent = result.ok ? `Authorized ${employeeNumber}.` : result.reason;
  }
  if (button.dataset.driverAction === "deauthorize") {
    revokeAuthorization(employeeNumber, "Supervisor Console");
    el.bulkActionStatus.textContent = `Revoked authorization for ${employeeNumber}.`;
  }
  if (button.dataset.driverAction === "edit") openDriverModal(driver);
  if (button.dataset.driverAction === "profile") openDriverProfile(driver);
  if (button.dataset.driverAction === "toggle") {
    driver.active = !driver.active;
    driver.updatedAt = new Date().toISOString();
    driver.updatedBy = "Supervisor Console";
    if (!driver.active) revokeAuthorization(employeeNumber, "Supervisor Console", "Driver deactivated");
    addAudit(driver.active ? "driver_reactivated" : "driver_deactivated", `Driver ${employeeNumber} ${driver.active ? "reactivated" : "deactivated"}.`, "Supervisor Console", "");
    el.bulkActionStatus.textContent = `${employeeNumber} marked ${driver.active ? "active" : "inactive"}.`;
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
  active.forEach((auth) => revokeAuthorization(auth.driverEmployee, "Supervisor Console", "Bulk revocation"));
  saveState();
  renderAll();
  setNotice("All active driver authorizations revoked.", "warning");
}

function bulkAuthorizeDrivers() {
  const selected = Array.from(document.querySelectorAll("#driversTableBody .row-check:checked"));
  if (!selected.length) {
    el.bulkActionStatus.textContent = "Select at least one eligible driver first.";
    return;
  }
  const ok = typeof confirm === "function" ? confirm(`Authorize ${selected.length} selected drivers for ${humanDuration(TEMP_AUTHORIZATION_DURATION)}?`) : true;
  if (!ok) return;
  let successful = 0;
  const blocked = [];
  selected.forEach((checkbox) => {
    const driver = findDriverAny(checkbox.value);
    const result = authorizeDriver(driver, TEMP_AUTHORIZATION_DURATION, "Supervisor Console", "", "bulk action");
    if (result.ok) successful += 1;
    else blocked.push(`${checkbox.value}: ${result.reason}`);
  });
  saveState();
  renderAll();
  el.bulkActionStatus.textContent = `${successful} successful, ${blocked.length} blocked${blocked.length ? ` (${blocked.join("; ")})` : ""}.`;
}

function showSupervisorSection(sectionId) {
  ui.activeSupervisorSection = sectionId;
  document.querySelectorAll(".supervisor-section").forEach((section) => {
    const active = section.id === sectionId;
    section.hidden = !active;
    section.classList.toggle("is-active", active);
  });
  document.querySelectorAll("[data-supervisor-section]").forEach((button) => {
    const active = button.dataset.supervisorSection === sectionId;
    button.classList.toggle("is-active", active);
    button.setAttribute("aria-selected", String(active));
  });
  if (sectionId === "vehiclesSection") renderVehicles();
  if (sectionId === "devicesSection") renderDevices();
}

function clearDriverErrors() {
  [el.driverEmployeeError, el.driverNameError, el.driverLicenseError].forEach((node) => { node.textContent = ""; });
}

function openDriverModal(driver = null) {
  ui.modalTrigger = document.activeElement;
  clearDriverErrors();
  el.driverForm.reset();
  el.driverEditEmployee.value = driver ? driver.employeeNumber : "";
  el.driverEmployeeNumber.value = driver ? driver.employeeNumber : "";
  el.driverEmployeeNumber.disabled = Boolean(driver);
  el.driverName.value = driver ? driver.name : "";
  el.driverLicenseExpires.value = driver ? dateKey(new Date(driver.licenseExpires)) : "";
  el.driverActive.value = driver && !driver.active ? "false" : "true";
  document.getElementById("driverModalHeading").textContent = driver ? "Edit Driver" : "Add Driver";
  el.driverModal.classList.remove("hidden");
  window.setTimeout(() => (driver ? el.driverName : el.driverEmployeeNumber).focus(), 20);
}

function closeDriverModal() { closeManagedModal(el.driverModal); }

function closeManagedModal(modal) {
  if (!modal || modal.classList.contains("hidden")) return;
  modal.classList.add("hidden");
  const trigger = ui.modalTrigger;
  ui.modalTrigger = null;
  if (trigger && typeof trigger.focus === "function") trigger.focus();
}

function saveDriverForm(event) {
  event.preventDefault();
  clearDriverErrors();
  const originalEmployee = normalize(el.driverEditEmployee.value);
  const enteredEmployeeNumber = normalize(el.driverEmployeeNumber.value);
  const employeeNumber = enteredEmployeeNumber ? `EMP-${normalizeEmployee(enteredEmployeeNumber)}` : "";
  const name = el.driverName.value.trim();
  const licenseExpires = el.driverLicenseExpires.value;
  let invalid = false;
  if (!employeeNumber) { el.driverEmployeeError.textContent = "Employee Number is required."; invalid = true; }
  if (!originalEmployee && state.drivers.some((driver) => normalizeEmployee(driver.employeeNumber) === normalizeEmployee(employeeNumber))) { el.driverEmployeeError.textContent = "Employee Number must be unique."; invalid = true; }
  if (!name) { el.driverNameError.textContent = "Driver Name is required."; invalid = true; }
  if (!licenseExpires || Number.isNaN(new Date(`${licenseExpires}T12:00:00`).getTime())) { el.driverLicenseError.textContent = "A valid license expiration date is required."; invalid = true; }
  if (invalid) return;
  const now = new Date().toISOString();
  const existing = originalEmployee ? findDriverAny(originalEmployee) : null;
  if (existing) {
    existing.name = name; existing.licenseExpires = new Date(`${licenseExpires}T12:00:00`).toISOString(); existing.active = el.driverActive.value === "true"; existing.updatedAt = now; existing.updatedBy = "Supervisor Console";
    if (!existing.active) revokeAuthorization(existing.employeeNumber, "Supervisor Console", "Driver marked inactive during edit");
    addAudit("driver_edited", `Driver ${existing.employeeNumber} edited.`, "Supervisor Console", "");
  } else {
    state.drivers.push({ employeeNumber, name, licenseExpires: new Date(`${licenseExpires}T12:00:00`).toISOString(), active: el.driverActive.value === "true", createdAt: now, updatedAt: now, createdBy: "Supervisor Console", updatedBy: "Supervisor Console" });
    addAudit("driver_created", `Driver ${employeeNumber} created.`, "Supervisor Console", "");
  }
  saveState(); closeDriverModal(); renderAll();
}

function clearVehicleErrors() {
  [el.vehicleMakeError, el.vehicleModelError, el.vehicleYearError, el.vehicleColorError, el.vehicleVinError, el.vehicleBarcodeError, el.vehicleFormStatus].forEach((node) => { node.textContent = ""; });
}

function openVehicleModal(vehicle = null) {
  ui.modalTrigger = document.activeElement;
  clearVehicleErrors(); el.vehicleForm.reset();
  el.vehicleEditId.value = vehicle ? vehicle.id : "";
  [[el.vehicleMake, "make"], [el.vehicleModel, "model"], [el.vehicleYear, "year"], [el.vehicleColor, "color"], [el.vehicleVin, "vin"], [el.vehicleBarcode, "assignedBarcode"], [el.vehiclePlate, "plate"]].forEach(([input, key]) => { input.value = vehicle ? vehicle[key] || "" : ""; });
  el.vehicleActive.value = vehicle && !vehicle.active ? "false" : "true";
  document.getElementById("vehicleModalHeading").textContent = vehicle ? "Edit Vehicle" : "Add Vehicle";
  el.vehicleModal.classList.remove("hidden");
  window.setTimeout(() => el.vehicleMake.focus(), 20);
}

function closeVehicleModal() { closeManagedModal(el.vehicleModal); }

function saveVehicleForm(event) {
  event.preventDefault(); clearVehicleErrors();
  const vehicleId = el.vehicleEditId.value;
  const fields = { make: el.vehicleMake.value.trim(), model: el.vehicleModel.value.trim(), year: Number(el.vehicleYear.value.trim()), color: el.vehicleColor.value.trim(), vin: normalize(el.vehicleVin.value), assignedBarcode: normalize(el.vehicleBarcode.value), plate: normalize(el.vehiclePlate.value), active: el.vehicleActive.value === "true" };
  let invalid = false;
  [["make", el.vehicleMakeError, "Make is required."], ["model", el.vehicleModelError, "Model is required."], ["color", el.vehicleColorError, "Color is required."], ["vin", el.vehicleVinError, "VIN is required."], ["assignedBarcode", el.vehicleBarcodeError, "Assigned Barcode is required."]].forEach(([key, node, message]) => { if (!fields[key]) { node.textContent = message; invalid = true; } });
  if (!Number.isInteger(fields.year) || fields.year < 1900 || fields.year > new Date().getFullYear() + 2) { el.vehicleYearError.textContent = "Year must be a reasonable four-digit value."; invalid = true; }
  if (state.vehicles.some((vehicle) => vehicle.id !== vehicleId && vehicle.vin === fields.vin)) { el.vehicleVinError.textContent = "VIN must be unique."; invalid = true; }
  if (state.vehicles.some((vehicle) => vehicle.id !== vehicleId && vehicle.assignedBarcode === fields.assignedBarcode)) { el.vehicleBarcodeError.textContent = "Assigned Barcode must be unique and is never reused."; invalid = true; }
  if (invalid) return;
  const now = new Date().toISOString();
  const existing = state.vehicles.find((vehicle) => vehicle.id === vehicleId);
  if (existing) {
    const barcodeChanged = existing.assignedBarcode !== fields.assignedBarcode;
    Object.assign(existing, fields, { updatedAt: now, updatedBy: "Supervisor Console" });
    addAudit("vehicle_edited", `Vehicle ${existing.id} edited.`, "Supervisor Console", "");
    if (barcodeChanged) addAudit("barcode_changed", `Vehicle ${existing.id} barcode changed to ${fields.assignedBarcode}.`, "Supervisor Console", "");
  } else {
    const vehicle = { id: makeId("veh"), ...fields, createdAt: now, updatedAt: now, createdBy: "Supervisor Console", updatedBy: "Supervisor Console", removedAt: "", removedBy: "", reactivatedAt: "" };
    state.vehicles.push(vehicle);
    addAudit("vehicle_created", `Vehicle ${vehicle.id} created.`, "Supervisor Console", "");
    addAudit("barcode_assigned", `Barcode ${vehicle.assignedBarcode} assigned to ${vehicle.id}.`, "Supervisor Console", "");
  }
  if (fields.vin.length !== 17) el.vehicleFormStatus.textContent = "VIN saved with a non-17-character warning.";
  saveState(); closeVehicleModal(); renderAll();
}

function handleVehicleTableAction(event) {
  const button = event.target.closest("[data-vehicle-action]");
  if (!button) return;
  const vehicle = state.vehicles.find((item) => item.id === button.dataset.vehicleId);
  if (!vehicle) return;
  if (button.dataset.vehicleAction === "edit") { openVehicleModal(vehicle); return; }
  const restoring = button.dataset.vehicleAction === "restore";
  const prompt = restoring ? `Restore ${vehicle.assignedBarcode} to active inventory?` : `Remove ${vehicle.assignedBarcode} from inventory? It will remain searchable but cannot be scanned for new movements.`;
  if (typeof confirm === "function" && !confirm(prompt)) return;
  vehicle.active = restoring;
  vehicle.updatedAt = new Date().toISOString(); vehicle.updatedBy = "Supervisor Console";
  if (restoring) { vehicle.reactivatedAt = vehicle.updatedAt; addAudit("vehicle_restored", `Vehicle ${vehicle.assignedBarcode} restored to inventory.`, "Supervisor Console", ""); }
  else { vehicle.removedAt = vehicle.updatedAt; vehicle.removedBy = "Supervisor Console"; addAudit("vehicle_removed_from_inventory", `Vehicle ${vehicle.assignedBarcode} removed from inventory.`, "Supervisor Console", ""); }
  saveState(); renderAll();
}

function renderVehicles() {
  if (!el.vehiclesTableBody) return;
  const needle = normalize(el.vehicleSearch.value);
  const status = el.vehicleStatusFilter.value;
  const vehicles = state.vehicles.filter((vehicle) => {
    const matchesStatus = status === "all" || (status === "active" && vehicle.active) || (status === "inactive" && !vehicle.active);
    const haystack = [vehicle.assignedBarcode, vehicle.vin, vehicle.plate, vehicle.make, vehicle.model, vehicle.year, vehicle.color].join(" ").toUpperCase();
    return matchesStatus && (!needle || haystack.includes(needle));
  });
  el.vehiclesTableBody.innerHTML = vehicles.length ? vehicles.map((vehicle) => `<tr><td class="mono">${escapeHtml(vehicle.assignedBarcode)}</td><td>${escapeHtml(vehicle.year)}</td><td>${escapeHtml(vehicle.make)}</td><td>${escapeHtml(vehicle.model)}</td><td>${escapeHtml(vehicle.color)}</td><td class="mono">${escapeHtml(vehicle.vin)}</td><td>${escapeHtml(vehicle.plate || "-")}</td><td><span class="status-badge ${vehicle.active ? "authorized" : "inactive"}">${vehicle.active ? "Active" : "Inactive"}</span></td><td class="action-stack"><button class="table-action" type="button" data-vehicle-action="edit" data-vehicle-id="${escapeHtml(vehicle.id)}">Edit</button><button class="table-action ${vehicle.active ? "danger-text" : "success-text"}" type="button" data-vehicle-action="${vehicle.active ? "remove" : "restore"}" data-vehicle-id="${escapeHtml(vehicle.id)}">${vehicle.active ? "Remove from Inventory" : "Restore to Inventory"}</button></td></tr>`).join("") : `<tr><td colspan="9" class="empty-cell">No vehicles match this inventory view.</td></tr>`;
}

function openDriverProfile(driver) {
  ui.modalTrigger = document.activeElement;
  ui.profileEmployee = driver.employeeNumber;
  const auth = findActiveAuthorization(driver.employeeNumber);
  const movements = state.transactions.filter((transaction) => transaction.driverEmployee === driver.employeeNumber).slice(0, 3);
  el.driverProfileHeading.textContent = driver.name;
  el.driverProfileBody.innerHTML = summaryRows([
    ["Employee #", driver.employeeNumber], ["Status", driver.active ? "Active" : "Inactive"], ["License", `${formatDate(driver.licenseExpires)} - ${licenseStatus(driver).label}`], ["Authorization", auth ? `${humanDuration(auth.type)} until ${formatTimestamp(auth.expiresAt)}` : "Not authorized"], ["Created", formatTimestamp(driver.createdAt)], ["Updated", `${formatTimestamp(driver.updatedAt)} by ${driver.updatedBy || "System"}`], ["Recent movements", movements.length ? movements.map((item) => `${item.direction} ${item.vehicleBarcode || item.plate} (${formatTimestamp(item.timestamp)})`).join("; ") : "No recent movements"]
  ]);
  el.profileToggleDriverButton.textContent = driver.active ? "Mark inactive" : "Reactivate";
  el.driverProfileModal.classList.remove("hidden");
  window.setTimeout(() => el.closeDriverProfileButton.focus(), 20);
}

function closeDriverProfile() { closeManagedModal(el.driverProfileModal); }

function toggleDriverFromProfile() {
  const driver = findDriverAny(ui.profileEmployee);
  if (!driver) return;
  driver.active = !driver.active;
  driver.updatedAt = new Date().toISOString(); driver.updatedBy = "Supervisor Console";
  if (!driver.active) revokeAuthorization(driver.employeeNumber, "Supervisor Console", "Driver deactivated");
  addAudit(driver.active ? "driver_reactivated" : "driver_deactivated", `Driver ${driver.employeeNumber} ${driver.active ? "reactivated" : "deactivated"} from profile.`, "Supervisor Console", "");
  saveState(); closeDriverProfile(); renderAll();
}

function deviceLocationOptions(selected = "", includeBlank = true) {
  return `${includeBlank ? `<option value="">${selected ? "Unassigned" : "Select location"}</option>` : ""}${activeLocations().map((location) => optionHtml(location.name, location.name === selected)).join("")}`;
}

function openDeviceSetup() {
  ui.modalTrigger = document.activeElement;
  el.currentDeviceSelect.innerHTML = (state.devices || []).map((device) => optionHtml(device.id, device.id === state.currentDeviceId)).join("");
  updateDeviceSetupFields();
  el.deviceSetupModal.classList.remove("hidden");
  window.setTimeout(() => el.currentDeviceSelect.focus(), 20);
}

function closeDeviceSetup() { closeManagedModal(el.deviceSetupModal); }

function updateDeviceSetupFields() {
  const device = state.devices.find((item) => item.id === el.currentDeviceSelect.value);
  if (!device) return;
  const isFloater = device.type === "Floater";
  el.floaterLocationFields.classList.toggle("hidden", !isFloater);
  const floaterSelectedLocation = state.floaterLocationConfirmed && device.id === state.currentDeviceId ? state.workingLocation : "";
  el.floaterLocationSelect.innerHTML = deviceLocationOptions(floaterSelectedLocation, true);
  el.changeFloaterLocationButton.classList.toggle("hidden", !isFloater || !state.floaterLocationConfirmed || device.id !== state.currentDeviceId);
  el.confirmDeviceLocationButton.textContent = isFloater ? "Confirm Location" : "Use Fixed Device";
  el.deviceSetupStatus.textContent = !device.active || device.status !== "Active" ? `This device has ${device.status} status and cannot be used for scanning.` : isFloater ? (state.floaterLocationConfirmed && device.id === state.currentDeviceId ? `Confirmed at ${state.workingLocation}. Use Change Location to move it.` : "Choose and confirm a working location before scanning.") : `Fixed at ${device.assignedLocation}. Scanner location is locked to this device.`;
}

function prepareFloaterLocationChange() {
  const device = currentDevice();
  if (!device || device.type !== "Floater") return;
  const ok = typeof confirm === "function" ? confirm("Change floater location? Any incomplete scan will be reset.") : true;
  if (!ok) return;
  state.floaterLocationConfirmed = false;
  resetFlow();
  addAudit("floater_location_change_started", `Floater ${device.id} location change started.`, "Supervisor Console", state.workingLocation);
  saveState(); updateDeviceSetupFields();
}

function confirmDeviceLocation() {
  const device = state.devices.find((item) => item.id === el.currentDeviceSelect.value);
  if (!device) return;
  if (!device.active || device.status !== "Active") { el.deviceSetupStatus.textContent = "Only a device with Active status can be selected for scanning."; return; }
  if (device.type === "Fixed") {
    const previous = currentDevice();
    if (!activeLocations().some((location) => location.name === device.assignedLocation)) { el.deviceSetupStatus.textContent = "Fixed device requires an active assigned location."; return; }
    const switchingDevice = !previous || previous.id !== device.id;
    const changingLocation = state.workingLocation !== device.assignedLocation;
    const unfinishedScan = ui.activeFlow === "scan" && Boolean(ui.validatedDriverEmployee || el.driverInput.value || el.barcodeInput.value || ui.direction || ui.pendingOverride);
    if ((switchingDevice || changingLocation) && typeof confirm === "function" && !confirm(`Use fixed device ${device.id} at ${device.assignedLocation}?${unfinishedScan ? " The unfinished scan will be reset." : ""}`)) return;
    state.currentDeviceId = device.id; state.workingLocation = device.assignedLocation; state.floaterLocationConfirmed = false;
    addAudit("fixed_device_selected", `Fixed device ${device.id} selected at ${device.assignedLocation}.`, "Supervisor Console", device.assignedLocation);
  } else {
    const location = el.floaterLocationSelect.value;
    if (!activeLocations().some((item) => item.name === location)) { el.deviceSetupStatus.textContent = "Choose an active location before confirming the floater device."; return; }
    if (typeof confirm === "function" && !confirm(`Confirm floater device at ${location}?`)) return;
    const oldLocation = state.workingLocation;
    state.currentDeviceId = device.id; state.workingLocation = location; state.floaterLocationConfirmed = true;
    addAudit("floater_location_confirmed", `Floater ${device.id} location confirmed from ${oldLocation} to ${location}.`, "Supervisor Console", location);
  }
  resetFlow(); saveState(); populateLocationControls(); renderAll(); closeDeviceSetup(); setNotice(`Device ready: ${currentDevice().id} at ${state.workingLocation}.`, "success");
}

function clearDeviceErrors() { [el.deviceIdError, el.deviceNameError, el.deviceImeiError, el.deviceLocationError].forEach((node) => { node.textContent = ""; }); }

function openDeviceModal(device = null) {
  ui.modalTrigger = document.activeElement; clearDeviceErrors(); el.deviceForm.reset();
  el.deviceEditId.value = device ? device.id : ""; el.deviceIdInput.value = device ? device.id : ""; el.deviceIdInput.disabled = Boolean(device);
  el.deviceNameInput.value = device ? device.name : ""; el.deviceImeiInput.value = device ? device.imei : ""; el.deviceTypeInput.value = device ? device.type : "Fixed";
  el.deviceLocationInput.innerHTML = deviceLocationOptions(device ? device.assignedLocation : ""); el.deviceStatusInput.value = device ? device.status : "Active"; el.devicePhoneInput.value = device ? device.phone : ""; el.deviceNotesInput.value = device ? device.notes : "";
  document.getElementById("deviceModalHeading").textContent = device ? "Edit Device" : "Add Device";
  el.deviceModal.classList.remove("hidden"); window.setTimeout(() => el.deviceIdInput.focus(), 20);
}

function closeDeviceModal() { closeManagedModal(el.deviceModal); }

function saveDeviceForm(event) {
  event.preventDefault(); clearDeviceErrors();
  const existingId = el.deviceEditId.value; const id = normalize(el.deviceIdInput.value); const name = el.deviceNameInput.value.trim(); const imei = normalizeImei(el.deviceImeiInput.value); const type = el.deviceTypeInput.value; const assignedLocation = type === "Fixed" ? el.deviceLocationInput.value : ""; const status = el.deviceStatusInput.value;
  let invalid = false;
  if (!id) { el.deviceIdError.textContent = "Device ID is required."; invalid = true; }
  if (!existingId && state.devices.some((device) => device.id === id)) { el.deviceIdError.textContent = "Device ID must be unique."; invalid = true; }
  if (!name) { el.deviceNameError.textContent = "Friendly device name is required."; invalid = true; }
  if (!imei) { el.deviceImeiError.textContent = "IMEI is required."; invalid = true; }
  if (state.devices.some((device) => device.id !== existingId && device.imei === imei)) { el.deviceImeiError.textContent = "IMEI must be unique."; invalid = true; }
  if (type === "Fixed" && !activeLocations().some((location) => location.name === assignedLocation)) { el.deviceLocationError.textContent = "Fixed device requires one active location."; invalid = true; }
  if (invalid) return;
  const now = new Date().toISOString(); const existing = state.devices.find((device) => device.id === existingId);
  const fields = { id, name, imei, type, assignedLocation, status, active: status !== "Inactive", phone: el.devicePhoneInput.value.trim(), notes: el.deviceNotesInput.value.trim(), updatedAt: now, updatedBy: "Supervisor Console" };
  if (existing) { const oldLocation = existing.assignedLocation; if (existing.type === "Fixed" && type === "Fixed" && oldLocation !== assignedLocation && typeof confirm === "function" && !confirm(`Reassign fixed device ${id} from ${oldLocation} to ${assignedLocation}?`)) return; Object.assign(existing, fields); if (existing.id === state.currentDeviceId && existing.type === "Fixed") { state.workingLocation = existing.assignedLocation; state.floaterLocationConfirmed = false; } addAudit("device_edited", `Device ${id} edited.`, "Supervisor Console", assignedLocation); if (oldLocation !== assignedLocation) addAudit("fixed_device_reassigned", `Device ${id} reassigned from ${oldLocation || "unassigned"} to ${assignedLocation || "floater"}.`, "Supervisor Console", assignedLocation); }
  else { state.devices.push({ ...fields, createdAt: now, lastUsedAt: "", lastTransactionLocation: "", createdBy: "Supervisor Console" }); addAudit("device_created", `Device ${id} created.`, "Supervisor Console", assignedLocation); }
  saveState(); populateLocationControls(); closeDeviceModal(); renderAll();
}

function handleDeviceTableAction(event) {
  const button = event.target.closest("[data-device-action]"); if (!button) return;
  const device = state.devices.find((item) => item.id === button.dataset.deviceId); if (!device) return;
  if (button.dataset.deviceAction === "edit") { openDeviceModal(device); return; }
  if (button.dataset.deviceAction === "history") { el.deviceActionStatus.textContent = `${device.id}: last used ${device.lastUsedAt ? formatTimestamp(device.lastUsedAt) : "never"}; last transaction location ${device.lastTransactionLocation || "-"}.`; return; }
  const activate = button.dataset.deviceAction === "reactivate";
  if (typeof confirm === "function" && !confirm(`${activate ? "Reactivate" : "Mark inactive"} device ${device.id}?`)) return;
  device.active = activate; device.status = activate ? "Active" : "Inactive"; device.updatedAt = new Date().toISOString(); device.updatedBy = "Supervisor Console";
  addAudit(activate ? "device_reactivated" : "device_inactivated", `Device ${device.id} ${activate ? "reactivated" : "marked inactive"}.`, "Supervisor Console", device.assignedLocation);
  saveState(); renderAll();
}

function renderDevices() {
  if (!el.devicesTableBody) return;
  const devices = state.devices || [];
  el.devicesTableBody.innerHTML = devices.map((device) => `<tr><td class="mono">${escapeHtml(device.id)}</td><td>${escapeHtml(device.name)}</td><td class="mono">${escapeHtml(device.imei)}</td><td>${escapeHtml(device.type)}</td><td>${escapeHtml(device.assignedLocation || "Floater")}</td><td><span class="status-badge ${device.active ? "authorized" : "inactive"}">${escapeHtml(device.status)}</span></td><td>${device.lastUsedAt ? escapeHtml(formatTimestamp(device.lastUsedAt)) : "-"}</td><td>${escapeHtml(device.lastTransactionLocation || "-")}</td><td class="action-stack"><button class="table-action" type="button" data-device-action="edit" data-device-id="${escapeHtml(device.id)}">Edit</button><button class="table-action" type="button" data-device-action="history" data-device-id="${escapeHtml(device.id)}">History</button><button class="table-action ${device.active ? "danger-text" : "success-text"}" type="button" data-device-action="${device.active ? "inactive" : "reactivate"}" data-device-id="${escapeHtml(device.id)}">${device.active ? "Mark inactive" : "Reactivate"}</button></td></tr>`).join("") || `<tr><td colspan="9" class="empty-cell">No devices configured.</td></tr>`;
  const deviceEvents = state.auditEvents.filter((event) => event.type.includes("device") || event.type.includes("floater")).slice(0, 5);
  el.deviceHistoryList.innerHTML = deviceEvents.length ? deviceEvents.map((event) => `<article class="audit-event muted"><div class="audit-type">${escapeHtml(event.type.replaceAll("_", " "))}</div><div><h2>${escapeHtml(event.description)}</h2><p>${escapeHtml(event.actor)}</p></div><time>${escapeHtml(formatTimestamp(event.timestamp))}</time></article>`).join("") : `<p class="empty-state">No device changes recorded.</p>`;
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
  renderSupervisor();
  renderVehicles();
  renderDevices();
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
    ["Vehicle", vehicle ? `${vehicle.assignedBarcode} - ${vehicle.year} ${vehicle.make} ${vehicle.model} / ${vehicle.vin}${vehicle.plate ? ` / ${vehicle.plate}` : ""}` : "Awaiting barcode"],
    ["Authorization", authorization]
  ]);
}

function renderScanSummary() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  const authorization = driver ? authorizationLabel(driver, ui.direction) : "Awaiting driver";
  el.scanSummary.innerHTML = summaryRows([
    ["Movement", `Vehicle ${ui.direction}`],
    ["Location", el.scannerLocation.value],
    ["Driver", driver ? `${driver.employeeNumber} - ${driver.name}` : "Awaiting employee #"],
    ["Vehicle", vehicle ? `${vehicle.assignedBarcode} - ${vehicle.year} ${vehicle.make} ${vehicle.model} / ${vehicle.vin}${vehicle.plate ? ` / ${vehicle.plate}` : ""}` : "Awaiting barcode"],
    ["Barcode", vehicle ? vehicle.assignedBarcode : "Awaiting assigned barcode"],
    ["VIN", vehicle ? `${vehicle.vin}${vehicle.vin.length === 17 ? " (17 characters)" : ` (${vehicle.vin.length} characters - warning)`}` : "-"],
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
  if (el.syncQueueCount) el.syncQueueCount.textContent = "Sync queue: 0";
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

function renderSupervisor() {
  expireAuthorizations("render");
  const activeAuths = state.authorizations.filter((auth) => auth.status === "active");
  el.adminAuthorizedCount.textContent = activeAuths.length;
  el.authorizedDriversBody.innerHTML = activeAuths.length ? activeAuths.map((auth) => {
    const driver = findDriverAny(auth.driverEmployee);
    return `<tr><td>${escapeHtml(auth.driverEmployee)}</td><td>${escapeHtml(driver ? driver.name : "Unknown driver")}</td><td>${escapeHtml(humanDuration(auth.type))}</td><td><span class="scope-label">All current locations</span></td><td>${escapeHtml(formatTimestamp(auth.expiresAt))}</td><td><button class="table-action danger-text" type="button" data-driver-action="deauthorize" data-driver-employee="${escapeHtml(auth.driverEmployee)}">Revoke</button></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="empty-cell">No active driver authorizations.</td></tr>`;

  const rosterNeedle = normalize(el.driverRosterSearch.value);
  const roster = state.drivers.filter((driver) => !rosterNeedle || driver.employeeNumber.includes(rosterNeedle) || driver.name.toUpperCase().includes(rosterNeedle));
  el.driversTableBody.innerHTML = roster.map(renderDriverRow).join("") || `<tr><td colspan="10" class="empty-cell">No drivers match this search.</td></tr>`;
  renderLicenseCounts();
  renderLicenseWarnings();
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
    <td><button class="table-action" type="button" data-driver-action="profile" data-driver-employee="${escapeHtml(driver.employeeNumber)}" aria-label="View profile for ${escapeHtml(driver.name)}">${escapeHtml(driver.name)}</button></td>
    <td><span class="status-badge ${driver.active ? "authorized" : "inactive"}">${driver.active ? "Active" : "Inactive"}</span></td>
    <td><span class="status-badge ${statusClass}">${escapeHtml(license.label)}</span></td>
    <td>${escapeHtml(formatDate(driver.licenseExpires))}</td>
    <td><span class="status-badge ${auth ? "authorized" : "unauthorized"}">${auth ? "Authorized" : "Not authorized"}</span></td>
    <td>${auth ? escapeHtml(humanDuration(auth.type)) : "-"}</td>
    <td>${auth ? escapeHtml(formatTimestamp(auth.expiresAt)) : "-"}</td>
    <td class="action-stack"><button class="table-action" type="button" data-driver-action="edit" data-driver-employee="${escapeHtml(driver.employeeNumber)}">Edit</button><button class="table-action" type="button" data-driver-action="toggle" data-driver-employee="${escapeHtml(driver.employeeNumber)}">${driver.active ? "Mark inactive" : "Reactivate"}</button>${auth ? `<button class="table-action danger-text" type="button" data-driver-action="deauthorize" data-driver-employee="${escapeHtml(driver.employeeNumber)}">Revoke</button>` : `<button class="table-action success-text" type="button" data-driver-action="authorize" data-driver-employee="${escapeHtml(driver.employeeNumber)}" ${eligible ? "" : "disabled"}>Authorize</button>`}</td>
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

function renderLicenseWarnings() {
  const warnings = state.drivers
    .map((driver) => ({ driver, license: licenseStatus(driver) }))
    .filter((item) => item.license.tone !== "current")
    .sort((a, b) => new Date(a.driver.licenseExpires) - new Date(b.driver.licenseExpires));
  el.licenseWarningBody.innerHTML = warnings.length ? warnings.map(({ driver, license }) => `<tr><td>${escapeHtml(driver.employeeNumber)}</td><td>${escapeHtml(driver.name)}</td><td>${escapeHtml(formatDate(driver.licenseExpires))}</td><td><span class="status-badge ${license.tone === "expired" ? "expired" : "unauthorized"}">${escapeHtml(license.label)}</span></td><td>${driver.active ? "Active" : "Inactive"}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-cell">No licenses approaching expiration.</td></tr>`;
}

function renderLocationList() {
  el.locationList.innerHTML = state.locations.map((location) => `<li>${escapeHtml(location.name)}<span>${location.active ? "Active scanner option" : "Inactive - history only"}</span></li>`).join("");
}

function filterTransactions() {
  const vehicle = normalize(el.filterVehicle.value);
  const driver = normalize(el.filterDriver.value);
  const location = el.filterLocation.value;
  const date = el.filterDate.value;
  const type = el.filterType.value;

  return state.transactions.filter((item) => {
    const matchesVehicle = !vehicle || (item.vehicleBarcode || "").includes(vehicle) || item.vin.includes(vehicle) || (item.plate || "").includes(vehicle);
    const matchesDriver = !driver || item.driverEmployee.includes(driver) || item.driverName.toUpperCase().includes(driver);
    const matchesLocation = !location || item.location === location;
    const matchesDate = !date || dateKey(new Date(item.timestamp)) === date;
    const matchesType = !type || item.direction === type;
    return matchesVehicle && matchesDriver && matchesLocation && matchesDate && matchesType;
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
    <td>${formatTimestamp(item.timestamp)}</td><td><span class="movement-chip ${item.direction.toLowerCase()}">${item.direction}</span></td><td>${escapeHtml(item.driverEmployee)}</td><td>${escapeHtml(item.driverName)}</td><td class="mono">${escapeHtml(item.vehicleBarcode || "-")}</td><td class="mono">${escapeHtml(item.vin)}</td><td>${escapeHtml(item.plate || "-")}</td><td>${escapeHtml(item.location)}${isHistoricalOnlyLocation(item.location) ? ` <span class="status-badge inactive">History only</span>` : ""}</td><td><span class="status-badge ${item.authorizationStatus === "Authorized" ? "authorized" : "unauthorized"}">${escapeHtml(item.authorizationStatus)}</span></td><td>${escapeHtml(item.note || "-")}</td><td>${escapeHtml(item.submittedBy)}</td>
  </tr>`).join("") : `<tr><td colspan="11" class="empty-cell">No transactions match these filters.</td></tr>`;
}

function isHistoricalOnlyLocation(locationName) {
  const location = state.locations.find((item) => item.name === locationName);
  return Boolean(location && location.historicalOnly);
}

function resetDemo() {
  const ok = typeof confirm === "function" ? confirm("Reset the GateFlow demo data? Current prototype changes will be replaced.") : true;
  if (!ok) return;
  const fresh = createSeedState();
  Object.keys(state).forEach((key) => delete state[key]);
  Object.assign(state, fresh);
  addAudit("demo_reset", "Demo data reset to V0.7 scanner and device control seed data.", "System", "");
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

function normalizeEmployee(value) {
  return normalize(value).replace(/^EMP-/, "");
}

function normalizeImei(value) {
  return String(value || "").replace(/\D/g, "");
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
