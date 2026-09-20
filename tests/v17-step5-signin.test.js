// CR-V17-AWS-CONNECT-001 step 5 — sign-in and roles, on the device side.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");

function storage() {
  const box = new Map();
  return { box, getItem: (key) => (box.has(key) ? box.get(key) : null), setItem: (key, value) => box.set(key, String(value)), removeItem: (key) => box.delete(key) };
}

function token(claims) {
  return `x.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.y`;
}

function loadCloud(responses = []) {
  const session = storage();
  const local = storage();
  const calls = [];
  global.window = { sessionStorage: session, localStorage: local };
  global.fetch = (url, options = {}) => {
    calls.push({ url, target: (options.headers || {})["x-amz-target"] || "", options });
    const next = responses.shift();
    if (!next || next.offline) return Promise.reject(new Error("offline"));
    return Promise.resolve({ ok: next.status < 300, status: next.status, text: () => Promise.resolve(JSON.stringify(next.body || {})) });
  };
  delete require.cache[require.resolve("../cloud.js")];
  return { cloud: require("../cloud.js"), session, local, calls };
}

const KEY = "veri-gate.cloud.session.v1";
const signedInReply = (claims) => ({ status: 200, body: { AuthenticationResult: { IdToken: token(claims), RefreshToken: "r", ExpiresIn: 3600 } } });

test("the role and name come from the token, most senior group first", async () => {
  const { cloud } = loadCloud([signedInReply({ "cognito:groups": ["Scanner", "Supervisor"], name: "Jordan Wells" })]);
  await cloud.signIn("jwells", "pw");
  const status = cloud.status();
  assert.equal(status.role, "Supervisor");
  assert.equal(status.rank, 3);
  assert.equal(status.name, "Jordan Wells");
});

test("a gate phone's sign-in is remembered across restarts; a console's lives in the tab", async () => {
  const phone = loadCloud([signedInReply({ "cognito:groups": ["Device"] })]);
  await phone.cloud.signIn("d0001", "pw", { remember: true });
  assert.ok(phone.local.box.has(KEY), "kept on the phone");
  assert.ok(!phone.session.box.has(KEY));
  const consoleTab = loadCloud([signedInReply({ "cognito:groups": ["Supervisor"] })]);
  await consoleTab.cloud.signIn("jwells", "pw");
  assert.ok(consoleTab.session.box.has(KEY), "kept in the tab");
  assert.ok(!consoleTab.local.box.has(KEY));
});

test("with no signal, an expired phone sign-in is kept and tried again later, not thrown away", async () => {
  const { cloud, local } = loadCloud([{ offline: true }]);
  local.setItem(KEY, JSON.stringify({ username: "d0001", idToken: token({ "cognito:groups": ["Device"] }), refreshToken: "r", expiresAt: new Date(Date.now() - 1000).toISOString(), remember: true }));
  cloud.start();
  await assert.rejects(() => cloud.reference(), (error) => error.kind === "offline");
  assert.equal(cloud.status().signedIn, true, "still signed in");
  assert.ok(local.box.has(KEY), "and still remembered");
});

test("only Cognito refusing the refresh signs a phone out", async () => {
  const { cloud, local } = loadCloud([{ status: 400, body: { __type: "NotAuthorizedException", message: "Refresh Token has been revoked" } }]);
  local.setItem(KEY, JSON.stringify({ username: "d0001", idToken: token({}), refreshToken: "r", expiresAt: new Date(Date.now() - 1000).toISOString(), remember: true }));
  cloud.start();
  await assert.rejects(() => cloud.reference(), (error) => error.kind === "auth");
  assert.equal(cloud.status().signedIn, false);
  assert.ok(!local.box.has(KEY));
});

test("'your role may not do this' (403) is a refusal with the reason, and signs nobody out", async () => {
  const { cloud } = loadCloud([signedInReply({ "cognito:groups": ["FleetLead"] }), { status: 403, body: { error: "forbidden", message: "Only a Supervisor or above can add or edit drivers." } }]);
  await cloud.signIn("jwells", "pw");
  await assert.rejects(() => cloud.recordChange({}), (error) => error.status === 403 && /Only a Supervisor/.test(error.message));
  assert.equal(cloud.status().signedIn, true);
  assert.equal(cloud.failureAction({ kind: "forbidden", status: 403 }), "refuse", "the queue sets it aside and carries on");
});

