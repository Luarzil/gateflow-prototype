"use strict";

/*
  GateFlow production integration notes:
  - Zebra DataWedge: configure a DataWedge profile for this web app and send scan data
    as keyboard wedge input into the focused Driver/VIN/Supervisor fields. For stricter
    routing, include scanner prefixes or field focus rules so the app can classify scans.
  - Android Intents: if GateFlow later runs inside a native shell or Zebra Enterprise
    Browser, receive scan payloads through Intent APIs and call handleScannerPayload().
  - Zebra Enterprise Browser: this static prototype can be hosted as an Enterprise
    Browser app, then upgraded with EB APIs for scanner, RFID, NFC, camera, and device
    controls while preserving the same UI flow.
  - Native Android option: a Kotlin/Java Android version can reuse these transaction
    rules while replacing DOM input handlers with DataWedge/EMDK callbacks.
  - Supabase/Postgres or enterprise-hosted database: replace localStorage persistence
    with row-level-secured tables for drivers, vehicles, locations, transactions, and audit.
  - Offline sync: queue writes locally with durable transaction IDs, then sync to the
    customer database with conflict resolution when Wi-Fi returns.
  - Photo capture: add evidence attachments to IN/OUT transactions through camera capture,
    stored with immutable audit metadata.
  - Role-based permissions: enforce guard, supervisor, manager, and admin capabilities on
    the server. The client-side checks here are only for prototype behavior.
  - Customer-owned data hosting: design deployment so the customer controls where vehicle,
    driver, photo, and audit records are hosted and retained.
*/

const STORAGE_KEY = "gateflow.v0.1.state";
const VIEWS = ["scannerView", "adminView", "searchView", "auditView"];

const state = loadState();
const ui = {
  activeFlow: null,
  outStep: 0,
  inStep: 0,
  outAuthorization: null,
  outPhotoDataUrl: null,
  lastConfirmation: null,
  searchResults: null
};

const samples = {
  outDriver: ["D-2033", "D-1027", "D-9188"],
  outVehicle: ["1FTFW1E88PFA10277", "YARD-204", "BC-TRAIL-77"],
  inDriver: ["D-7701", "D-1027", "D-5502"],
  inVehicle: ["3AKJHHDR9NSNN5188", "YARD-104", "1HTMMAAN8DH232990"],
  supervisorId: ["SUP-1001", "SUP-2040", "SUP-BAD"]
};

const el = {};

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  bindEvents();
  populateLocationControls();
  renderAll();
  updateClock();
  setInterval(updateClock, 30000);

  if ("serviceWorker" in navigator && location.protocol !== "file:") {
    navigator.serviceWorker.register("service-worker.js").catch(() => {
      setSaveStatus("Offline cache unavailable");
    });
  }
});

function cacheElements() {
  [
    "saveStatus", "resetDemoButton", "scannerHeading", "deviceClock", "scannerNotice",
    "scannerHome", "outWizard", "inWizard", "confirmScreen", "goOutFlow", "goInFlow",
    "outCancel", "inCancel", "outDots", "inDots", "outDriver", "outVehicle", "outDestination", "outNote",
    "inDriver", "inVehicle", "inFromLocation", "inNote", "outDriverStatus",
    "outVehicleStatus", "inDriverStatus", "inVehicleStatus", "outDriverNext",
    "outVehicleBack", "outVehicleNext", "outDestinationBack", "outDestinationNext",
    "outNoteBack", "outNoteNext", "outReviewBack", "submitOutButton", "outSummary",
    "outPhotoInput", "outPhotoPreview", "overridePanel", "overrideReason", "supervisorId",
    "supervisorStatus", "cancelOverrideButton", "approveOverrideButton", "inDriverNext",
    "inVehicleBack", "inVehicleNext", "inLocationBack", "inLocationNext", "inReviewBack",
    "submitInButton", "inSummary", "confirmTitle", "confirmSummary", "confirmDone",
    "currentScanTitle", "scanDetailList", "gateMiniFeed",
    "todayOutCount", "todayInCount", "todayBlockCount", "todayChip", "driversTableBody",
    "vehiclesTableBody", "locationList", "authorizedCount", "snapshotTransactions",
    "snapshotOverrides", "snapshotVehiclesOut", "snapshotActiveDrivers", "searchForm",
    "filterVin", "filterPlate", "filterDriver", "filterDate", "filterLocation",
    "filterType", "clearSearchButton", "searchResultsHeading", "searchResultCount",
    "searchResultsBody", "auditTypeFilter", "auditTextFilter", "auditList"
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  on("goOutFlow", "click", startOutFlow);
  on("goInFlow", "click", startInFlow);
  on("outCancel", "click", showScannerHome);
  on("inCancel", "click", showScannerHome);
  on("confirmDone", "click", showScannerHome);

  document.querySelectorAll("[data-scan-target]").forEach((button) => {
    button.addEventListener("click", () => simulateScan(button.dataset.scanTarget));
  });

  document.querySelectorAll("[data-demo-target]").forEach((button) => {
    button.addEventListener("click", () => {
      handleScannerPayload(button.dataset.demoTarget, button.dataset.demoValue);
      advanceFromDemoScan(button.dataset.demoTarget);
    });
  });

  ["outDriver", "outVehicle", "inDriver", "inVehicle"].forEach((id) => {
    el[id].addEventListener("input", () => {
      clearFlowApprovalIfNeeded(id);
      updateScannerStatus();
      updateScanDetails();
    });
  });

  on("outDriverNext", "click", validateOutDriverStep);
  on("outVehicleBack", "click", () => showOutStep(0));
  on("outVehicleNext", "click", validateOutVehicleStep);
  on("outDestinationBack", "click", () => showOutStep(1));
  on("outDestinationNext", "click", validateOutDestinationStep);
  on("outNoteBack", "click", () => showOutStep(2));
  on("outNoteNext", "click", () => {
    renderOutSummary();
    showOutStep(4);
  });
  on("outReviewBack", "click", () => showOutStep(3));
  on("submitOutButton", "click", submitOutTransaction);
  on("cancelOverrideButton", "click", showScannerHome);
  on("approveOverrideButton", "click", approveSupervisorOverride);

  on("inDriverNext", "click", validateInDriverStep);
  on("inVehicleBack", "click", () => showInStep(0));
  on("inVehicleNext", "click", validateInVehicleStep);
  on("inLocationBack", "click", () => showInStep(1));
  on("inLocationNext", "click", validateInLocationStep);
  on("inReviewBack", "click", () => showInStep(2));
  on("submitInButton", "click", submitInTransaction);

  bindEnterToButton("outDriver", "outDriverNext");
  bindEnterToButton("outVehicle", "outVehicleNext");
  bindEnterToButton("supervisorId", "approveOverrideButton");
  bindEnterToButton("inDriver", "inDriverNext");
  bindEnterToButton("inVehicle", "inVehicleNext");

  on("outPhotoInput", "change", previewOutPhoto);

  el.driversTableBody.addEventListener("click", (event) => {
    const button = event.target.closest("[data-driver-action]");
    if (!button) return;
    updateDriverAuthorization(button.dataset.driverId, button.dataset.driverAction);
  });

  el.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    ui.searchResults = filterTransactions();
    renderSearchResults();
  });

  el.clearSearchButton.addEventListener("click", () => {
    el.searchForm.reset();
    el.filterLocation.value = "";
    ui.searchResults = null;
    renderSearchResults();
  });

  el.auditTypeFilter.addEventListener("change", renderAuditLog);
  el.auditTextFilter.addEventListener("input", renderAuditLog);

  el.resetDemoButton.addEventListener("click", () => {
    localStorage.removeItem(STORAGE_KEY);
    const fresh = createSeedState();
    Object.keys(state).forEach((key) => delete state[key]);
    Object.assign(state, fresh);
    saveState();
    ui.outAuthorization = null;
    ui.searchResults = null;
    populateLocationControls();
    renderAll();
    showScannerHome();
    setNotice("Demo data reset.", "success");
  });
}

