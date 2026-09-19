// CR-V17 — the console went blank when a date was missing.
//
// Found while rebuilding the review site: with two console tabs open, a vehicle a gate scan created
// in one tab arrived in the other with no "added at" date. The Vehicles table formats that date, and
// Intl throws on an unreadable one, so renderAll() died part way and the whole console stopped
// redrawing - not just that cell. Two things are checked here: no date can throw, and a vehicle met
// at the gate keeps the date it was added on whichever tab it turns up in.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");

function functionSource(name) {
  const start = app.indexOf(`function ${name}(`);
  assert.ok(start >= 0, `app.js has no function ${name}`);
  let depth = 0;
  for (let index = app.indexOf("{", start); index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") { depth -= 1; if (depth === 0) return app.slice(start, index + 1); }
  }
  throw new Error(`unbalanced ${name}`);
}

function formatters() {
  const context = { Intl, Date, Number, BUSINESS_TIMEZONE: "America/New_York" };
  vm.createContext(context);
  vm.runInContext(
    [functionSource("formatWhen"), functionSource("formatTimestamp"), functionSource("formatDate"), functionSource("formatTime")].join("\n") +
    "\nthis.f = { formatTimestamp, formatDate, formatTime };",
    context
  );
  return context.f;
}

test("a missing or unreadable date is a dash, and never throws", () => {
  const { formatTimestamp, formatDate, formatTime } = formatters();
  // The exact values that crashed it, plus everything else a half-written record can hold.
  ["", null, undefined, "not a date", NaN, "0000-00-00", {}].forEach((value) => {
    assert.equal(formatTimestamp(value), "-", `formatTimestamp(${JSON.stringify(value)})`);
    assert.equal(formatDate(value), "-", `formatDate(${JSON.stringify(value)})`);
    assert.equal(formatTime(value), "-", `formatTime(${JSON.stringify(value)})`);
  });
  // And a real date still reads the way it always did.
  assert.match(formatTimestamp("2026-09-19T19:07:55.134Z"), /^09\/19\/26, \d/);
  assert.equal(formatDate("2026-09-19T19:07:55.134Z"), "09/19/26");
});

function normalize() {
  const context = {
    Number, String, Boolean, Date, Math, Object, Array,
    SCAN_CREATED_SOURCE: "inbound_scan",
    COMPLETE_STATUS: "complete",
    normalize: (value) => String(value || "").trim(),
    canonicalVehicleBarcode: (value) => String(value || "").trim().toUpperCase()
  };
  vm.createContext(context);
  vm.runInContext(`${functionSource("normalizeVehicle")}; this.n = normalizeVehicle;`, context);
  return context.n;
}

test("a vehicle met at the gate that was saved without its added date is healed on load", () => {
  const normalizeVehicle = normalize();
  const healed = normalizeVehicle({
    id: "veh-1", assignedBarcode: "G0901", createdSource: "inbound_scan",
    createdAt: "2026-09-19T19:07:55.134Z", provisionalAt: "",
    vin: "", plate: "", make: "", model: "", year: "", color: ""
  }, 0);
  assert.equal(healed.provisionalAt, "2026-09-19T19:07:55.134Z");
});

test("a vehicle a person added is not given an added-by-scan date it never had", () => {
  const normalizeVehicle = normalize();
  const added = normalizeVehicle({
    id: "veh-2", assignedBarcode: "G0902", createdSource: "supervisor",
    createdAt: "2026-09-19T19:07:55.134Z", provisionalAt: "",
    vin: "", plate: "", make: "", model: "", year: "", color: ""
  }, 0);
  assert.equal(added.provisionalAt, "", "only a gate scan puts a vehicle in that list");
});

test("another tab's gate scan arrives with the date it was recorded", () => {
  const line = app.slice(app.indexOf("function applyChangeLocally("), app.indexOf("function mergeChanges("));
  assert.ok(
    line.includes('provisionalAt: data.createdSource === SCAN_CREATED_SOURCE ? change.queuedAt : ""'),
    "a vehicle created from another tab's change must carry when it was added"
  );
  assert.ok(line.includes("createdSource: data.createdSource,"), "and be known as a gate scan before it is normalized");
});
