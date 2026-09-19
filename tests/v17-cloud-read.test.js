// CR-V17-AWS-CONNECT-001 step 2 — the console reads the shared database.
//
// cloud.js is a plain browser script, so it is loaded here against small stubs for window,
// sessionStorage and fetch. That means these are real behaviour tests, not source assertions:
// they check what the client sends, what it does with the answer, and what it does when the
// answer is a failure - which is the case that matters most, because a dropped connection must
// never look like an empty gate log.

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const app = fs.readFileSync(path.join(root, "app.js"), "utf8");
const html = fs.readFileSync(path.join(root, "index.html"), "utf8");
const worker = fs.readFileSync(path.join(root, "service-worker.js"), "utf8");

// A fresh copy of the client for each test, with its own stubs.
function loadCloud({ responses = [] } = {}) {
  const calls = [];
  const box = new Map();
  global.window = {
    sessionStorage: {
      getItem: (key) => (box.has(key) ? box.get(key) : null),
      setItem: (key, value) => box.set(key, String(value)),
      removeItem: (key) => box.delete(key)
    }
  };
  global.fetch = (url, options = {}) => {
    calls.push({ url, options, target: (options.headers || {})["x-amz-target"] || "" });
    const next = responses.shift();
    if (!next) return Promise.reject(new Error("no stubbed response"));
    if (next.networkError) return Promise.reject(new Error("offline"));
    return Promise.resolve({
      ok: next.status === undefined || (next.status >= 200 && next.status < 300),
      status: next.status || 200,
      text: () => Promise.resolve(typeof next.body === "string" ? next.body : JSON.stringify(next.body || {})),
      json: () => Promise.resolve(next.body || {})
    });
  };
  delete require.cache[require.resolve("../cloud.js")];
  const cloud = require("../cloud.js");
  return { cloud, calls, stored: box };
}

const authResult = (overrides = {}) => ({
  AuthenticationResult: Object.assign({ IdToken: "id-token", AccessToken: "access-token", RefreshToken: "refresh-token", ExpiresIn: 3600 }, overrides)
});

// --- what it sends --------------------------------------------------------

test("only the filters that were filled in are sent", () => {
  const { cloud } = loadCloud();
  const query = cloud.internals.movementQuery({ vehicle: "G0001", driver: "  ", location: "", date: "2026-09-18", direction: "OUT", limit: 50 });
  assert.equal(query, "vehicle=G0001&date=2026-09-18&direction=OUT&limit=50");
});

test("a cursor is sent as before, so the server does the paging", () => {
  const { cloud } = loadCloud();
  assert.equal(cloud.internals.movementQuery({ limit: 50 }, "cursor-abc"), "limit=50&before=cursor-abc");
});

test("search text is escaped rather than pasted into the query", () => {
  const { cloud } = loadCloud();
  assert.equal(cloud.internals.movementQuery({ driver: "Nina & Marcus" }), "driver=Nina%20%26%20Marcus");
});

test("the sign-in token goes to the API as the Authorization header", async () => {
  const { cloud, calls } = loadCloud({ responses: [{ body: authResult() }, { body: { movements: [], next: null, total: 0 } }] });
  await cloud.signIn("raul", "a-password");
  await cloud.movements({ limit: 50 });
  const apiCall = calls[calls.length - 1];
  assert.match(apiCall.url, /\/v1\/movements\?limit=50$/);
  assert.equal(apiCall.options.headers.authorization, "id-token");
});

// --- what it does with the answer -----------------------------------------

test("a database row arrives in the shape the console already renders", () => {
  const { cloud } = loadCloud();
  const row = cloud.internals.mapMovement({
    id: 7, client_id: "seed-tx-001", occurred_at: "2026-09-18T20:00:00.000Z", direction: "OUT",
    driver_employee: "E1001", driver_name: "Nina Patel", driver_entry_method: "scanner_field",
    vehicle_barcode: "G0001", vehicle_entry_method: "scanner_field", vin: "1HGCM82633A004352",
    plate: "TRK-8877", location: "Division Street", authorization_status: "Authorized",
    note: "Customer delivery", submitted_by: "Division Street Scanner", delayed: true, conflict: "driver_revoked"
  });
  assert.equal(row.timestamp, "2026-09-18T20:00:00.000Z");
  assert.equal(row.driverEmployee, "E1001");
  assert.equal(row.vehicleBarcode, "G0001");
  assert.equal(row.authorizationStatus, "Authorized");
  assert.equal(row.submittedBy, "Division Street Scanner");
  // Carried for the offline work in step 4.
  assert.equal(row.delayed, true);
  assert.equal(row.conflict, "driver_revoked");
});