function on(id, eventName, handler) {
  if (el[id]) {
    el[id].addEventListener(eventName, handler);
  }
}

function bindEnterToButton(inputId, buttonId) {
  if (!el[inputId] || !el[buttonId]) return;
  el[inputId].addEventListener("keydown", (event) => {
    if (event.key !== "Enter") return;
    event.preventDefault();
    el[buttonId].click();
  });
}

function showView(viewId) {
  if (!VIEWS.includes(viewId)) return;
  VIEWS.forEach((id) => {
    document.getElementById(id).classList.toggle("is-active", id === viewId);
  });
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });
}

function showScannerHome() {
  ui.activeFlow = null;
  ui.outAuthorization = null;
  el.scannerHeading.textContent = "Gate Scanner";
  setScannerScreen("home");
  setNotice("Ready. Choose OUT or IN.", "neutral");
  updateScannerStatus();
  updateScanDetails();
}

function startOutFlow() {
  resetOutFlow();
  ui.activeFlow = "out";
  el.scannerHeading.textContent = "Vehicle OUT";
  setNotice("Scan the driver ID.", "neutral");
  showOutStep(0);
}

function startInFlow() {
  resetInFlow();
  ui.activeFlow = "in";
  el.scannerHeading.textContent = "Vehicle IN";
  setNotice("Scan the returning driver ID.", "neutral");
  showInStep(0);
}

function setScannerScreen(name) {
  const screens = {
    home: el.scannerHome,
    out: el.outWizard,
    override: el.overridePanel,
    in: el.inWizard,
    confirm: el.confirmScreen
  };
  Object.values(screens).forEach((screen) => {
    if (screen) screen.classList.add("hidden");
  });
  if (screens[name]) {
    screens[name].classList.remove("hidden");
  }
}

function showOutStep(index) {
  ui.activeFlow = "out";
  ui.outStep = index;
  el.scannerHeading.textContent = "Vehicle OUT";
  setScannerScreen("out");
  document.querySelectorAll(".out-step").forEach((step) => {
    step.classList.toggle("hidden", Number(step.dataset.step) !== index);
  });
  updateProgressDots(el.outDots, index);
  updateScannerStatus();
  updateScanDetails();
}

function showInStep(index) {
  ui.activeFlow = "in";
  ui.inStep = index;
  el.scannerHeading.textContent = "Vehicle IN";
  setScannerScreen("in");
  document.querySelectorAll(".in-step").forEach((step) => {
    step.classList.toggle("hidden", Number(step.dataset.step) !== index);
  });
  updateProgressDots(el.inDots, index);
  updateScannerStatus();
  updateScanDetails();
}

function showOverrideScreen(driver) {
  ui.activeFlow = "out";
  el.scannerHeading.textContent = "Supervisor Authorization";
  el.overrideReason.textContent = `${driver.name} is active but not authorized for ${todayKey()}.`;
  el.supervisorId.value = "";
  el.supervisorStatus.textContent = "Awaiting supervisor scan.";
  el.supervisorStatus.className = "field-status warn";
  setScannerScreen("override");
  setNotice("OUT blocked. Supervisor authorization required.", "warning");
}

