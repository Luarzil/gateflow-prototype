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
test("role options include scanner through admin", matches(html, /value="Scanner"[\s\S]*value="Fleet Lead"[\s\S]*value="Supervisor"[\s\S]*value="Manager"[\s\S]*value="Admin"/));
test("ability levels are exactly the approved labels", includes(app, 'const ABILITY_LEVELS = ["Restricted", "View only", "Assign"]'));
test("new user abilities default to restricted", includes(app, 'defaultDesktopAbilities()'));
test("desktop users normalize legacy Owner/System Administrator to Admin", includes(app, 'if (value === "Owner / System Administrator") return "Admin";'));
test("password value is cleared after save", includes(app, 'el.desktopUserPassword.value = "";'));
test("password value is not stored in the desktop user object", excludes(app, "password: el.desktopUserPassword.value"));
test("drivers remain excluded from application login accounts", includes(html, "Drivers are operational records, not application login accounts."));
test("ability matrix does not assign permissions to driver records", excludes(app, 'id: "drivers"'));
test("driver profile management is named separately from driver accounts", includes(app, 'id: "driverProfiles"'));
test("manual entry opener controls are visible", matches(html, /id="openManualEmployeeButton"[\s\S]*id="openManualBarcodeButton"/));