test("a row with nothing recorded in a column does not render undefined", () => {
  const { cloud } = loadCloud();
  const row = cloud.internals.mapMovement({ occurred_at: "2026-09-18T20:00:00.000Z", direction: "IN" });
  assert.equal(row.note, "");
  assert.equal(row.plate, "");
  assert.equal(row.driverEntryMethod, "legacy_unknown");
});

test("the page keeps the server's total and cursor", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult() }, { body: { movements: [{ id: 1, occurred_at: "2026-09-18T20:00:00.000Z", direction: "IN" }], next: "cursor-2", total: 128 } }] });
  await cloud.signIn("raul", "a-password");
  const page = await cloud.movements({ limit: 50 });
  assert.equal(page.movements.length, 1);
  assert.equal(page.next, "cursor-2");
  assert.equal(page.total, 128);
});

// --- sessions -------------------------------------------------------------

test("a token's life is stored as a time, not a countdown", () => {
  const { cloud } = loadCloud();
  const session = cloud.internals.sessionFromAuthResult({ IdToken: "id", ExpiresIn: 3600 }, "raul", null);
  const seconds = (new Date(session.expiresAt).getTime() - Date.now()) / 1000;
  assert.ok(seconds > 3500 && seconds <= 3600, `expected about an hour, got ${seconds}s`);
});

test("a refresh keeps the refresh token it was not given again", () => {
  const { cloud } = loadCloud();
  const first = cloud.internals.sessionFromAuthResult({ IdToken: "id", RefreshToken: "keep-me", ExpiresIn: 3600 }, "raul", null);
  const refreshed = cloud.internals.sessionFromAuthResult({ IdToken: "id2", ExpiresIn: 3600 }, "raul", first);
  assert.equal(refreshed.refreshToken, "keep-me");
  assert.equal(refreshed.signedInAt, first.signedInAt);
});

test("a token about to expire counts as expired, so it is refreshed early", () => {
  const { cloud } = loadCloud();
  const nearly = { expiresAt: new Date(Date.now() + 30000).toISOString() };
  const fine = { expiresAt: new Date(Date.now() + 600000).toISOString() };
  assert.equal(cloud.internals.isSessionExpired(nearly), true);
  assert.equal(cloud.internals.isSessionExpired(fine), false);
  assert.equal(cloud.internals.isSessionExpired(null), true);
});

test("signing in stores the session, and signing out clears it", async () => {
  const { cloud, stored } = loadCloud({ responses: [{ body: authResult() }] });
  await cloud.signIn("raul", "a-password");
  assert.equal(cloud.status().signedIn, true);
  assert.equal(stored.size, 1);
  cloud.signOut();
  assert.equal(cloud.status().signedIn, false);
  assert.equal(stored.size, 0);
});

test("reading without a sign-in is refused before any request is made", async () => {
  const { cloud, calls } = loadCloud();
  await assert.rejects(() => cloud.movements({}), /Sign in/);
  assert.equal(calls.length, 0);
});

// --- first sign-in, and failures ------------------------------------------

test("an Admin-created login is asked for a new password, then signed in", async () => {
  const { cloud, calls } = loadCloud({
    responses: [
      { body: { ChallengeName: "NEW_PASSWORD_REQUIRED", Session: "challenge-session" } },
      { body: authResult() }
    ]
  });
  const first = await cloud.signIn("raul", "temporary-one");
  assert.equal(first.challenge, "NEW_PASSWORD_REQUIRED");
  assert.equal(cloud.status().signedIn, false, "the challenge is not a sign-in");
  const done = await cloud.completeNewPassword("raul", "a-longer-password-1", first.challengeSession);
  assert.equal(done.signedIn, true);
  assert.equal(calls[1].target, "AWSCognitoIdentityProviderService.RespondToAuthChallenge");
});