function showConfirmation(title, rows) {
  el.scannerHeading.textContent = "Complete";
  el.confirmTitle.textContent = title;
  el.confirmSummary.innerHTML = rows.map(([label, value]) => summaryRow(label, value)).join("");
  setScannerScreen("confirm");
}

function updateProgressDots(container, index) {
  if (!container) return;
  container.querySelectorAll(".dot").forEach((dot, dotIndex) => {
    dot.classList.toggle("active", dotIndex === index);
    dot.classList.toggle("done", dotIndex < index);
  });
}

function resetOutFlow() {
  ["outDriver", "outVehicle", "outDestination", "outNote", "supervisorId"].forEach((id) => {
    if (el[id]) el[id].value = "";
  });
  ui.outAuthorization = null;
  ui.outPhotoDataUrl = null;
  if (el.outPhotoInput) el.outPhotoInput.value = "";
  if (el.outPhotoPreview) {
    el.outPhotoPreview.removeAttribute("src");
    el.outPhotoPreview.classList.add("hidden");
  }
  renderFieldStatus(el.outDriverStatus, "Awaiting driver scan.", "");
  renderFieldStatus(el.outVehicleStatus, "Awaiting vehicle scan.", "");
  if (el.supervisorStatus) renderFieldStatus(el.supervisorStatus, "Awaiting supervisor scan.", "");
  if (el.outSummary) el.outSummary.innerHTML = "";
}

function resetInFlow() {
  ["inDriver", "inVehicle", "inFromLocation", "inNote"].forEach((id) => {
    if (el[id]) el[id].value = "";
  });
  renderFieldStatus(el.inDriverStatus, "Awaiting driver scan.", "");
  renderFieldStatus(el.inVehicleStatus, "Awaiting vehicle scan.", "");
  if (el.inSummary) el.inSummary.innerHTML = "";
}

// Future DataWedge keyboard wedge input lands in focused fields. Intent-based
// integrations can call this same handler with decoded scan payloads.
function handleScannerPayload(targetId, value) {
  const target = el[targetId];
  if (!target) return;
  target.value = value;
  target.dispatchEvent(new Event("input", { bubbles: true }));
  target.focus();
}

function simulateScan(targetId) {
  const list = samples[targetId] || [];
  const target = el[targetId];
  if (!target || list.length === 0) return;
  const currentIndex = Number(target.dataset.sampleIndex || "0");
  const value = list[currentIndex % list.length];
  target.dataset.sampleIndex = String(currentIndex + 1);
  handleScannerPayload(targetId, value);
  setNotice(`Simulated scan: ${value}`, "neutral");
  advanceFromDemoScan(targetId);
}

function advanceFromDemoScan(targetId) {
  const nextButtonByTarget = {
    outDriver: "outDriverNext",
    outVehicle: "outVehicleNext",
    supervisorId: "approveOverrideButton",
    inDriver: "inDriverNext",
    inVehicle: "inVehicleNext"
  };
  const buttonId = nextButtonByTarget[targetId];
  if (buttonId && el[buttonId]) {
    window.setTimeout(() => el[buttonId].click(), 60);
  }
}

function clearFlowApprovalIfNeeded(id) {
  if (id === "outDriver") {
    ui.outAuthorization = null;
  }
}

function validateOutDriverStep() {
  const driver = findDriver(el.outDriver.value);

  if (!driver) {
    ui.outAuthorization = null;
    renderFieldStatus(el.outDriverStatus, "Driver not found. Check the scan and try again.", "bad");
    setNotice("Driver not found.", "danger");
    addAudit("blocked", "Blocked OUT attempt", "Unknown driver ID entered at the gate.", "Gate guard", {
      driverInput: el.outDriver.value
    });
    saveState();
    renderAll();
    return false;
  }

  if (driver.status !== "active") {
    ui.outAuthorization = null;
    renderFieldStatus(el.outDriverStatus, `${driver.name} is ${driver.status}.`, "bad");
    setNotice(`${driver.name} is ${driver.status}. OUT remains blocked.`, "danger");
    addAudit("blocked", "Blocked OUT attempt", `${driver.name} is ${driver.status}.`, "Gate guard", {
      driverId: driver.id
    });
    saveState();
    renderAll();
    return false;
  }

  if (isDriverAuthorizedToday(driver)) {
    ui.outAuthorization = {
      driverId: driver.id,
      source: "daily",
      supervisorId: null
    };
    renderFieldStatus(el.outDriverStatus, `${driver.name} is authorized today.`, "ok");
    setNotice("Driver authorized. Scan the vehicle.", "success");
    showOutStep(1);
    return true;
  }

  ui.outAuthorization = null;
  renderFieldStatus(el.outDriverStatus, `${driver.name} needs supervisor authorization.`, "warn");
  addAudit("blocked", "Blocked OUT attempt", `${driver.name} attempted OUT without daily authorization.`, "Gate guard", {
    driverId: driver.id
  });
  saveState();
  renderAll();
  showOverrideScreen(driver);
  return false;
}

function validateOutVehicleStep() {
  const vehicle = findVehicle(el.outVehicle.value);
  if (!vehicle) {
    renderFieldStatus(el.outVehicleStatus, "Vehicle not found. Scan VIN, plate, or barcode.", "bad");
    setNotice("Vehicle not found.", "danger");
    return false;
  }
  renderFieldStatus(el.outVehicleStatus, `${vehicle.plate} - ${vehicle.type}.`, "ok");
  setNotice("Vehicle found. Choose destination.", "success");
  showOutStep(2);
  return true;
}

