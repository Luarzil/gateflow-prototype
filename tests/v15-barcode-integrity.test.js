// CR-V15-BARCODE-INTEGRITY-001
//
// The rule being protected: a movement is never gated on whether the vehicle is known, but the
// system must not invent barcode digits, and a typed barcode that nobody can vouch for should be
// visible to the operator and to a supervisor.
//
// These are source assertions in the style of the other static suites. The behaviour itself is
// exercised by the click-path validator and by hand in the browser.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

const includes = (source, needle) => () => assert.ok(source.includes(needle), `Missing: ${needle}`);
const excludes = (source, needle) => () => assert.ok(!source.includes(needle), `Should be gone: ${needle}`);

// --- digits are counted, never invented ----------------------------------

test("a helper reports the digits actually entered", includes(app, "function vehicleBarcodeDigits(value)"));

test("the expected barcode length is a named constant", includes(app, "const VEHICLE_BARCODE_DIGITS = 4;"));

// The constant is read by canonicalVehicleBarcode, which runs inside the load-time migration.
// Declaring it below that point put it in the temporal dead zone during CR-V14 and silently threw
// every saved state away, so its position is worth pinning down rather than trusting.
test("the barcode constant is declared before loadState runs", () => {
  const constantAt = app.indexOf("const VEHICLE_BARCODE_DIGITS");
  // The call itself, not the comment above it that happens to mention loadState().
  const loadStateCallAt = app.indexOf("const state = loadState();");
  assert.ok(constantAt >= 0, "constant must exist");
  assert.ok(loadStateCallAt >= 0, "loadState call must exist");
  assert.ok(constantAt < loadStateCallAt, "VEHICLE_BARCODE_DIGITS must be initialised before loadState() runs");
});

test("typing is no longer rewritten into a padded barcode", includes(app, 'ui.vehicleEntryMethod === "manual" ? normalize(rawValue) : canonicalVehicleBarcode(rawValue)'));

test("an incomplete typed barcode does not advance", includes(app, "if (typed && digits.length > 0 && digits.length !== VEHICLE_BARCODE_DIGITS)"));

test("the refusal names the expected length", includes(app, "Barcode looks incomplete. Enter all ${VEHICLE_BARCODE_DIGITS} digits"));

// --- the operator is warned, never blocked -------------------------------

test("a typed unknown barcode warns the operator", includes(app, "Check this barcode. ${barcode} is not in inventory. Continue if it is right."));

test("the warning is a notice, not a gate", () => {
  const start = app.indexOf("if (typed && !vehicle) {");
  assert.ok(start >= 0, "the typed-unknown branch must exist");
  const branch = app.slice(start, start + 700);
  assert.ok(!/\breturn\b/.test(branch), "warning the operator must not stop the movement");
});

test("continuing past the warning is recorded", includes(app, '"typed_barcode_unverified"'));

// --- a scanned unknown vehicle stays frictionless ------------------------
//
// This is Patrick's 2026-09-06 rule and the whole point of CR-V11: an unknown vehicle arriving at
// the gate is ordinary traffic. Only a hand-typed barcode is ever questioned.

test("the review flag is set from the entry path, not from being unknown", includes(app, 'needsBarcodeReview: draft.vehicleEntryMethod === "manual"'));

test("scan-created vehicles still carry no completion gate", excludes(app, "needsSupervisorCompletion: true"));

// --- the supervisor can see it and act on it -----------------------------

test("the flag persists on the vehicle", includes(app, "barcodeNeedsReview: Boolean(context.needsBarcodeReview)"));

test("the flag survives a reload", includes(app, "barcodeNeedsReview: vehicle.barcodeNeedsReview === true"));

test("a flagged vehicle is marked in the supervisor record", includes(app, ">Check barcode</span>"));

test("a supervisor can confirm the barcode", includes(app, "function confirmVehicleBarcode(vehicle)"));

test("confirming is recorded rather than silently cleared", includes(app, '"typed_barcode_confirmed"'));

test("editing the record also settles the review", includes(app, '"typed_barcode_resolved"'));

// The added-by-scan panel carries data-vehicle-action buttons but had no click listener, so its
// Edit button was inert from the day the panel was built.
test("the added-by-scan panel is wired to the vehicle actions", includes(app, 'el.incompleteInventoryBody.addEventListener("click", handleVehicleTableAction);'));
