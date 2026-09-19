const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

const includes = (source, value) => () => assert.ok(source.includes(value), `Missing: ${value}`);
const excludes = (source, value) => () => assert.ok(!source.includes(value), `Unexpected: ${value}`);
const matches = (source, expression) => () => assert.match(source, expression);

test("users form captures a username", includes(html, 'id="desktopUserUsername"'));
test("users form shows demo password but labels it prototype-only", includes(html, 'id="desktopUserPassword"'));
test("password reset state is represented without email sending", includes(html, "Reset status is local prototype state only; no email is sent."));
test("role options run scanner through admin with no separate Manager", () => {
  for (const role of ["Scanner", "Fleet Lead", "Supervisor", "Admin"]) {
    assert.ok(html.includes(`value="${role}"`), `missing role option ${role}`);
  }
  assert.ok(!html.includes('value="Manager"'), "Manager should no longer be a selectable role");
});
test("ability levels are exactly the approved labels", includes(app, 'const ABILITY_LEVELS = ["Restricted", "View only", "Assign"]'));
test("new user abilities default to restricted", includes(app, 'defaultDesktopAbilities()'));
test("legacy Owner/System Administrator and Manager both normalize to Admin", includes(app, `if (value === "Owner / System Administrator" || value === "Manager") return "Admin";`));
test("password value is cleared after save", includes(app, 'el.desktopUserPassword.value = "";'));
test("password value is not stored in the desktop user object", excludes(app, "password: el.desktopUserPassword.value"));
test("drivers remain excluded from application login accounts", includes(html, "Drivers are operational records, not application login accounts."));
test("ability matrix does not assign permissions to driver records", excludes(app, 'id: "drivers"'));
test("driver profile management is named separately from driver accounts", includes(app, 'id: "driverProfiles"'));
// CR-V14 item 2, Patrick 2026-09-12: "Manual entry button can be removed... there is no need for
// duplication with a manual key button." Tapping the field is the manual path now, so the button
// and its dialog are gone and the entry path is recorded from the tap instead.
test("manual entry is the field itself, not a separate control", () => {
  assert.ok(!html.includes('id="openManualBarcodeButton"'), "vehicle manual entry button must be gone");
  assert.ok(!html.includes('id="openManualEmployeeButton"'), "driver manual entry button must be gone");
  assert.ok(!html.includes('id="manualBarcodeModal"'), "vehicle manual entry dialog must be gone");
  assert.ok(!html.includes('id="manualEmployeeModal"'), "driver manual entry dialog must be gone");
  assert.ok(app.includes('ui.vehicleEntryMethod = "manual"'), "tapping the barcode field must record manual entry");
  assert.ok(app.includes('ui.driverEntryMethod = "manual"'), "tapping the driver field must record manual entry");
});