function validateOutDestinationStep() {
  if (!el.outDestination.value) {
    setNotice("Choose a destination before continuing.", "warning");
    return false;
  }
  setNotice("Add an optional note or photo.", "neutral");
  showOutStep(3);
  return true;
}

function approveSupervisorOverride() {
  const driver = findDriver(el.outDriver.value);
  const supervisor = findSupervisor(el.supervisorId.value);

  if (!driver) {
    setNotice("Scan a valid driver before supervisor approval.", "danger");
    return;
  }

  if (!supervisor) {
    setNotice("Supervisor ID is not valid.", "danger");
    renderFieldStatus(el.supervisorStatus, "Supervisor ID is not valid.", "bad");
    addAudit("blocked", "Invalid supervisor credential", `Invalid supervisor ID entered for ${driver.name}.`, "Gate guard", {
      driverId: driver.id,
      supervisorInput: el.supervisorId.value
    });
    saveState();
    renderAll();
    return;
  }

  driver.authorizedDate = todayKey();
  ui.outAuthorization = {
    driverId: driver.id,
    source: "supervisor",
    supervisorId: supervisor.id
  };

  addAudit("override", "Supervisor override", `${supervisor.name} authorized ${driver.name} for today.`, supervisor.name, {
    supervisorId: supervisor.id,
    driverId: driver.id
  });
  addAudit("authorization", "Driver authorized", `${driver.name} authorized for ${todayKey()} by supervisor override.`, supervisor.name, {
    supervisorId: supervisor.id,
    driverId: driver.id
  });

  saveState();
  renderAll();
  renderFieldStatus(el.outDriverStatus, `${driver.name} approved by ${supervisor.name}.`, "ok");
  renderFieldStatus(el.supervisorStatus, `Approved by ${supervisor.name}.`, "ok");
  setNotice("Supervisor approved. Scan the vehicle.", "success");
  showOutStep(1);
}

function validateInDriverStep() {
  const driver = findDriver(el.inDriver.value);
  if (!driver) {
    renderFieldStatus(el.inDriverStatus, "Driver not found. Check the scan and try again.", "bad");
    setNotice("Driver not found.", "danger");
    return false;
  }

  if (driver.status !== "active") {
    renderFieldStatus(el.inDriverStatus, `${driver.name} is ${driver.status}.`, "bad");
    setNotice(`${driver.name} is ${driver.status}. IN is blocked.`, "danger");
    addAudit("blocked", "Blocked IN attempt", `${driver.name} is ${driver.status}.`, "Gate guard", {
      driverId: driver.id
    });
    saveState();
    renderAll();
    return false;
  }

  renderFieldStatus(el.inDriverStatus, `${driver.name} is active.`, "ok");
  setNotice("Driver found. Scan the vehicle.", "success");
  showInStep(1);
  return true;
}

function validateInVehicleStep() {
  const vehicle = findVehicle(el.inVehicle.value);
  if (!vehicle) {
    renderFieldStatus(el.inVehicleStatus, "Vehicle not found. Scan VIN, plate, or barcode.", "bad");
    setNotice("Vehicle not found.", "danger");
    return false;
  }
  renderFieldStatus(el.inVehicleStatus, `${vehicle.plate} - ${vehicle.type}.`, "ok");
  setNotice("Vehicle found. Choose from location.", "success");
  showInStep(2);
  return true;
}

function validateInLocationStep() {
  if (!el.inFromLocation.value) {
    setNotice("Choose the from location before continuing.", "warning");
    return false;
  }
  renderInSummary();
  setNotice("Review and submit IN.", "neutral");
  showInStep(3);
  return true;
}

function renderOutSummary() {
  const driver = findDriver(el.outDriver.value);
  const vehicle = findVehicle(el.outVehicle.value);
  const supervisor = ui.outAuthorization && ui.outAuthorization.supervisorId
    ? findSupervisor(ui.outAuthorization.supervisorId)
    : null;
  const rows = [
    ["Driver", driver ? `${driver.name} (${driver.id})` : "Not found"],
    ["Vehicle", vehicle ? `${vehicle.plate} - ${vehicle.type}` : "Not found"],
    ["Destination", el.outDestination.value || "Not selected"],
    ["Authorization", supervisor ? `Supervisor override by ${supervisor.name}` : "Daily authorization"],
    ["Note", el.outNote.value.trim() || "None"],
    ["Photo", ui.outPhotoDataUrl ? "Attached in prototype preview" : "None"]
  ];
  el.outSummary.innerHTML = rows.map(([label, value]) => summaryRow(label, value)).join("");
  updateScanDetails();
}

function renderInSummary() {
  const driver = findDriver(el.inDriver.value);
  const vehicle = findVehicle(el.inVehicle.value);
  const rows = [
    ["Driver", driver ? `${driver.name} (${driver.id})` : "Not found"],
    ["Vehicle", vehicle ? `${vehicle.plate} - ${vehicle.type}` : "Not found"],
    ["From", el.inFromLocation.value || "Not selected"],
    ["Note", el.inNote.value.trim() || "None"]
  ];
  el.inSummary.innerHTML = rows.map(([label, value]) => summaryRow(label, value)).join("");
  updateScanDetails();
}