test("a login needing an authenticator code says so instead of failing silently", async () => {
  const { cloud } = loadCloud({ responses: [{ body: { ChallengeName: "SOFTWARE_TOKEN_MFA", Session: "s" } }] });
  await assert.rejects(() => cloud.signIn("raul", "a-password"), /authenticator code/);
});

test("Cognito's developer wording is replaced with something an operator can act on", () => {
  const { cloud } = loadCloud();
  const message = cloud.internals.signInMessage;
  assert.equal(message({ __type: "NotAuthorizedException" }), "That username or password was not accepted.");
  // A wrong username must not be distinguishable from a wrong password.
  assert.equal(message({ __type: "UserNotFoundException" }), message({ __type: "NotAuthorizedException" }));
  assert.match(message({ __type: "PasswordResetRequiredException" }), /Admin/);
  assert.match(message({ __type: "TooManyRequestsException" }), /Wait a minute/);
});

test("the waking database is reported as worth retrying, not as an error", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult() }, { status: 503, body: { error: "database_waking" } }] });
  await cloud.signIn("raul", "a-password");
  await assert.rejects(() => cloud.movements({}), (error) => {
    assert.equal(error.kind, "waking");
    assert.match(error.message, /waking up/);
    return true;
  });
});

test("no signal is reported as no signal, and the session is kept", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult() }, { networkError: true }] });
  await cloud.signIn("raul", "a-password");
  await assert.rejects(() => cloud.movements({}), (error) => {
    assert.equal(error.kind, "offline");
    assert.match(error.message, /device/);
    return true;
  });
  assert.equal(cloud.status().signedIn, true, "a dropped connection is not a sign-out");
});

test("a rejected token signs the console out, so it stops pretending to be connected", async () => {
  const { cloud } = loadCloud({ responses: [{ body: authResult() }, { status: 401, body: { error: "unauthorized" } }] });
  await cloud.signIn("raul", "a-password");
  await assert.rejects(() => cloud.movements({}), /Sign in again/);
  assert.equal(cloud.status().signedIn, false);
});

test("the health check needs no sign-in, so no signal can be told from no login", async () => {
  const { cloud, calls } = loadCloud({ responses: [{ body: { service: "veri-gate-api", migrations: ["001_initial"] } }] });
  const result = await cloud.health();
  assert.deepEqual(result.migrations, ["001_initial"]);
  assert.equal(calls[0].options.headers, undefined, "no token is sent");
});

// --- the console around it -------------------------------------------------

