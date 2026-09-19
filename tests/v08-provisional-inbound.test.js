// CR-V08-BETA-CRITICAL-APP-001 - provisional inbound vehicle creation.
// Source requirement: Patrick Amaral, email `thought`, 2026-09-01.
// Governing rule: "Allowed IN != Authorized OUT".
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");

const includes = (source, value) => () => assert.ok(source.includes(value), `Missing: ${value}`);
const excludes = (source, value) => () => assert.ok(!source.includes(value), `Unexpected: ${value}`);

// --- data model -----------------------------------------------------------
test("provisional and complete inventory states are named constants", includes(app, 'const PROVISIONAL_STATUS = "provisional";'));
test("vehicles carry an inventory status", includes(app, "inventoryStatus:"));
test("vehicles record where they came from", includes(app, 'createdSource: "inbound_scan"'));
test("provisional records are bound to the inbound transaction that created them", includes(app, "provisionalFromTxId"));

test("AC10 legacy vehicles without a status normalize to complete, never to provisional", () => {
  const normalize = app.slice(app.indexOf("function normalizeVehicle"), app.indexOf("function mapTransactionVehicle"));
  assert.ok(
    normalize.includes("vehicle.inventoryStatus === PROVISIONAL_STATUS ? PROVISIONAL_STATUS : COMPLETE_STATUS"),
    "normalizeVehicle must default unknown inventory status to complete"
  );
});

// --- inbound acceptance ---------------------------------------------------
test("AC1 an unknown barcode no longer stops the barcode step", excludes(app, 'setNotice("Vehicle barcode was not found. New movements require an assigned inventory barcode.", "danger")'));
test("AC1 an unknown barcode is not an error in the manual entry path", excludes(app, '"Vehicle barcode was not found. Enter the exact assigned barcode."'));
test("AC2 there is a single creation point for provisional records", includes(app, "function createProvisionalVehicle(barcode, context)"));

test("AC3/AC9 creation is duplicate-safe on the canonical barcode", () => {
  const create = app.slice(app.indexOf("function createProvisionalVehicle"), app.indexOf("function mapTransactionVehicle"));
  assert.ok(create.includes("const existing = findVehicleByBarcode(canonical);"), "must look up before creating");
  assert.ok(create.includes("if (existing) return existing;"), "must reuse an existing record instead of creating a duplicate");
});

test("AC4 the inbound movement is still recorded normally", includes(app, 'draft.direction === "OUT" ? "out_transaction" : "in_transaction"'));

// --- the security-critical gate -------------------------------------------
test("AC7 an unknown or provisional vehicle is blocked for OUT", includes(app, 'if (draft.direction === "OUT" && (!draft.vehicle || isProvisionalVehicle(draft.vehicle)))'));

test("AC7 the vehicle gate is evaluated BEFORE any driver authorization check", () => {
  const start = app.indexOf("function startTransaction");
  const body = app.slice(start, app.indexOf("function blockOutForIncompleteVehicle"));
  const vehicleGate = body.indexOf("blockOutForIncompleteVehicle(draft)");
  const licenseGate = body.indexOf('license.tone === "expired"');
  const authGate = body.indexOf('draft.direction === "OUT" && !auth');
  assert.ok(vehicleGate > -1, "vehicle gate must exist in startTransaction");
  assert.ok(licenseGate > -1 && authGate > -1, "driver gates must still exist");
  assert.ok(vehicleGate < licenseGate, "vehicle gate must precede the license check");
  assert.ok(vehicleGate < authGate, "vehicle gate must precede the driver authorization check");
});

test("AC7 the vehicle block offers no supervisor override path", () => {
  const block = app.slice(app.indexOf("function blockOutForIncompleteVehicle"), app.indexOf("function blockOutForSupervisor"));
  assert.ok(!block.includes("pendingOverride"), "an incomplete vehicle must not be releasable by driver override");
  assert.ok(!block.includes('setScannerScreen("override")'), "must not open the supervisor approval screen");
  assert.ok(block.includes("blocked_out_incomplete_vehicle"), "must record a distinct audit type");
});

// --- supervisor completion ------------------------------------------------
test("AC5 the supervisor area has an incomplete-inventory queue", includes(html, 'id="incompleteInventoryBody"'));
test("AC5 the queue explains that OUT stays blocked", includes(html, "Vehicle OUT stays blocked for each one until its record is completed."));
test("AC5 the queue is rendered from provisional records", includes(app, "function renderIncompleteInventory()"));
test("AC6 completing the record clears provisional state", includes(app, "existing.inventoryStatus = COMPLETE_STATUS;"));
test("AC6 completion is auditable", includes(app, '"provisional_vehicle_completed"'));
test("AC8 creation is auditable with its originating transaction", includes(app, '"provisional_vehicle_created"'));
test("provisional vehicles are visibly flagged in the inventory table", includes(app, '<span class="status-badge provisional"'));

// --- 081526 v7 edits carried in this CR -----------------------------------
test("081526 #9 a clean submission returns straight to the scanner home", includes(app, "showScannerHome();\n  setNotice(`Vehicle ${draft.direction} saved"));
test("081526 #9 the post-submit confirmation screen is gone", excludes(html, 'id="transactionConfirmation"'));
test("081526 #9 the extra Start Next Scan tap is gone", excludes(html, "Start Next Scan"));
test("081526 #9 no dangling confirmation bindings remain", excludes(app, "confirmationDoneButton"));
test("081526 #3 tall modals can scroll to reach lower fields", () => {
  const panel = css.slice(css.indexOf(".modal-panel {"), css.indexOf(".modal-panel h2"));
  assert.ok(panel.includes("overflow-y: auto;"), "modal panel must scroll");
  assert.ok(panel.includes("max-height:"), "modal panel must be height-bounded");
});

// --- 081526 #10: override restricted to Fleet Lead and above ---------------
test("#10 an explicit minimum override role exists", includes(app, 'const OVERRIDE_MIN_ROLE = "Fleet Lead";'));
test("#10 rank is derived from the ordered role list", includes(app, "return DESKTOP_USER_ROLES.indexOf(role);"));
test("#10 approvers carry a role", includes(app, '{ id: "S1001", name: "Morgan Lee", role: "Supervisor" }'));

test("#10 the rank check is enforced at approval, not only in the status text", () => {
  const approve = app.slice(app.indexOf("function approveSupervisorOverride"), app.indexOf("function cancelSupervisorOverride") > 0 ? app.indexOf("function cancelSupervisorOverride") : app.length);
  const gate = approve.indexOf("canApproveOverride(supervisor)");
  const grant = approve.indexOf("authorizeDriver(");
  assert.ok(gate > -1, "approval must check the approver rank");
  assert.ok(grant > -1, "approval must still grant authorization");
  assert.ok(gate < grant, "the rank check must precede granting the authorization");
});

test("#10 a denied override is audited", includes(app, '"override_denied_insufficient_role"'));
test("#10 stored approvers without a role default to the minimum, not a senior role", includes(app, "DESKTOP_USER_ROLES.includes(supervisor.role) ? supervisor.role : OVERRIDE_MIN_ROLE"));