function previewOutPhoto() {
  const file = el.outPhotoInput.files && el.outPhotoInput.files[0];
  if (!file) {
    ui.outPhotoDataUrl = null;
    el.outPhotoPreview.removeAttribute("src");
    el.outPhotoPreview.classList.add("hidden");
    return;
  }

  const reader = new FileReader();
  reader.addEventListener("load", () => {
    ui.outPhotoDataUrl = String(reader.result || "");
    el.outPhotoPreview.src = ui.outPhotoDataUrl;
    el.outPhotoPreview.classList.remove("hidden");
  });
  reader.readAsDataURL(file);
}

function submitOutTransaction(event) {
  if (event && event.preventDefault) event.preventDefault();

  const driver = findDriver(el.outDriver.value);
  const vehicle = findVehicle(el.outVehicle.value);
  const destination = el.outDestination.value;

  if (!driver || !vehicle || !destination) {
    setNotice("Driver, vehicle, and destination are required.", "danger");
    return;
  }

  if (!isDriverAuthorizedToday(driver)) {
    validateOutDriverStep();
    return;
  }

  const transaction = createTransaction({
    type: "OUT",
    driver,
    vehicle,
    location: destination,
    note: el.outNote.value,
    supervisorId: ui.outAuthorization ? ui.outAuthorization.supervisorId : null,
    photoAttached: Boolean(ui.outPhotoDataUrl)
  });

  vehicle.status = "out";
  vehicle.lastLocation = destination;
  vehicle.lastTransactionId = transaction.id;

  state.transactions.unshift(transaction);
  addAudit("transaction", "Vehicle OUT", `${vehicle.plate} released to ${destination} with ${driver.name}.`, "Gate guard", {
    transactionId: transaction.id,
    driverId: driver.id,
    vehicleVin: vehicle.vin,
    supervisorId: transaction.supervisorId
  });

  const confirmationRows = [
    ["Type", "OUT"],
    ["Vehicle", `${vehicle.plate} - ${vehicle.type}`],
    ["Driver", driver.name],
    ["Destination", destination],
    ["Audit", transaction.id]
  ];

  ui.outAuthorization = null;
  saveState();
  renderAll();
  setNotice(`OUT submitted for ${vehicle.plate}.`, "success");
  showConfirmation("OUT submitted", confirmationRows);
  resetOutFlow();
}

function submitInTransaction(event) {
  if (event && event.preventDefault) event.preventDefault();

  const driver = findDriver(el.inDriver.value);
  const vehicle = findVehicle(el.inVehicle.value);
  const fromLocation = el.inFromLocation.value;

  if (!driver || !vehicle || !fromLocation) {
    setNotice("Driver, vehicle, and from location are required.", "danger");
    return;
  }

  if (driver.status !== "active") {
    setNotice(`${driver.name} is ${driver.status}. IN is blocked pending manager review.`, "danger");
    addAudit("blocked", "Blocked IN attempt", `${driver.name} is ${driver.status}.`, "Gate guard", {
      driverId: driver.id,
      vehicleVin: vehicle.vin
    });
    saveState();
    renderAll();
    return;
  }

  const transaction = createTransaction({
    type: "IN",
    driver,
    vehicle,
    location: fromLocation,
    note: el.inNote.value,
    supervisorId: null
  });

  vehicle.status = "in";
  vehicle.lastLocation = "North Gate 4";
  vehicle.lastTransactionId = transaction.id;

  state.transactions.unshift(transaction);
  addAudit("transaction", "Vehicle IN", `${vehicle.plate} returned from ${fromLocation} with ${driver.name}.`, "Gate guard", {
    transactionId: transaction.id,
    driverId: driver.id,
    vehicleVin: vehicle.vin
  });

  const confirmationRows = [
    ["Type", "IN"],
    ["Vehicle", `${vehicle.plate} - ${vehicle.type}`],
    ["Driver", driver.name],
    ["From", fromLocation],
    ["Audit", transaction.id]
  ];

  saveState();
  renderAll();
  setNotice(`IN submitted for ${vehicle.plate}.`, "success");
  showConfirmation("IN submitted", confirmationRows);
  resetInFlow();
}

function updateDriverAuthorization(driverId, action) {
  const driver = state.drivers.find((item) => item.id === driverId);
  if (!driver) return;

  if (action === "authorize") {
    driver.authorizedDate = todayKey();
    addAudit("authorization", "Driver authorized", `${driver.name} authorized for today by admin dashboard.`, "Manager", {
      driverId: driver.id
    });
  }

  if (action === "deauthorize") {
    driver.authorizedDate = null;
    addAudit("authorization", "Driver deauthorized", `${driver.name} removed from today's authorization list.`, "Manager", {
      driverId: driver.id
    });
  }

  saveState();
  renderAll();
}

function updateScannerStatus() {
  const driver = findDriver(ui.activeFlow === "out" ? el.outDriver.value : el.inDriver.value);
  const vehicle = findVehicle(ui.activeFlow === "out" ? el.outVehicle.value : el.inVehicle.value);
  const driverStatus = ui.activeFlow === "out" ? el.outDriverStatus : el.inDriverStatus;
  const vehicleStatus = ui.activeFlow === "out" ? el.outVehicleStatus : el.inVehicleStatus;

  renderFieldStatus(driverStatus, describeDriver(driver, ui.activeFlow), driver ? statusClassForDriver(driver, ui.activeFlow) : "");
  renderFieldStatus(vehicleStatus, describeVehicle(vehicle), vehicle ? "ok" : "");
}

