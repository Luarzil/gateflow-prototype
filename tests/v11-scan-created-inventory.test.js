const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const includes = (source, value) => () => assert.ok(source.includes(value), `Missing: ${value}`);
const excludes = (source, value) => () => assert.ok(!source.includes(value), `Unexpected: ${value}`);

// --- CR-V11: unknown vehicles are logged, not gated -------------------------
//
// Patrick, 2026-09-06: "If a vehicle comes to the gate and is not known to our inventory, that
// vehicle should be let in like any other vehicle... Regarding their exit, it should be handled
// just like any other vehicle... The whole purpose is to create a log."
//
// This supersedes CR-V08-BETA-CRITICAL-APP-001. These tests exist to stop the gate coming back.

test("there is no provisional inventory status", excludes(app, "PROVISIONAL_STATUS"));
test("no vehicle-level OUT block remains", excludes(app, "blockOutForIncompleteVehicle"));
test("the OUT path no longer consults an inventory status", excludes(app, "isProvisionalVehicle"));

test("an unknown barcode is created rather than refused", includes(app, "createScannedVehicle"));

test("creation happens in either direction, not only on IN", () => {
  const start = app.indexOf("function startTransaction");
  const end = app.indexOf("function completeTransaction");
  const body = app.slice(start, end);
  assert.ok(body.includes("if (!draft.vehicle) {"), "unknown vehicles should be created regardless of direction");
  assert.ok(!/draft\.direction === "IN" && !draft\.vehicle/.test(body), "creation must not be limited to Vehicle IN");
});

test("a scan-created vehicle is ordinary inventory", () => {
  const start = app.indexOf("function createScannedVehicle");
  const end = app.indexOf("function mapTransactionVehicle");
  const body = app.slice(start, end);
  assert.ok(body.includes("inventoryStatus: COMPLETE_STATUS"), "should be complete, not provisional");
  assert.ok(body.includes("needsSupervisorCompletion: false"), "should not demand supervisor completion");
});

test("creation is still duplicate-safe on the canonical barcode", () => {
  const start = app.indexOf("function createScannedVehicle");
  const body = app.slice(start, start + 900);
  assert.ok(body.includes("if (existing) return existing;"), "a re-scan must reuse the existing record");
});

// --- the log Patrick asked for ---------------------------------------------

test("provenance is recorded so the log shows what arrived on its own", includes(app, 'const SCAN_CREATED_SOURCE = "inbound_scan";'));
test("provenance is exposed as a helper", includes(app, "function isScannerAddedVehicle"));
test("the supervisor list is a record, not a task list", includes(html, "This list is a record, not a task list."));
test("the panel no longer claims OUT is blocked", excludes(html, "stays blocked"));
test("the badge describes origin rather than incompleteness", includes(app, "This vehicle was added automatically when it was scanned at the gate"));

test("stored provisional records are released on load", () => {
  const start = app.indexOf("function normalizeVehicle");
  const end = app.indexOf("function mapTransactionVehicle");
  const body = app.slice(start, end);
  assert.ok(body.includes("inventoryStatus: COMPLETE_STATUS"), "nothing should remain provisional after migration");
});

// --- one Admin, not Manager and Admin ---------------------------------------

test("Manager is not a role", includes(app, 'const DESKTOP_USER_ROLES = ["Scanner", "Fleet Lead", "Supervisor", "Admin"];'));
test("stored Managers become Admin", includes(app, 'value === "Manager") return "Admin"'));
test("Manager is not selectable in the form", excludes(html, 'value="Manager"'));

// --- 081526 v7 item #1: users can be edited ---------------------------------

test("the user modal accepts an existing user", includes(app, "function openDesktopUserModal(user = null)"));
test("each user row offers an edit control", includes(app, 'data-user-action="edit" data-user-id='));
test("the edit action opens the modal populated", includes(app, 'if (button.dataset.userAction === "edit") {'));
test("editing updates in place instead of adding a duplicate", includes(app, "if (ui.editingUserId) {"));
test("the uniqueness check ignores the user being edited", includes(app, "user.id !== ui.editingUserId"));
test("a role change is auditable", includes(app, "Role changed from"));
test("closing the modal clears the edit state", includes(app, "function closeDesktopUserModal() { ui.editingUserId = null;"));

// --- the Fleet Lead override rule is untouched by any of this ---------------

test("the override still requires Fleet Lead or above", includes(app, 'const OVERRIDE_MIN_ROLE = "Fleet Lead";'));
test("the rank check still runs before the authorization is granted", () => {
  const start = app.indexOf("function approveSupervisorOverride");
  const body = app.slice(start, start + 1600);
  const gate = body.indexOf("canApproveOverride(supervisor)");
  const grant = body.indexOf("authorizeDriver(");
  assert.ok(gate > -1 && grant > -1 && gate < grant, "the rank check must still precede the grant");
});
