const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const readme = fs.readFileSync(path.join(root, "README.md"), "utf8");
const guide = fs.readFileSync(path.join(root, "Lot-Watch-GateFlow-V0.7-Call-Update-Guide.md"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

const includes = (source, value) => () => assert.ok(source.includes(value), `Missing: ${value}`);
const excludes = (source, value) => () => assert.ok(!source.includes(value), `Unexpected: ${value}`);
const matches = (source, expression) => () => assert.match(source, expression);

const cases = [
  ["01 scanner has four numbered steps", matches(html, /data-step="0"[\s\S]*data-step="3"/)],
  ["02 scanner starts on driver entry", includes(html, 'id="driverInput"')],
  ["03 scanner accepts employee example E1003", includes(html, "e.g. E1003")],
  ["04 scanner accepts vehicle example G0001", includes(html, 'placeholder="G0001"')],
  ["05 scanner has an OUT action", includes(html, 'id="directionOut"')],
  ["06 scanner has an IN action", includes(html, 'id="directionIn"')],
  ["07 scanner has a review submit action", includes(html, 'id="submitTransactionButton"')],
  ["08 scanner retains a back-to-home action", includes(html, 'id="flowCancel"')],
  ["09 scanner exposes compact feedback", includes(html, 'id="openScannerFeedbackButton"')],
  ["10 scanner does not expose Device setup", excludes(html, 'id="deviceSetupButton"')],
  ["11 scanner does not expose connectivity status", excludes(html, 'id="onlineStatus"')],
  ["12 scanner does not expose local-save status", excludes(html, 'id="lastSavedLocal"')],
  ["13 scanner does not expose keyboard-wedge wording", excludes(html, "Keyboard-wedge")],
  ["14 scanner does not expose Zebra wording", excludes(html, "Zebra")],
  ["15 review has movement", includes(app, '["Movement", `Vehicle ${ui.direction}`]')],
  ["16 review has location", includes(app, '["Location", el.scannerLocation.value]')],
  ["17 review has driver", includes(app, '["Driver", driver ?')],
  ["18 review has vehicle", includes(app, '["Vehicle", vehicle ?')],
  ["19 review has authorization", includes(app, '["Authorization", authorization]')],
  ["20 review omits VIN duplication", excludes(app.slice(app.indexOf("function renderScanSummary"), app.indexOf("function authorizationLabel")), '["VIN",')],
  ["21 employee IDs have a canonical helper", includes(app, "function canonicalEmployeeId")],
  ["22 employee IDs store E prefix", includes(app, "return digits ? `E${digits}`")],
  ["23 vehicle IDs have a canonical helper", includes(app, "function canonicalVehicleBarcode")],
  ["24 vehicle IDs store G prefix", includes(app, "return digits ? `G${digits.padStart(4, \"0\")}`")],
  ["25 supervisor IDs have a canonical helper", includes(app, "function canonicalSupervisorId")],
  ["26 device IDs have a canonical helper", includes(app, "function canonicalDeviceId")],
  ["27 E1003 is seeded", includes(app, 'seedDriver("E1003"')],
  ["28 G0001 is seeded", includes(app, 'seedVehicle("veh-001", "G0001"')],
  ["29 S1001 is seeded", includes(app, '{ id: "S1001"')],
  ["30 D0001 is seeded", includes(app, 'currentDeviceId: "D0001"')],
  ["31 legacy EMP IDs migrate", includes(app, 'replace(/^EMP-?/, "")')],
  ["32 legacy GFV IDs migrate", includes(app, 'replace(/^GFV-?/, "")')],
  ["33 legacy SUP IDs migrate", includes(app, 'replace(/^SUP-?/, "")')],
  ["34 legacy DIV device ID maps", includes(app, '"DEV-DIV-01": "D0001"')],
  ["35 legacy NORTH device ID maps", includes(app, '"DEV-NORTH-01": "D0002"')],
  ["36 legacy EWR device ID maps", includes(app, '"DEV-EWR-01": "D0003"')],
  ["37 legacy LINDEN device ID maps", includes(app, '"DEV-LINDEN-01": "D0004"')],
  ["38 legacy floater device ID maps", includes(app, '"DEV-FLOAT-01": "D0005"')],
  ["39 legacy supervisor records migrate", includes(app, "normalized.supervisors")],
  ["40 legacy working location migrates", includes(app, "normalized.workingLocation = normalizeLocationName")],
  ["41 EWR migrates to EWR North", includes(app, 'if (location === "EWR") return "EWR North"')],
  ["42 Division Street is configured", includes(app, '{ name: "Division Street", active: true }')],
  ["43 North Ave is configured", includes(app, '{ name: "North Ave", active: true }')],
  ["44 EWR North is configured", includes(app, '{ name: "EWR North", active: true }')],
  ["45 Linden is configured", includes(app, '{ name: "Linden", active: true }')],
  ["46 nonexistent yard is not seeded", excludes(app, '{ name: "Elizabeth Repair Facility"')],
  ["47 legacy removed-yard records are filtered", includes(app, 'transaction.location !== "Enterprise Repair Facility"')],
  ["48 pre-call migration data is backed up", includes(app, "PRE_CALL_MIGRATION_BACKUP_KEY")],
  ["49 migration stores its backup before conversion", includes(app, "localStorage.getItem(PRE_CALL_MIGRATION_BACKUP_KEY)")],
  ["50 valid driver clears stale scanner feedback", includes(app, 'setNotice("Driver found. Continue to the vehicle barcode.", "success")')],
  ["51 valid barcode clears stale scanner feedback", includes(app, 'setNotice("Vehicle found. Choose the movement.", "success")')],
  // CR-V08-BETA-CRITICAL-APP-001 superseded case 52: an unknown barcode is no longer blocked at
  // the barcode step. It is accepted, and OUT is gated on the vehicle record instead.
  ["52 an unknown barcode is added to inventory rather than gated", includes(app, "createScannedVehicle")],
  ["53 barcode uses canonical lookup", includes(app, "const value = canonicalVehicleBarcode(el.barcodeInput.value)")],
  ["54 supervisor field updates live status", includes(app, 'addEventListener("input", updateSupervisorStatus)')],
  ["55 supervisor valid state is visible", includes(app, "is ready to approve 9 hours")],
  // CR-V08-BETA-CRITICAL-APP-002 (081526 v7 edit #10): the override approver is now role-gated.
  ["56 approver valid state clears stale feedback", includes(app, "setNotice(`${OVERRIDE_MIN_ROLE} or above found. Approve the temporary authorization to continue.`, \"success\")")],
  ["57 approver invalid state remains visible and under-ranked approvers are denied", () => { assert.ok(app.includes("Approver ID was not found."), "invalid ID message"); assert.ok(app.includes("override_denied_insufficient_role"), "role denial is audited at approval time"); }],
  ["58 supervisor approval uses canonical ID", includes(app, "canonicalSupervisorId(el.supervisorInput.value)")],
  ["59 supervisor approval uses nine hours", includes(app, "const duration = TEMP_AUTHORIZATION_DURATION")],
  ["60 supervisor approval advances to OUT review", includes(app, 'chooseDirection("OUT")')],
  ["61 approval completion is visible", includes(app, "approved ${humanDuration(duration)}. Vehicle OUT can continue")],
  ["62 unauthorized OUT is still blocked", includes(app, "blockOutForSupervisor(draft.driver)")],
  ["63 unauthorized IN remains reviewable", includes(app, "Unauthorized IN - operational review")],
  ["64 expired license still blocks OUT", includes(app, "authorization_blocked_expired_license")],
  ["65 inactive vehicle still blocks movement", includes(app, "Vehicle is inactive and cannot be used")],
  ["66 feedback state exists", includes(app, "feedback: []")],
  ["67 scanner feedback records context", includes(app, "source: ui.feedbackSurface")],
  ["68 scanner feedback records location", includes(app, "location: state.workingLocation")],
  ["69 scanner feedback records current screen", includes(app, "screen = ui.feedbackSurface")],
  ["70 supervisor feedback supports longer details", includes(html, 'id="feedbackDetails"')],
  ["71 feedback is labelled local", includes(html, "Save feedback locally")],
  ["72 Users tab is present", includes(html, 'id="usersSection"')],
  ["73 desktop user directory is stored separately", includes(app, "desktopUsers:")],
  ["74 desktop roles are Scanner through Admin, with no separate Manager", includes(app, 'DESKTOP_USER_ROLES = ["Scanner", "Fleet Lead", "Supervisor", "Admin"]')],
  ["75 users remain prototype-only", includes(html, "Prototype-only user directory")],
  ["76 users can be added", includes(app, "function saveDesktopUser")],
  ["77 Device setup is Supervisor-only", includes(html, 'id="openDeviceSetupButton"')],
  ["78 current scanner setup remains outside scanning", includes(html, "outside the scan workflow")],
  ["79 service worker cache version changes", includes(worker, "v0.8-user-auth-abilities-static")],
  ["80 mobile safe-area action styling remains", includes(css, "safe-area-inset-bottom")],
  ["81 mobile action dock remains fixed", matches(css, /\.wizard-actions \{ position: fixed/)],
  ["82 README records the AWS read-only boundary", includes(readme, "read-only account and resource inventory")],
  ["83 operator guide documents test IDs", includes(guide, "E1003")],
  ["84 operator guide documents G0001", includes(guide, "G0001")]
];

assert.equal(cases.length, 84, "V0.7 release gate must retain exactly 84 cases");
for (const [name, check] of cases) test(name, check);