function updateScanDetails() {
  const driver = findDriver(ui.activeFlow === "out" ? el.outDriver.value : el.inDriver.value);
  const vehicle = findVehicle(ui.activeFlow === "out" ? el.outVehicle.value : el.inVehicle.value);

  if (!driver && !vehicle) {
    el.currentScanTitle.textContent = "No scan selected";
    el.scanDetailList.innerHTML = `<div class="empty-state">Scan or enter a driver and vehicle.</div>`;
    return;
  }

  el.currentScanTitle.textContent = vehicle ? vehicle.plate : driver.name;
  el.scanDetailList.innerHTML = [
    detailRow("Driver", driver ? `${driver.name} (${driver.id})` : "Not found"),
    detailRow("Auth", driver ? authorizationLabel(driver) : "Pending"),
    detailRow("Vehicle", vehicle ? `${vehicle.plate} - ${vehicle.type}` : "Not found"),
    detailRow("VIN", vehicle ? vehicle.vin : "Pending"),
    detailRow("Status", vehicle ? vehicle.status.toUpperCase() : "Pending"),
    detailRow("Location", vehicle ? vehicle.lastLocation : "Pending")
  ].join("");
}

function renderFieldStatus(target, text, className) {
  target.textContent = text;
  target.className = `field-status ${className || ""}`.trim();
}

function describeDriver(driver, flow) {
  if (!driver) return "Driver not found yet.";
  if (driver.status !== "active") return `${driver.name} is ${driver.status}.`;
  if (flow === "out" && !isDriverAuthorizedToday(driver)) return `${driver.name} needs supervisor authorization.`;
  if (flow === "out") return `${driver.name} is authorized today.`;
  return `${driver.name} is active.`;
}

function describeVehicle(vehicle) {
  if (!vehicle) return "Vehicle not found yet.";
  return `${vehicle.plate} - ${vehicle.type}, currently ${vehicle.status.toUpperCase()}.`;
}

function statusClassForDriver(driver, flow) {
  if (driver.status !== "active") return "bad";
  if (flow === "out" && !isDriverAuthorizedToday(driver)) return "warn";
  return "ok";
}

function renderAll() {
  renderScannerMetrics();
  renderAdmin();
  renderSearchResults();
  renderAuditLog();
  updateScannerStatus();
  updateScanDetails();
  el.todayChip.textContent = todayKey();
}

function renderScannerMetrics() {
  const todaysTransactions = state.transactions.filter((item) => item.date === todayKey());
  el.todayOutCount.textContent = todaysTransactions.filter((item) => item.type === "OUT").length;
  el.todayInCount.textContent = todaysTransactions.filter((item) => item.type === "IN").length;
  el.todayBlockCount.textContent = state.audit.filter((item) => item.type === "blocked" && item.date === todayKey()).length;

  const recent = state.transactions.slice(0, 4);
  el.gateMiniFeed.innerHTML = recent.length
    ? recent.map((item) => `
        <div class="mini-feed-item">
          <strong>${escapeHtml(item.type)} ${escapeHtml(item.plate)}</strong>
          <span>${escapeHtml(item.driverName)} - ${escapeHtml(item.location)}</span>
        </div>
      `).join("")
    : `<div class="empty-state">No transactions yet.</div>`;
}

function renderAdmin() {
  const authorizedDrivers = state.drivers.filter(isDriverAuthorizedToday);
  el.authorizedCount.textContent = `${authorizedDrivers.length} authorized`;
  el.snapshotTransactions.textContent = state.transactions.filter((item) => item.date === todayKey()).length;
  el.snapshotOverrides.textContent = state.audit.filter((item) => item.type === "override" && item.date === todayKey()).length;
  el.snapshotVehiclesOut.textContent = state.vehicles.filter((item) => item.status === "out").length;
  el.snapshotActiveDrivers.textContent = state.drivers.filter((item) => item.status === "active").length;

  el.driversTableBody.innerHTML = state.drivers.map((driver) => {
    const authorized = isDriverAuthorizedToday(driver);
    const action = authorized ? "deauthorize" : "authorize";
    const actionLabel = authorized ? "Deauthorize" : "Authorize";
    return `
      <tr>
        <td class="person-cell"><strong>${escapeHtml(driver.name)}</strong><span>${escapeHtml(driver.id)} - ${escapeHtml(driver.credential)}</span></td>
        <td>${escapeHtml(driver.company)}</td>
        <td>${tag(driver.status, driver.status === "active" ? "green" : "red")}</td>
        <td>${tag(authorized ? "authorized" : "not authorized", authorized ? "green" : "amber")}</td>
        <td><button class="button secondary compact" type="button" data-driver-action="${action}" data-driver-id="${escapeHtml(driver.id)}">${actionLabel}</button></td>
      </tr>
    `;
  }).join("");

  el.vehiclesTableBody.innerHTML = state.vehicles.map((vehicle) => `
    <tr>
      <td class="vehicle-cell"><strong>${escapeHtml(vehicle.vin)}</strong><span>${escapeHtml(vehicle.barcode)}</span></td>
      <td>${escapeHtml(vehicle.plate)}</td>
      <td>${escapeHtml(vehicle.type)}</td>
      <td>${tag(vehicle.status, vehicle.status === "in" ? "green" : "blue")}</td>
      <td>${escapeHtml(vehicle.lastLocation)}</td>
    </tr>
  `).join("");

  el.locationList.innerHTML = state.locations.map((location) => {
    const count = state.transactions.filter((transaction) => transaction.location === location.name).length;
    return `
      <div class="location-item">
        <strong>${escapeHtml(location.name)}</strong>
        <span>${count} records</span>
      </div>
    `;
  }).join("");
}

