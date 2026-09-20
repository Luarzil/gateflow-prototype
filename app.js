"use strict";

/*
  Veri-Gate V0.8 review prototype notes:
  - This is still a static HTML/CSS/JS prototype. Typed and scanned values use the
    same validation path without presenting a hardware-specific input mode.
  - Production needs customer-owned or customer-approved hosted data storage
    (Postgres, Supabase/Postgres, or enterprise-hosted database), server-side role
    enforcement, reversible migrations, audit immutability, and offline sync queues.
  - Scanner users, Supervisors, Managers, and Owner/System Administrators are shown
    here as UI/business-rule placeholders only. No real authentication is included.
  - Individual operator identification and authentication remain future backend work.
  - Photo capture is intentionally not included because the client said photos are
    not needed for this workflow.
*/

// Defined here, before DEMO_MODE, because DEMO_MODE has to be able to ask it.
const IN_TEST_HARNESS = (() => {
  try {
    return window.top !== window && /\/gateflow-validator\//.test(window.top.location.pathname);
  } catch (error) {
    // A frame from another origin: not our validator, and not something to trust either.
    return false;
  }
})();

// The public review site. On this host the app is something people are sent to look at, so it opens
// as a demo unless somebody deliberately asks for the real console with ?live=1. Anywhere else - a
// developer's machine, the Android app, whatever the live account is called one day - the real
// console is the default and the demo has to be asked for.
const REVIEW_HOST = "gateflow-prototype.vercel.app";

// CR-V17 step 5: the review site shows Patrick the app without a login. ?demo=1 opens that mode for
// the tab. Its records are kept apart from the real ones (their own storage), and it never connects
// to the shared records: a demo session in the same browser as a real console must not be able to
// hand the console its made-up changes to upload, the way the validator's test records leaked on
// 2026-09-18.
const DEMO_MODE = (() => {
  // The validator is never a demo, whatever the tab it is opened in was doing beforehand.
  // sessionStorage is shared with every same-origin frame in a tab, so opening the demo and then
  // the validator in that tab put the harness into demo mode: it wrote to the demo's storage while
  // the validator read the real key, and 78 of 113 checks failed with "Target state was not saved".
  // That reads as a broken application and is nothing of the kind, which is worse than a real
  // failure - it hides one.
  if (IN_TEST_HARNESS) return false;
  try {
    const query = new URLSearchParams(window.location.search);
    // An explicit answer, either way, is remembered for the tab.
    if (query.has("demo")) window.sessionStorage.setItem("veri-gate.demo", "1");
    if (query.has("live")) window.sessionStorage.setItem("veri-gate.demo", "0");
    const remembered = window.sessionStorage.getItem("veri-gate.demo");
    if (remembered !== null) return remembered === "1";
    // Nobody said. On the review site that means a reviewer who followed a link, or typed the
    // address, or used an old bookmark - and the one thing they must not meet is a login they
    // cannot pass. Patrick did, on 2026-09-20, because the review site and the real console are
    // the same address and only ?demo=1 told them apart.
    return window.location.hostname === REVIEW_HOST;
  } catch (error) {
    return false;
  }
})();
const STORAGE_KEY = DEMO_MODE ? "lot-watch.gateflow.v0.7.state.demo" : "lot-watch.gateflow.v0.7.state";
const PRE_CALL_MIGRATION_BACKUP_KEY = "lot-watch.gateflow.v0.7.pre-call-migration";
const V06_STORAGE_KEY = "lot-watch.gateflow.v0.6.state";
const V05_STORAGE_KEY = "lot-watch.gateflow.v0.5.state";
const LEGACY_STORAGE_KEY = "lot-watch.gateflow.v0.4.state";
// CR-V14 item 4, Patrick 2026-09-12: "Currently there is no way to authorize personnel for more
// then 9 hours." expirationForDuration always supported these; the interface pinned them to nine
// hours with a hidden input. This must stay declared up here with the other load-time constants:
// normalizeV07State reads it, and loadState() runs while the script is still evaluating.
const TEMP_AUTHORIZATION_DURATION = "9_hours";
const AUTHORIZATION_DURATIONS = ["9_hours", "12_hours", "today", "48_hours", "3_days"];
// CR-V15: a gate barcode is G plus four digits. Declared up here because
// canonicalVehicleBarcode runs during the load-time migration.
const VEHICLE_BARCODE_DIGITS = 4;
const VIEWS = ["scannerView", "supervisorView", "searchView"];
// CR-V16: Patrick 2026-09-13, "limit to searches to 50 data lines ... offer a clickable option to
// pull another 50". Only the rendering is paged here, because the data is local. The AWS API will
// page the query itself, and this is the page size it will use.
const SEARCH_PAGE_SIZE = 50;

// CR-V09-ROLE-SHELLS-001 - one codebase, two shells.
//
// A gate operator on a handheld and a supervisor at a desk are doing different jobs, so they
// get different interfaces out of the same build:
//
//   scanner  - the gate handheld. Scanner view only. Supervisor and Search are not reachable,
//              so there is nothing to tap into by accident mid-shift.
//   console  - the desktop. Everything, including the scanner view, because a supervisor
//              legitimately needs to see what the operator sees.
//
// The shell is deliberately NOT a security boundary. Hiding a tab is a usability decision;
// real restriction needs the server-side permissions from CR-V08-AWS-DEV-ENV-001. This only
// decides what is worth showing.
const SHELLS = {
  scanner: ["scannerView"],
  console: ["scannerView", "supervisorView", "searchView"]
};
const SHELL_STORAGE_KEY = "lot-watch.gateflow.shell";
const HANDHELD_MAX_WIDTH = 768;

// CR-V17 review after step 4. The click-path validator drives this app inside a frame and rewrites
// its storage as it goes. With tabs merging each other's records, a signed-in tab absorbed the
// validator's test movements and its queue uploaded 24 of them to the dev database (ids 45-68,
// 2026-09-18). Inside the harness, therefore: movements get no shared-records id, so nothing can
// upload them; the cloud client is never started; and every save carries the harness epoch, so no
// other open tab merges the test records into its own.
const HARNESS_EPOCH = "test-harness";

function resolveShell() {
  // 1. An explicit ?shell= wins and is remembered. This is how a handheld gets provisioned:
  //    open the scanner URL once on the device and it stays a scanner.
  const requested = new URLSearchParams(window.location.search).get("shell");
  if (requested && SHELLS[requested]) {
    try { window.localStorage.setItem(SHELL_STORAGE_KEY, requested); } catch (error) { /* private mode */ }
    return requested;
  }
  // 2. A remembered choice from a previous visit.
  try {
    const stored = window.localStorage.getItem(SHELL_STORAGE_KEY);
    if (stored && SHELLS[stored]) return stored;
  } catch (error) { /* private mode */ }
  // 3. Otherwise infer: a narrow screen is a handheld.
  return window.innerWidth <= HANDHELD_MAX_WIDTH ? "scanner" : "console";
}

function shellViews() {
  return SHELLS[ui.shell] || SHELLS.console;
}

function applyShell() {
  const allowed = shellViews();
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.hidden = !allowed.includes(button.dataset.view);
  });
  document.body.dataset.shell = ui.shell;
  // The nav is noise when there is only one destination.
  const nav = document.querySelector(".top-nav");
  if (nav) nav.hidden = allowed.length < 2;
  if (!allowed.includes(ui.activeView)) showView(allowed[0]);
}

const BUSINESS_TIMEZONE = "America/New_York";
const LICENSE_VALID_THROUGH_PRINTED_DATE = true;
const ENTRY_METHODS = ["scanner_field", "manual"];
const LEGACY_ENTRY_METHOD = "legacy_unknown";
// CR-V11-PATRICK-FEEDBACK-001. Patrick, 2026-09-06: a vehicle that is not in inventory is
// normal traffic, not an exception. Cars move around Enterprise national inventory constantly.
// It is let in like any other vehicle, added to the database as if a supervisor had added it,
// and it leaves like any other vehicle. "The whole purpose is to create a log."
//
// So there is no provisional state and no gate. What is kept is the provenance: which vehicles
// arrived on their own rather than being entered by a person. That is the log, and it costs
// nothing because it blocks nothing.
const COMPLETE_STATUS = "complete";
const SCAN_CREATED_SOURCE = "inbound_scan";
// One Admin, not a Manager and an Admin. Patrick, 2026-09-06: "we issue 1 admin and they
// create and give the users out with authority."
const DESKTOP_USER_ROLES = ["Scanner", "Fleet Lead", "Supervisor", "Admin"];
// CR-V08-BETA-CRITICAL-APP-002 (081526 v7 edit #10): the OUT override is restricted to
// Fleet Lead and above. DESKTOP_USER_ROLES is ordered by seniority, so its index is the rank.
// Before this change the approver list carried no role at all and any listed ID could approve.
const OVERRIDE_MIN_ROLE = "Fleet Lead";
// CR-V16: what a movement let through by a location's scanned-badge override is recorded as. It is
// deliberately not "Authorized": the driver had no daily authorization, and the record says so.
const LOCATION_OVERRIDE_STATUS = "Location override";

function roleRank(role) {
  return DESKTOP_USER_ROLES.indexOf(role);
}

function canApproveOverride(approver) {
  return Boolean(approver) && roleRank(approver.role) >= roleRank(OVERRIDE_MIN_ROLE);
}
const ABILITY_LEVELS = ["Restricted", "View only", "Assign"];
const DESKTOP_USER_ABILITIES = [
  { id: "scanner", title: "Scanner", description: "Use the gate scanner workflow." },
  { id: "driverProfiles", title: "Driver profiles", description: "View or maintain driver profile and authorization controls." },
  { id: "vehicles", title: "Vehicles", description: "View or maintain vehicle inventory records." },
  { id: "devices", title: "Devices", description: "View or maintain scanner devices and replacements." },
  { id: "users", title: "Users", description: "View or maintain application users and abilities." },
  { id: "search", title: "Search / audit", description: "View movement history and audit-style records." },
  { id: "feedback", title: "Feedback", description: "Review scanner and supervisor feedback." }
];

let storageAvailable = true;

const el = {};
const ui = {
  shell: "console",
  editingUserId: null,
  activeView: "scannerView",
  direction: null,
  step: 0,
  activeFlow: null,
  pendingOverride: null,
  searchResults: [],
  searchLimit: SEARCH_PAGE_SIZE,
  searchRanAt: null,
  searchCriteria: "",
  lastRawScan: "No scan received",
  lastScanField: "-",
  scanTerminator: "No",
  lastSavedAt: null,
  activeSupervisorSection: "driversSection",
  modalTrigger: null,
  driverEntryMethod: null,
  vehicleEntryMethod: null,
  profileEmployee: "",
  validatedDriverEmployee: "",
  feedbackSurface: "scanner",
  // CR-V17 step 2: where the rows on the Search screen came from, and how to ask the shared
  // database for the next page. "device" is the copy in this browser; "shared" is the database
  // every scanner will write to.
  searchSource: "device",
  searchTotal: null,
  searchCursor: null,
  searchBusy: false,
  cloudChallenge: null,
  // The movement the operator just recorded: the only one whose upload result is shown to them.
  lastSubmittedClientId: ""
};

const state = loadState();

document.addEventListener("DOMContentLoaded", () => {
  cacheElements();
  ui.shell = resolveShell();
  applyShell();
  bindEvents();
  expireAuthorizations("system");
  populateLocationControls();
  renderAll();
  startCloud();
  updateClock();
  setInterval(updateClock, 30000);

  if (!storageAvailable) {
    setNotice("This browser blocks local storage. The application still works for this session, but data will not persist after reload.", "warning");
  }

  if ("serviceWorker" in navigator && location.protocol !== "file:") navigator.serviceWorker.register("service-worker.js").catch(() => {});
});

function cacheElements() {
  [
    "resetDemoButton", "deviceClock", "scannerHeading", "scannerNotice",
    "scannerHome", "scanWizard", "supervisorPanel", "startScanButton",
    "flowCancel", "wizardDots", "scannerLocation", "driverInput", "driverStatus", "driverNext", "barcodeInput",
    "barcodeStatus", "barcodeBack", "barcodeNext", "transactionNote", "reviewStepTitle", "reviewBack",
    "scanSummary", "submitTransactionButton", "supervisorReason", "supervisorInput",
    "supervisorStatus", "cancelSupervisorButton", "approveSupervisorButton",
    "incompleteInventoryPanel", "incompleteInventoryBody", "incompleteInventoryCount",
    "todayOutCount", "todayInCount", "todayBlockCount",
    "adminAuthorizedCount", "authorizedDriversBody", "driversTableBody", "licenseWarningBody",
    "deauthorizeAllButton", "searchForm", "filterVehicle",
    "filterDriver", "filterLocation", "filterDate", "filterType", "clearSearchButton",
    "searchResultCount", "searchResultsBody", "searchShowing", "searchMoreButton", "printSearchButton",
    "searchPrintedBy", "searchPrintStatus", "searchPrintFooter", "authorizationCrossCheck", "locationOverrideBody",
    "searchSourceNote", "cloudStatusButton", "cloudSignInModal", "cloudSignInForm", "cloudUsername", "cloudPassword",
    "cloudNewPasswordRow", "cloudNewPassword", "cloudSignInStatus", "cloudSignInSubmit",
    "closeCloudSignInButton", "cancelCloudSignInButton", "syncStatus",
    "directionOut", "directionIn", "movementBack",
    "driverRosterSearch", "authorizationDuration", "bulkAuthorizeButton",
    "license30Count", "license15Count", "license5Count", "licenseExpiredCount", "bulkActionStatus",
    "supervisorDuration", "addDriverButton", "driverModal", "driverForm",
    "driverEditEmployee", "driverEmployeeNumber", "driverName", "driverLicenseExpires", "driverActive",
    "driverEmployeeError", "driverNameError", "driverLicenseError", "closeDriverModalButton", "cancelDriverButton",
    "addVehicleButton", "vehicleSearch", "vehicleStatusFilter", "vehiclesTableBody", "vehicleModal", "vehicleForm",
    "vehicleEditId", "vehicleMake", "vehicleModel", "vehicleYear", "vehicleColor", "vehicleVin", "vehicleBarcode",
    "vehiclePlate", "vehicleActive", "vehicleMakeError", "vehicleModelError", "vehicleYearError", "vehicleColorError",
    "vehicleVinError", "vehicleBarcodeError", "vehicleFormStatus", "closeVehicleModalButton", "cancelVehicleButton", "vehicleInventoryToggle",
    "labelModal", "labelModalHeading", "labelPreview", "labelModalStatus", "printLabelButton", "skipLabelButton", "labelPrintSheet",
    "consoleGate", "consoleGateStatus", "consoleGateSignInButton", "demoBanner", "loginsPanel", "prototypeUsersPanel", "loginForm", "loginNameInput",
    "loginUsernameInput", "loginRoleInput", "loginFormStatus", "loginPasswordBox", "loginPasswordText", "loginPasswordValue", "hideLoginPasswordButton",
    "loginsTableBody", "phoneSignInOpenButton", "phoneSignInModal", "closePhoneSignInButton", "phoneSignInStatus", "phoneSignInFields", "phoneUsername",
    "phonePassword", "phoneNewPasswordRow", "phoneNewPassword", "phoneSignInButton", "phoneSignInMessage", "phoneSignOutButton",
    "openDeviceSetupButton", "deviceSetupModal", "closeDeviceSetupButton", "currentDeviceSelect", "floaterLocationFields", "floaterLocationSelect", "deviceSetupStatus", "confirmDeviceLocationButton", "changeFloaterLocationButton",
    "devicesTableBody", "deviceHistoryList", "addDeviceButton", "deviceModal", "deviceForm", "closeDeviceModalButton", "cancelDeviceButton", "deviceEditId", "deviceIdInput", "deviceNameInput", "deviceImeiInput", "deviceTypeInput", "deviceLocationInput", "deviceStatusInput", "devicePhoneInput", "deviceNotesInput", "deviceIdError", "deviceNameError", "deviceImeiError", "deviceLocationError", "deviceActionStatus",
    "driverProfileModal", "closeDriverProfileButton", "driverProfileHeading", "driverProfileBody", "profileEditDriverButton", "profileToggleDriverButton",
    "openScannerFeedbackButton", "openSupervisorFeedbackButton", "feedbackModal", "feedbackForm", "feedbackEyebrow", "feedbackName", "feedbackNote", "feedbackDetailsRow", "feedbackDetails", "feedbackContext", "closeFeedbackButton", "cancelFeedbackButton", "desktopUsersTableBody", "addDesktopUserButton", "desktopUserModal", "desktopUserHeading", "desktopUserForm", "desktopUserName", "desktopUserUsername", "desktopUserPassword", "desktopUserResetRequired", "desktopUserRole", "desktopUserScope", "desktopAbilityGrid", "desktopUserNameError", "desktopUserUsernameError", "closeDesktopUserButton", "cancelDesktopUserButton"
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

  el.scannerLocation.addEventListener("change", () => {
    state.workingLocation = el.scannerLocation.value;
    saveState();
    renderAll();
  });

  el.driverInput.addEventListener("input", () => handleScanInput("driverInput"));
  el.barcodeInput.addEventListener("input", () => handleScanInput("barcodeInput"));
  el.supervisorInput.addEventListener("input", updateSupervisorStatus);

  document.querySelectorAll("[data-demo-field]").forEach((button) => {
    button.addEventListener("click", () => setScannerValue(button.dataset.demoField, button.dataset.demoValue));
  });

  ["driverInput", "barcodeInput", "supervisorInput"].forEach((id) => {
    el[id].addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== "Tab") return;
      recordScannerInput(id, el[id].value, event.key);
      if (event.key !== "Enter") return;
      event.preventDefault();
      if (id === "supervisorInput") approveSupervisorOverride();
      else if (id === "barcodeInput") validateBarcodeStep();
      else validateDriverStep();
    });
  });

  el.driversTableBody.addEventListener("click", handleDriverTableAction);
  el.driversTableBody.addEventListener("change", handleDriverActionMenu);
  el.printLabelButton.addEventListener("click", printVehicleLabel);
  el.skipLabelButton.addEventListener("click", closeLabelPrompt);
  startTypingFieldWatch();
  el.consoleGateSignInButton.addEventListener("click", openCloudSignIn);
  el.loginForm.addEventListener("submit", submitNewLogin);
  el.loginsTableBody.addEventListener("change", handleLoginAction);
  el.hideLoginPasswordButton.addEventListener("click", hideTemporaryPassword);
  el.phoneSignInOpenButton.addEventListener("click", () => { ui.modalTrigger = el.phoneSignInOpenButton; renderPhoneSignIn(); el.phoneSignInModal.classList.remove("hidden"); });
  el.closePhoneSignInButton.addEventListener("click", () => { ui.phoneChallenge = null; el.phonePassword.value = ""; el.phoneNewPassword.value = ""; closeManagedModal(el.phoneSignInModal); });
  el.phoneSignInButton.addEventListener("click", submitPhoneSignIn);
  el.phoneSignOutButton.addEventListener("click", signPhoneOut);
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
  // CR-V14 item 1: a scan field must not raise the soft keyboard just because the step opened.
  // inputmode="none" keeps focus (so a hardware wedge scan still lands in the field) while
  // telling Android not to show a keyboard. Tapping the field opts into typing.
  [el.barcodeInput, el.driverInput, el.supervisorInput].forEach((input) => {
    input.addEventListener("pointerdown", () => enableTypingOn(input));
  });
  el.vehicleInventoryToggle.addEventListener("click", toggleVehicleInventoryFromModal);
  el.vehicleForm.addEventListener("submit", saveVehicleForm);
  el.vehicleSearch.addEventListener("input", renderVehicles);
  el.vehicleStatusFilter.addEventListener("change", renderVehicles);
  el.vehiclesTableBody.addEventListener("click", handleVehicleTableAction);
  // The added-by-scan panel carries the same data-vehicle-action buttons but never had a
  // listener, so its Edit button had been inert since the panel was built.
  el.incompleteInventoryBody.addEventListener("click", handleVehicleTableAction);
  el.addDeviceButton.addEventListener("click", () => openDeviceModal());
  el.closeDeviceModalButton.addEventListener("click", closeDeviceModal);
  el.cancelDeviceButton.addEventListener("click", closeDeviceModal);
  el.deviceForm.addEventListener("submit", saveDeviceForm);
  el.devicesTableBody.addEventListener("click", handleDeviceTableAction);
  el.openDeviceSetupButton.addEventListener("click", openDeviceSetup);
  el.closeDeviceSetupButton.addEventListener("click", closeDeviceSetup);
  el.currentDeviceSelect.addEventListener("change", updateDeviceSetupFields);
  el.confirmDeviceLocationButton.addEventListener("click", confirmDeviceLocation);
  el.changeFloaterLocationButton.addEventListener("click", prepareFloaterLocationChange);
  el.closeDriverProfileButton.addEventListener("click", closeDriverProfile);
  el.profileEditDriverButton.addEventListener("click", () => { const driver = findDriverAny(ui.profileEmployee); closeDriverProfile(); if (driver) openDriverModal(driver); });
  el.profileToggleDriverButton.addEventListener("click", () => toggleDriverFromProfile());
  el.openScannerFeedbackButton.addEventListener("click", () => openFeedbackModal("scanner"));
  el.openSupervisorFeedbackButton.addEventListener("click", () => openFeedbackModal("supervisor"));
  el.closeFeedbackButton.addEventListener("click", closeFeedbackModal);
  el.cancelFeedbackButton.addEventListener("click", closeFeedbackModal);
  el.feedbackForm.addEventListener("submit", submitFeedback);
  el.addDesktopUserButton.addEventListener("click", () => openDesktopUserModal());
  el.closeDesktopUserButton.addEventListener("click", closeDesktopUserModal);
  el.cancelDesktopUserButton.addEventListener("click", closeDesktopUserModal);
  el.desktopUserForm.addEventListener("submit", saveDesktopUser);
  el.desktopUsersTableBody.addEventListener("click", handleDesktopUserAction);
  [el.driverModal, el.vehicleModal, el.deviceModal, el.deviceSetupModal, el.driverProfileModal, el.feedbackModal, el.desktopUserModal].forEach((modal) => modal.addEventListener("click", (event) => { if (event.target === modal) closeManagedModal(modal); }));
  document.addEventListener("keydown", (event) => { if (event.key === "Escape") { [el.driverModal, el.vehicleModal, el.deviceModal, el.deviceSetupModal, el.driverProfileModal, el.feedbackModal, el.desktopUserModal].forEach(closeManagedModal); if (!el.labelModal.classList.contains("hidden")) closeLabelPrompt(); if (!el.phoneSignInModal.classList.contains("hidden")) { ui.phoneChallenge = null; closeManagedModal(el.phoneSignInModal); } } });

  el.searchForm.addEventListener("submit", (event) => {
    event.preventDefault();
    submitSearch();
  });
  el.cloudStatusButton.addEventListener("click", handleCloudPillClick);
  // Close and Cancel are deliberate: they give up on the sign-in rather than pausing it.
  el.closeCloudSignInButton.addEventListener("click", () => { ui.cloudChallenge = null; closeCloudSignIn(); });
  el.cancelCloudSignInButton.addEventListener("click", () => { ui.cloudChallenge = null; closeCloudSignIn(); });
  el.cloudSignInForm.addEventListener("submit", submitCloudSignIn);
  // A click beside the panel closes it, except while it is waiting for a new password: losing a
  // half-finished first sign-in by clicking the page behind it is how this went wrong in testing.
  el.cloudSignInModal.addEventListener("click", (event) => { if (event.target === el.cloudSignInModal && !ui.cloudChallenge) closeCloudSignIn(); });
  // Escape closes it like every other panel, on the same condition as a click beside it.
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !el.cloudSignInModal.classList.contains("hidden") && !ui.cloudChallenge) closeCloudSignIn();
  });
  el.clearSearchButton.addEventListener("click", clearSearch);
  el.searchMoreButton.addEventListener("click", showMoreSearchResults);
  el.printSearchButton.addEventListener("click", printSearch);
  el.locationOverrideBody.addEventListener("click", handleLocationOverrideAction);
  if (el.resetDemoButton) el.resetDemoButton.addEventListener("click", resetDemo);
}

