"use strict";

/*
  Lot Watch / GateFlow V0.2 production integration notes:
  - This prototype uses normal text inputs so typed values and Zebra DataWedge keyboard
    wedge scans use the same flow. No Zebra hardware is required in V0.2.
  - A Zebra DataWedge profile can later target the focused driver, VIN, or supervisor
    field. Android Intents can call setScannerValue() from a native wrapper instead.
  - Zebra Enterprise Browser or a native Android app can retain these transaction rules
    while adding EMDK, RFID, NFC, or device-management APIs.
  - Replace localStorage with a secured customer-owned backend when production access is
    available. Queue small transaction packets for offline sync and resolve on reconnect.
  - AWS Cognito, API Gateway/Lambda or Amplify, DynamoDB or RDS/Postgres, role-based
    permissions, reporting, and approved customer data hosting are future work only.
*/

const STORAGE_KEY = "lot-watch.gateflow.v0.2.state";
const VIEWS = ["scannerView", "adminView", "searchView", "auditView"];
const CURRENT_GUARD = "Gate Guard 01";

const el = {};
const ui = {
  direction: "OUT",
  pendingTransaction: null,
  searchResults: null
};

const state = loadState();

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
    "saveStatus", "resetDemoButton", "deviceClock", "scannerNotice", "scannerLocation",
    "driverInput", "vinInput", "transactionNote", "directionOut", "directionIn",
    "submitTransactionButton", "driverPreview", "vehiclePreview", "authorizationPreview",
    "supervisorPanel", "supervisorReason", "supervisorInput", "supervisorStatus",
    "cancelSupervisorButton", "approveSupervisorButton", "transactionConfirmation",
    "confirmationTitle", "confirmationSummary", "confirmationDoneButton", "recentActivity",
    "todayOutCount", "todayInCount", "todayBlockCount", "authorizedTodayCount",
    "selectedLocationTitle", "adminAuthorizedCount", "authorizedDriversBody", "driversTableBody",
    "deauthorizeAllButton", "locationList", "searchForm", "filterVin", "filterPlate",
    "filterDriver", "filterLocation", "filterDate", "filterType", "clearSearchButton",
    "searchResultCount", "searchResultsBody", "auditTypeFilter", "auditTextFilter", "auditList"
  ].forEach((id) => {
    el[id] = document.getElementById(id);
  });
}

function bindEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  el.scannerLocation.addEventListener("change", () => {
    renderScannerContext();
    refreshScannerPreview();
  });
  el.driverInput.addEventListener("input", refreshScannerPreview);
  el.vinInput.addEventListener("input", refreshScannerPreview);
  el.directionOut.addEventListener("click", () => setDirection("OUT"));
  el.directionIn.addEventListener("click", () => setDirection("IN"));
  el.submitTransactionButton.addEventListener("click", startTransaction);
  el.cancelSupervisorButton.addEventListener("click", cancelSupervisorOverride);
  el.approveSupervisorButton.addEventListener("click", approveSupervisorOverride);
  el.confirmationDoneButton.addEventListener("click", clearTransactionForm);

  document.querySelectorAll("[data-demo-field]").forEach((button) => {
    button.addEventListener("click", () => setScannerValue(button.dataset.demoField, button.dataset.demoValue));
  });
  document.querySelectorAll("[data-scan-target]").forEach((button) => {
    button.addEventListener("click", () => simulateScan(button.dataset.scanTarget));
  });

  ["driverInput", "vinInput", "supervisorInput"].forEach((id) => {
    el[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (id === "supervisorInput") approveSupervisorOverride();
      else if (id === "vinInput") startTransaction();
      else el.vinInput.focus();
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
}

function createSeedState() {
  const now = new Date();
  const today = dateKey(now);
  const isoMinutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();

  return {
    version: "0.2",
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

function loadState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (saved && saved.version === "0.2" && Array.isArray(saved.transactions)) return saved;
  } catch (error) {
    console.warn("Could not load Lot Watch state", error);
  }
  return createSeedState();
}

function saveState() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  setSaveStatus("Saved locally");
}

function showView(viewId) {
  if (!VIEWS.includes(viewId)) return;
  VIEWS.forEach((id) => document.getElementById(id).classList.toggle("is-active", id === viewId));
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.classList.toggle("is-active", button.dataset.view === viewId);
  });
}