function renderSearchResults() {
  const rows = ui.searchResults || state.transactions.slice(0, 12);
  el.searchResultsHeading.textContent = ui.searchResults ? "Filtered transactions" : "Recent transactions";
  el.searchResultCount.textContent = `${rows.length} ${rows.length === 1 ? "match" : "matches"}`;

  el.searchResultsBody.innerHTML = rows.length
    ? rows.map((item) => `
        <tr>
          <td>${escapeHtml(formatDateTime(item.timestamp))}</td>
          <td>${tag(item.type, item.type === "OUT" ? "blue" : "green")}</td>
          <td class="vehicle-cell"><strong>${escapeHtml(item.vehicleVin)}</strong><span>${escapeHtml(item.barcode)}</span></td>
          <td>${escapeHtml(item.plate)}</td>
          <td>${escapeHtml(item.driverName)}</td>
          <td>${escapeHtml(item.location)}</td>
          <td>${escapeHtml(item.note || "-")}</td>
        </tr>
      `).join("")
    : `<tr><td colspan="7"><div class="empty-state">No matching transactions.</div></td></tr>`;
}

function renderAuditLog() {
  const typeFilter = el.auditTypeFilter.value;
  const textFilter = normalize(el.auditTextFilter.value);
  let items = [...state.audit];

  if (typeFilter) {
    items = items.filter((item) => item.type === typeFilter);
  }

  if (textFilter) {
    items = items.filter((item) => normalize([
      item.title,
      item.detail,
      item.actor,
      item.meta ? JSON.stringify(item.meta) : ""
    ].join(" ")).includes(textFilter));
  }

  el.auditList.innerHTML = items.length
    ? items.map((item) => `
        <article class="audit-card ${escapeHtml(item.type)}">
          <time>${escapeHtml(formatDateTime(item.timestamp))}</time>
          <div>
            <strong>${escapeHtml(item.title)}</strong>
            <span>${escapeHtml(item.detail)}</span>
          </div>
          <small>${escapeHtml(item.actor)}</small>
        </article>
      `).join("")
    : `<div class="empty-state">No audit events match the current filters.</div>`;
}

function filterTransactions() {
  const vin = normalize(el.filterVin.value);
  const plate = normalize(el.filterPlate.value);
  const driver = normalize(el.filterDriver.value);
  const date = el.filterDate.value;
  const location = el.filterLocation.value;
  const type = el.filterType.value;

  return state.transactions.filter((item) => {
    const driverBlob = normalize(`${item.driverId} ${item.driverName} ${item.driverCompany}`);
    const vinBlob = normalize(`${item.vehicleVin} ${item.barcode}`);
    const plateBlob = normalize(item.plate);
    return (!vin || vinBlob.includes(vin))
      && (!plate || plateBlob.includes(plate))
      && (!driver || driverBlob.includes(driver))
      && (!date || item.date === date)
      && (!location || item.location === location)
      && (!type || item.type === type);
  });
}

function populateLocationControls() {
  const locationOptions = state.locations.map((location) => `<option value="${escapeHtml(location.name)}">${escapeHtml(location.name)}</option>`).join("");
  el.outDestination.innerHTML = `<option value="">Select destination</option>${locationOptions}`;
  el.inFromLocation.innerHTML = `<option value="">Select from location</option>${locationOptions}`;
  el.filterLocation.innerHTML = `<option value="">Any</option>${locationOptions}`;
}

function createTransaction({ type, driver, vehicle, location, note, supervisorId, photoAttached }) {
  const timestamp = new Date().toISOString();
  return {
    id: `GF-${Date.now().toString(36).toUpperCase()}`,
    type,
    timestamp,
    date: todayKeyFromTimestamp(timestamp),
    driverId: driver.id,
    driverName: driver.name,
    driverCompany: driver.company,
    vehicleVin: vehicle.vin,
    barcode: vehicle.barcode,
    plate: vehicle.plate,
    location,
    note: note.trim(),
    supervisorId,
    photoAttached: Boolean(photoAttached)
  };
}

function addAudit(type, title, detail, actor, meta) {
  const timestamp = new Date().toISOString();
  state.audit.unshift({
    id: `AUD-${Date.now().toString(36).toUpperCase()}-${Math.floor(Math.random() * 1000)}`,
    type,
    title,
    detail,
    actor,
    timestamp,
    date: todayKeyFromTimestamp(timestamp),
    meta: meta || {}
  });
}

function findDriver(input) {
  const query = normalize(input);
  if (!query) return null;
  return state.drivers.find((driver) => normalize(`${driver.id} ${driver.name}`).includes(query)) || null;
}

function findVehicle(input) {
  const query = normalize(input);
  if (!query) return null;
  return state.vehicles.find((vehicle) => normalize(`${vehicle.vin} ${vehicle.plate} ${vehicle.barcode}`).includes(query)) || null;
}

function findSupervisor(input) {
  const query = normalize(input);
  if (!query) return null;
  return state.supervisors.find((supervisor) => supervisor.active && normalize(`${supervisor.id} ${supervisor.name}`).includes(query)) || null;
}

function isDriverAuthorizedToday(driver) {
  return driver && driver.status === "active" && driver.authorizedDate === todayKey();
}

function authorizationLabel(driver) {
  if (driver.status !== "active") return driver.status;
  return isDriverAuthorizedToday(driver) ? "Authorized today" : "Supervisor required";
}

function tag(text, color) {
  return `<span class="tag ${color}">${escapeHtml(text)}</span>`;
}