function createSeedState() {
  const now = new Date();
  const isoMinutesAgo = (minutes) => new Date(now.getTime() - minutes * 60000).toISOString();
  const todayAuth = createAuthorization("auth-001", "E1001", "9_hours", "System seed", "Division Street", now);
  const secondNineHourAuth = createAuthorization("auth-002", "E1002", TEMP_AUTHORIZATION_DURATION, "System seed", "North Ave", now);
  const thirdNineHourAuth = createAuthorization("auth-003", "E1004", TEMP_AUTHORIZATION_DURATION, "System seed", "Linden", now);

  return {
    version: "0.7",
    migrationVersion: 8,
    businessTimezone: BUSINESS_TIMEZONE,
    workingLocation: "Division Street",
    currentDeviceId: "D0001",
    floaterLocationConfirmed: false,
    drivers: [
      seedDriver("E1001", "Nina Patel", 84, true),
      seedDriver("E1002", "Marcus Reed", 30, true),
      seedDriver("E1003", "Tyrone Brooks", 4, true),
      seedDriver("E1004", "Maria Torres", 14, true),
      seedDriver("E1005", "Phil Grant", -3, true),
      seedDriver("E1006", "Angela Cruz", 180, false)
    ],
    vehicles: [
      seedVehicle("veh-001", "G0001", "1HGCM82633A004352", "TRK-8877", "Ford", "Transit", 2022, "White"),
      seedVehicle("veh-002", "G0002", "2T1BURHE5JC034789", "NJK-2214", "Toyota", "Camry", 2021, "Silver"),
      seedVehicle("veh-003", "G0003", "3FA6P0H75HR123456", "YARD-104", "Ford", "Fusion", 2019, "Blue"),
      seedVehicle("veh-004", "G0004", "5NPE24AF8FH001234", "EWR-5521", "Hyundai", "Sonata", 2020, "Gray"),
      seedVehicle("veh-005", "G0005", "1FTFW1EF1EFA00001", "LIND-7710", "Ford", "F-150", 2023, "Black")
    ],
    locations: [
      { name: "Division Street", active: true },
      { name: "North Ave", active: true },
      { name: "EWR North", active: true },
      { name: "Linden", active: true }
    ],
    supervisors: [
      { id: "S1001", name: "Morgan Lee", role: "Supervisor" },
      { id: "S2040", name: "Jordan Wells", role: "Fleet Lead" },
      // Deliberately below the override threshold so the rule is testable during beta.
      { id: "S3090", name: "Casey Rowe", role: "Scanner" }
    ],
    devices: [
      seedDevice("D0001", "Division Gate Scanner", "000000000000001", "Fixed", "Division Street"),
      seedDevice("D0002", "North Ave Gate Scanner", "000000000000002", "Fixed", "North Ave"),
      seedDevice("D0003", "EWR North Gate Scanner", "000000000000003", "Fixed", "EWR North"),
      seedDevice("D0004", "Linden Gate Scanner", "000000000000004", "Fixed", "Linden"),
      seedDevice("D0005", "Floater Gate Scanner", "000000000000005", "Floater", "")
    ],
    authorizations: [todayAuth, secondNineHourAuth, thirdNineHourAuth].filter(Boolean),
    transactions: [
      seedTransaction("tx-001", isoMinutesAgo(16), "OUT", "E1001", "Nina Patel", "veh-001", "G0001", "1HGCM82633A004352", "TRK-8877", "Division Street", "Authorized", "Customer delivery", "Division Street Scanner"),
      seedTransaction("tx-002", isoMinutesAgo(41), "IN", "E1003", "Tyrone Brooks", "veh-003", "G0003", "3FA6P0H75HR123456", "YARD-104", "EWR North", "Unauthorized", "Unauthorized IN - operational review", "EWR North Scanner"),
      seedTransaction("tx-003", isoMinutesAgo(68), "OUT", "E1004", "Maria Torres", "veh-004", "G0004", "5NPE24AF8FH001234", "EWR-5521", "Linden", "Authorized", "", "Linden Scanner")
    ],
    auditEvents: [
      seedAudit("audit-001", isoMinutesAgo(16), "out_transaction", "Vehicle OUT recorded for E1001 / TRK-8877.", "Division Street Scanner", "Division Street"),
      seedAudit("audit-002", isoMinutesAgo(41), "in_transaction", "Vehicle IN recorded for E1003 / YARD-104.", "EWR North Scanner", "EWR North"),
      seedAudit("audit-003", isoMinutesAgo(41), "unauthorized_in_review", "Unauthorized IN - operational review.", "EWR North Scanner", "EWR North"),
      seedAudit("audit-004", isoMinutesAgo(68), "out_transaction", "Vehicle OUT recorded for E1004 / EWR-5521.", "Linden Scanner", "Linden"),
      seedAudit("audit-005", isoMinutesAgo(130), "driver_authorized", "Driver E1001 authorized for Today.", "System seed", "Division Street")
    ],
    feedback: [],
    desktopUsers: [
      seedDesktopUser("U0001", "Avery Morgan", "avery.morgan", "Admin", "All locations", "Assign"),
      seedDesktopUser("U0002", "Jordan Wells", "jordan.wells", "Supervisor", "All locations", "View only")
    ]
  };
}

function seedDesktopUser(id, name, username, role, scope, abilityLevel) {
  return {
    id,
    name,
    username,
    role,
    active: true,
    scope,
    credentialPrototype: { passwordStatus: "not_stored", resetRequired: false, updatedAt: "" },
    abilities: defaultDesktopAbilities(abilityLevel)
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
  return { id, assignedBarcode: barcode, vin, plate, make, model, year, color, active: true, createdAt: now, updatedAt: now, createdBy: "System seed", updatedBy: "System seed", removedAt: "", removedBy: "", reactivatedAt: "", inventoryStatus: COMPLETE_STATUS, createdSource: "seed", needsSupervisorCompletion: false, provisionalFromTxId: "", provisionalAt: "", completedBy: "", completedAt: "" };
}

function seedDevice(id, name, imei, type, assignedLocation) {
  const now = new Date().toISOString();
  return { id, name, imei, type, assignedLocation, status: "Active", phone: "", notes: "", active: true, createdAt: now, updatedAt: now, lastUsedAt: "", lastTransactionLocation: "", createdBy: "System seed", updatedBy: "System seed" };
}

function seedTransaction(id, timestamp, direction, driverEmployee, driverName, vehicleId, vehicleBarcode, vin, plate, location, authorizationStatus, note, submittedBy) {
  return { id, timestamp, direction, driverEmployee, driverName, vehicleId, vehicleBarcode, vin, plate, location, authorizationStatus, note, submittedBy, driverEntryMethod: LEGACY_ENTRY_METHOD, vehicleEntryMethod: LEGACY_ENTRY_METHOD };
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
    if (saved && saved.version === "0.7" && Array.isArray(saved.transactions)) {
      if (saved.migrationVersion !== 8 && !localStorage.getItem(PRE_CALL_MIGRATION_BACKUP_KEY)) localStorage.setItem(PRE_CALL_MIGRATION_BACKUP_KEY, JSON.stringify(saved));
      const normalized = normalizeV07State(saved);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
      return normalized;
    }
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
    console.warn("Could not load or migrate Veri-Gate state", error);
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
  normalized.migrationVersion = 8;
  normalized.businessTimezone = BUSINESS_TIMEZONE;
  normalized.workingLocation = normalizeLocationName(normalized.workingLocation) || "Division Street";
  const originalDevices = normalized.devices || [];
  const originalCurrentDeviceId = normalize(normalized.currentDeviceId);
  normalized.locations = (normalized.locations || []).map((location) => ({ ...location, name: normalizeLocationName(location.name), scanOverride: normalizeScanOverride(location.scanOverride) })).filter((location) => location.name && location.name !== "Enterprise Repair Facility");
  if (!normalized.locations.length) normalized.locations = createSeedState().locations;
  normalized.drivers = (normalized.drivers || []).map((driver) => ({ ...driver, employeeNumber: canonicalEmployeeId(driver.employeeNumber) }));
  // CR-V08-BETA-CRITICAL-APP-002: stored approvers predate the role field. They are defaulted to
  // the minimum rank that preserves their existing ability to approve, rather than to a senior
  // role. Patrick should confirm the real rank of each approver before beta.
  normalized.supervisors = (normalized.supervisors || createSeedState().supervisors).map((supervisor) => ({ ...supervisor, id: canonicalSupervisorId(supervisor.id), role: DESKTOP_USER_ROLES.includes(supervisor.role) ? supervisor.role : OVERRIDE_MIN_ROLE }));
  normalized.vehicles = (normalized.vehicles || []).map((vehicle, index) => normalizeVehicle(vehicle, index));
  normalized.transactions = (normalized.transactions || []).map((transaction) => mapTransactionVehicle({ ...transaction, driverEmployee: canonicalEmployeeId(transaction.driverEmployee), location: normalizeLocationName(transaction.location), workingLocation: normalizeLocationName(transaction.workingLocation), deviceId: transaction.deviceId ? canonicalDeviceId(transaction.deviceId) : "" }, normalized.vehicles)).filter((transaction) => transaction.location && transaction.location !== "Enterprise Repair Facility");
  normalized.authorizations = (normalized.authorizations || []).map((authorization) => {
    const authorizedAt = new Date(authorization.authorizedAt || authorization.validFrom || Date.now());
    const normalizedAuthorization = { ...authorization, driverEmployee: canonicalEmployeeId(authorization.driverEmployee), actionLocation: normalizeLocationName(authorization.actionLocation || authorization.location), location: normalizeLocationName(authorization.location) };
    // CR-V14 item 4: this used to force every active authorization to 9_hours on load, which
    // would have quietly shortened any longer grant on the next refresh. A recognised duration
    // is kept as it was issued; only an unrecognised one falls back.
    if (authorization.status !== "active") return normalizedAuthorization;
    const type = AUTHORIZATION_DURATIONS.includes(authorization.type) ? authorization.type : TEMP_AUTHORIZATION_DURATION;
    return { ...normalizedAuthorization, type, expiresAt: expirationForDuration(type, authorizedAt).toISOString() };
  });
  normalized.devices = (originalDevices.length ? originalDevices : createSeedState().devices).map(normalizeDevice);
  const currentDeviceIndex = originalDevices.findIndex((device) => normalize(device.id) === originalCurrentDeviceId);
  normalized.currentDeviceId = normalized.devices[currentDeviceIndex]?.id || normalized.devices.find((device) => device.id === canonicalDeviceId(originalCurrentDeviceId))?.id || normalized.devices[0]?.id || "D0001";
  normalized.auditEvents = (normalized.auditEvents || []).map((event) => ({ ...event, location: normalizeLocationName(event.location), actor: String(event.actor || "").replaceAll("EWR Scanner", "EWR North Scanner"), description: String(event.description || "").replaceAll("EMP-", "E").replaceAll("EWR Scanner", "EWR North Scanner") })).filter((event) => event.location !== "Enterprise Repair Facility" && !event.description.includes("Enterprise Repair Facility"));
  normalized.feedback = Array.isArray(normalized.feedback) ? normalized.feedback : [];
  normalized.outbox = Array.isArray(normalized.outbox) ? normalized.outbox : [];
  normalized.desktopUsers = (Array.isArray(normalized.desktopUsers) && normalized.desktopUsers.length ? normalized.desktopUsers : createSeedState().desktopUsers).map((user, index) => normalizeDesktopUser(user, index));
  normalized.floaterLocationConfirmed = Boolean(normalized.floaterLocationConfirmed);
  return normalized;
}

function migrateV06State(v06) {
  const migrated = normalizeV07State(JSON.parse(JSON.stringify(v06)));
  migrated.migratedFrom = v06.version || "0.6";
  migrated.migratedAt = new Date().toISOString();
  return migrated;
}

function normalizeDevice(device, index = 0) {
  const now = new Date().toISOString();
  const type = device.type === "Floater" ? "Floater" : "Fixed";
  return { id: canonicalDeviceId(device.id, index), name: String(device.name || device.id || "Unnamed device").trim(), imei: normalizeImei(device.imei), type, assignedLocation: type === "Fixed" ? normalizeLocationName(device.assignedLocation) : "", status: device.status || (device.active === false ? "Inactive" : "Active"), phone: device.phone || "", notes: device.notes || "", active: device.active !== false && device.status !== "Inactive", createdAt: device.createdAt || now, updatedAt: device.updatedAt || now, lastUsedAt: device.lastUsedAt || "", lastTransactionLocation: normalizeLocationName(device.lastTransactionLocation), createdBy: device.createdBy || "V0.7 migration", updatedBy: device.updatedBy || "V0.7 migration" };
}

function normalizeDesktopUser(user, index = 0) {
  const role = normalizeDesktopRole(user.role);
  const username = normalizeUsername(user.username || user.login || user.email || user.name || `user${index + 1}`);
  const credential = user.credentialPrototype || {};
  return {
    id: user.id || `U${String(index + 1).padStart(4, "0")}`,
    name: String(user.name || username || "Unnamed user").trim(),
    username,
    role,
    active: user.active !== false,
    scope: user.scope || "All locations",
    credentialPrototype: {
      passwordStatus: credential.passwordStatus || "not_stored",
      resetRequired: Boolean(credential.resetRequired),
      updatedAt: credential.updatedAt || ""
    },
    abilities: normalizeDesktopAbilities(user.abilities)
  };
}

function normalizeDesktopRole(role) {
  const value = String(role || "").trim();
  // CR-V11: Manager and Admin were never meant to be two roles. Patrick, 2026-09-06: "we issue
  // 1 admin and they create and give the users out with authority." Stored Managers become Admin.
  if (value === "Owner / System Administrator" || value === "Manager") return "Admin";
  return DESKTOP_USER_ROLES.includes(value) ? value : "Scanner";
}

function normalizeUsername(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, ".")
    .replace(/^[._-]+|[._-]+$/g, "")
    .replace(/[.]{2,}/g, ".") || "";
}

function defaultDesktopAbilities(level = "Restricted") {
  const safeLevel = ABILITY_LEVELS.includes(level) ? level : "Restricted";
  return DESKTOP_USER_ABILITIES.reduce((abilities, ability) => {
    abilities[ability.id] = safeLevel;
    return abilities;
  }, {});
}

function normalizeDesktopAbilities(abilities = {}) {
  return DESKTOP_USER_ABILITIES.reduce((normalized, ability) => {
    normalized[ability.id] = abilities && ABILITY_LEVELS.includes(abilities[ability.id]) ? abilities[ability.id] : "Restricted";
    return normalized;
  }, {});
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
    assignedBarcode: canonicalVehicleBarcode(vehicle.assignedBarcode, index),
    // The demo details are only for records from before V0.6, which had no such fields at all. A blank
    // is a real answer: an unknown vehicle scanned at the gate (CR-V11) and a vehicle added with only
    // its VIN (CR-V14) both have one. Filling blanks turned every such vehicle into a made-up car on
    // the next load - a G0777 met at the gate came back as a 2021 silver Toyota Camry.
    vin: normalize(vehicle.vin), plate: normalize(vehicle.plate),
    make: vehicle.make === undefined ? demo[0] : String(vehicle.make || ""), model: vehicle.model === undefined ? demo[1] : String(vehicle.model || ""),
    year: vehicle.year === undefined ? demo[2] : Number(vehicle.year) || "", color: vehicle.color === undefined ? demo[3] : String(vehicle.color || ""),
    active: vehicle.active !== false,
    createdAt: vehicle.createdAt || now, updatedAt: vehicle.updatedAt || now, createdBy: vehicle.createdBy || "V0.5 migration", updatedBy: vehicle.updatedBy || "V0.5 migration", removedAt: vehicle.removedAt || "", removedBy: vehicle.removedBy || "", reactivatedAt: vehicle.reactivatedAt || "",
    // CR-V11: provisional inventory is gone. Any record previously held as provisional becomes
    // an ordinary vehicle on load, so nothing stays stuck from the earlier build.
    inventoryStatus: COMPLETE_STATUS,
    createdSource: vehicle.createdSource || "migration",
    barcodeNeedsReview: vehicle.barcodeNeedsReview === true,
    needsSupervisorCompletion: false,
    provisionalFromTxId: vehicle.provisionalFromTxId || "",
    // Records already saved with this blank are healed on load: a vehicle met at the gate was
    // added when it was created, so that is the date the list wants.
    provisionalAt: vehicle.provisionalAt || (vehicle.createdSource === SCAN_CREATED_SOURCE ? vehicle.createdAt || "" : ""),
    completedBy: vehicle.completedBy || "",
    completedAt: vehicle.completedAt || ""
  };
}

// Provenance only. This never gates a movement; it answers "did a person add this, or did it
// just turn up at the gate?"
function isScannerAddedVehicle(vehicle) {
  return Boolean(vehicle) && vehicle.createdSource === SCAN_CREATED_SOURCE;
}

function scannerAddedVehicles() {
  return state.vehicles.filter(isScannerAddedVehicle);
}

// Single creation point for auto-created inbound inventory. Duplicate-safe: the canonical
// barcode is the natural key, so a re-scan of the same unknown barcode returns the existing
// record instead of creating a second one.
function createScannedVehicle(barcode, context) {
  const canonical = canonicalVehicleBarcode(barcode);
  if (!canonical) return null;
  const existing = findVehicleByBarcode(canonical);
  if (existing) return existing;
  const now = new Date().toISOString();
  const vehicle = {
    id: makeId("veh"),
    assignedBarcode: canonical,
    vin: "", plate: "", make: "", model: "", year: 0, color: "",
    active: true,
    createdAt: now, updatedAt: now,
    createdBy: context.actor, updatedBy: context.actor,
    removedAt: "", removedBy: "", reactivatedAt: "",
    inventoryStatus: COMPLETE_STATUS,
    createdSource: SCAN_CREATED_SOURCE,
    needsSupervisorCompletion: false,
    provisionalFromTxId: context.transactionId || "",
    provisionalAt: now,
    barcodeNeedsReview: Boolean(context.needsBarcodeReview),
    completedBy: "", completedAt: ""
  };
  state.vehicles.push(vehicle);
  return vehicle;
}

function mapTransactionVehicle(transaction, vehicles) {
  const vehicle = vehicles.find((item) => item.id === transaction.vehicleId || item.vin === normalize(transaction.vin) || (transaction.plate && item.plate === normalize(transaction.plate)));
  const driverEntryMethod = normalizeStoredEntryMethod(transaction.driverEntryMethod);
  const vehicleEntryMethod = normalizeStoredEntryMethod(transaction.vehicleEntryMethod === undefined ? transaction.barcodeEntryMethod : transaction.vehicleEntryMethod);
  return { ...transaction, driverEmployee: canonicalEmployeeId(transaction.driverEmployee), location: normalizeLocationName(transaction.location), vehicleId: transaction.vehicleId || (vehicle ? vehicle.id : ""), vehicleBarcode: canonicalVehicleBarcode(transaction.vehicleBarcode || (vehicle ? vehicle.assignedBarcode : "")), driverEntryMethod, vehicleEntryMethod };
}

function normalizeStoredEntryMethod(value) {
  const method = String(value || "").trim().toLowerCase();
  if (method === "scanner_field" || method === "standard_input") return "scanner_field";
  if (method === "manual") return "manual";
  return LEGACY_ENTRY_METHOD;
}

function isNewEntryMethod(value) {
  return ENTRY_METHODS.includes(value);
}

function entryMethodLabel(value) {
  if (value === "scanner_field") return "Scanner field";
  if (value === "manual") return "Manual";
  return "Legacy / unknown";
}

function migrateV04State(legacy) {
  const migrated = normalizeV05State(JSON.parse(JSON.stringify(legacy)));
  migrated.businessTimezone = BUSINESS_TIMEZONE;
  migrated.migratedFrom = "0.4";
  migrated.migratedAt = new Date().toISOString();
  return migrated;
}

// CR-V17 review after step 4. Two faults in how the device keeps its records, both of which could
// lose movements that had not yet reached the shared records:
//
// 1. Storage fills up. Every movement costs about 1,300 characters with its audit entries, and a
//    phone's web storage holds a few megabytes, so a busy gate filled it in weeks. Saving then
//    switched itself off for the session while the next notice still said "saved". Now the device
//    trims what the shared database has already confirmed, and a failure to save is loud and stays
//    on screen.
// 2. Two tabs overwrite each other. Each tab saves its whole copy, so the last to save erased what
//    the other had recorded. Now each save first takes in anything another tab saved.
const SHARED_KEEP_DAYS = 14;
const SAVE_FAILED_NOTICE = "This device could not save. The latest movements are NOT stored on it. Do not close the app - call a supervisor.";
const SYNC_RANK = { local: 0, pending: 1, sending: 2, refused: 3, shared: 3 };

function saveState() {
  if (!storageAvailable) return false;
  if (IN_TEST_HARNESS) state.resetEpoch = HARNESS_EPOCH;
  // What changed on this device is queued before another tab's records are taken in, so the two
  // cannot be confused. Then it is sent straight away, not at the next minute's check: a driver
  // added on the console should reach the gate scanners as soon as there is a signal.
  if (recordLocalChanges()) setTimeout(() => syncDevice(), 0);
  mergeFromStorage();
  pruneSharedHistory(SHARED_KEEP_DAYS);
  if (writeState()) return true;
  // Full. Keep only today's confirmed history and try once more before giving up.
  if (pruneSharedHistory(1) && writeState()) return true;
  ui.saveFailed = true;
  setNotice(SAVE_FAILED_NOTICE, "danger");
  return false;
}

function writeState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    ui.lastSavedAt = new Date();
    ui.saveFailed = false;
    return true;
  } catch (error) {
    return false;
  }
}