function populateLocationControls() {
  const selectedScannerLocation = el.scannerLocation.value || state.locations[0];
  const selectedSearchLocation = el.filterLocation.value;
  el.scannerLocation.innerHTML = state.locations.map((location) => optionHtml(location, location === selectedScannerLocation)).join("");
  el.filterLocation.innerHTML = `<option value="">All locations</option>${state.locations.map((location) => optionHtml(location, location === selectedSearchLocation)).join("")}`;
}

function optionHtml(value, selected) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(value)}</option>`;
}

function setDirection(direction) {
  ui.direction = direction;
  const isOut = direction === "OUT";
  el.directionOut.classList.toggle("is-selected", isOut);
  el.directionIn.classList.toggle("is-selected", !isOut);
  el.directionOut.setAttribute("aria-pressed", String(isOut));
  el.directionIn.setAttribute("aria-pressed", String(!isOut));
  el.submitTransactionButton.textContent = `6. Submit Vehicle ${direction}`;
  refreshScannerPreview();
}

function setScannerValue(fieldId, value) {
  const input = el[fieldId];
  if (!input) return;
  input.value = value;
  if (fieldId === "driverInput" || fieldId === "vinInput") refreshScannerPreview();
  if (fieldId === "driverInput") el.vinInput.focus();
  if (fieldId === "vinInput") input.focus();
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

function refreshScannerPreview() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = findVehicle(el.vinInput.value);
  const authorized = driver ? isAuthorizedToday(driver.employeeNumber) : false;

  el.driverPreview.textContent = driver ? `${driver.employeeNumber} - ${driver.name}` : "Awaiting valid employee #";
  el.vehiclePreview.textContent = vehicle ? `${vehicle.vin} / ${vehicle.plate || "No plate"}` : "Awaiting valid VIN";
  if (!driver) el.authorizationPreview.textContent = "Checked on submit";
  else if (authorized) el.authorizationPreview.textContent = "Authorized today";
  else el.authorizationPreview.textContent = ui.direction === "OUT" ? "OUT requires approval" : "Unauthorized IN will be flagged";

  el.driverPreview.parentElement.classList.toggle("is-ready", Boolean(driver));
  el.vehiclePreview.parentElement.classList.toggle("is-ready", Boolean(vehicle));
  el.authorizationPreview.parentElement.classList.toggle("is-warning", Boolean(driver && !authorized));
  renderScannerContext();
}

function startTransaction() {
  const draft = readTransactionDraft();
  if (!draft) return;

  if (draft.direction === "OUT" && !isAuthorizedToday(draft.driver.employeeNumber)) {
    ui.pendingTransaction = draft;
    el.supervisorReason.textContent = `${draft.driver.employeeNumber} / ${draft.driver.name} is not authorized for today. Vehicle OUT is blocked until a supervisor approves.`;
    el.supervisorPanel.classList.remove("hidden");
    el.transactionConfirmation.classList.add("hidden");
    el.supervisorInput.value = "";
    el.supervisorStatus.textContent = "Awaiting a valid supervisor ID.";
    el.supervisorInput.focus();
    addAudit("blocked_out", `Blocked Vehicle OUT attempt for ${draft.driver.employeeNumber} / ${draft.vehicle.plate || draft.vehicle.vin}.`, CURRENT_GUARD, draft.location);
    saveState();
    renderAll();
    setNotice("Vehicle OUT blocked. Supervisor authorization required.", "warning");
    return;
  }

  completeTransaction(draft);
}

function readTransactionDraft() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = findVehicle(el.vinInput.value);
  const location = el.scannerLocation.value;
  if (!location) {
    setNotice("Select a location before submitting.", "warning");
    return null;
  }
  if (!driver) {
    setNotice("Scan or enter a valid Driver Employee #.", "warning");
    el.driverInput.focus();
    return null;
  }
  if (!vehicle) {
    setNotice("Scan or enter a valid vehicle VIN.", "warning");
    el.vinInput.focus();
    return null;
  }
  return {
    driver,
    vehicle,
    location,
    direction: ui.direction,
    note: el.transactionNote.value.trim()
  };
}

function approveSupervisorOverride() {
  if (!ui.pendingTransaction) return;
  const supervisor = state.supervisors.find((item) => item.id === normalize(el.supervisorInput.value));
  if (!supervisor) {
    el.supervisorStatus.textContent = "Invalid supervisor ID. Approval was not granted.";
    setNotice("Supervisor ID is not valid.", "danger");
    return;
  }

  const draft = ui.pendingTransaction;
  addAuthorization(draft.driver.employeeNumber, supervisor.id, draft.location, true);
  addAudit("supervisor_approval", "Supervisor approved unauthorized driver for today.", `${supervisor.id} / ${supervisor.name}`, draft.location);
  saveState();
  ui.pendingTransaction = null;
  el.supervisorPanel.classList.add("hidden");
  completeTransaction(draft);
}

function cancelSupervisorOverride() {
  ui.pendingTransaction = null;
  el.supervisorPanel.classList.add("hidden");
  el.supervisorInput.value = "";
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
  ui.searchResults = null;
  renderAll();
  showTransactionConfirmation(transaction);
  setNotice(`Vehicle ${draft.direction} saved.`, "success");
}

function showTransactionConfirmation(transaction) {
  el.supervisorPanel.classList.add("hidden");
  el.transactionConfirmation.classList.remove("hidden");
  el.confirmationTitle.textContent = `Vehicle ${transaction.direction} recorded`;
  el.confirmationSummary.textContent = `${transaction.driverEmployee} / ${transaction.driverName} - ${transaction.plate || transaction.vin} at ${transaction.location}. ${transaction.authorizationStatus} today.`;
}

function clearTransactionForm() {
  el.driverInput.value = "";
  el.vinInput.value = "";
  el.transactionNote.value = "";
  el.supervisorInput.value = "";
  ui.pendingTransaction = null;
  el.transactionConfirmation.classList.add("hidden");
  el.supervisorPanel.classList.add("hidden");
  refreshScannerPreview();
  el.driverInput.focus();
  setNotice("Ready for the next vehicle.", "neutral");
}

function findDriver(value) {
  const needle = normalize(value);
  return state.drivers.find((driver) => driver.employeeNumber === needle) || null;
}

function findVehicle(value) {
  const needle = normalize(value);
  return state.vehicles.find((vehicle) => vehicle.vin === needle || vehicle.plate === needle) || null;
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
  renderScannerContext();
  refreshScannerPreview();
  renderRecentActivity();
  renderAdmin();
  if (ui.searchResults === null) ui.searchResults = state.transactions.slice();
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
  el.authorizedTodayCount.textContent = state.drivers.filter((driver) => isAuthorizedToday(driver.employeeNumber)).length;
  el.selectedLocationTitle.textContent = el.scannerLocation.value || "Select a location";
}

function renderRecentActivity() {
  const transactions = state.transactions.slice(0, 5);
  el.recentActivity.innerHTML = transactions.length ? transactions.map((item) => `
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
  ui.searchResults = state.transactions.slice();
  renderSearchResults();
}

function renderSearchResults() {
  const results = ui.searchResults === null ? state.transactions : ui.searchResults;
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
  addAudit("demo_reset", "Demo data reset to V0.2 seed data.", "System", "");
  ui.searchResults = null;
  ui.pendingTransaction = null;
  populateLocationControls();
  clearTransactionForm();
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
