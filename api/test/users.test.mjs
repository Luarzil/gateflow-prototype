// CR-V17-AWS-CONNECT-001 step 5 — the Admin makes logins inside the app.

import assert from "node:assert/strict";
import { test } from "node:test";
import { createUser, listUsers, readUsername, temporaryPassword, updateUser } from "../src/users.mjs";
import { createHandler } from "../src/handler.mjs";

function fakeCognito({ users = [], groups = {} } = {}) {
  const calls = [];
  const record = (name) => async (...args) => { calls.push([name, ...args]); };
  return {
    calls,
    listUsers: async () => users,
    listUsersInGroup: async (group) => (groups[group] || []).map((username) => ({ Username: username })),
    groupsFor: async (username) => Object.keys(groups).filter((group) => groups[group].includes(username)),
    createUser: async (input) => {
      calls.push(["createUser", input]);
      if (users.some((user) => user.Username === input.username)) throw Object.assign(new Error("exists"), { name: "UsernameExistsException" });
    },
    addToGroup: record("addToGroup"),
    removeFromGroup: record("removeFromGroup"),
    disable: record("disable"),
    enable: record("enable"),
    setTemporaryPassword: record("setTemporaryPassword"),
    signOutEverywhere: record("signOutEverywhere")
  };
}

test("a temporary password meets the pool's rule and leaves out characters easy to misread", () => {
  for (let run = 0; run < 200; run += 1) {
    const password = temporaryPassword();
    assert.equal(password.length, 14);
    assert.match(password, /[A-Z]/);
    assert.match(password, /[a-z]/);
    assert.match(password, /[0-9]/);
    assert.doesNotMatch(password, /[0O1lI]/);
  }
});

test("a login name is simple enough to read out and type on a phone", () => {
  assert.equal(readUsername(" JWells "), "jwells");
  assert.equal(readUsername("d0001"), "d0001");
  assert.throws(() => readUsername("jw"), /3 to 40/);
  assert.throws(() => readUsername("j wells"), /3 to 40/);
  assert.throws(() => readUsername("-jwells"), /3 to 40/);
});

test("creating a login puts it in its role's group, sends no email, and returns the temporary password once", async () => {
  const cognito = fakeCognito();
  const created = await createUser(cognito, { username: "d0001", name: "Division Gate Scanner", role: "Device" }, { actor: "raul" });
  assert.equal(created.role, "Device");
  assert.equal(created.temporaryPassword.length, 14);
  const [, input] = cognito.calls.find(([name]) => name === "createUser");
  assert.equal(input.password, created.temporaryPassword);
  assert.deepEqual(cognito.calls.find(([name]) => name === "addToGroup"), ["addToGroup", "d0001", "Device"]);
});

test("a login name already taken, an unknown role, or no name is refused", async () => {
  const cognito = fakeCognito({ users: [{ Username: "jwells" }] });
  await assert.rejects(() => createUser(cognito, { username: "jwells", name: "J", role: "FleetLead" }, { actor: "raul" }), (error) => error.status === 409);
  await assert.rejects(() => createUser(cognito, { username: "new1", name: "N", role: "Manager" }, { actor: "raul" }), /role must be one of/);
  await assert.rejects(() => createUser(cognito, { username: "new1", name: " ", role: "Scanner" }, { actor: "raul" }), /needs the person's name/);
});

test("the list shows each login's most senior role, most senior first", async () => {
  const cognito = fakeCognito({
    users: [{ Username: "raul", Enabled: true, UserStatus: "CONFIRMED", Attributes: [{ Name: "name", Value: "Raul" }] }, { Username: "d0001", Enabled: false, UserStatus: "FORCE_CHANGE_PASSWORD" }],
    groups: { Admin: ["raul"], Supervisor: ["raul"], Device: ["d0001"] }
  });
  const users = await listUsers(cognito);
  assert.deepEqual(users.map((user) => [user.username, user.role, user.enabled]), [["raul", "Admin", true], ["d0001", "Device", false]]);
  assert.equal(users[0].name, "Raul");
});

test("changing a role leaves the login in exactly one role group", async () => {
  const cognito = fakeCognito({ groups: { Scanner: ["jwells"], FleetLead: [] } });
  await updateUser(cognito, "jwells", { role: "FleetLead" }, { actor: "raul" });
  assert.deepEqual(cognito.calls.filter(([name]) => /Group/.test(name)), [["removeFromGroup", "jwells", "Scanner"], ["addToGroup", "jwells", "FleetLead"]]);
});

test("turning a login off also signs it out everywhere, so a lost phone stops at once", async () => {
  const cognito = fakeCognito();
  await updateUser(cognito, "d0003", { enabled: false }, { actor: "raul" });
  assert.deepEqual(cognito.calls.map(([name]) => name), ["disable", "signOutEverywhere"]);
});

test("a new temporary password signs the login out, and is returned once", async () => {
  const cognito = fakeCognito();
  const result = await updateUser(cognito, "jwells", { resetPassword: true }, { actor: "raul" });
  assert.equal(result.temporaryPassword.length, 14);
  assert.deepEqual(cognito.calls.map(([name]) => name), ["setTemporaryPassword", "signOutEverywhere"]);
});

test("the Admin cannot change their own login here, so the only Admin cannot lock themselves out", async () => {
  await assert.rejects(() => updateUser(fakeCognito(), "RAUL", { enabled: false }, { actor: "raul" }), /cannot change your own login/);
});

// --- through the handler ------------------------------------------------------------------------

function fakeDb() {
  const writes = [];
  return { writes, async query() { return []; }, async execute(sql, params) { writes.push({ sql, params }); return { updated: 1 }; } };
}
const event = (method, rawPath, group, body) => ({
  requestContext: { http: { method }, authorizer: { jwt: { claims: { sub: "abc", "cognito:username": "raul", "cognito:groups": `[${group}]` } } } },
  rawPath,
  body: body ? JSON.stringify(body) : undefined
});

test("only the Admin reaches the logins", async () => {
  const handler = createHandler({ db: fakeDb(), cognito: fakeCognito() });
  assert.equal((await handler(event("GET", "/v1/users", "Supervisor"))).statusCode, 403);
  assert.equal((await handler(event("GET", "/v1/users", "Admin"))).statusCode, 200);
});

test("making a login is written to the shared history, and the password never is", async () => {
  const db = fakeDb();
  const handler = createHandler({ db, cognito: fakeCognito() });
  const response = await handler(event("POST", "/v1/users", "Admin", { username: "jwells", name: "Jordan Wells", role: "FleetLead" }));
  assert.equal(response.statusCode, 201);
  const { temporaryPassword: password } = JSON.parse(response.body);
  const [entry] = db.writes;
  assert.match(entry.params.description, /Login jwells \(Jordan Wells\) created as FleetLead by raul/);
  assert.ok(!JSON.stringify(db.writes).includes(password));
});

test("a login is changed at /v1/users/<name>", async () => {
  const cognito = fakeCognito();
  const handler = createHandler({ db: fakeDb(), cognito });
  const response = await handler(event("PATCH", "/v1/users/d0002", "Admin", { enabled: false }));
  assert.equal(response.statusCode, 200);
  assert.equal(cognito.calls[0][1], "d0002");
});