// Only what the shared database has confirmed, older than the window, with the audit entries that
// belong to it. Nothing unsent, refused, or recorded before movements went to the cloud is ever
// trimmed: for those, this device holds the only copy.
function pruneSharedHistory(keepDays) {
  const cutoff = Date.now() - keepDays * 86400000;
  const trimmed = new Set();
  state.transactions = state.transactions.filter((item) => {
    const confirmedAndOld = item.clientId && item.sync === "shared" && new Date(item.timestamp).getTime() < cutoff;
    if (confirmedAndOld) trimmed.add(item.clientId);
    return !confirmedAndOld;
  });
  const auditBefore = state.auditEvents.length;
  state.auditEvents = state.auditEvents.filter((event) => {
    if (event.movementClientId && trimmed.has(event.movementClientId)) return false;
    // An entry the shared records confirmed is kept for the same window as a movement.
    return !(event.sync === "shared" && new Date(event.timestamp).getTime() < cutoff);
  });
  const auditTrimmed = auditBefore - state.auditEvents.length;
  // Every driver needs an authorization every day, so ended ones pile up as fast as movements did.
  // One the shared records hold, and that ended more than three days ago, is only history, and the
  // server keeps it. Nothing still waiting to be sent is touched.
  const endedCutoff = Date.now() - AUTHORIZATION_HISTORY_DAYS * 86400000;
  const waitingKeys = new Set((state.outbox || []).filter((item) => SYNC_WAITING.includes(item.sync)).map((item) => item.key));
  const authorizationsBefore = state.authorizations.length;
  state.authorizations = state.authorizations.filter((auth) => {
    const ended = auth.status !== "active" || new Date(auth.expiresAt).getTime() < Date.now();
    const endedAt = new Date(auth.revokedAt || auth.expiresAt).getTime();
    const old = ended && auth.shared === true && endedAt < endedCutoff && !waitingKeys.has(sharedKey("authorization", auth.id));
    if (old && state.refShadow) delete state.refShadow[sharedKey("authorization", auth.id)];
    return !old;
  });
  const authorizationsTrimmed = authorizationsBefore - state.authorizations.length;
  // A change the shared records have is only kept a day, long enough for another tab to learn it was
  // sent. What it changed lives on in the records themselves.
  const changesBefore = (state.outbox || []).length;
  if (changesBefore) state.outbox = state.outbox.filter((item) => !(item.sync === "shared" && new Date(item.sharedAt || item.queuedAt).getTime() < Date.now() - SHARED_CHANGE_KEEP_MS));
  return trimmed.size + auditTrimmed + authorizationsTrimmed + (changesBefore - (state.outbox || []).length);
}

// Movements and audit entries are only ever added, so taking in everything another tab saved loses
// nothing. A reset of the demo data starts a new epoch, and records from before it are not revived.
function mergeFromStorage() {
  let stored = null;
  try { stored = JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); } catch (error) { return 0; }
  if (!stored || (stored.resetEpoch || 0) !== (state.resetEpoch || 0)) return 0;
  return mergeRecords("transactions", stored.transactions) + mergeRecords("auditEvents", stored.auditEvents) + mergeChanges(stored.outbox);
}

function mergeRecords(key, incoming) {
  if (!Array.isArray(incoming) || !Array.isArray(state[key])) return 0;
  const known = new Map(state[key].map((item) => [item.id, item]));
  let added = 0;
  incoming.forEach((item) => {
    const mine = item && known.get(item.id);
    if (!item || !item.id) return;
    if (!mine) {
      state[key].push(item);
      added += 1;
      return;
    }
    // Another tab may already have sent this movement: take its word rather than send it again.
    if (key === "auditEvents" && (SYNC_RANK[item.sync] || 0) > (SYNC_RANK[mine.sync] || 0)) mine.sync = item.sync;
    if (key === "transactions" && (SYNC_RANK[item.sync] || 0) > (SYNC_RANK[mine.sync] || 0)) {
      mine.sync = item.sync;
      mine.serverId = item.serverId;
      mine.serverConflict = item.serverConflict;
      mine.syncError = item.syncError;
    }
  });
  if (added) state[key].sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp));
  return added;
}

function showView(viewId) {
  if (!VIEWS.includes(viewId)) return;
  // CR-V09-ROLE-SHELLS-001: a view outside the active shell is unreachable, including by deep
  // link. The scanner shell cannot be navigated into the supervisor console.
  if (!shellViews().includes(viewId)) return;
  ui.activeView = viewId;
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
}

function optionHtml(value, selected, label = value) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function startFlow() {
  const deviceCheck = isDeviceReady();
  if (!deviceCheck.ok) { setNotice("Scanner unavailable. Contact a supervisor to confirm the assigned device.", "warning"); return; }
  resetFlow();
  ui.direction = null;
  ui.activeFlow = "scan";
  el.scannerHeading.textContent = "Vehicle Scan";
  setNotice("Scan the vehicle barcode, then the driver employee #.", "neutral");
  showWizardStep(0);
}

function showScannerHome() {
  resetFlow();
  ui.activeFlow = null;
  ui.direction = null;
  el.scannerHeading.textContent = "Veri-Gate";
  setScannerScreen("home");
  setNotice("Ready. Working location stays selected for this session.", "neutral");
  renderAll();
}

function setScannerScreen(name) {
  const screens = {
    home: el.scannerHome,
    wizard: el.scanWizard,
    override: el.supervisorPanel
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
  // CR-V14 item 1: every step opens scan-ready. The operator has to tap a field to get a keyboard,
  // and that choice does not carry over to the next step.
  resetScanInputModes();
  if (step === 3) renderScanSummary();
  if (step === 0) {
    el.barcodeInput.focus({ preventScroll: true });
    el.barcodeInput.scrollIntoView({ block: "center", inline: "nearest" });
  }
  if (step === 1) el.driverInput.focus();
  if (step === 2) el.directionOut.focus();
  if (step === 3) el.reviewStepTitle.focus();
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
  el.supervisorStatus.textContent = `Awaiting a valid ${OVERRIDE_MIN_ROLE} or above ID.`;
  ui.driverEntryMethod = null;
  ui.vehicleEntryMethod = null;
  ui.validatedDriverEmployee = "";
}

function clearDriverDerivedStateIfChanged(rawValue) {
  const employeeNumber = normalizeEmployee(rawValue);
  if (!ui.validatedDriverEmployee || employeeNumber === ui.validatedDriverEmployee) return false;
  ui.validatedDriverEmployee = "";
  ui.pendingOverride = null;
  ui.direction = null;
  ui.driverEntryMethod = null;
  el.transactionNote.value = "";
  el.supervisorInput.value = "";
  el.supervisorStatus.textContent = `Awaiting a valid ${OVERRIDE_MIN_ROLE} or above ID.`;
  setNotice("Driver changed. Previous authorization review and pending approval were cleared.", "warning");
  if (ui.activeFlow === "scan" && ui.step > 1) showWizardStep(1);
  return true;
}

function setScannerValue(fieldId, value) {
  const input = el[fieldId];
  if (!input) return;
  input.value = fieldId === "barcodeInput" ? canonicalVehicleBarcode(value) : value;
  recordScannerInput(fieldId, value, "Demo value");
  if (fieldId === "driverInput") { clearDriverDerivedStateIfChanged(value); updateDriverStatus(); }
  if (fieldId === "barcodeInput") updateBarcodeStatus();
  input.focus();
}

function handleScanInput(fieldId) {
  const input = el[fieldId];
  const rawValue = input.value;
  recordScannerInput(fieldId, rawValue, "Input");
  // CR-V14 item 2: these two lines used to clear the entry method on every keystroke, which was
  // right while a dialog set it to "manual" afterwards. Now the tap comes first, so clearing here
  // would erase it before the value is even typed and every movement would look scanned. resetFlow
  // clears both at the start of a movement, which is the only point they should be forgotten.
  // CR-V15: padding a part-typed barcode invents digits nobody entered, and it fought the
  // operator mid-word: typing "G0" jumped the field straight to "G0000". A scan is still
  // normalised, because that is what the padding was always for.
  if (fieldId === "barcodeInput") {
    input.value = ui.vehicleEntryMethod === "manual" ? normalize(rawValue) : canonicalVehicleBarcode(rawValue);
  }
  // The cleared-state warning must survive: updateDriverStatus would otherwise overwrite it with
  // its success notice on the very next line, and the operator would never learn that the
  // previous authorization review and pending approval were discarded.
  if (fieldId === "driverInput") { const cleared = clearDriverDerivedStateIfChanged(rawValue); updateDriverStatus({ preserveNotice: cleared }); }
  if (fieldId === "barcodeInput") updateBarcodeStatus();
}

// CR-V14 items 1 and 2: tapping a scan field is what "manual entry" means now, which is why the
// separate dialog could go. The tap both raises the keyboard and records the entry path, so the
// audit trail still distinguishes a typed movement from a scanned one.
function enableTypingOn(input) {
  if (input.getAttribute("inputmode") !== "none") return;
  input.setAttribute("inputmode", "text");
  // CR-V16: a person typing has to see what they type, so the scanned-ID mask comes off.
  input.classList.remove("id-masked");
  if (input === el.driverInput) ui.driverEntryMethod = "manual";
  if (input === el.barcodeInput) ui.vehicleEntryMethod = "manual";
  if (input === el.driverInput || input === el.barcodeInput) {
    addAudit("manual_entry_opened", `Manual entry opened for ${input === el.driverInput ? "the driver employee #" : "the vehicle barcode"}.`, currentStationIdentity(), el.scannerLocation.value);
    saveState();
  }
  // Android only re-reads inputmode when the field regains focus.
  input.blur();
  input.focus({ preventScroll: true });
}

// Back to scan-first for the next step or the next movement. The field the operator is currently
// typing in is left alone: changing a validated driver sends the wizard back to that step, and
// resetting the mode underneath them would shut the keyboard mid-word.
function resetScanInputModes() {
  [el.barcodeInput, el.driverInput, el.supervisorInput]
    .filter((input) => input !== document.activeElement)
    .forEach((input) => {
      input.setAttribute("inputmode", "none");
      // CR-V16: back to scan-first also means back to masked, for the two ID fields.
      if (input !== el.barcodeInput) input.classList.add("id-masked");
    });
}

function recordScannerInput(fieldId, rawValue, terminator) {
  const labels = {
    driverInput: "Driver Employee #",
    barcodeInput: "Vehicle Barcode",
    supervisorInput: "Approver ID"
  };
  ui.lastRawScan = rawValue || "No scan received";
  ui.lastScanField = labels[fieldId] || fieldId;
  ui.scanTerminator = terminator === "Enter" || terminator === "Tab" ? `${terminator} detected` : terminator;
}

function updateDriverStatus(options = {}) {
  const driver = findDriver(el.driverInput.value);
  if (!driver) {
    el.driverStatus.textContent = "Employee number not found in the active driver roster.";
  } else {
    const auth = findActiveAuthorization(driver.employeeNumber);
    const license = licenseStatus(driver);
    const authorizationText = auth ? `Authorized through ${formatTimestamp(auth.expiresAt)}` : "Not authorized";
    el.driverStatus.textContent = `${driver.name} - ${authorizationText}. ${license.label}.`;
    if (!options.preserveNotice) setNotice("Driver found. Choose the movement.", "success");
  }
}

// A vehicle may legitimately have no make, model, year or colour: CR-V11 creates them from a
// gate scan and CR-V14 item 10 lets a supervisor add one with only a VIN. Joining the blanks
// naively produced "G0006:   , ." on the scanner.
function vehicleDescription(vehicle) {
  const words = [vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ");
  const parts = [words, vehicle.color].filter(Boolean);
  return parts.length ? parts.join(", ") : "No details recorded";
}

function updateBarcodeStatus() {
  const value = canonicalVehicleBarcode(el.barcodeInput.value);
  const vehicle = findVehicleByBarcode(value);
  if (!value) {
    el.barcodeStatus.textContent = "Awaiting vehicle barcode scan.";
  } else if (!vehicle) {
    // CR-V11: an unknown barcode is ordinary traffic. It is added to inventory and the movement
    // continues in either direction. Neutral tone and no setNotice: the operator is not stopped.
    el.barcodeStatus.textContent = `${value}: not in inventory. It will be added automatically.`;
  } else if (!vehicle.active) {
    el.barcodeStatus.textContent = "Vehicle is inactive and cannot be used for a new movement.";
  } else {
    const vinWarning = !vehicle.vin ? "VIN not recorded yet." : vehicle.vin.length === 17 ? "VIN is 17 characters." : `VIN warning: ${vehicle.vin.length} characters.`;
    el.barcodeStatus.textContent = `${vehicle.assignedBarcode}: ${vehicleDescription(vehicle)}. VIN ${vehicle.vin || "none recorded"}; ${vehicle.plate || "No plate"}. ${vinWarning}`;
    setNotice("Vehicle found. Continue to driver.", "success");
  }
}

function updateSupervisorStatus() {
  recordScannerInput("supervisorInput", el.supervisorInput.value, "Input");
  const supervisor = state.supervisors.find((item) => item.id === canonicalSupervisorId(el.supervisorInput.value));
  if (!el.supervisorInput.value.trim()) {
    el.supervisorStatus.textContent = `Awaiting a valid ${OVERRIDE_MIN_ROLE} or above ID.`;
    return;
  }
  if (!supervisor) {
    el.supervisorStatus.textContent = "Approver ID was not found.";
    return;
  }
  if (!canApproveOverride(supervisor)) {
    el.supervisorStatus.textContent = `${supervisor.name} holds ${supervisor.role || "no role"} and cannot approve this override. ${OVERRIDE_MIN_ROLE} or above is required.`;
    return;
  }
  // CR-V16: names only on the scanner. An approver ID read off this screen could be typed in later.
  el.supervisorStatus.textContent = `${supervisor.name} (${supervisor.role}) is ready to approve.`;
  setNotice(`${OVERRIDE_MIN_ROLE} or above found. Approve the temporary authorization to continue.`, "success");
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
  if (ui.driverEntryMethod !== "manual") ui.driverEntryMethod = "scanner_field";
  updateDriverStatus();
  showWizardStep(2);
}

function validateBarcodeStep() {
  const typed = ui.vehicleEntryMethod === "manual";
  const digits = vehicleBarcodeDigits(el.barcodeInput.value);
  // CR-V15: an unfinished entry is not an unknown vehicle. Patrick's rule is that a movement is
  // never gated on whether the vehicle is known; it says nothing about accepting half a barcode,
  // and padding one to G0000 would record a barcode nobody ever saw.
  if (typed && digits.length > 0 && digits.length !== VEHICLE_BARCODE_DIGITS) {
    setNotice(`Barcode looks incomplete. Enter all ${VEHICLE_BARCODE_DIGITS} digits, for example G0001.`, "warning");
    shake(el.barcodeInput);
    el.barcodeInput.focus();
    return;
  }
  const barcode = canonicalVehicleBarcode(el.barcodeInput.value);
  el.barcodeInput.value = barcode;
  if (!barcode) {
    setNotice("Scan or enter an assigned vehicle barcode.", "warning");
    shake(el.barcodeInput);
    el.barcodeInput.focus();
    return;
  }
  const vehicle = findVehicleByBarcode(barcode);
  // CR-V13-SCANNER-ORDER-001: the vehicle is captured first, then the driver. Unknown barcodes
  // continue because CR-V11 made scan-created vehicles ordinary inventory records.
  if (vehicle && !vehicle.active) {
    setNotice("Vehicle is inactive and cannot be used for a new movement.", "danger");
    shake(el.barcodeInput);
    return;
  }
  if (ui.vehicleEntryMethod !== "manual") ui.vehicleEntryMethod = "scanner_field";
  updateBarcodeStatus();
  // CR-V15: a full-length typed barcode that is not in inventory is either a new vehicle or a
  // fat-finger, and the two are indistinguishable here. So this warns and lets them through
  // rather than blocking: the operator is the only person who still remembers what they typed.
  if (typed && !vehicle) {
    setNotice(`Check this barcode. ${barcode} is not in inventory. Continue if it is right.`, "warning");
    addAudit("typed_barcode_unverified", `Operator continued with typed barcode ${barcode}, which is not in inventory.`, currentStationIdentity(), state.workingLocation);
    saveState();
  }
  showWizardStep(1);
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

  // CR-V11: an unknown barcode is added to inventory and the movement proceeds, in either
  // direction. There is no gate, because the point is the log, not a checkpoint.
  if (!draft.vehicle) {
    draft.vehicle = createScannedVehicle(draft.barcode, {
      actor: currentStationIdentity(),
      // CR-V15: typed rather than scanned, and unknown. Worth a supervisor looking at.
      needsBarcodeReview: draft.vehicleEntryMethod === "manual"
    });
    if (!draft.vehicle) {
      setNotice("Vehicle barcode could not be read. Re-scan the vehicle.", "danger");
      return;
    }
    draft.scannerCreated = true;
  }

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
    // CR-V16: a location's scanned-badge override stands in for the daily authorization and for
    // nothing else. The license check above still applies, and a typed employee # is never covered.
    const override = scanOverrideDecision(draft);
    if (!override.applies) {
      blockOutForSupervisor(draft.driver, override.explanation);
      return;
    }
    draft.override = true;
  }
  completeTransaction(draft);
}

function blockOutForSupervisor(driver, explanation = "") {
  ui.pendingOverride = { driverEmployee: driver.employeeNumber, location: el.scannerLocation.value };
  // CR-V16: the driver's name, not the employee #, on anything the operator can read.
  el.supervisorReason.textContent = `${driver.name} is not authorized for this gate movement. Vehicle OUT is blocked until a ${OVERRIDE_MIN_ROLE} or above approves a temporary authorization.${explanation ? ` ${explanation}` : ""}`;
  el.supervisorInput.value = "";
  // This screen is reached without a wizard step, so it resets the approver field itself.
  el.supervisorInput.setAttribute("inputmode", "none");
  el.supervisorInput.classList.add("id-masked");
  el.supervisorStatus.textContent = `Awaiting a valid ${OVERRIDE_MIN_ROLE} or above ID.`;
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
  const supervisor = state.supervisors.find((item) => item.id === canonicalSupervisorId(el.supervisorInput.value));
  if (!supervisor) {
    el.supervisorStatus.textContent = "Invalid approver ID. Approval was not granted.";
    setNotice("Approver ID is not valid.", "danger");
    shake(el.supervisorInput);
    return;
  }
  // CR-V08-BETA-CRITICAL-APP-002: the rank check is enforced HERE, at the point the
  // authorization is actually granted, not only in the status text. A listed ID is not
  // sufficient; the approver must hold Fleet Lead or above.
  if (!canApproveOverride(supervisor)) {
    el.supervisorStatus.textContent = `${supervisor.name} holds ${supervisor.role || "no role"} and cannot approve a Vehicle OUT override. ${OVERRIDE_MIN_ROLE} or above is required.`;
    addAudit("override_denied_insufficient_role", `Override attempt denied: ${supervisor.id} / ${supervisor.name} holds ${supervisor.role || "no role"}, below the ${OVERRIDE_MIN_ROLE} threshold.`, currentStationIdentity(), ui.pendingOverride.location);
    saveState();
    setNotice(`Approval denied. ${OVERRIDE_MIN_ROLE} or above is required.`, "danger");
    shake(el.supervisorInput);
    return;
  }
  const driver = findDriver(ui.pendingOverride.driverEmployee);
  const duration = selectedDuration(el.supervisorDuration);
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
  el.supervisorStatus.textContent = `${supervisor.name} approved ${humanDuration(duration)}. Continuing to review.`;
  setNotice(`Supervisor approved ${humanDuration(duration)}. Vehicle OUT can continue.`, "success");
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
  const barcode = canonicalVehicleBarcode(el.barcodeInput.value);
  if (!barcode) {
    setNotice("A vehicle barcode must be scanned before submitting.", "warning");
    return null;
  }
  // CR-V08-BETA-CRITICAL-APP-001: an unknown barcode yields a null vehicle here. startTransaction
  // decides what that means based on direction; it is never an implicit rejection.
  if (vehicle && !vehicle.active) {
    setNotice("An active vehicle barcode must be scanned before submitting.", "warning");
    return null;
  }
  if (!el.scannerLocation.value || !ui.direction) return null;
  if (!isNewEntryMethod(ui.driverEntryMethod) || !isNewEntryMethod(ui.vehicleEntryMethod)) {
    setNotice("Driver and vehicle entry methods must be recorded before submitting.", "warning");
    return null;
  }
  return { driver, vehicle: vehicle || null, barcode, location: el.scannerLocation.value, direction: ui.direction, note: el.transactionNote.value.trim(), driverEntryMethod: ui.driverEntryMethod, vehicleEntryMethod: ui.vehicleEntryMethod };
}

function completeTransaction(draft) {
  const auth = findActiveAuthorization(draft.driver.employeeNumber);
  const authorizationStatus = auth ? "Authorized" : draft.override ? LOCATION_OVERRIDE_STATUS : "Unauthorized";
  const note = draft.direction === "IN" && !auth
    ? [draft.note, "Unauthorized IN - operational review"].filter(Boolean).join(" | ")
    : draft.note;
  const device = currentDevice();
  const transaction = {
    id: makeId("tx"),
    // CR-V17 step 3: the id the shared database knows this movement by. It is made here, on the
    // device, so an upload retried after a dropped signal is recognised instead of recorded twice.
    // Never inside the test harness: a movement with no id can never be queued or uploaded.
    clientId: IN_TEST_HARNESS || DEMO_MODE ? undefined : window.VeriGateCloud ? window.VeriGateCloud.movementId() : makeId("m"),
    sync: "local",
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
    driverEntryMethod: draft.driverEntryMethod,
    vehicleEntryMethod: draft.vehicleEntryMethod,
    barcodeEntryMethod: draft.vehicleEntryMethod,
    // The authorization this device relied on, sent with the movement. Until authorizations are
    // written to the shared records, it is how the server tells "authorized on the device" apart
    // from "not authorized" instead of flagging both the same way.
    deviceAuthorization: auth ? { validFrom: auth.validFrom, expiresAt: auth.expiresAt, authorizedBy: auth.authorizedBy } : null
  };
  if (device) { device.lastUsedAt = transaction.timestamp; device.lastTransactionLocation = draft.location; device.updatedAt = transaction.timestamp; }
  state.transactions.unshift(transaction);
  const auditBefore = state.auditEvents.length;
  // CR-V08-BETA-CRITICAL-APP-001: bind the provisional record to the inbound event that created
  // it, so the audit trail shows where an auto-created vehicle came from.
  if (draft.scannerCreated) {
    draft.vehicle.provisionalFromTxId = transaction.id;
    addAudit(
      "vehicle_added_by_scan",
      `Vehicle ${draft.vehicle.assignedBarcode} was not in inventory and was added automatically from a gate scan. Transaction ${transaction.id}; entry path: ${entryMethodLabel(draft.vehicleEntryMethod)}; device ${transaction.deviceName || transaction.deviceId || "unassigned"}; operator ${transaction.submittedBy}.`,
      currentStationIdentity(),
      draft.location
    );
  }
  addAudit(
    draft.direction === "OUT" ? "out_transaction" : "in_transaction",
    `Vehicle ${draft.direction} recorded for ${draft.driver.employeeNumber} / ${draft.vehicle.assignedBarcode}. Driver entry path: ${entryMethodLabel(draft.driverEntryMethod)}; vehicle entry path: ${entryMethodLabel(draft.vehicleEntryMethod)}.`,
    currentStationIdentity(),
    draft.location
  );
  if (draft.override) {
    addAudit("location_override_exit", `Vehicle OUT allowed by the scanned-badge override at ${draft.location} for ${draft.driver.employeeNumber} / ${draft.vehicle.assignedBarcode}. The driver had no daily authorization.`, currentStationIdentity(), draft.location);
  }
  if (draft.direction === "IN" && authorizationStatus === "Unauthorized") {
    addAudit("unauthorized_in_review", "Unauthorized IN - operational review.", currentStationIdentity(), draft.location);
  }
  // Tie this movement's own audit entries to it, so they are trimmed with it and never before it.
  state.auditEvents.slice(0, state.auditEvents.length - auditBefore).forEach((event) => { event.movementClientId = transaction.clientId; });
  saveState();
  renderAll();
  // 081526 v7 edit #9: a clean submission returns straight to the start page for the next scan.
  // The operator has no time to read a post-submit review, and the extra tap cost every
  // transaction. The pre-submit review step (step 3) is unchanged — that is the real check.
  showScannerHome();
  setNotice(`Vehicle ${draft.direction} saved for ${transaction.driverName} / ${transaction.vehicleBarcode}${draft.override ? " under the location override" : ""}.`, "success");
  ui.lastSubmittedClientId = transaction.clientId;
  syncDevice();
}

// CR-V17 steps 3 and 4: sending movements to the shared database.
//
// Every movement is saved on this device before any of this runs, so the gate never waits for the
// network - Patrick: outages "could be minutes or days" and "Enterprise will not tolerate a pause".
// What has not been sent yet waits here and goes, oldest first, the next time there is a signal
// and a sign-in: straight after a scan, when the signal comes back, when someone signs in, and
// once a minute while anything is waiting.
const SYNC_WAITING = ["local", "pending", "sending"];
const SYNC_RETRY_MS = 60000;
let syncRunning = false;

// Only movements made with a device id are ever sent. The demo seed and records made before step 3
// have none, and the shared database has its own copy of the seed.
function queuedMovements() {
  return state.transactions.filter((item) => item.clientId && SYNC_WAITING.includes(item.sync)).reverse();
}

function refusedMovements() {
  return state.transactions.filter((item) => item.clientId && item.sync === "refused");
}

function movementPayload(transaction) {
  return {
    clientId: transaction.clientId,
    direction: transaction.direction,
    driverEmployee: transaction.driverEmployee,
    vehicleBarcode: transaction.vehicleBarcode,
    location: transaction.location,
    workingLocation: transaction.workingLocation || transaction.location,
    authorizationStatus: transaction.authorizationStatus,
    driverEntryMethod: transaction.driverEntryMethod,
    vehicleEntryMethod: transaction.vehicleEntryMethod,
    submittedBy: transaction.submittedBy,
    note: transaction.note,
    deviceId: transaction.deviceId,
    occurredAt: transaction.timestamp,
    deviceAuthorization: transaction.deviceAuthorization || null
  };
}

// The operator only hears about the movement they just recorded. A backlog clearing in the
// background is shown by the waiting count going down, not by notices interrupting the next scan.
function isLatestSubmission(transaction) {
  return Boolean(ui.lastSubmittedClientId) && transaction.clientId === ui.lastSubmittedClientId;
}

function markShared(transaction, result) {
  const cloud = window.VeriGateCloud;
  transaction.sync = "shared";
  transaction.serverId = result.id;
  transaction.serverConflict = result.conflict || "";
  transaction.syncError = "";
  if (result.conflict) {
    // The vehicle moved either way. The disagreement is recorded for a supervisor to review,
    // which is the only change the shared records allow on a movement that is already written.
    const flagged = addAudit("movement_flagged_by_records",
      `Shared records flagged ${transaction.direction} for ${transaction.driverEmployee} / ${transaction.vehicleBarcode}: ${cloud.conflictText(result.conflict)}.`,
      transaction.submittedBy, transaction.location);
    flagged.movementClientId = transaction.clientId;
    if (isLatestSubmission(transaction)) setNotice(`Saved and shared, but flagged for review: ${cloud.conflictText(result.conflict)}.`, "warning");
  } else if (isLatestSubmission(transaction) && !result.alreadyRecorded) {
    setNotice(`Vehicle ${transaction.direction} saved for ${transaction.driverName} / ${transaction.vehicleBarcode}. In the shared records.`, "success");
  }
}

function markRefused(transaction, error) {
  transaction.sync = "refused";
  transaction.syncError = error.message;
  const refusal = addAudit("movement_refused_by_records",
    `Shared records refused ${transaction.direction} for ${transaction.driverEmployee} / ${transaction.vehicleBarcode}: ${error.message} The movement is kept on this device.`,
    transaction.submittedBy, transaction.location);
  refusal.movementClientId = transaction.clientId;
  if (isLatestSubmission(transaction)) setNotice(`Saved on this device, but the shared records refused it: ${error.message}`, "danger");
}

function syncDevice() {
  if (syncQueue().length === 0 && waitingAuditEntries().length === 0) return Promise.resolve(null);
  if (syncRunning || !cloudReady()) {
    renderSyncStatus();
    return Promise.resolve(null);
  }
  // No point sending with no signal; the "online" event brings us back here.
  if (typeof navigator !== "undefined" && navigator.onLine === false) {
    renderSyncStatus();
    return Promise.resolve(null);
  }
  const cloud = window.VeriGateCloud;
  const waiting = syncQueue();
  syncRunning = true;
  waiting.forEach((item) => { item.sync = "sending"; });
  return cloud.drainQueue(waiting, (item) => (item.change ? cloud.recordChange(changePayload(item)) : cloud.recordMovement(movementPayload(item))), {
    sent: (item, result) => (item.change ? markChangeShared(item, result) : markShared(item, result)),
    refused: (item, error) => (item.change ? markChangeRefused(item, error) : markRefused(item, error))
  }).then((summary) => {
    // Everything the queue did not reach goes back to waiting, with the reason it stopped.
    const reason = syncStopReason(summary.stopped);
    waiting.forEach((item) => {
      if (item.sync !== "sending") return;
      item.sync = "pending";
      item.syncError = reason;
    });
    const latest = waiting.find(isLatestSubmission);
    if (summary.stopped && latest && latest.sync === "pending") {
      setNotice(`Saved on this device. Not in the shared records yet: ${reason} It will be sent automatically.`, "warning");
    }
    // History entries last: nothing waits on them, and the entries the queue itself just wrote
    // (a flag, a refusal) go in the same pass.
    return summary.stopped ? summary : sendAuditEntries().then(() => summary);
  }).catch((error) => {
    // A bug in a handler must never lose a movement: anything mid-send goes back to waiting.
    waiting.forEach((item) => { if (item.sync === "sending") item.sync = "pending"; });
    state.auditEvents.forEach((item) => { if (item.sync === "sending") item.sync = "pending"; });
    return { sent: 0, refused: 0, stopped: { action: "retry", error } };
  }).then((summary) => {
    syncRunning = false;
    saveState();
    renderAll();
    // What was just sent is now the shared version; read it back, with anything other devices did.
    if (summary && summary.sent) pullReference();
    return summary;
  });
}

// Why the queue stopped, in the words the scanner shows. The error messages themselves are written
// for other screens ("the records on this device are still available" belongs on Search).
function syncStopReason(stopped) {
  if (!stopped) return "";
  const kind = stopped.error && stopped.error.kind;
  if (stopped.action === "signin") return "the sign-in has expired.";
  if (kind === "offline") return "there is no connection.";
  if (kind === "waking") return "the shared database is waking up.";
  return (stopped.error && stopped.error.message) || "the shared records did not answer.";
}

function countText(movements, changes) {
  const parts = [];
  if (movements) parts.push(`${movements} movement${movements === 1 ? "" : "s"}`);
  if (changes) parts.push(`${changes} change${changes === 1 ? "" : "s"} to drivers, vehicles or authorizations`);
  return parts.join(" and ");
}

function renderSyncStatus() {
  renderCloudPill();
  if (!el.syncStatus) return;
  const queue = syncQueue();
  const waiting = queue.length;
  const waitingMovements = queuedMovements().length;
  const refusedMovementCount = refusedMovements().length;
  const refusedChangeCount = refusedChanges().length;
  const refused = refusedMovementCount + refusedChangeCount;
  const parts = [];
  if (waiting) {
    // A phone can believe it has signal while nothing gets through (a gate Wi-Fi with no
    // internet). The last failed attempt is the better guide than the phone's own opinion.
    const lastFailure = queue.map((item) => item.syncError).find(Boolean);
    const why = !cloudReady()
      ? ui.shell === "scanner" ? "This phone is not signed in; ask the Admin (Phone sign-in, below)." : "Sign in to send them."
      : typeof navigator !== "undefined" && navigator.onLine === false
        ? "They will be sent when the signal returns."
        : lastFailure
          ? `The last try failed: ${lastFailure} Trying again every minute.`
          : "Sending automatically.";
    parts.push(`${countText(waitingMovements, waiting - waitingMovements)} waiting to reach the shared records. ${why}`);
  }
  if (refused) parts.push(`${countText(refusedMovementCount, refusedChangeCount)} refused by the shared records - a supervisor needs to review ${refused === 1 ? "it" : "them"}.`);
  el.syncStatus.textContent = parts.join(" ");
  el.syncStatus.classList.toggle("hidden", parts.length === 0);
  el.syncStatus.dataset.tone = refused ? "danger" : waiting ? "warning" : "";
}

function startSync() {
  // A movement that was mid-send when the app closed was never confirmed, so it is sent again.
  // The device id makes that safe: if it did arrive, the server says so and nothing is doubled.
  let recovered = 0;
  state.transactions.concat(state.outbox || [], state.auditEvents).forEach((item) => {
    if (item.sync === "sending") { item.sync = "pending"; recovered += 1; }
  });
  if (recovered) saveState();
  window.addEventListener("online", () => { syncDevice(); });
  window.addEventListener("offline", renderSyncStatus);
  // Another tab of the console saved: take in anything it recorded, so neither erases the other.
  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEY || !event.newValue) return;
    if (mergeFromStorage()) renderAll();
  });
  setInterval(() => {
    if (syncQueue().length || waitingAuditEntries().length) syncDevice();
    else if (pullIsDue() && pageIsVisible()) pullReference();
  }, SYNC_RETRY_MS);
  // Coming back to a console left in another window: catch up at once rather than within five minutes.
  document.addEventListener("visibilitychange", () => {
    if (pageIsVisible() && ui.referencePulledAt && Date.now() - ui.referencePulledAt > SYNC_RETRY_MS) pullReference();
  });
  renderSyncStatus();
}