function detailRow(label, value) {
  return `<div class="detail-row"><span>${escapeHtml(label)}</span><span>${escapeHtml(value)}</span></div>`;
}

function summaryRow(label, value) {
  return `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`;
}

function setNotice(message, tone) {
  el.scannerNotice.textContent = message;
  el.scannerNotice.className = `scanner-alert ${tone || "neutral"}`;
}

function setSaveStatus(message) {
  el.saveStatus.lastChild.textContent = ` ${message}`;
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setSaveStatus("Saved locally");
}

function loadState() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed && parsed.schemaVersion === 1) return parsed;
    }
  } catch (error) {
    console.warn("Could not load GateFlow state", error);
  }
  return createSeedState();
}

function createSeedState() {
  const today = todayKey();
  const yesterday = relativeDateKey(-1);
  return {
    schemaVersion: 1,
    drivers: [
      { id: "D-1027", name: "Maria Torres", company: "RidgeLine Logistics", credential: "CDL-A", status: "active", authorizedDate: today },
      { id: "D-2033", name: "Jalen Kim", company: "Metro Recovery", credential: "Class B", status: "active", authorizedDate: null },
      { id: "D-7701", name: "Nina Patel", company: "Northstar Freight", credential: "CDL-A", status: "active", authorizedDate: today },
      { id: "D-9188", name: "Owen Miller", company: "Temporary Escort", credential: "Visitor", status: "suspended", authorizedDate: null },
      { id: "D-5502", name: "Carl Adams", company: "Blue Arrow Transport", credential: "CDL-A", status: "active", authorizedDate: null }
    ],
    supervisors: [
      { id: "SUP-1001", name: "Alicia Grant", active: true },
      { id: "SUP-2040", name: "Ben Howard", active: true },
      { id: "SUP-4040", name: "Inactive Supervisor", active: false }
    ],
    vehicles: [
      { vin: "1FTFW1E88PFA10277", barcode: "BC-F150-10277", plate: "YARD-104", type: "Pickup", status: "in", lastLocation: "North Gate 4" },
      { vin: "3AKJHHDR9NSNN5188", barcode: "BC-FREIGHT-5188", plate: "TRK-8877", type: "Tractor", status: "out", lastLocation: "Customer Dock 18" },
      { vin: "1HTMMAAN8DH232990", barcode: "BC-BOX-32990", plate: "YARD-204", type: "Box truck", status: "in", lastLocation: "Maintenance Bay" },
      { vin: "2C4RDGEG1KR672114", barcode: "BC-VAN-2114", plate: "SEC-31", type: "Service van", status: "in", lastLocation: "North Gate 4" },
      { vin: "5N1AT2MT2KC742118", barcode: "BC-TRAIL-77", plate: "TRL-077", type: "Trailer", status: "out", lastLocation: "Rail Gate" }
    ],
    locations: [
      { name: "Customer Dock 18" },
      { name: "Main Plant" },
      { name: "Maintenance Bay" },
      { name: "Overflow Lot" },
      { name: "Rail Gate" },
      { name: "South Yard" }
    ],
    transactions: [
      {
        id: "GF-SEED-1002",
        type: "OUT",
        timestamp: `${today}T13:35:00.000Z`,
        date: today,
        driverId: "D-7701",
        driverName: "Nina Patel",
        driverCompany: "Northstar Freight",
        vehicleVin: "3AKJHHDR9NSNN5188",
        barcode: "BC-FREIGHT-5188",
        plate: "TRK-8877",
        location: "Customer Dock 18",
        note: "Outbound load 42B.",
        supervisorId: null
      },
      {
        id: "GF-SEED-1001",
        type: "IN",
        timestamp: `${yesterday}T21:10:00.000Z`,
        date: yesterday,
        driverId: "D-1027",
        driverName: "Maria Torres",
        driverCompany: "RidgeLine Logistics",
        vehicleVin: "1FTFW1E88PFA10277",
        barcode: "BC-F150-10277",
        plate: "YARD-104",
        location: "Main Plant",
        note: "Returned with signed manifest.",
        supervisorId: null
      }
    ],
    audit: [
      {
        id: "AUD-SEED-2002",
        type: "transaction",
        title: "Vehicle OUT",
        detail: "TRK-8877 released to Customer Dock 18 with Nina Patel.",
        actor: "Gate guard",
        timestamp: `${today}T13:35:10.000Z`,
        date: today,
        meta: { transactionId: "GF-SEED-1002" }
      },
      {
        id: "AUD-SEED-2001",
        type: "authorization",
        title: "Driver authorized",
        detail: "Maria Torres authorized for today's gate activity.",
        actor: "Manager",
        timestamp: `${today}T11:20:00.000Z`,
        date: today,
        meta: { driverId: "D-1027" }
      }
    ]
  };
}

function todayKey() {
  return relativeDateKey(0);
}

function relativeDateKey(offsetDays) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);
  return localDateKey(now);
}

function todayKeyFromTimestamp(timestamp) {
  return localDateKey(new Date(timestamp));
}

function localDateKey(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function formatDateTime(timestamp) {
  return new Intl.DateTimeFormat([], {
    month: "short",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date(timestamp));
}

function updateClock() {
  if (!el.deviceClock) return;
  el.deviceClock.textContent = new Intl.DateTimeFormat([], {
    weekday: "short",
    hour: "numeric",
    minute: "2-digit"
  }).format(new Date());
}

function normalize(value) {
  return String(value || "").trim().toLowerCase();
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