test("signing out on purpose also ends the refresh token at Cognito", async () => {
  const { cloud, calls } = loadCloud([signedInReply({ "cognito:groups": ["Supervisor"] }), { status: 200, body: {} }]);
  await cloud.signIn("jwells", "pw");
  cloud.signOut();
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(calls[calls.length - 1].target, "AWSCognitoIdentityProviderService.RevokeToken");
  assert.equal(cloud.status().signedIn, false);
});

test("the Admin's login calls reach /v1/users", async () => {
  const { cloud, calls } = loadCloud([signedInReply({ "cognito:groups": ["Admin"] }), { status: 200, body: { users: [{ username: "raul" }] } }, { status: 201, body: { username: "d0001", temporaryPassword: "x" } }, { status: 200, body: { username: "d0001" } }]);
  await cloud.signIn("raul", "pw");
  assert.deepEqual((await cloud.users()).map((user) => user.username), ["raul"]);
  await cloud.createUser({ username: "d0001", name: "Division Gate Scanner", role: "Device" });
  await cloud.updateUser("d0001", { enabled: false });
  assert.match(calls[2].url, /\/v1\/users$/);
  assert.equal(calls[2].options.method, "POST");
  assert.match(calls[3].url, /\/v1\/users\/d0001$/);
  assert.equal(calls[3].options.method, "PATCH");
});

// --- the app ------------------------------------------------------------------------------------

test("demo mode keeps its records apart and never connects to the shared records", () => {
  assert.ok(app.includes('const STORAGE_KEY = DEMO_MODE ? "lot-watch.gateflow.v0.7.state.demo" : "lot-watch.gateflow.v0.7.state";'));
  assert.ok(app.indexOf("const DEMO_MODE = (() => {") < app.indexOf("const STORAGE_KEY ="), "decided before anything is loaded");
  assert.ok(app.includes("clientId: IN_TEST_HARNESS || DEMO_MODE ? undefined :"));
  assert.ok(app.includes("return !IN_TEST_HARNESS && !DEMO_MODE && Boolean(window.VeriGateCloud);"));
  assert.ok(app.includes("if (!window.VeriGateCloud || IN_TEST_HARNESS || DEMO_MODE) {"));
  assert.ok(app.includes("return !DEMO_MODE && Boolean(window.VeriGateCloud && window.VeriGateCloud.status().signedIn);"));
});

test("on the review site a visitor gets the demo, never a login they cannot pass", () => {
  // Patrick opened the app on a laptop on 2026-09-20 and met "Sign in to continue. Ask the Admin
  // if you do not have a login." The links sent to him were right; the review site and the real
  // console were the same address, and only ?demo=1 told them apart. Anything that dropped it -
  // an old bookmark, typing the address, a forwarded link - landed a reviewer on a login wall.
  assert.ok(app.includes('const REVIEW_HOST = "gateflow-prototype.vercel.app";'));
  assert.ok(app.includes("return window.location.hostname === REVIEW_HOST;"), "the review host defaults to the demo");
  // And the real console is still reachable there, deliberately.
  assert.ok(app.includes('if (query.has("live")) window.sessionStorage.setItem("veri-gate.demo", "0");'));
  // An explicit choice, either way, wins over the default.
  const block = app.slice(app.indexOf("const DEMO_MODE = (() => {"), app.indexOf("const STORAGE_KEY ="));
  assert.ok(block.indexOf('query.has("demo")') < block.indexOf("hostname === REVIEW_HOST"), "asked-for demo is read first");
  assert.ok(block.indexOf('query.has("live")') < block.indexOf("hostname === REVIEW_HOST"), "asked-for live is read first");
  // Everywhere else - a developer's machine, the Android app, a future live domain - is the real
  // console unless the demo is asked for.
  assert.ok(block.includes("if (remembered !== null) return remembered === \"1\";"));
});

test("the capture of the real service asks for the real console", () => {
  const capture = fs.readFileSync(path.join(root, "tools", "capture-service-frames.js"), "utf8");
  assert.ok(capture.includes("?shell=console&live=1"), "or it would capture the demo and call it the service");
});

