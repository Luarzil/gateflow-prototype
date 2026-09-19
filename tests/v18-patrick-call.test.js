// CR-V18-PATRICK-CALL-001 — the screen changes from Patrick's 2026-09-13 call.
//
// Where it matters these run the app's own functions in a sandbox: the barcode has to be one a
// scanner can read, the Actions menu must not change a driver without asking, and a half-typed date
// must not quietly search every date.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
const manifest = fs.readFileSync(path.join(root, "android", "app", "src", "main", "AndroidManifest.xml"), "utf8");

const SECTION_START = app.indexOf("// --- CR-V18: Patrick's 2026-09-13 call, the screen changes");
const SECTION_END = app.indexOf("// --- CR-V17: drivers, vehicles, authorizations and override switches, shared");

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

function sandbox(extra = {}) {
  const context = { console, Math, Number, String, Object, Array, JSON, Error, window: {}, document: {}, el: {}, ui: {}, state: {}, ...extra };
  vm.createContext(context);
  const section = app.slice(SECTION_START, SECTION_END > SECTION_START ? SECTION_END : app.indexOf("function findDriver(value) {"));
  vm.runInContext(`${functionSource("escapeHtml")}\n${section}\nthis.api = { code128Values, code128Widths, code128Svg, CODE128_PATTERNS, CODE128_STOP, searchDateProblem, handleDriverActionMenu, driverActionMenu, keepTypingFieldVisible };`, context);
  return context;
}

// --- the barcode label ------------------------------------------------------------------------

test("every Code 128 symbol is 11 modules of three bars and three spaces, and no two are alike", () => {
  const { api } = sandbox();
  const patterns = Array.from(api.CODE128_PATTERNS);
  assert.equal(patterns.length, 106, "values 0 to 102, and the three start codes");
  patterns.forEach((pattern, value) => {
    assert.match(pattern, /^[1-4]{6}$/, `value ${value}`);
    assert.equal([...pattern].reduce((sum, width) => sum + Number(width), 0), 11, `value ${value} must be 11 modules`);
    // A symbol has an even number of bar modules (odd parity is the scanners' self-check).
    assert.equal((Number(pattern[0]) + Number(pattern[2]) + Number(pattern[4])) % 2, 0, `value ${value} bar parity`);
  });
  assert.equal(new Set(patterns).size, patterns.length);
  assert.equal([...api.CODE128_STOP].reduce((sum, width) => sum + Number(width), 0), 13);
});

test("G0001 encodes as start B, G, 0, 0, 0, 1 and the checksum a scanner will check", () => {
  const { api } = sandbox();
  // 104 + 39x1 + 16x2 + 16x3 + 16x4 + 17x5 = 372, and 372 mod 103 = 63.
  assert.deepEqual(Array.from(api.code128Values("G0001")), [104, 39, 16, 16, 16, 17, 63]);
});

test("the bars read back to the barcode they were drawn from", () => {
  const { api } = sandbox();
  const byPattern = new Map(Array.from(api.CODE128_PATTERNS).map((pattern, value) => [pattern, value]));
  ["G0001", "G0888", "G12345", "G9999"].forEach((barcode) => {
    const widths = api.code128Widths(barcode);
    assert.ok(widths.endsWith(api.CODE128_STOP));
    const symbols = widths.slice(0, -api.CODE128_STOP.length).match(/.{6}/g).map((pattern) => byPattern.get(pattern));
    assert.equal(symbols[0], 104);
    const data = symbols.slice(1, -1);
    const checksum = (104 + data.reduce((sum, value, index) => sum + value * (index + 1), 0)) % 103;
    assert.equal(symbols[symbols.length - 1], checksum, `${barcode} checksum`);
    assert.equal(String.fromCharCode(...data.map((value) => value + 32)), barcode);
  });
});

test("the drawn label has one bar per bar width, on a white background with quiet zones", () => {
  const { api } = sandbox();
  const svg = api.code128Svg("G0001");
  const bars = (svg.match(/<rect x=/g) || []).length;
  const widths = api.code128Widths("G0001");
  assert.equal(bars, Math.ceil(widths.length / 2));
  assert.match(svg, /<rect width="\d+" height="70" fill="#fff"\/>/);
  assert.match(svg, /<rect x="20" /, "ten modules of quiet zone before the first bar");
  assert.throws(() => api.code128Values("G00é1"), /cannot carry/);
});

test("Save Vehicle offers the label for a new vehicle, or one whose barcode changed, and prints only the label", () => {
  assert.ok(app.includes("    labelFor = vehicle;"));
  assert.ok(app.includes("    if (barcodeChanged) labelFor = existing;"));
  assert.ok(app.includes("  if (labelFor) openLabelPrompt(labelFor);"));
  assert.ok(html.includes('id="labelModal"') && html.includes('id="printLabelButton"') && html.includes('id="skipLabelButton"'));
  assert.match(html, /<div class="label-print-sheet" id="labelPrintSheet" aria-hidden="true"><\/div>\r?\n<\/body>/, "a direct child of body, so printing can hide everything else");
  assert.ok(css.includes("body.printing-label > *:not(.label-print-sheet) { display: none !important; }"));
  assert.ok(css.includes("@page label { size: 4in 2in; margin: 0.1in; }"));
  assert.ok(app.includes('addAudit("barcode_label_printed"'));
});

// --- the driver Actions menu -------------------------------------------------------------------