// --- CR-V17: drivers, vehicles, authorizations and override switches, shared --------------
//
// Until now only movements reached the shared records. A driver added on the console was unknown to
// the server, so every movement for that driver was refused; an authorization a Fleet Lead gave at
// the gate was unknown too, so the movement it allowed was flagged. The review after step 4 put this
// first.
//
// Two halves. Out: every save compares these records with how they stood at the last save, and each
// one that changed is queued in the outbox, then sent in the same line as the movements, oldest
// first - so the authorization a Fleet Lead gave reaches the server before the OUT it allowed. It
// catches every change whichever screen made it, including screens not written yet. In: the device
// reads the shared records every few minutes and after it sends anything, and takes in what other
// devices changed. Anything still waiting to be sent from this device is left alone until it has.

const REFERENCE_PULL_MS = 5 * 60000;
const SHARED_CHANGE_KEEP_MS = 86400000;
const SHARED_KIND_ORDER = ["driver", "vehicle", "authorization", "location"];
const AUTHORIZATION_HISTORY_DAYS = 3;
const AUDIT_BATCH = 50;

function waitingAuditEntries() {
  return state.auditEvents.filter((event) => SYNC_WAITING.includes(event.sync)).reverse();
}

// The device's history entries, oldest first, 50 to a request. A batch the server will never accept
// is set aside rather than retried forever; one that could not get through stops until next time.
function sendAuditEntries() {
  const cloud = window.VeriGateCloud;
  const batch = waitingAuditEntries().slice(0, AUDIT_BATCH);
  if (!batch.length || !cloud || typeof cloud.recordAuditEntries !== "function") return Promise.resolve();
  batch.forEach((event) => { event.sync = "sending"; });
  const entries = batch.map((event) => ({ clientId: event.id, type: event.type, description: event.description, actor: event.actor, location: event.location, source: event.source, occurredAt: event.timestamp }));
  return cloud.recordAuditEntries(entries).then(() => {
    batch.forEach((event) => { event.sync = "shared"; });
    return sendAuditEntries();
  }, (error) => {
    const refused = cloud.failureAction(error) === "refuse";
    batch.forEach((event) => { event.sync = refused ? "refused" : "pending"; });
  });
}

function isoOrEmpty(value) {
  if (!value) return "";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toISOString();
}

// "S2040 / Jordan Wells" is how a gate approval names its approver.
function approverBadgeFrom(authorizedBy) {
  const match = /^(S\d+)\s*\//.exec(String(authorizedBy || ""));
  return match ? match[1] : "";
}

// What each record looks like to the shared records, and so what counts as a change to it.
function driverRecord(driver) {
  return { employeeNumber: driver.employeeNumber, name: driver.name, licenseExpires: dateKey(new Date(driver.licenseExpires)), active: driver.active !== false };
}

function vehicleRecord(vehicle) {
  return {
    id: vehicle.id, assignedBarcode: vehicle.assignedBarcode, vin: vehicle.vin || "", plate: vehicle.plate || "",
    make: vehicle.make || "", model: vehicle.model || "", year: vehicle.year || "", color: vehicle.color || "",
    active: vehicle.active !== false, barcodeNeedsReview: vehicle.barcodeNeedsReview === true,
    createdSource: vehicle.createdSource === SCAN_CREATED_SOURCE ? SCAN_CREATED_SOURCE : "supervisor"
  };
}

function authorizationRecord(auth) {
  return {
    id: auth.id, driverEmployee: auth.driverEmployee, type: auth.type,
    validFrom: isoOrEmpty(auth.validFrom), expiresAt: isoOrEmpty(auth.expiresAt),
    // Running out is not news: every device and the server work that out from the clock. Only an
    // authorization somebody ended is a change worth sending.
    status: auth.status === "expired" ? "active" : auth.status,
    authorizedBy: auth.authorizedBy || "", revokedBy: auth.revokedBy || "", revokedAt: isoOrEmpty(auth.revokedAt),
    revocationReason: auth.revocationReason || "", location: auth.location || "", actionLocation: auth.actionLocation || ""
  };
}

function locationRecord(location) {
  const override = normalizeScanOverride(location.scanOverride);
  return { name: location.name, scanOverride: { enabled: override.enabled, changedBy: override.changedBy, changedAt: isoOrEmpty(override.changedAt) } };
}

const SHARED_KINDS = {
  driver: { list: () => state.drivers, id: (item) => item.employeeNumber, record: driverRecord },
  vehicle: { list: () => state.vehicles, id: (item) => item.id, record: vehicleRecord },
  authorization: { list: () => state.authorizations, id: (item) => item.id, record: authorizationRecord },
  location: { list: () => state.locations, id: (item) => item.name, record: locationRecord }
};

function sharedKey(kind, id) {
  return `${kind}:${id}`;
}

function sharingChanges() {
  // Never inside the validator: its test records must not become anybody's shared records.
  return !IN_TEST_HARNESS && !DEMO_MODE && Boolean(window.VeriGateCloud);
}

// What is remembered about each record's last shared state: a fingerprint, not a copy. With the whole
// vehicle inventory on every phone, a copy of each record doubled what the phone had to hold. A
// vehicle's also carries its barcode, since a change of barcode has to say what it was before.
function fingerprint(text) {
  let first = 0x811c9dc5;
  let second = 0x01000193;
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index);
    first = Math.imul(first ^ code, 0x01000193) >>> 0;
    second = Math.imul(second ^ code, 0x5bd1e995) >>> 0;
  }
  return first.toString(36) + second.toString(36);
}

function shadowValue(kind, record) {
  const print = fingerprint(JSON.stringify(record));
  return kind === "vehicle" ? `${print}|${record.assignedBarcode}` : print;
}

// Bookkeeping from the build that stored whole records is read in the new form, unchanged in meaning.
function currentShadow(kind, key) {
  const stored = state.refShadow[key];
  if (typeof stored === "string" && stored.startsWith("{")) {
    try { state.refShadow[key] = shadowValue(kind, JSON.parse(stored)); } catch (error) { delete state.refShadow[key]; }
  }
  return state.refShadow[key];
}

// Marks a record as agreeing with the shared records, so it is not sent back as a change.
function settleShared(kind, item) {
  state.refShadow[sharedKey(kind, SHARED_KINDS[kind].id(item))] = shadowValue(kind, SHARED_KINDS[kind].record(item));
}

// Only what the server needs beyond the record itself: which shared vehicle this is, and who
// approved an authorization.
function changeData(kind, item, record, before) {
  const data = { ...record };
  if (kind === "vehicle") {
    data.serverId = item.serverId || null;
    const previousBarcode = before ? String(before).split("|")[1] : "";
    if (previousBarcode && previousBarcode !== record.assignedBarcode) data.previousBarcode = previousBarcode;
  }
  if (kind === "authorization") {
    data.approverBadge = approverBadgeFrom(item.authorizedBy);
    const approver = data.approverBadge ? (state.supervisors || []).find((supervisor) => supervisor.id === data.approverBadge) : null;
    // A badge approval's rank is checked by the server against its own approver list. The console
    // has no sign-in of its own yet (step 5), so what it grants is recorded as a Supervisor's.
    data.authorizedRole = approver ? approver.role : "Supervisor";
  }
  return data;
}

function recordLocalChanges() {
  if (!sharingChanges()) return 0;
  if (!Array.isArray(state.outbox)) state.outbox = [];
  // The records this device already held when sharing began are not news to anybody; the first
  // read of the shared records settles them. Only what changes after that is sent.
  const first = !state.refShadow || typeof state.refShadow !== "object";
  if (first) state.refShadow = {};
  let queued = 0;
  SHARED_KIND_ORDER.forEach((kind) => {
    const spec = SHARED_KINDS[kind];
    const items = (spec.list() || []).slice();
    // Oldest first, so a replaced authorization is ended before the one replacing it arrives.
    if (kind === "authorization") items.sort((a, b) => new Date(a.validFrom) - new Date(b.validFrom));
    items.forEach((item) => {
      const key = sharedKey(kind, spec.id(item));
      const record = spec.record(item);
      const print = shadowValue(kind, record);
      const before = currentShadow(kind, key);
      if (before === print) return;
      state.refShadow[key] = print;
      if (first) return;
      state.outbox.push({ id: window.VeriGateCloud.changeId(), change: true, kind, key, data: changeData(kind, item, record, before), queuedAt: new Date().toISOString(), sync: "local", syncError: "" });
      queued += 1;
    });
  });
  return queued;
}

function queuedChanges() {
  return (state.outbox || []).filter((item) => SYNC_WAITING.includes(item.sync));
}

function refusedChanges() {
  return (state.outbox || []).filter((item) => item.sync === "refused");
}

// Movements and changes in one line, in the order they happened. A change and a movement in the
// same millisecond: the change goes first, since the movement may rely on it.
function syncQueue() {
  const at = (item) => new Date(item.change ? item.queuedAt : item.timestamp).getTime() || 0;
  return queuedMovements().concat(queuedChanges())
    .sort((a, b) => (at(a) - at(b)) || ((a.change ? 0 : 1) - (b.change ? 0 : 1)));
}

function changePayload(change) {
  return { clientId: change.id, kind: change.kind, occurredAt: change.queuedAt, data: change.data };
}

function changeLabel(change) {
  const data = change.data || {};
  if (change.kind === "driver") return `driver ${data.employeeNumber}`;
  if (change.kind === "vehicle") return `vehicle ${data.assignedBarcode}`;
  if (change.kind === "authorization") return `the authorization for ${data.driverEmployee}`;
  return `the override switch at ${data.name}`;
}

function markChangeShared(change, result) {
  change.sync = "shared";
  change.sharedAt = new Date().toISOString();
  change.outcome = result.outcome;
  change.syncError = "";
  if (change.kind === "authorization") {
    const auth = state.authorizations.find((item) => item.id === change.data.id);
    if (auth) auth.shared = true;
  }
  if (result.outcome === "superseded") {
    // Not an error: another device changed the same record later, and the later edit stands. The
    // next read brings it here, replacing this device's older one.
    addAudit("change_superseded_by_records", `A later edit of ${changeLabel(change)} was already in the shared records, so it stands and this device's earlier edit does not.`, "Shared records", "");
  }
}

function markChangeRefused(change, error) {
  change.sync = "refused";
  change.syncError = error.message;
  addAudit("change_refused_by_records", `The shared records refused a change to ${changeLabel(change)}: ${error.message} Every device, this one included, keeps the shared version.`, "Shared records", "");
  setNotice(`The shared records refused a change to ${changeLabel(change)}: ${error.message}`, "danger");
}

// Another tab of the console queued a change this tab has not seen. It is applied here too, so the
// two tabs agree now rather than at the next read of the shared records.
function applyChangeLocally(change) {
  const data = change.data || {};
  if (change.kind === "driver") {
    const fields = { name: data.name, licenseExpires: new Date(`${data.licenseExpires}T12:00:00`).toISOString(), active: data.active !== false };
    let driver = findDriverAny(data.employeeNumber);
    if (!driver) { driver = { employeeNumber: data.employeeNumber, createdAt: change.queuedAt, createdBy: "Another tab" }; state.drivers.push(driver); }
    Object.assign(driver, fields, { updatedAt: change.queuedAt, updatedBy: "Another tab" });
    settleShared("driver", driver);
  } else if (change.kind === "vehicle") {
    let vehicle = state.vehicles.find((item) => item.id === data.id);
    // A vehicle met at the gate is listed under "added by a gate scan", which shows when it was
    // added. The change carries no such date, so it is taken from when the other tab queued it.
    if (!vehicle) { vehicle = normalizeVehicle({ id: data.id, createdAt: change.queuedAt, createdBy: "Another tab", createdSource: data.createdSource, provisionalAt: data.createdSource === SCAN_CREATED_SOURCE ? change.queuedAt : "" }, state.vehicles.length); state.vehicles.push(vehicle); }
    Object.assign(vehicle, { assignedBarcode: data.assignedBarcode, vin: data.vin, plate: data.plate, make: data.make, model: data.model, year: data.year, color: data.color, active: data.active !== false, barcodeNeedsReview: data.barcodeNeedsReview === true, createdSource: data.createdSource, updatedAt: change.queuedAt, updatedBy: "Another tab" });
    settleShared("vehicle", vehicle);
  } else if (change.kind === "authorization") {
    let auth = state.authorizations.find((item) => item.id === data.id);
    if (!auth) { auth = { id: data.id, driverEmployee: data.driverEmployee, type: data.type, validFrom: data.validFrom, expiresAt: data.expiresAt, authorizedBy: data.authorizedBy, authorizedAt: data.validFrom, scopeType: "all_current_locations", scopeIds: [], createdAt: change.queuedAt }; state.authorizations.unshift(auth); }
    Object.assign(auth, { status: data.status, revokedBy: data.revokedBy, revokedAt: data.revokedAt, revocationReason: data.revocationReason, location: data.location, actionLocation: data.actionLocation, updatedAt: change.queuedAt });
    settleShared("authorization", auth);
  } else if (change.kind === "location") {
    const location = state.locations.find((item) => item.name === data.name);
    if (!location) return;
    location.scanOverride = normalizeScanOverride(data.scanOverride);
    settleShared("location", location);
  }
}

function mergeChanges(incoming) {
  if (!Array.isArray(incoming)) return 0;
  if (!Array.isArray(state.outbox)) state.outbox = [];
  const known = new Map(state.outbox.map((item) => [item.id, item]));
  let added = 0;
  incoming.forEach((item) => {
    if (!item || !item.id || !item.change) return;
    const mine = known.get(item.id);
    if (mine) {
      // Another tab may already have sent it: take its word rather than send it again.
      if ((SYNC_RANK[item.sync] || 0) > (SYNC_RANK[mine.sync] || 0)) Object.assign(mine, { sync: item.sync, sharedAt: item.sharedAt, outcome: item.outcome, syncError: item.syncError });
      return;
    }
    state.outbox.push(item);
    added += 1;
    // Only a change still on its way is news. One already sent is in the shared records, and the
    // next read brings it; applying it again here could undo something newer.
    const newerHere = state.outbox.some((other) => other !== item && other.key === item.key && other.queuedAt > item.queuedAt);
    if (SYNC_WAITING.includes(item.sync) && !newerHere && state.refShadow) applyChangeLocally(item);
  });
  return added;
}