test("the validator is never a demo, whatever the tab was doing before it", () => {
  // sessionStorage is shared with every same-origin frame in a tab. Opening the demo and then the
  // validator in that tab put the harness into demo mode: it wrote to the demo's storage while the
  // validator read the real key, and 78 of 113 checks failed with "Target state was not saved".
  // That looks like a broken application and is nothing of the kind - which is worse than a real
  // failure, because it hides one.
  assert.ok(app.includes("  if (IN_TEST_HARNESS) return false;"), "DEMO_MODE must refuse inside the harness");
  // And it can only ask that if it is decided first.
  assert.ok(app.indexOf("const IN_TEST_HARNESS = (() => {") < app.indexOf("const DEMO_MODE = (() => {"),
    "IN_TEST_HARNESS must be defined before DEMO_MODE asks it");
  assert.equal(app.split("const IN_TEST_HARNESS = (() => {").length - 1, 1, "defined exactly once");
  assert.ok(app.indexOf("const DEMO_MODE = (() => {") < app.indexOf("const STORAGE_KEY ="),
    "and both before the storage key they decide");
});

test("a demo says so on the phone too, not only in the console", () => {
  // Patrick opens the review link on his own phone, where the scanner is an exact copy of the gate
  // screen. Hiding the notice there leaves nothing saying the movements are made up.
  assert.ok(app.includes('el.demoBanner.classList.toggle("hidden", !DEMO_MODE);'));
  assert.ok(!app.includes('!(DEMO_MODE && ui.shell === "console")'), "the console-only test is gone");
  assert.match(html, /id="demoBanner"[^>]*>Demo mode: nothing here is real/);
});

test("the console cannot be used without signing in, except in demo mode and the validator", () => {
  assert.ok(app.includes('return ui.shell === "console" && Boolean(window.VeriGateCloud) && !IN_TEST_HARNESS && !DEMO_MODE && !cloudReady();'));
  assert.ok(html.includes('id="consoleGate"'));
  assert.ok(fs.readFileSync(path.join(root, "styles.css"), "utf8").includes("body.console-locked main > .view, body.console-locked .top-nav { display: none !important; }"));
});

test("what a role may not do is not offered", () => {
  [["searchView", "fleetLead"], ["devicesSection", "supervisor"], ["usersSection", "admin"], ["adminSection", "admin"]].forEach(([target, level]) => {
    assert.match(html, new RegExp(`(data-view|data-supervisor-section)="${target}" data-needs="${level}"`));
  });
  ["addDriverButton", "addVehicleButton"].forEach((id) => assert.match(html, new RegExp(`id="${id}" type="button" data-needs="supervisor"`)));
  ["bulkAuthorizeButton", "deauthorizeAllButton"].forEach((id) => assert.match(html, new RegExp(`id="${id}" type="button" data-needs="fleetLead"`)));
});

function driverMenuFor(rank) {
  const start = app.indexOf("function driverActionMenu(");
  let depth = 0;
  let end = start;
  for (let index = app.indexOf("{", start); index < app.length; index += 1) {
    if (app[index] === "{") depth += 1;
    if (app[index] === "}") { depth -= 1; if (depth === 0) { end = index + 1; break; } }
  }
  const context = { allowed: (level) => rank >= { admin: 4, supervisor: 3, fleetLead: 2 }[level], escapeHtml: (value) => String(value) };
  vm.createContext(context);
  vm.runInContext(`${app.slice(start, end)}; this.menu = driverActionMenu;`, context);
  return context.menu({ employeeNumber: "E1001", name: "Nina", active: true }, null, true);
}

test("a Fleet Lead's driver menu offers authorizing only; a gate login's offers nothing", () => {
  const fleetLead = driverMenuFor(2);
  assert.match(fleetLead, /value="authorize"/);
  assert.doesNotMatch(fleetLead, /value="edit"|value="toggle"/);
  assert.match(driverMenuFor(3), /value="edit".*value="toggle".*value="authorize"/);
  assert.doesNotMatch(driverMenuFor(1), /<select/);
});

test("changes are recorded under the person signed in, not 'Supervisor Console'", () => {
  assert.ok(!/addAudit\([^)]*"Supervisor Console"/.test(app), "no fixed console name left in the history");
  assert.ok(app.includes("return status.name && status.name !== status.username ? `${status.name} (${status.username})` : status.username;"));
});

test("a temporary password is shown once to the Admin, and never saved on the device", () => {
  assert.ok(app.includes("el.loginPasswordValue.textContent = password;"));
  assert.ok(!/state\.[a-zA-Z]+\s*=\s*[^;]*temporaryPassword/.test(app));
  assert.ok(!/addAudit\([^)]*temporaryPassword/.test(app));
});