// The working tree is checked out with Windows line endings, so the break is matched either way.
test("the search asks the server for the next page instead of revealing rows it holds", () => {
  assert.match(app, /if \(ui\.searchSource === "shared"\) \{\r?\n\s*searchShared\(false\);/, "Show next 50 must fetch when reading the shared database");
});

test("a failed shared read falls back to this device and says so", () => {
  assert.ok(app.includes("Showing the records on this device instead."));
});

test("a re-render cannot replace shared rows with this device's copy", () => {
  assert.ok(app.includes("if (ui.searchSource === \"shared\" && !resetPage) return;"));
});

test("the printout states which records it came from", () => {
  assert.ok(app.includes('["Records from", ui.searchSource === "shared" ? "the shared Veri-Gate database" : "this device only"]'));
});

test("the print audit entry records the source too", () => {
  assert.ok(app.includes('Source: ${ui.searchSource === "shared" ? "shared database" : "this device"}'));
});

test("the console header carries the source pill, and the scanner shell hides it", () => {
  assert.ok(html.includes('id="cloudStatusButton"'));
  const css = fs.readFileSync(path.join(root, "styles.css"), "utf8");
  assert.ok(css.includes('body[data-shell="scanner"] .cloud-pill { display: none; }'));
});

test("the sign-in panel asks for a new password when the login needs one", () => {
  assert.ok(html.includes('id="cloudNewPasswordRow"'));
  assert.ok(app.includes('result.challenge === "NEW_PASSWORD_REQUIRED"'));
});

test("cloud.js loads before the app, and is cached for offline use", () => {
  const cloudTag = html.indexOf('src="cloud.js"');
  const appTag = html.indexOf('src="app.js"');
  // A missing tag reads as position -1, which would otherwise count as "first".
  assert.ok(cloudTag >= 0 && appTag >= 0 && cloudTag < appTag);
  assert.ok(worker.includes('"./cloud.js"'));
});

test("the cache name moved on, so a stale shell is replaced", () => {
  assert.ok(worker.includes('const CACHE_NAME = "lot-watch-gateflow-v0.8-signin-static";'));
});

test("the client points at the Veri-Gate Dev service", () => {
  const cloudSource = fs.readFileSync(path.join(root, "cloud.js"), "utf8");
  assert.ok(cloudSource.includes("https://26yolfohvj.execute-api.us-east-1.amazonaws.com"));
  assert.ok(cloudSource.includes('userPoolId: "us-east-1_AQE30dxWN"'));
});

// The browser downloads this file, so anyone can read it. An app client id and an API address are
// meant to be public; a password, key or client secret in here would be handing them out.
test("nothing secret is hard-coded in a file the browser downloads", () => {
  const code = fs.readFileSync(path.join(root, "cloud.js"), "utf8")
    .replace(/\/\/[^\n]*/g, "")
    .replace(/\/\*[\s\S]*?\*\//g, "");
  const literal = /\b(clientSecret|client_secret|secretHash|SecretHash|apiKey|api_key|accessKeyId|secretAccessKey|password)\s*[:=]\s*["'][^"']+["']/;
  assert.ok(!literal.test(code), "a credential is hard-coded in cloud.js");
});

// The Data API's timestamps arrive without a zone; read as local time they put the first
// movements four hours out. The API now says UTC explicitly, and the client insists on it.
test("a timestamp with no zone is read as UTC, not as local time", () => {
  const { cloud } = loadCloud();
  const row = cloud.internals.mapMovement({ occurred_at: "2026-09-18 22:59:47.718031", direction: "OUT" });
  assert.equal(row.timestamp, "2026-09-18T22:59:47.718031Z");
  assert.equal(new Date(row.timestamp).getUTCHours(), 22);
});

test("a timestamp that already states its zone is left alone", () => {
  const { cloud } = loadCloud();
  assert.equal(cloud.internals.mapMovement({ occurred_at: "2026-09-18T22:59:47.718Z" }).timestamp, "2026-09-18T22:59:47.718Z");
  assert.equal(cloud.internals.mapMovement({ occurred_at: "2026-09-18T18:59:47.718-04:00" }).timestamp, "2026-09-18T18:59:47.718-04:00");
});

test("the status line stops saying Reading before the rows are drawn", () => {
  assert.match(app, /ui\.searchBusy = false;\r?\n\s*const rows = reset \?/);
});

test("the sign-in panel will not close while it waits for a new password", () => {
  assert.ok(app.includes("event.target === el.cloudSignInModal && !ui.cloudChallenge"));
});

test("an interrupted first sign-in resumes instead of starting over", () => {
  assert.match(app, /if \(ui\.cloudChallenge\) \{\r?\n\s*el\.cloudUsername\.value = ui\.cloudChallenge\.username;/);
});

// A single 'ANY /v1/{proxy+}' route also swallowed the browser's unauthenticated OPTIONS
// preflight, and the authorizer rejected it - which the console could only report as "no
// connection". The methods are listed one at a time so API Gateway answers the preflight.
test("the API does not route the browser's preflight through the authorizer", () => {
  const template = fs.readFileSync(path.join(root, "infra", "gateflow-api.yaml"), "utf8");
  assert.ok(!template.includes("RouteKey: 'ANY /v1/{proxy+}'"), "an ANY route captures OPTIONS as well");
  ["GET", "POST", "PUT", "PATCH"].forEach((method) => {
    assert.ok(template.includes(`RouteKey: '${method} /v1/{proxy+}'`), `${method} route is missing`);
  });
  assert.ok(!template.includes("RouteKey: 'OPTIONS /v1/{proxy+}'"), "OPTIONS must stay unrouted");
});