// A value from the shared records differs from this device's copy.
function differs(target, fields) {
  return Object.keys(fields).some((key) => JSON.stringify(target[key]) !== JSON.stringify(fields[key]));
}

// Takes in the shared records. Returns how many records changed here.
function applyReference(reference, startedAt) {
  if (!reference || typeof reference !== "object") return 0;
  // Anything changed here since the last save is queued first, so it counts as waiting below.
  recordLocalChanges();
  if (!state.refShadow) return 0;
  // Left alone: records with a change still on its way from this device, and records whose change
  // arrived while this read was under way, since the read may predate it. The next read settles them.
  const busy = new Set((state.outbox || [])
    .filter((item) => SYNC_WAITING.includes(item.sync) || (item.sharedAt && new Date(item.sharedAt).getTime() >= startedAt))
    .map((item) => item.key));
  const isBusy = (kind, id) => busy.has(sharedKey(kind, id));
  const now = new Date().toISOString();
  let changed = 0;

  // An empty list is read as "nothing shared yet" rather than "delete everything": a new database
  // must not wipe a device's roster before the import (step 6) has filled it.
  const drivers = Array.isArray(reference.drivers) ? reference.drivers : [];
  if (drivers.length) {
    const seen = new Set();
    drivers.forEach((row) => {
      const employeeNumber = canonicalEmployeeId(row.employee_number);
      seen.add(employeeNumber);
      if (isBusy("driver", employeeNumber)) return;
      const fields = { employeeNumber, name: String(row.name || ""), licenseExpires: new Date(`${row.license_expires}T12:00:00`).toISOString(), active: row.active !== false };
      let driver = findDriverAny(employeeNumber);
      if (!driver) {
        driver = { ...fields, createdAt: isoOrEmpty(row.updated_at) || now, updatedAt: isoOrEmpty(row.updated_at) || now, createdBy: "Shared records", updatedBy: "Shared records" };
        state.drivers.push(driver);
        changed += 1;
      } else if (differs(driver, fields)) {
        Object.assign(driver, fields, { updatedAt: isoOrEmpty(row.updated_at) || now, updatedBy: "Shared records" });
        changed += 1;
      }
      settleShared("driver", driver);
    });
    const before = state.drivers.length;
    state.drivers = state.drivers.filter((driver) => seen.has(driver.employeeNumber) || isBusy("driver", driver.employeeNumber));
    changed += before - state.drivers.length;
  }

  const vehicles = Array.isArray(reference.vehicles) ? reference.vehicles : [];
  if (vehicles.length) {
    const kept = new Set();
    vehicles.forEach((row) => {
      const serverId = Number(row.id);
      const barcode = canonicalVehicleBarcode(row.assigned_barcode);
      // The same car may carry a different id here: the one this device gave it, or none yet.
      let vehicle = (row.client_id && state.vehicles.find((item) => item.id === row.client_id))
        || state.vehicles.find((item) => Number(item.serverId) === serverId)
        || state.vehicles.find((item) => item.assignedBarcode === barcode && !kept.has(item) && !item.serverId)
        || null;
      if (vehicle && isBusy("vehicle", vehicle.id)) { kept.add(vehicle); return; }
      const id = row.client_id || (vehicle ? vehicle.id : `srv-veh-${serverId}`);
      const fields = {
        assignedBarcode: barcode, vin: normalize(row.vin), plate: normalize(row.plate), make: row.make || "", model: row.model || "",
        year: Number(row.year) || "", color: row.color || "", active: row.active !== false, barcodeNeedsReview: row.barcode_needs_review === true,
        createdSource: row.created_source || "supervisor", serverId
      };
      if (!vehicle) {
        vehicle = { id, ...fields, createdAt: isoOrEmpty(row.added_at) || now, updatedAt: now, createdBy: "Shared records", updatedBy: "Shared records", removedAt: isoOrEmpty(row.removed_at), removedBy: row.removed_by || "", reactivatedAt: "", inventoryStatus: COMPLETE_STATUS, needsSupervisorCompletion: false, provisionalFromTxId: "", provisionalAt: isoOrEmpty(row.added_at), completedBy: "", completedAt: "" };
        state.vehicles.push(vehicle);
        changed += 1;
      } else {
        // Every device ends up calling the car by the id the shared records hold for it.
        if (vehicle.id !== id) { delete state.refShadow[sharedKey("vehicle", vehicle.id)]; vehicle.id = id; changed += 1; }
        if (differs(vehicle, fields)) {
          Object.assign(vehicle, fields, { updatedAt: now, updatedBy: "Shared records", removedAt: isoOrEmpty(row.removed_at) || vehicle.removedAt || "", removedBy: row.removed_by || vehicle.removedBy || "" });
          changed += 1;
        }
      }
      kept.add(vehicle);
      settleShared("vehicle", vehicle);
    });
    const before = state.vehicles.length;
    state.vehicles = state.vehicles.filter((vehicle) => kept.has(vehicle) || isBusy("vehicle", vehicle.id));
    changed += before - state.vehicles.length;
  }

  const authorizations = Array.isArray(reference.authorizations) ? reference.authorizations : [];
  const seenAuthorizations = new Set();
  authorizations.forEach((row) => {
    const id = row.client_id || `srv-auth-${row.id}`;
    seenAuthorizations.add(id);
    if (isBusy("authorization", id)) return;
    let auth = state.authorizations.find((item) => item.id === id);
    const fields = {
      driverEmployee: canonicalEmployeeId(row.driver_employee),
      type: AUTHORIZATION_DURATIONS.includes(row.duration) ? row.duration : TEMP_AUTHORIZATION_DURATION,
      validFrom: isoOrEmpty(row.valid_from || row.authorized_at), expiresAt: isoOrEmpty(row.expires_at),
      // One this device has already seen run out stays "expired" here; the server never marks that.
      status: auth && auth.status === "expired" && row.status === "active" ? "expired" : row.status || "active",
      authorizedBy: row.authorized_by || "", revokedBy: row.revoked_by || "", revokedAt: isoOrEmpty(row.revoked_at),
      revocationReason: row.revocation_reason || "", location: row.location || "", actionLocation: row.action_location || row.location || ""
    };
    if (!auth) {
      auth = { id, ...fields, authorizedAt: isoOrEmpty(row.authorized_at) || fields.validFrom, scopeType: row.scope_type || "all_current_locations", scopeIds: [], createdAt: fields.validFrom, updatedAt: now };
      state.authorizations.push(auth);
      changed += 1;
    } else if (differs(auth, fields)) {
      Object.assign(auth, fields, { updatedAt: now });
      changed += 1;
    }
    auth.shared = true;
    settleShared("authorization", auth);
  });
  // An authorization this device holds as active that the shared records do not list is one they
  // never had. Ended ones are kept as this device's history.
  const beforeAuthorizations = state.authorizations.length;
  state.authorizations = state.authorizations.filter((auth) => seenAuthorizations.has(auth.id) || auth.status !== "active" || isBusy("authorization", auth.id));
  changed += beforeAuthorizations - state.authorizations.length;
  state.authorizations.sort((a, b) => new Date(b.validFrom) - new Date(a.validFrom));

  (Array.isArray(reference.locations) ? reference.locations : []).forEach((row) => {
    const name = normalizeLocationName(row.name);
    if (!name || isBusy("location", name)) return;
    const fields = {
      active: row.active !== false,
      historicalOnly: row.historical_only === true,
      scanOverride: { enabled: row.scan_override_enabled === true, changedBy: row.scan_override_changed_by || "", changedAt: isoOrEmpty(row.scan_override_changed_at) }
    };
    let location = state.locations.find((item) => item.name === name);
    if (!location) {
      location = { name, ...fields };
      state.locations.push(location);
      changed += 1;
    } else if (differs(location, fields)) {
      Object.assign(location, fields);
      changed += 1;
    }
    settleShared("location", location);
  });

  // The badges that can approve at the gate. Read only: they are not edited on any device.
  const approvers = (Array.isArray(reference.approvers) ? reference.approvers : [])
    .map((row) => ({ id: canonicalSupervisorId(row.badge_id), name: String(row.name || ""), role: DESKTOP_USER_ROLES.includes(row.role) ? row.role : OVERRIDE_MIN_ROLE }));
  if (approvers.length && JSON.stringify(approvers) !== JSON.stringify(state.supervisors)) {
    state.supervisors = approvers;
    changed += 1;
  }
  return changed;
}

let pullRunning = false;

function pullReference() {
  if (pullRunning || !cloudReady() || IN_TEST_HARNESS) return Promise.resolve(null);
  if (typeof navigator !== "undefined" && navigator.onLine === false) return Promise.resolve(null);
  pullRunning = true;
  const startedAt = Date.now();
  return window.VeriGateCloud.reference().then((reference) => {
    const changed = applyReference(reference, startedAt);
    ui.referencePulledAt = Date.now();
    ui.referenceError = "";
    if (changed) {
      saveState();
      renderAll();
    }
    return changed;
  }).catch((error) => {
    // The device keeps working from its own copy; the next read tries again.
    ui.referenceError = error.message || "The shared records did not answer.";
    return null;
  }).then((result) => {
    pullRunning = false;
    return result;
  });
}

function pullIsDue() {
  return !ui.referencePulledAt || Date.now() - ui.referencePulledAt >= REFERENCE_PULL_MS;
}

// Reading the shared records keeps the database awake, and Dev's pauses when idle to save money,
// so a device reads only while somebody is looking at it.
function pageIsVisible() {
  return typeof document === "undefined" || document.visibilityState !== "hidden";
}

// --- CR-V18: Patrick's 2026-09-13 call, the screen changes ----------------------------------------

// Patrick: "the only time we're going to need to print is when we're printing a barcode... once you
// do the add vehicle... and you hit save vehicle, then another pop-up comes. Do you want to print it?"
//
// The barcode is drawn here, as Code 128 (code set B), which every handheld and wedge scanner reads.
// No label printer is chosen yet, so this prints through the browser's own dialog to whatever printer
// the console has, sized as a 4 x 2 inch label.
const CODE128_PATTERNS = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213",
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132",
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211",
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313",
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331",
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111",
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214",
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111",
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141",
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141",
  "114131", "311141", "411131", "211412", "211214", "211232"
];
const CODE128_START_B = 104;
const CODE128_STOP = "2331112";