test("each driver row has one Actions menu instead of three buttons", () => {
  assert.ok(app.includes("<td>${driverActionMenu(driver, auth, eligible)}</td>"));
  const { api } = sandbox({ humanDuration: () => "9 Hours", selectedDuration: () => "9_hours" });
  const menu = api.driverActionMenu({ employeeNumber: "E1001", name: "Nina Patel", active: true }, null, false);
  assert.match(menu, /<option value="">Actions<\/option><option value="edit">Edit<\/option><option value="toggle">Mark inactive<\/option><option value="authorize" disabled>Authorize<\/option>/);
  assert.match(api.driverActionMenu({ employeeNumber: "E1001", name: "Nina Patel", active: true }, { id: "a" }, true), /<option value="deauthorize">Revoke authorization<\/option>/);
});

function menuSandbox(answer) {
  const ran = [];
  const asked = [];
  const box = sandbox({
    confirm: (question) => { asked.push(question); return answer; },
    findDriverAny: () => ({ employeeNumber: "E1001", name: "Nina Patel", active: true }),
    runDriverAction: (action) => ran.push(action),
    humanDuration: () => "9 Hours",
    selectedDuration: () => "9_hours"
  });
  const choose = (value) => {
    const menu = { value, dataset: { driverActions: "E1001" }, closest: () => menu };
    box.api.handleDriverActionMenu({ target: menu });
    return menu;
  };
  return { ran, asked, choose };
}

test("anything that changes a driver asks first, and nothing happens if the answer is no", () => {
  const refused = menuSandbox(false);
  ["toggle", "authorize", "deauthorize"].forEach((action) => refused.choose(action));
  assert.equal(refused.asked.length, 3);
  assert.deepEqual(refused.ran, []);
  assert.match(refused.asked[0], /Mark Nina Patel \(E1001\) inactive\?/);
  const agreed = menuSandbox(true);
  agreed.choose("deauthorize");
  assert.deepEqual(agreed.ran, ["deauthorize"]);
});

test("Edit just opens the form, and the menu goes back to 'Actions' either way", () => {
  const { ran, asked, choose } = menuSandbox(false);
  const menu = choose("edit");
  assert.deepEqual(ran, ["edit"]);
  assert.equal(asked.length, 0);
  assert.equal(menu.value, "");
});

// --- Active Driver Authorizations ----------------------------------------------------------------

test("Active Driver Authorizations is one narrow line per driver, with the shared scope said once", () => {
  assert.ok(html.includes('<table class="compact-rows"><thead><tr><th>Driver</th><th>Dur</th><th>Expires</th><th></th></tr></thead><tbody id="authorizedDriversBody">'));
  assert.ok(html.includes("Scope for every authorization: All current locations."));
  assert.ok(!app.includes('<td><span class="scope-label">All current locations</span></td><td>${escapeHtml(formatTimestamp(auth.expiresAt))}</td>'));
  assert.ok(css.includes(".compact-rows th, .compact-rows td { padding-top: 4px; padding-bottom: 4px; white-space: nowrap; }"));
});

// --- the Search date box -------------------------------------------------------------------------

function dateSandbox(value, validity = {}) {
  return sandbox({ el: { filterDate: { value, validity } } }).api.searchDateProblem();
}

test("a whole date with a four-digit year searches; a half-typed or six-digit one does not", () => {
  assert.equal(dateSandbox(""), "", "no date is fine: it searches every date, as asked");
  assert.equal(dateSandbox("2026-09-13"), "");
  assert.match(dateSandbox("", { badInput: true }), /Finish the date, or clear it/, "the browser reports a half-typed date as empty");
  assert.match(dateSandbox("202609-09-13"), /four-digit year/);
  assert.match(dateSandbox("1999-12-31"), /between 2020 and 2099/);
  assert.ok(html.includes('<input id="filterDate" type="date" min="2020-01-01" max="2099-12-31">'));
  assert.match(app, /function submitSearch\(\) \{\r?\n  const dateProblem = searchDateProblem\(\);\r?\n  if \(dateProblem\) \{/);
});

// --- the keyboard on the scanner -------------------------------------------------------------------

test("Android shrinks the app above the keyboard rather than covering it", () => {
  assert.match(manifest, /android:windowSoftInputMode="adjustResize"/);
});

function keyboardSandbox({ inputTop, inputBottom, dockTop, viewportHeight, inputmode = "text", id = "barcodeInput" }) {
  const scrolled = [];
  const input = { id, getAttribute: () => inputmode, getBoundingClientRect: () => ({ top: inputTop, bottom: inputBottom }) };
  const dock = { getBoundingClientRect: () => ({ top: dockTop, height: 70 }) };
  const box = sandbox({
    document: { activeElement: input, querySelector: () => dock },
    window: { innerHeight: 800, visualViewport: { offsetTop: 0, height: viewportHeight }, scrollBy: (x, y) => scrolled.push(y), getComputedStyle: () => ({ position: "fixed" }) }
  });
  box.api.keepTypingFieldVisible();
  return scrolled;
}

test("a field being typed in that the keyboard and Continue bar would cover is scrolled into view", () => {
  // The keyboard has taken the bottom half: 420 px left, the Continue bar at 340-410.
  assert.deepEqual(keyboardSandbox({ inputTop: 360, inputBottom: 407, dockTop: 340, viewportHeight: 420 }), [407 - (340 - 12)]);
});

test("a field already in view is left where it is, and a field waiting for a scan is never moved", () => {
  assert.deepEqual(keyboardSandbox({ inputTop: 120, inputBottom: 167, dockTop: 340, viewportHeight: 420 }), []);
  assert.deepEqual(keyboardSandbox({ inputTop: 360, inputBottom: 407, dockTop: 340, viewportHeight: 420, inputmode: "none" }), []);
  assert.deepEqual(keyboardSandbox({ inputTop: 360, inputBottom: 407, dockTop: 340, viewportHeight: 420, id: "transactionNote" }), []);
});