// The symbol values for a text in code set B: start, one per character, checksum, stop.
function code128Values(text) {
  const values = [CODE128_START_B];
  for (const character of String(text)) {
    const code = character.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Code 128 B cannot carry ${JSON.stringify(character)}.`);
    values.push(code - 32);
  }
  const checksum = values.reduce((sum, value, index) => sum + value * (index === 0 ? 1 : index), 0) % 103;
  return values.concat(checksum);
}

// Bar and space widths, in modules, starting with a bar.
function code128Widths(text) {
  return code128Values(text).map((value) => CODE128_PATTERNS[value]).join("") + CODE128_STOP;
}

function code128Svg(text, { module = 2, height = 70, quiet = 10 } = {}) {
  const widths = code128Widths(text).split("").map(Number);
  let x = quiet * module;
  const bars = [];
  widths.forEach((width, index) => {
    if (index % 2 === 0) bars.push(`<rect x="${x}" y="0" width="${width * module}" height="${height}"/>`);
    x += width * module;
  });
  const total = x + quiet * module;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${total} ${height}" width="${total}" height="${height}" role="img" aria-label="Barcode ${escapeHtml(text)}" shape-rendering="crispEdges"><rect width="${total}" height="${height}" fill="#fff"/><g fill="#000">${bars.join("")}</g></svg>`;
}

function labelHtml(vehicle) {
  const details = [vehicle.year, vehicle.make, vehicle.model, vehicle.color].filter(Boolean).join(" ");
  return `<div class="barcode-label">
    <div class="barcode-label-bars">${code128Svg(vehicle.assignedBarcode)}</div>
    <p class="barcode-label-code">${escapeHtml(vehicle.assignedBarcode)}</p>
    ${vehicle.vin ? `<p class="barcode-label-meta">VIN ${escapeHtml(vehicle.vin)}</p>` : ""}
    ${details ? `<p class="barcode-label-meta">${escapeHtml(details)}</p>` : ""}
  </div>`;
}

function openLabelPrompt(vehicle) {
  if (!vehicle || !el.labelModal) return;
  ui.labelVehicleId = vehicle.id;
  ui.modalTrigger = document.activeElement;
  el.labelModalHeading.textContent = `Print the barcode label for ${vehicle.assignedBarcode}?`;
  el.labelPreview.innerHTML = labelHtml(vehicle);
  el.labelModalStatus.textContent = "";
  el.labelModal.classList.remove("hidden");
  window.setTimeout(() => el.printLabelButton.focus(), 20);
}

function closeLabelPrompt() {
  ui.labelVehicleId = "";
  closeManagedModal(el.labelModal);
}

function printVehicleLabel() {
  const vehicle = state.vehicles.find((item) => item.id === ui.labelVehicleId);
  if (!vehicle) { closeLabelPrompt(); return; }
  el.labelPrintSheet.innerHTML = labelHtml(vehicle);
  document.body.classList.add("printing-label");
  addAudit("barcode_label_printed", `Barcode label printed for ${vehicle.assignedBarcode}.`, consoleActor(), "");
  saveState();
  const finished = () => {
    document.body.classList.remove("printing-label");
    el.labelPrintSheet.innerHTML = "";
    window.removeEventListener("afterprint", finished);
  };
  window.addEventListener("afterprint", finished);
  if (typeof window.print === "function") window.print();
  // Some browsers never fire afterprint; the sheet must not stay hidden-but-armed.
  window.setTimeout(finished, 1000);
  closeLabelPrompt();
}

// Patrick: the driver rows' three green actions ("Edit, Mark... like 3 lines") should be "something
// within the drop down, because this is going to end up having thousands of lines". One menu per row.
// A menu is easy to set off by mistake - a slip of the mouse, or the arrow keys on a menu that has
// focus - so anything that changes a driver asks first. Edit only opens the form.
const DRIVER_ACTION_QUESTIONS = {
  toggle: (driver) => driver.active ? `Mark ${driver.name} (${driver.employeeNumber}) inactive? Any authorization they hold is revoked.` : `Reactivate ${driver.name} (${driver.employeeNumber})?`,
  authorize: (driver) => `Authorize ${driver.name} (${driver.employeeNumber}) for ${humanDuration(selectedDuration(el.authorizationDuration))}?`,
  deauthorize: (driver) => `Revoke the authorization for ${driver.name} (${driver.employeeNumber})?`
};

function driverActionMenu(driver, auth, eligible) {
  // Step 5: only what this login's role may do. A Fleet Lead authorizes and revokes; a Supervisor
  // also edits.
  const supervisor = typeof allowed !== "function" || allowed("supervisor");
  const fleetLead = typeof allowed !== "function" || allowed("fleetLead");
  const options = [
    `<option value="">Actions</option>`,
    supervisor ? `<option value="edit">Edit</option>` : "",
    supervisor ? `<option value="toggle">${driver.active ? "Mark inactive" : "Reactivate"}</option>` : "",
    !fleetLead ? "" : auth ? `<option value="deauthorize">Revoke authorization</option>` : `<option value="authorize"${eligible ? "" : " disabled"}>Authorize</option>`
  ].filter(Boolean);
  if (options.length === 1) return `<span class="field-status">-</span>`;
  return `<select class="row-actions" data-driver-actions="${escapeHtml(driver.employeeNumber)}" aria-label="Actions for ${escapeHtml(driver.name)}">${options.join("")}</select>`;
}

function handleDriverActionMenu(event) {
  const menu = event.target.closest("[data-driver-actions]");
  if (!menu || !menu.value) return;
  const action = menu.value;
  const employeeNumber = menu.dataset.driverActions;
  menu.value = "";
  const driver = findDriverAny(employeeNumber);
  if (!driver) return;
  const question = DRIVER_ACTION_QUESTIONS[action];
  if (question && typeof confirm === "function" && !confirm(question(driver))) return;
  runDriverAction(action, driver);
}

// Patrick: "The keyboard is going to block the operator's ability to see what he's typing." When a
// scanner field is opened for typing, it is kept in view above both the keyboard and the Continue
// bar, and again whenever the keyboard changes the size of the screen.
const SCANNER_TYPING_FIELDS = ["barcodeInput", "driverInput", "supervisorInput"];

function keepTypingFieldVisible() {
  const input = document.activeElement;
  if (!input || !SCANNER_TYPING_FIELDS.includes(input.id) || input.getAttribute("inputmode") === "none") return;
  const viewport = window.visualViewport;
  const visibleBottom = viewport ? viewport.offsetTop + viewport.height : window.innerHeight;
  const dock = document.querySelector(".wizard-step:not(.hidden) .wizard-actions") || null;
  const dockRect = dock ? dock.getBoundingClientRect() : null;
  const dockIsFloating = dock && window.getComputedStyle(dock).position === "fixed" && dockRect.height > 0;
  const limit = Math.min(visibleBottom, dockIsFloating ? dockRect.top : visibleBottom) - 12;
  const rect = input.getBoundingClientRect();
  const top = viewport ? viewport.offsetTop + 8 : 8;
  if (rect.bottom > limit) window.scrollBy(0, rect.bottom - limit);
  else if (rect.top < top) window.scrollBy(0, rect.top - top);
}

function startTypingFieldWatch() {
  const later = () => window.setTimeout(keepTypingFieldVisible, 60);
  // The keyboard takes a moment to open, so look again once it has.
  document.addEventListener("focusin", (event) => {
    if (!SCANNER_TYPING_FIELDS.includes(event.target.id)) return;
    later();
    window.setTimeout(keepTypingFieldVisible, 350);
    // Some keyboards are slower, and some phones settle their layout after the resize signal.
    window.setTimeout(keepTypingFieldVisible, 700);
  });
  window.addEventListener("resize", later);
  if (window.visualViewport) window.visualViewport.addEventListener("resize", later);
}

// Patrick: "a search is going to look for a 4 digit date... I just want to make sure that it doesn't
// cause a conflict." The date box is the browser's own picker, which lets a year run to six digits,
// and a half-typed date reads as empty - so the search quietly ran across every date. A date must be
// complete, with a four-digit year, before anything is searched.
const SEARCH_DATE_MIN = "2020-01-01";
const SEARCH_DATE_MAX = "2099-12-31";

function searchDateProblem() {
  const input = el.filterDate;
  if (!input) return "";
  const validity = input.validity || {};
  if (validity.badInput) return "Finish the date, or clear it. The year has four digits, for example 09/13/2026.";
  const value = input.value;
  if (!value) return "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < SEARCH_DATE_MIN || value > SEARCH_DATE_MAX) return "Use a date between 2020 and 2099, with a four-digit year.";
  return "";
}

// --- CR-V17 step 5: sign-in and roles ------------------------------------------------------------
//
// Decided by the owner, 2026-09-19:
//   - each gate phone has a login of its own, signed in once by the Admin, and stays signed in;
//   - the console cannot be used without signing in, and what is done is recorded under that name;
//   - the Admin makes the logins, inside the app.
//
// The server enforces every rule here (api/src/roles.mjs). The console only stops offering what the
// server would refuse, so nobody is shown a refusal for a button they should never have had.

const RANK_NEEDED = { admin: 4, supervisor: 3, fleetLead: 2 };

function cloudStatusNow() {
  return window.VeriGateCloud && !IN_TEST_HARNESS && !DEMO_MODE ? window.VeriGateCloud.status() : null;
}

// Who is doing this, for the history. Signed in, it is the person; otherwise the console's old name,
// which is what the validator and demo mode still use.
function consoleActor() {
  const status = cloudStatusNow();
  if (!status || !status.signedIn) return "Supervisor Console";
  return status.name && status.name !== status.username ? `${status.name} (${status.username})` : status.username;
}

// Demo mode, the validator and a build without the cloud client see everything, as before step 5.
function currentRank() {
  const status = cloudStatusNow();
  if (!status || DEMO_MODE) return RANK_NEEDED.admin;
  return status.signedIn ? status.rank : 0;
}

function allowed(level) {
  return currentRank() >= RANK_NEEDED[level];
}

function consoleNeedsSignIn() {
  return ui.shell === "console" && Boolean(window.VeriGateCloud) && !IN_TEST_HARNESS && !DEMO_MODE && !cloudReady();
}

// Anything marked data-needs="supervisor" (and so on) is shown only to that role or above.
function applyRoleVisibility() {
  document.querySelectorAll("[data-needs]").forEach((node) => {
    node.classList.toggle("role-hidden", !allowed(node.dataset.needs));
  });
  // A tab that disappeared must not stay open underneath.
  const open = document.getElementById(ui.activeSupervisorSection || "");
  if (open && open.classList.contains("role-hidden")) showSupervisorSection("driversSection");
}

function renderConsoleGate() {
  if (!el.consoleGate) return;
  const needs = consoleNeedsSignIn();
  el.consoleGate.classList.toggle("hidden", !needs);
  document.body.classList.toggle("console-locked", needs);
  // On both shells. The scanner is the one Patrick opens on his own phone from the review page, and
  // it is an exact copy of the gate screen - without this there is nothing on it saying the
  // movements are made up.
  el.demoBanner.classList.toggle("hidden", !DEMO_MODE);
  const status = cloudStatusNow();
  el.consoleGateStatus.textContent = status && status.message ? status.message : "";
}

// --- the Admin's logins -----------------------------------------------------------------------------

const LOGIN_ROLES = [["Supervisor", "Supervisor"], ["FleetLead", "Fleet Lead"], ["Scanner", "Scanner (person)"], ["Device", "Gate phone"], ["Admin", "Admin"]];

function loginRoleLabel(role) {
  const found = LOGIN_ROLES.find(([value]) => value === role);
  return found ? found[1] : "No role";
}

function sharedLoginsActive() {
  return cloudReady() && allowed("admin") && !DEMO_MODE;
}

function renderLoginsPanel() {
  if (!el.loginsPanel) return;
  const shared = sharedLoginsActive();
  el.loginsPanel.classList.toggle("hidden", !shared);
  el.prototypeUsersPanel.classList.toggle("hidden", shared);
  if (!shared) return;
  const logins = ui.logins || [];
  el.loginsTableBody.innerHTML = logins.length ? logins.map((login) => {
    const self = window.VeriGateCloud.status().username === login.username;
    const state = !login.enabled ? `<span class="status-badge inactive">Off</span>` : login.status === "FORCE_CHANGE_PASSWORD" ? `<span class="status-badge provisional" title="Has not signed in yet with the temporary password">Not used yet</span>` : `<span class="status-badge authorized">Active</span>`;
    const actions = self ? `<span class="field-status">This is you</span>` : `<select class="row-actions" data-login-actions="${escapeHtml(login.username)}" aria-label="Actions for ${escapeHtml(login.username)}">
        <option value="">Actions</option>
        ${LOGIN_ROLES.filter(([value]) => value !== login.role).map(([value, label]) => `<option value="role:${value}">Make ${escapeHtml(label)}</option>`).join("")}
        <option value="reset">New temporary password</option>
        <option value="${login.enabled ? "off" : "on"}">${login.enabled ? "Turn off" : "Turn back on"}</option>
      </select>`;
    return `<tr><td class="mono">${escapeHtml(login.username)}</td><td>${escapeHtml(login.name || "-")}</td><td>${escapeHtml(loginRoleLabel(login.role))}</td><td>${state}</td><td>${actions}</td></tr>`;
  }).join("") : `<tr><td colspan="5" class="empty-cell">${ui.loginsError ? escapeHtml(ui.loginsError) : "Reading the logins..."}</td></tr>`;
}

function loadLogins() {
  if (!sharedLoginsActive()) return Promise.resolve();
  return window.VeriGateCloud.users().then((logins) => {
    ui.logins = logins;
    ui.loginsError = "";
  }, (error) => {
    ui.loginsError = error.message;
  }).then(renderLoginsPanel);
}

// A temporary password is shown once, here, for the Admin to hand over, and never stored.
function showTemporaryPassword(username, password, what) {
  el.loginPasswordBox.classList.remove("hidden");
  el.loginPasswordText.textContent = `${what} Give ${username} this temporary password. They choose their own the first time they sign in. It is shown only now.`;
  el.loginPasswordValue.textContent = password;
}

function hideTemporaryPassword() {
  el.loginPasswordBox.classList.add("hidden");
  el.loginPasswordValue.textContent = "";
}

function submitNewLogin(event) {
  event.preventDefault();
  const input = { name: el.loginNameInput.value.trim(), username: el.loginUsernameInput.value.trim(), role: el.loginRoleInput.value };
  el.loginFormStatus.textContent = "Creating the login...";
  window.VeriGateCloud.createUser(input).then((created) => {
    el.loginForm.reset();
    el.loginFormStatus.textContent = "";
    showTemporaryPassword(created.username, created.temporaryPassword, `Login ${created.username} created as ${loginRoleLabel(created.role)}.`);
    return loadLogins();
  }, (error) => {
    el.loginFormStatus.textContent = error.message;
  });
}

function handleLoginAction(event) {
  const menu = event.target.closest("[data-login-actions]");
  if (!menu || !menu.value) return;
  const action = menu.value;
  const username = menu.dataset.loginActions;
  menu.value = "";
  let input;
  let question;
  if (action.startsWith("role:")) { input = { role: action.slice(5) }; question = `Make ${username} a ${loginRoleLabel(input.role)}?`; }
  if (action === "reset") { input = { resetPassword: true }; question = `Give ${username} a new temporary password? Their current password stops working, and they are signed out everywhere.`; }
  if (action === "off") { input = { enabled: false }; question = `Turn off ${username}? They are signed out everywhere at once. A phone with this login keeps its records and sends them once it is signed in again.`; }
  if (action === "on") { input = { enabled: true }; question = `Turn ${username} back on?`; }
  if (!input || (typeof confirm === "function" && !confirm(question))) return;
  window.VeriGateCloud.updateUser(username, input).then((result) => {
    if (result.temporaryPassword) showTemporaryPassword(username, result.temporaryPassword, "New temporary password made.");
    setNotice(`Login ${username} updated.`, "success");
    return loadLogins();
  }, (error) => {
    setNotice(error.message, "danger");
  });
}

// --- signing a gate phone in ------------------------------------------------------------------------

function renderPhoneSignIn() {
  if (!el.phoneSignInStatus) return;
  const status = cloudStatusNow();
  const signedIn = Boolean(status && status.signedIn);
  el.phoneSignInStatus.textContent = !window.VeriGateCloud ? "The shared records are not available in this build."
    : signedIn ? `Signed in to the shared records as ${status.username}${status.remembered ? ", and stays signed in" : " for this session only"}.`
    : "Not signed in. Movements are kept on this phone until it is.";
  el.phoneSignInFields.classList.toggle("hidden", signedIn);
  el.phoneSignOutButton.classList.toggle("hidden", !signedIn);
  el.phoneNewPasswordRow.classList.toggle("hidden", !ui.phoneChallenge);
  el.phoneSignInButton.textContent = ui.phoneChallenge ? "Set password and sign in" : "Sign this phone in";
}

function submitPhoneSignIn() {
  const cloud = window.VeriGateCloud;
  if (!cloud) return;
  el.phoneSignInMessage.textContent = "Signing in...";
  const attempt = ui.phoneChallenge
    ? cloud.completeNewPassword(ui.phoneChallenge.username, el.phoneNewPassword.value, ui.phoneChallenge.challengeSession, { remember: true })
    : cloud.signIn(el.phoneUsername.value.trim(), el.phonePassword.value, { remember: true });
  attempt.then((result) => {
    el.phonePassword.value = "";
    el.phoneNewPassword.value = "";
    if (result && result.challenge === "NEW_PASSWORD_REQUIRED") {
      ui.phoneChallenge = result;
      el.phoneSignInMessage.textContent = "This login needs a new password. Choose one and keep it with the phone's records; it is needed again in six months.";
      renderPhoneSignIn();
      el.phoneNewPassword.focus();
      return;
    }
    ui.phoneChallenge = null;
    el.phoneSignInMessage.textContent = "";
    renderPhoneSignIn();
  }, (error) => {
    el.phoneSignInMessage.textContent = error.message;
  });
}

function signPhoneOut() {
  if (typeof confirm === "function" && !confirm("Sign this phone out of the shared records? It keeps scanning, and keeps its movements until it is signed in again.")) return;
  window.VeriGateCloud.signOut();
  renderPhoneSignIn();
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
  const barcode = canonicalVehicleBarcode(value);
  return state.vehicles.find((vehicle) => vehicle.vin === needle || vehicle.plate === needle || vehicle.assignedBarcode === barcode) || null;
}

function findVehicleByBarcode(value) {
  const needle = canonicalVehicleBarcode(value);
  return state.vehicles.find((vehicle) => vehicle.assignedBarcode === needle) || null;
}

function readVehicleInput() {
  const barcode = canonicalVehicleBarcode(el.barcodeInput.value);
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

// Reading the select through here keeps an unexpected value from becoming an authorization of
// unknown length.
function selectedDuration(element) {
  const value = element && element.value;
  return AUTHORIZATION_DURATIONS.includes(value) ? value : TEMP_AUTHORIZATION_DURATION;
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

// CR-V16: Patrick 2026-09-13. "The toggle switch will turn off the need for a Fleet lead. As long
// as a driver ID is scanned and that ID is not revoked the driver can go through ... This override
// will not apply to manual entries, just scanned badges ... there should be an override toggle for
// each location, again, under manager authority only."
//
// A typed employee # is refused because it is exactly the case Patrick is worried about: an ID read
// off a screen and typed in. "Not revoked" is taken to include a supervisor revoking the driver
// today, so Deauthorize all still stops everyone, even at a location with the override on. That
// reading is an assumption to confirm with Patrick.
function locationOverrideOn(locationName) {
  const location = state.locations.find((item) => item.name === locationName);
  return Boolean(location && location.active && location.scanOverride && location.scanOverride.enabled === true);
}

function revokedToday(employeeNumber) {
  const today = dateKey(new Date());
  return state.authorizations.some((auth) => auth.driverEmployee === employeeNumber && auth.status === "revoked" && auth.revokedAt && dateKey(new Date(auth.revokedAt)) === today);
}

function scanOverrideDecision(draft) {
  if (!locationOverrideOn(draft.location)) return { applies: false, explanation: "" };
  if (draft.driverEntryMethod !== "scanner_field") return { applies: false, explanation: "This location's override covers scanned badges only, not a typed employee #." };
  if (!draft.driver.active || licenseStatus(draft.driver).tone === "expired") return { applies: false, explanation: "" };
  if (revokedToday(draft.driver.employeeNumber)) return { applies: false, explanation: "This driver's authorization was revoked today, so the location override does not apply." };
  return { applies: true, explanation: "" };
}

function normalizeScanOverride(value) {
  const source = value && typeof value === "object" ? value : {};
  return { enabled: source.enabled === true, changedBy: String(source.changedBy || ""), changedAt: String(source.changedAt || "") };
}

function licenseStatus(driver) {
  const now = new Date();
  const expirationBoundary = licenseExpirationBoundary(driver.licenseExpires);
  const days = Math.floor((startOfLocalDay(new Date(driver.licenseExpires)) - startOfLocalDay(now)) / 86400000);
  // CR-V14 item 6, Patrick 2026-09-12: "Within the Driver Roster section change Expired
  // -Authorization Blocked to Exp". The short form is for the supervisor tables: the roster, and
  // since CR-V16 Licenses Approaching Expiration too, which CR-V14 missed. The long label stays on
  // the scanner, where an operator refused at the gate needs to read why rather than decode it.
  if (now >= expirationBoundary) return { label: "Expired - authorization blocked", short: "Exp", tone: "expired", days };
  if (days <= 5) return { label: "Expires within 5 days", short: "5d", tone: "warning5", days };
  if (days <= 15) return { label: "Expires within 15 days", short: "15d", tone: "warning15", days };
  if (days <= 30) return { label: "Expires within 30 days", short: "30d", tone: "warning30", days };
  return { label: "License current", short: "Current", tone: "current", days };
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
  const driver = findDriverAny(button.dataset.driverEmployee);
  if (!driver) return;
  runDriverAction(button.dataset.driverAction, driver);
}

// The same actions whether they come from a button or from a row's Actions menu (CR-V18).
function runDriverAction(action, driver) {
  const employeeNumber = driver.employeeNumber;
  if (action === "authorize") {
    const result = authorizeDriver(driver, selectedDuration(el.authorizationDuration), consoleActor(), "", "user action");
    el.bulkActionStatus.textContent = result.ok ? `Authorized ${employeeNumber}.` : result.reason;
  }
  if (action === "deauthorize") {
    revokeAuthorization(employeeNumber, consoleActor());
    el.bulkActionStatus.textContent = `Revoked authorization for ${employeeNumber}.`;
  }
  if (action === "edit") openDriverModal(driver);
  if (action === "profile") openDriverProfile(driver);
  if (action === "toggle") {
    driver.active = !driver.active;
    driver.updatedAt = new Date().toISOString();
    driver.updatedBy = consoleActor();
    if (!driver.active) revokeAuthorization(employeeNumber, consoleActor(), "Driver deactivated");
    addAudit(driver.active ? "driver_reactivated" : "driver_deactivated", `Driver ${employeeNumber} ${driver.active ? "reactivated" : "deactivated"}.`, consoleActor(), "");
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
  active.forEach((auth) => revokeAuthorization(auth.driverEmployee, consoleActor(), "Bulk revocation"));
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
  const bulkDuration = selectedDuration(el.authorizationDuration);
  const ok = typeof confirm === "function" ? confirm(`Authorize ${selected.length} selected drivers for ${humanDuration(bulkDuration)}?`) : true;
  if (!ok) return;
  let successful = 0;
  const blocked = [];
  selected.forEach((checkbox) => {
    const driver = findDriverAny(checkbox.value);
    const result = authorizeDriver(driver, bulkDuration, consoleActor(), "", "bulk action");
    if (result.ok) successful += 1;
    else blocked.push(`${checkbox.value}: ${result.reason}`);
  });
  saveState();
  renderAll();
  el.bulkActionStatus.textContent = `${successful} successful, ${blocked.length} blocked${blocked.length ? ` (${blocked.join("; ")})` : ""}.`;
}

function showSupervisorSection(sectionId) {
  ui.activeSupervisorSection = sectionId;
  if (sectionId === "usersSection") loadLogins();
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

function openFeedbackModal(surface) {
  ui.modalTrigger = document.activeElement;
  ui.feedbackSurface = surface;
  el.feedbackForm.reset();
  const isScanner = surface === "scanner";
  el.feedbackEyebrow.textContent = isScanner ? "Scanner feedback" : "Desktop feedback";
  el.feedbackDetailsRow.classList.toggle("hidden", isScanner);
  el.feedbackContext.textContent = isScanner
    ? `Includes ${state.workingLocation} and ${ui.activeFlow ? `scanner step ${ui.step + 1}` : "scanner home"}.`
    : `Includes the supervisor desktop at ${state.workingLocation}.`;
  el.feedbackModal.classList.remove("hidden");
  window.setTimeout(() => el.feedbackNote.focus(), 20);
}

function closeFeedbackModal() { closeManagedModal(el.feedbackModal); }

function submitFeedback(event) {
  event.preventDefault();
  const note = el.feedbackNote.value.trim();
  if (!note) {
    el.feedbackContext.textContent = "Describe what happened before sending feedback.";
    shake(el.feedbackNote);
    return;
  }
  const screen = ui.feedbackSurface === "scanner" ? (ui.activeFlow ? `Scanner step ${ui.step + 1}` : "Scanner home") : "Supervisor desktop";
  state.feedback.unshift({ id: makeId("feedback"), createdAt: new Date().toISOString(), source: ui.feedbackSurface, name: el.feedbackName.value.trim(), note, details: el.feedbackDetails.value.trim(), location: state.workingLocation, screen });
  addAudit("feedback_submitted", `${ui.feedbackSurface === "scanner" ? "Scanner" : "Desktop"} feedback submitted from ${screen}.`, el.feedbackName.value.trim() || ui.feedbackSurface, state.workingLocation);
  saveState();
  closeFeedbackModal();
  setNotice("Feedback saved on this device for review.", "success");
}

// CR-V11 (081526 v7 item #1). Patrick, 2026-09-06: "there is no way to edit the users once
// their created". The same modal now serves both cases; ui.editingUserId decides which.
function openDesktopUserModal(user = null) {
  ui.modalTrigger = document.activeElement;
  el.desktopUserForm.reset();
  el.desktopUserNameError.textContent = "";
  el.desktopUserUsernameError.textContent = "";
  ui.editingUserId = user ? user.id : null;
  el.desktopUserHeading.textContent = user ? `Edit ${user.name}` : "Add desktop user";
  if (user) {
    el.desktopUserName.value = user.name || "";
    el.desktopUserUsername.value = user.username || "";
    el.desktopUserRole.value = normalizeDesktopRole(user.role);
    el.desktopUserScope.value = user.scope || "All locations";
    el.desktopUserResetRequired.value = user.credentialPrototype && user.credentialPrototype.resetRequired ? "true" : "false";
  }
  renderDesktopAbilityControls(user ? user.abilities : defaultDesktopAbilities());
  el.desktopUserModal.classList.remove("hidden");
  window.setTimeout(() => el.desktopUserName.focus(), 20);
}

function closeDesktopUserModal() { ui.editingUserId = null; closeManagedModal(el.desktopUserModal); }

function renderDesktopAbilityControls(abilities) {
  if (!el.desktopAbilityGrid) return;
  const normalized = normalizeDesktopAbilities(abilities);
  el.desktopAbilityGrid.innerHTML = DESKTOP_USER_ABILITIES.map((ability) => `
    <div class="ability-row">
      <div><strong>${escapeHtml(ability.title)}</strong><span>${escapeHtml(ability.description)}</span></div>
      <select data-user-ability="${escapeHtml(ability.id)}" aria-label="${escapeHtml(ability.title)} ability">
        ${ABILITY_LEVELS.map((level) => `<option value="${escapeHtml(level)}" ${normalized[ability.id] === level ? "selected" : ""}>${escapeHtml(level)}</option>`).join("")}
      </select>
    </div>
  `).join("");
}

function collectDesktopAbilities() {
  const abilities = defaultDesktopAbilities();
  el.desktopAbilityGrid.querySelectorAll("[data-user-ability]").forEach((select) => {
    abilities[select.dataset.userAbility] = ABILITY_LEVELS.includes(select.value) ? select.value : "Restricted";
  });
  return abilities;
}

function saveDesktopUser(event) {
  event.preventDefault();
  const name = el.desktopUserName.value.trim();
  const username = normalizeUsername(el.desktopUserUsername.value);
  el.desktopUserNameError.textContent = "";
  el.desktopUserUsernameError.textContent = "";
  if (!name) {
    el.desktopUserNameError.textContent = "Name is required.";
    shake(el.desktopUserName);
    return;
  }
  if (!username) {
    el.desktopUserUsernameError.textContent = "Username is required.";
    shake(el.desktopUserUsername);
    return;
  }
  // A user editing their own record must not collide with themselves.
  if ((state.desktopUsers || []).some((user) => normalizeUsername(user.username) === username && user.id !== ui.editingUserId)) {
    el.desktopUserUsernameError.textContent = "Username must be unique.";
    shake(el.desktopUserUsername);
    return;
  }

  if (ui.editingUserId) {
    const existing = state.desktopUsers.find((user) => user.id === ui.editingUserId);
    if (existing) {
      const previousRole = existing.role;
      Object.assign(existing, {
        name,
        username,
        role: normalizeDesktopRole(el.desktopUserRole.value),
        scope: el.desktopUserScope.value,
        abilities: collectDesktopAbilities()
      });
      existing.credentialPrototype = {
        ...(existing.credentialPrototype || {}),
        resetRequired: el.desktopUserResetRequired.value === "true",
        updatedAt: new Date().toISOString()
      };
      el.desktopUserPassword.value = "";
      const roleNote = previousRole === existing.role ? "" : ` Role changed from ${previousRole} to ${existing.role}.`;
      addAudit("desktop_user_edited", `Desktop user ${existing.id} edited.${roleNote}`, consoleActor(), existing.scope || "");
      ui.editingUserId = null;
      saveState();
      renderAll();
      closeDesktopUserModal();
      setNotice(`${existing.name} updated.`, "success");
      return;
    }
    ui.editingUserId = null;
  }
  const nextId = `U${String((state.desktopUsers || []).length + 1).padStart(4, "0")}`;
  const now = new Date().toISOString();
  const credentialPrototype = {
    passwordStatus: el.desktopUserPassword.value ? "demo_value_entered_not_saved" : "not_stored",
    resetRequired: el.desktopUserResetRequired.value === "true",
    updatedAt: now
  };
  state.desktopUsers.push(normalizeDesktopUser({ id: nextId, name, username, role: el.desktopUserRole.value, active: true, scope: el.desktopUserScope.value, credentialPrototype, abilities: collectDesktopAbilities() }));
  el.desktopUserPassword.value = "";
  addAudit("desktop_user_created", `Desktop user ${nextId} created as ${el.desktopUserRole.value}; credential fields are prototype-only and password value was not saved.`, consoleActor(), el.desktopUserScope.value);
  saveState();
  closeDesktopUserModal();
  renderAll();
}

function saveDriverForm(event) {
  event.preventDefault();
  clearDriverErrors();
  const originalEmployee = canonicalEmployeeId(el.driverEditEmployee.value);
  const enteredEmployeeNumber = normalize(el.driverEmployeeNumber.value);
  const employeeNumber = enteredEmployeeNumber ? canonicalEmployeeId(enteredEmployeeNumber) : "";
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
    existing.name = name; existing.licenseExpires = new Date(`${licenseExpires}T12:00:00`).toISOString(); existing.active = el.driverActive.value === "true"; existing.updatedAt = now; existing.updatedBy = consoleActor();
    if (!existing.active) revokeAuthorization(existing.employeeNumber, consoleActor(), "Driver marked inactive during edit");
    addAudit("driver_edited", `Driver ${existing.employeeNumber} edited.`, consoleActor(), "");
  } else {
    state.drivers.push({ employeeNumber, name, licenseExpires: new Date(`${licenseExpires}T12:00:00`).toISOString(), active: el.driverActive.value === "true", createdAt: now, updatedAt: now, createdBy: consoleActor(), updatedBy: consoleActor() });
    addAudit("driver_created", `Driver ${employeeNumber} created.`, consoleActor(), "");
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
  // CR-V14 item 9: removal moved off the table row and into here, because the VIN is now the only
  // way in. There is nothing to remove on a vehicle that does not exist yet.
  // The button carries the "hidden" CSS class in the markup, and .hidden { display: none !important }
  // beats the hidden property. Setting the property cleared the attribute and left the class, so the
  // control was invisible from the day CR-V14 added it: you could open a vehicle from its VIN but
  // never remove it. Toggle the class, which is what actually governs the display.
  el.vehicleInventoryToggle.classList.toggle("hidden", !vehicle);
  if (vehicle) el.vehicleInventoryToggle.textContent = vehicle.active ? "Remove from Inventory" : "Restore to Inventory";
  el.vehicleModal.classList.remove("hidden");
  window.setTimeout(() => el.vehicleVin.focus(), 20);
}

function closeVehicleModal() { closeManagedModal(el.vehicleModal); }

function toggleVehicleInventoryFromModal() {
  const vehicle = state.vehicles.find((item) => item.id === el.vehicleEditId.value);
  if (!vehicle) return;
  if (!setVehicleInventoryState(vehicle, !vehicle.active)) return;
  saveState(); closeVehicleModal(); renderAll();
}

// A vehicle with no barcode is invisible to the scanner, so a blank one is filled in with the
// next free G number rather than rejected. Uniqueness is still enforced for anything typed in.
function nextAvailableBarcode() {
  const used = new Set(state.vehicles.map((vehicle) => vehicle.assignedBarcode));
  for (let n = 1; n <= 9999; n += 1) {
    const candidate = `G${String(n).padStart(4, "0")}`;
    if (!used.has(candidate)) return candidate;
  }
  return `G${Date.now().toString().slice(-4)}`;
}

function saveVehicleForm(event) {
  event.preventDefault(); clearVehicleErrors();
  const vehicleId = el.vehicleEditId.value;
  const enteredBarcode = canonicalVehicleBarcode(el.vehicleBarcode.value);
  const fields = { make: el.vehicleMake.value.trim(), model: el.vehicleModel.value.trim(), year: el.vehicleYear.value.trim() ? Number(el.vehicleYear.value.trim()) : "", color: el.vehicleColor.value.trim(), vin: normalize(el.vehicleVin.value), assignedBarcode: enteredBarcode || nextAvailableBarcode(), plate: normalize(el.vehiclePlate.value), active: el.vehicleActive.value === "true" };
  let invalid = false;
  // CR-V14 item 10, Patrick 2026-09-12: "When adding a vehicle nothing is required other then
  // the VIN under this section." Make, model, year, colour and plate are all optional now, and a
  // blank barcode is assigned rather than refused, because a vehicle with no barcode could never
  // be found at the gate.
  if (!fields.vin) { el.vehicleVinError.textContent = "VIN is required."; invalid = true; }
  if (el.vehicleYear.value.trim() && (!Number.isInteger(fields.year) || fields.year < 1900 || fields.year > new Date().getFullYear() + 2)) { el.vehicleYearError.textContent = "Year must be a reasonable four-digit value."; invalid = true; }
  if (state.vehicles.some((vehicle) => vehicle.id !== vehicleId && vehicle.vin === fields.vin)) { el.vehicleVinError.textContent = "VIN must be unique."; invalid = true; }
  if (state.vehicles.some((vehicle) => vehicle.id !== vehicleId && vehicle.assignedBarcode === fields.assignedBarcode)) { el.vehicleBarcodeError.textContent = "Assigned Barcode must be unique and is never reused."; invalid = true; }
  if (invalid) return;
  const now = new Date().toISOString();
  const existing = state.vehicles.find((vehicle) => vehicle.id === vehicleId);
  // CR-V18: a new barcode, or a changed one, needs a label on the car.
  let labelFor = null;
  if (existing) {
    const barcodeChanged = existing.assignedBarcode !== fields.assignedBarcode;
    Object.assign(existing, fields, { updatedAt: now, updatedBy: consoleActor() });
    // CR-V15: a supervisor who has opened and saved the record has looked at the barcode, so the
    // review flag is settled here too rather than lingering after it has been dealt with.
    if (existing.barcodeNeedsReview) { existing.barcodeNeedsReview = false; addAudit("typed_barcode_resolved", `Barcode review closed for ${existing.assignedBarcode} by editing the record.`, consoleActor(), ""); }
    addAudit("vehicle_edited", `Vehicle ${existing.id} edited.`, consoleActor(), "");
    if (barcodeChanged) addAudit("barcode_changed", `Vehicle ${existing.id} barcode changed to ${fields.assignedBarcode}.`, consoleActor(), "");
    if (barcodeChanged) labelFor = existing;
  } else {
    const vehicle = { id: makeId("veh"), ...fields, createdAt: now, updatedAt: now, createdBy: consoleActor(), updatedBy: consoleActor(), removedAt: "", removedBy: "", reactivatedAt: "", inventoryStatus: COMPLETE_STATUS, createdSource: "supervisor", needsSupervisorCompletion: false, provisionalFromTxId: "", provisionalAt: "", completedBy: "", completedAt: "" };
    state.vehicles.push(vehicle);
    addAudit("vehicle_created", `Vehicle ${vehicle.id} created.`, consoleActor(), "");
    addAudit("barcode_assigned", `Barcode ${vehicle.assignedBarcode} assigned to ${vehicle.id}.`, consoleActor(), "");
    labelFor = vehicle;
  }
  if (fields.vin.length !== 17) el.vehicleFormStatus.textContent = "VIN saved with a non-17-character warning.";
  saveState(); closeVehicleModal(); renderAll();
  if (labelFor) openLabelPrompt(labelFor);
}

function handleVehicleTableAction(event) {
  const button = event.target.closest("[data-vehicle-action]");
  if (!button) return;
  const vehicle = state.vehicles.find((item) => item.id === button.dataset.vehicleId);
  if (!vehicle) return;
  if (button.dataset.vehicleAction === "edit") { openVehicleModal(vehicle); return; }
  if (button.dataset.vehicleAction === "confirm-barcode") { confirmVehicleBarcode(vehicle); return; }
  if (!setVehicleInventoryState(vehicle, button.dataset.vehicleAction === "restore")) return;
  saveState(); renderAll();
}

// Shared by the modal control and any remaining row action so the confirmation prompt and the
// audit entry cannot drift apart between the two routes.
// CR-V15: a supervisor saying the barcode is right is the end of the matter. It is recorded
// rather than just cleared, so the trail shows who vouched for it.
function confirmVehicleBarcode(vehicle) {
  vehicle.barcodeNeedsReview = false;
  vehicle.updatedAt = new Date().toISOString();
  vehicle.updatedBy = consoleActor();
  addAudit("typed_barcode_confirmed", `Barcode ${vehicle.assignedBarcode} was confirmed correct by a supervisor.`, consoleActor(), "");
  saveState(); renderAll();
}

function setVehicleInventoryState(vehicle, restoring) {
  const prompt = restoring ? `Restore ${vehicle.assignedBarcode} to active inventory?` : `Remove ${vehicle.assignedBarcode} from inventory? It will remain searchable but cannot be scanned for new movements.`;
  if (typeof confirm === "function" && !confirm(prompt)) return false;
  vehicle.active = restoring;
  vehicle.updatedAt = new Date().toISOString(); vehicle.updatedBy = consoleActor();
  if (restoring) { vehicle.reactivatedAt = vehicle.updatedAt; addAudit("vehicle_restored", `Vehicle ${vehicle.assignedBarcode} restored to inventory.`, consoleActor(), ""); }
  else { vehicle.removedAt = vehicle.updatedAt; vehicle.removedBy = consoleActor(); addAudit("vehicle_removed_from_inventory", `Vehicle ${vehicle.assignedBarcode} removed from inventory.`, consoleActor(), ""); }
  return true;
}

// CR-V08-BETA-CRITICAL-APP-001: the supervisor work queue for auto-created inbound vehicles.
function renderIncompleteInventory() {
  if (!el.incompleteInventoryBody) return;
  const pending = scannerAddedVehicles();
  el.incompleteInventoryCount.textContent = String(pending.length);
  el.incompleteInventoryPanel.classList.toggle("hidden", pending.length === 0);
  el.incompleteInventoryBody.innerHTML = pending.length
    ? pending.map((vehicle) => {
      const missing = [["VIN", vehicle.vin], ["Make", vehicle.make], ["Model", vehicle.model], ["Year", vehicle.year], ["Color", vehicle.color], ["Plate", vehicle.plate]]
        .filter(([, value]) => !value).map(([label]) => label).join(", ");
            // CR-V15: a typed unknown barcode is the one case in this list that may be a mistake rather
      // than a new vehicle, so it is marked and given an explicit action. Everything else here
      // stays a record, not a task, which is what Patrick asked for.
      const flag = vehicle.barcodeNeedsReview
        ? ` <span class="status-badge unauthorized" title="This barcode was typed by hand and was not in inventory. Confirm it is correct, or correct it through the VIN.">Check barcode</span>`
        : "";
      const action = vehicle.barcodeNeedsReview
        ? `<button class="table-action success-text" type="button" data-vehicle-action="confirm-barcode" data-vehicle-id="${escapeHtml(vehicle.id)}">Barcode is correct</button>`
        : `<button class="table-action" type="button" data-vehicle-action="edit" data-vehicle-id="${escapeHtml(vehicle.id)}">Open</button>`;
      return `<tr><td class="mono">${escapeHtml(vehicle.assignedBarcode)}${flag}</td><td>${escapeHtml(formatTimestamp(vehicle.provisionalAt))}</td><td>${escapeHtml(missing || "None")}</td><td>${action}</td></tr>`;
    }).join("")
    : `<tr><td colspan="4" class="empty-cell">No vehicles have been added by a gate scan yet.</td></tr>`;
}

function renderVehicles() {
  renderIncompleteInventory();
  if (!el.vehiclesTableBody) return;
  const needle = normalize(el.vehicleSearch.value);
  const status = el.vehicleStatusFilter.value;
  const vehicles = state.vehicles.filter((vehicle) => {
    const matchesStatus = status === "all" || (status === "active" && vehicle.active) || (status === "inactive" && !vehicle.active);
    const haystack = [vehicle.assignedBarcode, vehicle.vin, vehicle.plate, vehicle.make, vehicle.model, vehicle.year, vehicle.color].join(" ").toUpperCase();
    return matchesStatus && (!needle || haystack.includes(needle));
  });
  const activity = lastActivityIndex();
  const lastMoved = (vehicle) => Math.max(activity.get(`vehicle:${vehicle.id}`) || 0, activity.get(`barcode:${vehicle.assignedBarcode}`) || 0);
  vehicles.sort((a, b) => lastMoved(b) - lastMoved(a) || a.assignedBarcode.localeCompare(b.assignedBarcode));
  el.vehiclesTableBody.innerHTML = vehicles.length ? vehicles.map((vehicle) => `<tr><td class="mono">${escapeHtml(vehicle.assignedBarcode)}</td><td>${escapeHtml(vehicle.year || "-")}</td><td>${escapeHtml(vehicle.make)}</td><td>${escapeHtml(vehicle.model)}</td><td>${escapeHtml(vehicle.color)}</td><td><button class="table-action mono" type="button" data-vehicle-action="edit" data-vehicle-id="${escapeHtml(vehicle.id)}" aria-label="Open ${escapeHtml(vehicle.assignedBarcode)} to edit or remove it">${escapeHtml(vehicle.vin || "Add VIN")}</button></td><td>${escapeHtml(vehicle.plate || "-")}</td><td><span class="status-badge ${vehicle.active ? "authorized" : "inactive"}">${vehicle.active ? "Active" : "Inactive"}</span>${isScannerAddedVehicle(vehicle) ? ` <span class="status-badge provisional" title="This vehicle was added automatically when it was scanned at the gate, rather than being entered by a person.">Added by scan</span>` : ""}${vehicle.barcodeNeedsReview ? ` <span class="status-badge unauthorized" title="This barcode was typed by hand and was not in inventory. Confirm it is correct, or correct it here.">Check barcode</span>` : ""}</td></tr>`).join("") : `<tr><td colspan="8" class="empty-cell">No vehicles match this inventory view.</td></tr>`;
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
  driver.updatedAt = new Date().toISOString(); driver.updatedBy = consoleActor();
  if (!driver.active) revokeAuthorization(driver.employeeNumber, consoleActor(), "Driver deactivated");
  addAudit(driver.active ? "driver_reactivated" : "driver_deactivated", `Driver ${driver.employeeNumber} ${driver.active ? "reactivated" : "deactivated"} from profile.`, consoleActor(), "");
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
  addAudit("floater_location_change_started", `Floater ${device.id} location change started.`, consoleActor(), state.workingLocation);
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
    addAudit("fixed_device_selected", `Fixed device ${device.id} selected at ${device.assignedLocation}.`, consoleActor(), device.assignedLocation);
  } else {
    const location = el.floaterLocationSelect.value;
    if (!activeLocations().some((item) => item.name === location)) { el.deviceSetupStatus.textContent = "Choose an active location before confirming the floater device."; return; }
    if (typeof confirm === "function" && !confirm(`Confirm floater device at ${location}?`)) return;
    const oldLocation = state.workingLocation;
    state.currentDeviceId = device.id; state.workingLocation = location; state.floaterLocationConfirmed = true;
    addAudit("floater_location_confirmed", `Floater ${device.id} location confirmed from ${oldLocation} to ${location}.`, consoleActor(), location);
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
  const existingId = el.deviceEditId.value; const id = canonicalDeviceId(el.deviceIdInput.value, state.devices.length); const name = el.deviceNameInput.value.trim(); const imei = normalizeImei(el.deviceImeiInput.value); const type = el.deviceTypeInput.value; const assignedLocation = type === "Fixed" ? el.deviceLocationInput.value : ""; const status = el.deviceStatusInput.value;
  let invalid = false;
  if (!id) { el.deviceIdError.textContent = "Device ID is required."; invalid = true; }
  if (!existingId && state.devices.some((device) => device.id === id)) { el.deviceIdError.textContent = "Device ID must be unique."; invalid = true; }
  if (!name) { el.deviceNameError.textContent = "Friendly device name is required."; invalid = true; }
  if (!imei) { el.deviceImeiError.textContent = "IMEI is required."; invalid = true; }
  if (state.devices.some((device) => device.id !== existingId && device.imei === imei)) { el.deviceImeiError.textContent = "IMEI must be unique."; invalid = true; }
  if (type === "Fixed" && !activeLocations().some((location) => location.name === assignedLocation)) { el.deviceLocationError.textContent = "Fixed device requires one active location."; invalid = true; }
  if (invalid) return;
  const now = new Date().toISOString(); const existing = state.devices.find((device) => device.id === existingId);
  const fields = { id, name, imei, type, assignedLocation, status, active: status !== "Inactive", phone: el.devicePhoneInput.value.trim(), notes: el.deviceNotesInput.value.trim(), updatedAt: now, updatedBy: consoleActor() };
  if (existing) { const oldLocation = existing.assignedLocation; if (existing.type === "Fixed" && type === "Fixed" && oldLocation !== assignedLocation && typeof confirm === "function" && !confirm(`Reassign fixed device ${id} from ${oldLocation} to ${assignedLocation}?`)) return; Object.assign(existing, fields); if (existing.id === state.currentDeviceId && existing.type === "Fixed") { state.workingLocation = existing.assignedLocation; state.floaterLocationConfirmed = false; } addAudit("device_edited", `Device ${id} edited.`, consoleActor(), assignedLocation); if (oldLocation !== assignedLocation) addAudit("fixed_device_reassigned", `Device ${id} reassigned from ${oldLocation || "unassigned"} to ${assignedLocation || "floater"}.`, consoleActor(), assignedLocation); }
  else { state.devices.push({ ...fields, createdAt: now, lastUsedAt: "", lastTransactionLocation: "", createdBy: consoleActor() }); addAudit("device_created", `Device ${id} created.`, consoleActor(), assignedLocation); }
  saveState(); populateLocationControls(); closeDeviceModal(); renderAll();
}

function handleDeviceTableAction(event) {
  const button = event.target.closest("[data-device-action]"); if (!button) return;
  const device = state.devices.find((item) => item.id === button.dataset.deviceId); if (!device) return;
  if (button.dataset.deviceAction === "edit") { openDeviceModal(device); return; }
  if (button.dataset.deviceAction === "history") { el.deviceActionStatus.textContent = `${device.id}: last used ${device.lastUsedAt ? formatTimestamp(device.lastUsedAt) : "never"}; last transaction location ${device.lastTransactionLocation || "-"}.`; return; }
  const activate = button.dataset.deviceAction === "reactivate";
  if (typeof confirm === "function" && !confirm(`${activate ? "Reactivate" : "Mark inactive"} device ${device.id}?`)) return;
  device.active = activate; device.status = activate ? "Active" : "Inactive"; device.updatedAt = new Date().toISOString(); device.updatedBy = consoleActor();
  addAudit(activate ? "device_reactivated" : "device_inactivated", `Device ${device.id} ${activate ? "reactivated" : "marked inactive"}.`, consoleActor(), device.assignedLocation);
  saveState(); renderAll();
}

function renderDevices() {
  if (!el.devicesTableBody) return;
  const devices = state.devices || [];
  el.devicesTableBody.innerHTML = devices.map((device) => `<tr><td><button class="table-action mono" type="button" data-device-action="edit" data-device-id="${escapeHtml(device.id)}" aria-label="Open ${escapeHtml(device.id)} to edit">${escapeHtml(device.id)}</button></td><td>${escapeHtml(device.name)}</td><td class="mono">${escapeHtml(device.imei)}</td><td>${escapeHtml(device.type)}</td><td>${escapeHtml(device.assignedLocation || "Floater")}</td><td><span class="status-badge ${device.active ? "authorized" : "inactive"}">${escapeHtml(device.status)}</span></td><td>${device.lastUsedAt ? escapeHtml(formatTimestamp(device.lastUsedAt)) : "-"}</td><td>${escapeHtml(device.lastTransactionLocation || "-")}</td><td class="action-stack"><button class="table-action" type="button" data-device-action="history" data-device-id="${escapeHtml(device.id)}">History</button><button class="table-action ${device.active ? "danger-text" : "success-text"}" type="button" data-device-action="${device.active ? "inactive" : "reactivate"}" data-device-id="${escapeHtml(device.id)}">${device.active ? "Mark inactive" : "Reactivate"}</button></td></tr>`).join("") || `<tr><td colspan="9" class="empty-cell">No devices configured.</td></tr>`;
  const deviceEvents = state.auditEvents.filter((event) => event.type.includes("device") || event.type.includes("floater")).slice(0, 5);
  el.deviceHistoryList.innerHTML = deviceEvents.length ? deviceEvents.map((event) => `<article class="audit-event muted"><div class="audit-type">${escapeHtml(event.type.replaceAll("_", " "))}</div><div><h2>${escapeHtml(event.description)}</h2><p>${escapeHtml(event.actor)}</p></div><time>${escapeHtml(formatTimestamp(event.timestamp))}</time></article>`).join("") : `<p class="empty-state">No device changes recorded.</p>`;
}

function addAudit(type, description, actor, location, source = "user action") {
  const event = {
    id: makeId("audit"),
    timestamp: new Date().toISOString(),
    type,
    description,
    actor,
    location,
    source
  };
  // Sent to the shared records like everything else, so that a blocked OUT or a denied approval is
  // not evidence held on one phone only, and so the phone can clear it once the server has it.
  if (sharingChanges()) event.sync = "local";
  state.auditEvents.unshift(event);
  // Returned so a movement's own entries can be tied to it, and trimmed with it once the shared
  // records hold both.
  return event;
}

function renderAll() {
  renderScannerContext();
  renderSupervisor();
  renderVehicles();
  renderDevices();
  renderDesktopUsers();
  renderLocationOverrides();
  runSearch(false);
  renderSearchResults();
  renderSyncStatus();
  renderConsoleGate();
  renderLoginsPanel();
  renderPhoneSignIn();
  applyRoleVisibility();
}

function renderScannerContext() {
  const today = dateKey(new Date());
  const transactionsToday = state.transactions.filter((item) => dateKey(new Date(item.timestamp)) === today);
  const auditToday = state.auditEvents.filter((item) => dateKey(new Date(item.timestamp)) === today);
  el.todayOutCount.textContent = transactionsToday.filter((item) => item.direction === "OUT").length;
  el.todayInCount.textContent = transactionsToday.filter((item) => item.direction === "IN").length;
  el.todayBlockCount.textContent = auditToday.filter((item) => item.type === "blocked_out").length;
}

function renderScanSummary() {
  const driver = findDriver(el.driverInput.value);
  const vehicle = readVehicleInput();
  const authorization = driver ? authorizationLabel(driver, ui.direction) : "Awaiting driver";
  el.scanSummary.innerHTML = summaryRows([
    ["Movement", `Vehicle ${ui.direction}`],
    ["Location", el.scannerLocation.value],
    // CR-V16: the name identifies the driver to the operator; the employee # is not shown.
    ["Driver", driver ? driver.name : "Awaiting employee #"],
    ["Vehicle", vehicle ? `${vehicle.assignedBarcode} - ${vehicleDescription(vehicle)}` : "Awaiting barcode"],
    ["Authorization", authorization]
  ]);
}

function authorizationLabel(driver, direction) {
  const auth = findActiveAuthorization(driver.employeeNumber);
  const license = licenseStatus(driver);
  if (license.tone === "expired") return "Driver's license expired - authorization blocked";
  if (auth) return `Authorized until ${formatTimestamp(auth.expiresAt)}`;
  if (direction === "IN") return "Unauthorized IN - operational review";
  if (direction === "OUT" && scanOverrideDecision({ driver, location: el.scannerLocation.value, driverEntryMethod: ui.driverEntryMethod }).applies) return "No daily authorization - allowed by this location's scanned-badge override";
  if (direction === "OUT") return "Supervisor approval required";
  return "Not authorized";
}

function summaryRows(rows) {
  return rows.map(([label, value]) => `<li><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></li>`).join("");
}

function renderSupervisor() {
  expireAuthorizations("render");
  const activeAuths = state.authorizations.filter((auth) => auth.status === "active");
  el.adminAuthorizedCount.textContent = activeAuths.length;
  // CR-V16: Patrick 2026-09-13 read an empty list beside two drivers marked Active as a bug, and
  // asked for "its own [count] as a double check from the main section". Active on the roster means
  // the driver may work, not that they are authorized today, so this states both numbers, and
  // recounts from the roster, which reads authorizations by a different route.
  const rosterAuthorized = state.drivers.filter((driver) => findActiveAuthorization(driver.employeeNumber)).length;
  const waiting = state.drivers.filter((driver) => driver.active && !findActiveAuthorization(driver.employeeNumber)).length;
  el.authorizationCrossCheck.textContent = rosterAuthorized === activeAuths.length
    ? `${activeAuths.length} authorized now. ${waiting} active ${waiting === 1 ? "driver is" : "drivers are"} not authorized today.`
    : `Check: this list has ${activeAuths.length}, but the roster shows ${rosterAuthorized} authorized. Refresh the page, and report it if the numbers still differ.`;
  el.authorizedDriversBody.innerHTML = activeAuths.length ? activeAuths.map((auth) => {
    const driver = findDriverAny(auth.driverEmployee);
    // CR-V18, Patrick: "the more narrow we can make these lines, the better" - four locations with
    // 15 to 20 drivers each. One line per driver; the scope is the same for all, so it is said once above.
    return `<tr><td><strong>${escapeHtml(driver ? driver.name : "Unknown driver")}</strong> <span class="muted mono">${escapeHtml(auth.driverEmployee)}</span></td><td>${escapeHtml(humanDuration(auth.type))}</td><td>${escapeHtml(formatTimestamp(auth.expiresAt))}</td><td><button class="table-action danger-text" type="button" data-needs="fleetLead" data-driver-action="deauthorize" data-driver-employee="${escapeHtml(auth.driverEmployee)}">Revoke</button></td></tr>`;
  }).join("") : `<tr><td colspan="6" class="empty-cell">No active driver authorizations.</td></tr>`;

  const rosterNeedle = normalize(el.driverRosterSearch.value);
  const activity = lastActivityIndex();
  const lastMoved = (driver) => activity.get(`driver:${driver.employeeNumber}`) || 0;
  const roster = state.drivers
    .filter((driver) => !rosterNeedle || driver.employeeNumber.includes(rosterNeedle) || driver.name.toUpperCase().includes(rosterNeedle))
    .sort((a, b) => lastMoved(b) - lastMoved(a) || a.name.localeCompare(b.name));
  el.driversTableBody.innerHTML = roster.map(renderDriverRow).join("") || `<tr><td colspan="10" class="empty-cell">No drivers match this search.</td></tr>`;
  renderLicenseCounts();
  renderLicenseWarnings();
}

// CR-V16: Patrick 2026-09-13 asked for Drivers and Vehicles to "sort by recent activity", so the
// people a supervisor is most likely to reactivate sit near the top. This is the latest movement
// time per driver, vehicle id and barcode. The keys are prefixed because an employee # may now
// contain letters, and G0001 could be either.
function lastActivityIndex() {
  const latest = new Map();
  const note = (key, time) => { if (time > (latest.get(key) || 0)) latest.set(key, time); };
  state.transactions.forEach((item) => {
    const time = new Date(item.timestamp).getTime();
    if (!Number.isFinite(time)) return;
    if (item.driverEmployee) note(`driver:${item.driverEmployee}`, time);
    if (item.vehicleId) note(`vehicle:${item.vehicleId}`, time);
    if (item.vehicleBarcode) note(`barcode:${item.vehicleBarcode}`, time);
  });
  return latest;
}

function renderDesktopUsers() {
  if (!el.desktopUsersTableBody) return;
  const users = state.desktopUsers || [];
  el.desktopUsersTableBody.innerHTML = users.length ? users.map((user) => {
    const normalizedUser = normalizeDesktopUser(user);
    return `<tr><td><button class="table-action mono" type="button" data-user-action="edit" data-user-id="${escapeHtml(normalizedUser.id)}" aria-label="Open ${escapeHtml(normalizedUser.name)} to edit">${escapeHtml(normalizedUser.id)}</button></td><td><button class="table-action" type="button" data-user-action="edit" data-user-id="${escapeHtml(normalizedUser.id)}">${escapeHtml(normalizedUser.name)}</button></td><td class="mono">${escapeHtml(normalizedUser.username)}</td><td>${escapeHtml(normalizedUser.role)}</td><td><span class="status-badge ${normalizedUser.active ? "authorized" : "inactive"}">${normalizedUser.active ? "Active" : "Inactive"}</span></td><td>${escapeHtml(normalizedUser.scope)}</td><td>${escapeHtml(credentialStatusLabel(normalizedUser))}</td><td>${abilitySummary(normalizedUser.abilities)}</td><td class="action-stack"><button class="table-action" type="button" data-user-action="reset" data-user-id="${escapeHtml(normalizedUser.id)}">Mark reset</button></td></tr>`;
  }).join("") : `<tr><td colspan="9" class="empty-cell">No desktop users configured.</td></tr>`;
}

function credentialStatusLabel(user) {
  const credential = user.credentialPrototype || {};
  if (credential.resetRequired) return "Reset required";
  if (credential.passwordStatus === "demo_value_entered_not_saved") return "Demo password entered - not saved";
  return "No production password stored";
}

function abilitySummary(abilities) {
  const normalized = normalizeDesktopAbilities(abilities);
  return DESKTOP_USER_ABILITIES.map((ability) => {
    const level = normalized[ability.id];
    const badgeClass = level === "Assign" ? "authorized" : level === "View only" ? "unauthorized" : "inactive";
    return `<span class="ability-chip ${badgeClass}">${escapeHtml(ability.title)}: ${escapeHtml(level)}</span>`;
  }).join(" ");
}

function handleDesktopUserAction(event) {
  const button = event.target.closest("[data-user-action]");
  if (!button) return;
  const user = state.desktopUsers.find((item) => item.id === button.dataset.userId);
  if (!user) return;
  if (button.dataset.userAction === "edit") {
    openDesktopUserModal(user);
    return;
  }
  if (button.dataset.userAction !== "reset") return;
  user.credentialPrototype = { ...(user.credentialPrototype || {}), passwordStatus: "reset_invite_pending", resetRequired: true, updatedAt: new Date().toISOString() };
  addAudit("desktop_user_password_reset_marked", `Desktop user ${user.id} marked for prototype password reset. No reset email was sent.`, consoleActor(), user.scope || "");
  saveState();
  renderAll();
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
    <td><span class="status-badge ${statusClass}" title="${escapeHtml(license.label)}">${escapeHtml(license.short)}</span></td>
    <td>${escapeHtml(formatDate(driver.licenseExpires))}</td>
    <td><span class="status-badge ${auth ? "authorized" : "unauthorized"}">${auth ? "Auth" : "No auth"}</span></td>
    <td>${auth ? escapeHtml(humanDuration(auth.type)) : "-"}</td>
    <td>${auth ? escapeHtml(formatTimestamp(auth.expiresAt)) : "-"}</td>
    <td>${driverActionMenu(driver, auth, eligible)}</td>
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
  el.licenseWarningBody.innerHTML = warnings.length ? warnings.map(({ driver, license }) => `<tr><td>${escapeHtml(driver.employeeNumber)}</td><td>${escapeHtml(driver.name)}</td><td>${escapeHtml(formatDate(driver.licenseExpires))}</td><td><span class="status-badge ${license.tone === "expired" ? "expired" : "unauthorized"}" title="${escapeHtml(license.label)}">${escapeHtml(license.short)}</span></td><td>${driver.active ? "Active" : "Inactive"}</td></tr>`).join("") : `<tr><td colspan="5" class="empty-cell">No licenses approaching expiration.</td></tr>`;
}

function renderLocationOverrides() {
  if (!el.locationOverrideBody) return;
  el.locationOverrideBody.innerHTML = activeLocations().map((location) => {
    const override = normalizeScanOverride(location.scanOverride);
    const changed = override.changedAt ? `${formatTimestamp(override.changedAt)} by ${override.changedBy || "unknown"}` : "Never changed";
    return `<tr><td>${escapeHtml(location.name)}</td><td><span class="status-badge ${override.enabled ? "provisional" : "inactive"}">${override.enabled ? "On" : "Off"}</span></td><td>${escapeHtml(changed)}</td><td><button class="table-action ${override.enabled ? "danger-text" : ""}" type="button" data-override-location="${escapeHtml(location.name)}">${override.enabled ? "Turn off" : "Turn on"}</button></td></tr>`;
  }).join("") || `<tr><td colspan="4" class="empty-cell">No active locations.</td></tr>`;
}

function handleLocationOverrideAction(event) {
  const button = event.target.closest("[data-override-location]");
  if (!button) return;
  const location = state.locations.find((item) => item.name === button.dataset.overrideLocation);
  if (!location) return;
  const turningOn = !normalizeScanOverride(location.scanOverride).enabled;
  const question = turningOn
    ? `Turn ON the scanned-badge override at ${location.name}? A driver whose badge is scanned there can leave without a daily authorization.`
    : `Turn OFF the scanned-badge override at ${location.name}? Daily authorization will be required again.`;
  if (typeof confirm === "function" && !confirm(question)) return;
  location.scanOverride = { enabled: turningOn, changedBy: consoleActor(), changedAt: new Date().toISOString() };
  addAudit(turningOn ? "location_override_enabled" : "location_override_disabled", `Scanned-badge override turned ${turningOn ? "on" : "off"} at ${location.name}.`, consoleActor(), location.name);
  saveState();
  renderAll();
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
  // The printout name belongs to the person, not the search, so Clear leaves it.
  const printedBy = el.searchPrintedBy.value;
  el.searchForm.reset();
  el.searchPrintedBy.value = printedBy;
  el.filterLocation.value = "";
  ui.searchLimit = SEARCH_PAGE_SIZE;
  renderAll();
}

function runSearch(resetPage) {
  // While the console is reading the shared database, a re-render of anything else must not
  // quietly replace those rows with this device's copy.
  if (ui.searchSource === "shared" && !resetPage) return;
  ui.searchSource = "device";
  ui.searchTotal = null;
  ui.searchCursor = null;
  ui.searchResults = filterTransactions();
  ui.searchRanAt = new Date().toISOString();
  ui.searchCriteria = searchCriteriaText();
  if (resetPage) ui.searchLimit = SEARCH_PAGE_SIZE;
}

function searchCriteriaText() {
  const parts = [];
  if (el.filterVehicle.value.trim()) parts.push(`Barcode, VIN, or plate: ${el.filterVehicle.value.trim()}`);
  if (el.filterDriver.value.trim()) parts.push(`Employee # or driver: ${el.filterDriver.value.trim()}`);
  if (el.filterLocation.value) parts.push(`Location: ${el.filterLocation.value}`);
  if (el.filterDate.value) parts.push(`Date: ${formatDate(`${el.filterDate.value}T12:00:00`)}`);
  if (el.filterType.value) parts.push(`Movement: Vehicle ${el.filterType.value}`);
  return parts.length ? parts.join("; ") : "All movements (no filters)";
}

function showMoreSearchResults() {
  // Against the shared database the next 50 rows are fetched, not revealed: that is the resource
  // saving Patrick asked about on 2026-09-13. Against this device's copy there is nothing to
  // fetch, so the page size only limits what is drawn.
  if (ui.searchSource === "shared") {
    searchShared(false);
    return;
  }
  ui.searchLimit = (ui.searchLimit || SEARCH_PAGE_SIZE) + SEARCH_PAGE_SIZE;
  renderSearchResults();
}

// --- CR-V17 step 2: reading the shared database ---------------------------

function cloudReady() {
  return !DEMO_MODE && Boolean(window.VeriGateCloud && window.VeriGateCloud.status().signedIn);
}

// The search fields, in the names the API uses. The date box is already a YYYY-MM-DD value.
function cloudSearchFilters() {
  return {
    vehicle: el.filterVehicle.value.trim(),
    driver: el.filterDriver.value.trim(),
    location: el.filterLocation.value,
    date: el.filterDate.value,
    direction: el.filterType.value,
    limit: SEARCH_PAGE_SIZE
  };
}

function submitSearch() {
  const dateProblem = searchDateProblem();
  if (dateProblem) {
    el.searchSourceNote.textContent = dateProblem;
    el.filterDate.focus();
    return;
  }
  if (cloudReady()) {
    searchShared(true);
    return;
  }
  runSearch(true);
  renderSearchResults();
}

function searchShared(reset) {
  if (ui.searchBusy) return;
  const cloud = window.VeriGateCloud;
  const filters = reset ? cloudSearchFilters() : ui.searchFilters || cloudSearchFilters();
  const cursor = reset ? null : ui.searchCursor;
  if (!reset && !cursor) return;
  ui.searchBusy = true;
  ui.searchFilters = filters;
  el.searchSourceNote.textContent = reset ? "Reading the shared database..." : "Reading the next 50 from the shared database...";
  cloud.movements(filters, cursor).then((page) => {
    // Cleared before the render, or the render leaves "Reading..." on screen after it finished.
    ui.searchBusy = false;
    const rows = reset ? page.movements : (ui.searchResults || []).concat(page.movements);
    ui.searchSource = "shared";
    ui.searchResults = rows;
    ui.searchLimit = rows.length;
    ui.searchCursor = page.next;
    if (reset || typeof page.total === "number") ui.searchTotal = typeof page.total === "number" ? page.total : ui.searchTotal;
    ui.searchRanAt = reset ? new Date().toISOString() : ui.searchRanAt;
    ui.searchCriteria = searchCriteriaText();
    renderSearchResults();
  }).catch((error) => {
    // A failure must never look like an empty gate log. The rows on this device are shown
    // instead, clearly labelled, so nobody reads "no movements" off a dropped connection.
    ui.searchBusy = false;
    runSearch(true);
    renderSearchResults();
    el.searchSourceNote.textContent = `${error.message} Showing the records on this device instead.`;
  });
}

function searchSourceText() {
  if (ui.searchSource === "shared") {
    const scope = ui.searchCursor ? "The next 50 are fetched when you ask for them." : "This is every matching row.";
    return `From the shared Veri-Gate database. ${scope}`;
  }
  return cloudReady()
    ? "From this device. Run the search again to read the shared database."
    : "From this device only. Sign in to read what every scanner recorded.";
}

function handleCloudPillClick() {
  if (cloudReady()) {
    window.VeriGateCloud.signOut();
    ui.searchSource = "device";
    runSearch(true);
    renderSearchResults();
    return;
  }
  openCloudSignIn();
}

function openCloudSignIn() {
  ui.modalTrigger = el.cloudStatusButton;
  el.cloudPassword.value = "";
  el.cloudNewPassword.value = "";
  el.cloudSignInModal.classList.remove("hidden");
  // A first sign-in that was interrupted picks up where it left off, rather than starting over.
  if (ui.cloudChallenge) {
    el.cloudUsername.value = ui.cloudChallenge.username;
    el.cloudNewPasswordRow.classList.remove("hidden");
    el.cloudSignInSubmit.textContent = "Set password and sign in";
    el.cloudSignInStatus.textContent = "This login needs a new password before it can be used.";
    el.cloudNewPassword.focus();
    return;
  }
  el.cloudSignInStatus.textContent = "";
  el.cloudNewPasswordRow.classList.add("hidden");
  el.cloudSignInSubmit.textContent = "Sign in";
  el.cloudUsername.focus();
}

function closeCloudSignIn() {
  el.cloudSignInModal.classList.add("hidden");
  el.cloudPassword.value = "";
  el.cloudNewPassword.value = "";
  if (ui.modalTrigger && typeof ui.modalTrigger.focus === "function") ui.modalTrigger.focus();
}

function submitCloudSignIn(event) {
  event.preventDefault();
  const cloud = window.VeriGateCloud;
  if (!cloud) {
    el.cloudSignInStatus.textContent = "The cloud client did not load.";
    return;
  }
  const username = el.cloudUsername.value.trim();
  el.cloudSignInStatus.textContent = "Signing in...";
  el.cloudSignInSubmit.disabled = true;
  // The Admin hands out a temporary password, so the first sign-in always asks for a new one.
  const attempt = ui.cloudChallenge
    ? cloud.completeNewPassword(ui.cloudChallenge.username, el.cloudNewPassword.value, ui.cloudChallenge.challengeSession)
    : cloud.signIn(username, el.cloudPassword.value);
  attempt.then((result) => {
    if (result && result.challenge === "NEW_PASSWORD_REQUIRED") {
      ui.cloudChallenge = result;
      el.cloudNewPasswordRow.classList.remove("hidden");
      el.cloudSignInSubmit.textContent = "Set password and sign in";
      el.cloudSignInStatus.textContent = "This login needs a new password before it can be used.";
      el.cloudNewPassword.focus();
      return;
    }
    ui.cloudChallenge = null;
    closeCloudSignIn();
    // Signed in, so the search that matters is the shared one.
    submitSearch();
  }).catch((error) => {
    el.cloudSignInStatus.textContent = error.message || "Sign-in failed.";
  }).then(() => {
    el.cloudSignInSubmit.disabled = false;
  });
}

// The console's pill also says when something has not reached the shared records, since the
// scanner's waiting line is not on the console.
function renderCloudPill() {
  if (!el.cloudStatusButton || !window.VeriGateCloud) return;
  const status = window.VeriGateCloud.status();
  if (!status.signedIn) return;
  const waiting = syncQueue().length;
  const refused = refusedMovements().length + refusedChanges().length;
  const extra = refused ? ` - ${refused} refused` : waiting ? ` - ${waiting} waiting` : "";
  el.cloudStatusButton.textContent = `Shared records: ${status.username}${extra}`;
  el.cloudStatusButton.dataset.state = refused ? "refused" : "connected";
}

function renderCloudStatus(status) {
  const signedIn = Boolean(status && status.signedIn);
  el.cloudStatusButton.textContent = signedIn ? `Shared records: ${status.username}` : "This device only";
  el.cloudStatusButton.dataset.state = signedIn ? "connected" : "local";
  el.cloudStatusButton.title = signedIn
    ? "Reading the shared Veri-Gate database. Click to sign out."
    : "Records come from this device. Click to sign in to the shared database.";
  if (!signedIn && ui.searchSource === "shared") {
    ui.searchSource = "device";
    runSearch(true);
  }
  renderSearchResults();
}

function startCloud() {
  if (!window.VeriGateCloud || IN_TEST_HARNESS || DEMO_MODE) {
    // No shared records here, so no pill offering to sign in to them.
    if (DEMO_MODE && el.cloudStatusButton) el.cloudStatusButton.classList.add("hidden");
    return;
  }
  startSync();
  window.VeriGateCloud.onChange((status) => {
    renderCloudStatus(status);
    renderConsoleGate();
    applyRoleVisibility();
    renderPhoneSignIn();
    if (status.signedIn) loadLogins(); else ui.logins = null;
    // Signing in is the moment a device that recorded offline can finally send its backlog, and
    // then take in the shared records.
    if (status.signedIn) syncDevice().then(() => pullReference());
  });
  const status = window.VeriGateCloud.start();
  renderCloudStatus(status);
  if (status.signedIn) syncDevice().then(() => pullReference());
}

// CR-V16: Patrick 2026-09-13 wants a printable search for "a criminal matter or even just as
// documentation for employee termination", carrying the person's name, the date and time, and the
// search criteria. The browser's print dialog does that without a server: it prints to paper or
// saves a PDF on the user's own machine. What prints is what is on screen, and the footer says how
// many of the matching rows that is.
function printSearch() {
  const printedBy = el.searchPrintedBy.value.trim();
  if (!printedBy) {
    el.searchPrintStatus.textContent = "Enter your name first. It is printed with the search details.";
    el.searchPrintedBy.focus();
    return;
  }
  const results = ui.searchResults || [];
  const shown = Math.min(results.length, ui.searchLimit || SEARCH_PAGE_SIZE);
  const matching = typeof ui.searchTotal === "number" ? ui.searchTotal : results.length;
  const printedAt = new Date().toISOString();
  const criteria = ui.searchCriteria || searchCriteriaText();
  el.searchPrintFooter.innerHTML = [
    ["Search criteria", criteria],
    ["Search run", formatTimestamp(ui.searchRanAt || printedAt)],
    // A printout that may end up in a termination file or a police report has to say which
    // records it came from: the shared database, or only the device it was printed on.
    ["Records from", ui.searchSource === "shared" ? "the shared Veri-Gate database" : "this device only"],
    ["Rows printed", `${shown} of ${matching} matching movement${matching === 1 ? "" : "s"}`],
    ["Printed by", `${printedBy}, ${formatTimestamp(printedAt)}`]
  ].map(([label, value]) => `<p><strong>${escapeHtml(label)}:</strong> ${escapeHtml(value)}</p>`).join("");
  addAudit("search_printed", `Search printed by ${printedBy}. Criteria: ${criteria}. Rows: ${shown} of ${matching}. Source: ${ui.searchSource === "shared" ? "shared database" : "this device"}.`, printedBy, el.filterLocation.value || "");
  saveState();
  el.searchPrintStatus.textContent = "";
  if (typeof window.print === "function") window.print();
}

function renderSearchResults() {
  const results = ui.searchResults || [];
  const shown = results.slice(0, ui.searchLimit || SEARCH_PAGE_SIZE);
  // Reading the shared database, the count comes from the server: the rows here are the pages
  // fetched so far, and there may be more waiting behind the cursor.
  const matching = typeof ui.searchTotal === "number" ? ui.searchTotal : results.length;
  const remaining = ui.searchSource === "shared" ? Math.max(matching - shown.length, 0) : results.length - shown.length;
  el.searchResultCount.textContent = matching;
  el.searchShowing.textContent = matching ? `Showing ${shown.length} of ${matching}.` : "";
  el.searchMoreButton.classList.toggle("hidden", ui.searchSource === "shared" ? !ui.searchCursor : remaining <= 0);
  el.searchMoreButton.textContent = `Show next ${Math.min(SEARCH_PAGE_SIZE, Math.max(remaining, 0)) || SEARCH_PAGE_SIZE}`;
  if (el.searchSourceNote && !ui.searchBusy) el.searchSourceNote.textContent = searchSourceText();
  el.searchResultsBody.innerHTML = shown.length ? shown.map((item) => `<tr>
    <td>${formatTimestamp(item.timestamp)}</td><td><span class="movement-chip ${escapeHtml(String(item.direction).toLowerCase())}">${escapeHtml(item.direction)}</span></td><td>${escapeHtml(item.driverEmployee)}</td><td>${escapeHtml(item.driverName)}</td><td>${escapeHtml(entryMethodLabel(item.driverEntryMethod))}</td><td class="mono">${escapeHtml(item.vehicleBarcode || "-")}</td><td>${escapeHtml(entryMethodLabel(item.vehicleEntryMethod))}</td><td class="mono">${escapeHtml(item.vin)}</td><td>${escapeHtml(item.plate || "-")}</td><td>${escapeHtml(item.location)}${isHistoricalOnlyLocation(item.location) ? ` <span class="status-badge inactive">History only</span>` : ""}</td><td><span class="status-badge ${item.authorizationStatus === "Authorized" ? "authorized" : item.authorizationStatus === LOCATION_OVERRIDE_STATUS ? "provisional" : "unauthorized"}">${escapeHtml(item.authorizationStatus)}</span></td><td>${escapeHtml(item.note || "-")}</td><td>${escapeHtml(item.submittedBy)}</td><td>${escapeHtml(item.uploadedBy || "-")}</td>
  </tr>`).join("") : `<tr><td colspan="14" class="empty-cell">No transactions match these filters.</td></tr>`;
}

function isHistoricalOnlyLocation(locationName) {
  const location = state.locations.find((item) => item.name === locationName);
  return Boolean(location && location.historicalOnly);
}

function resetDemo() {
  const ok = typeof confirm === "function" ? confirm("Reset the Veri-Gate demo data? Current prototype changes will be replaced.") : true;
  if (!ok) return;
  const fresh = createSeedState();
  // A new epoch, so another open tab cannot merge the old records back in.
  fresh.resetEpoch = Date.now();
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
  // A device that cannot save must not show "saved" for anything, including the next movement.
  if (ui.saveFailed && tone !== "danger") { message = SAVE_FAILED_NOTICE; tone = "danger"; }
  el.scannerNotice.textContent = message;
  el.scannerNotice.className = `scanner-alert ${tone}`;
}

function updateClock() {
  el.deviceClock.textContent = new Intl.DateTimeFormat([], { timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit" }).format(new Date());
}

function normalize(value) {
  return String(value || "").trim().toUpperCase();
}

function normalizeEmployee(value) {
  return canonicalEmployeeId(value);
}

// CR-V14 item 3, Patrick 2026-09-12: "Employee numbers must be allowed to contain letters."
// This used to strip every non-digit and re-apply an "E", so AB123 silently became E123 and two
// different people could collapse onto one record. Letters and digits are both kept now.
//
// The legacy folding is kept for numeric IDs only: EMP-1003, E-1003 and 1003 all still mean E1003,
// because that is how existing records, the seed data and Patrick's test values are written. It is
// deliberately not applied when anything non-numeric follows, so AB123 stays AB123 and is never
// mistaken for a prefixed number.
function canonicalEmployeeId(value) {
  const source = normalize(value).replace(/[^A-Z0-9]/g, "");
  if (!source) return "";
  const legacyNumeric = source.match(/^(?:EMP|E)?(\d+)$/);
  return legacyNumeric ? `E${legacyNumeric[1]}` : source;
}

// The digits actually present, with the prefix and separators stripped and nothing added.
// canonicalVehicleBarcode pads, which is right for a scanner and for legacy records but hides
// the difference between a finished barcode and a half-typed one.
function vehicleBarcodeDigits(value) {
  return normalize(value).replace(/^GFV-?/, "").replace(/^G-?/, "").replace(/\D/g, "");
}

function canonicalVehicleBarcode(value, index) {
  const source = normalize(value);
  if (!source) return index === undefined ? "" : `G${String(index + 1).padStart(4, "0")}`;
  const digits = source.replace(/^GFV-?/, "").replace(/^G-?/, "").replace(/\D/g, "");
  return digits ? `G${digits.padStart(4, "0")}` : "";
}

function canonicalSupervisorId(value) {
  const digits = normalize(value).replace(/^SUP-?/, "").replace(/^S-?/, "").replace(/\D/g, "");
  return digits ? `S${digits}` : "";
}

function canonicalDeviceId(value, index = 0) {
  const source = normalize(value);
  const legacyDeviceIds = {
    "DEV-DIV-01": "D0001",
    "DEV-NORTH-01": "D0002",
    "DEV-EWR-01": "D0003",
    "DEV-LINDEN-01": "D0004",
    "DEV-FLOAT-01": "D0005"
  };
  if (legacyDeviceIds[source]) return legacyDeviceIds[source];
  if (/^D\d+$/.test(source)) return `D${source.slice(1).padStart(4, "0")}`;
  return `D${String(index + 1).padStart(4, "0")}`;
}

function normalizeLocationName(value) {
  const location = String(value || "").trim();
  if (location === "EWR") return "EWR North";
  if (location === "Elizabeth Repair Facility" || location === "Enterprise Repair Facility") return "Enterprise Repair Facility";
  return location;
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

// CR-V16: Patrick 2026-09-13, "All dates within the sections should follow this format": MM/DD/YY,
// with the time after it where there is one. Pinned to en-US because the order is the requirement;
// a browser set to a European locale would otherwise print 22/11/26.
// A missing or unreadable date is written as a dash, never thrown. Intl throws on one, and these
// run inside the table builders, so a single blank date used to take the whole console down with
// it: a vehicle a gate scan created in another tab arrived here with no "added at", and Vehicles,
// Drivers and the gate log all went blank together. One bad field must cost one cell.
function formatWhen(value, options, locale) {
  const date = new Date(value);
  if (!value || Number.isNaN(date.getTime())) return "-";
  return new Intl.DateTimeFormat(locale, options).format(date);
}

function formatTimestamp(value) {
  return formatWhen(value, { timeZone: BUSINESS_TIMEZONE, month: "2-digit", day: "2-digit", year: "2-digit", hour: "numeric", minute: "2-digit" }, "en-US");
}

function formatDate(value) {
  return formatWhen(value, { timeZone: BUSINESS_TIMEZONE, month: "2-digit", day: "2-digit", year: "2-digit" }, "en-US");
}

function formatTime(value) {
  return formatWhen(value, { timeZone: BUSINESS_TIMEZONE, hour: "numeric", minute: "2-digit" }, []);
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
    vehicle_added_by_scan: "Vehicle added by scan",
    desktop_user_edited: "Desktop user edited",
    override_denied_insufficient_role: "Override denied - rank",
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
