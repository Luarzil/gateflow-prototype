// Logins, made by the Admin inside the app — CR-V17-AWS-CONNECT-001 step 5.
//
// Patrick, 2026-09-06: "we issue 1 admin and they create and give the users out with authority." The
// Admin adds a person or a gate phone in the Users tab; this creates the Cognito login, puts it in the
// role's group, and hands back a temporary password once, to be given to the person. Their first
// sign-in makes them choose their own. Passwords are never stored here or anywhere in the app.
//
// Cognito is reached through a small client passed in, so the rules below are tested without AWS.

import { randomInt } from "node:crypto";
import { RequestError } from "./queries.mjs";
import { RANKS, roleOf } from "./roles.mjs";

export const ROLE_GROUPS = ["Admin", "Supervisor", "FleetLead", "Scanner", "Device"];

function text(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

// Lower-case letters, digits, dot, dash and underscore: easy to read out and to type on a phone.
export function readUsername(value) {
  const username = text(value, 60).toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{2,39}$/.test(username)) {
    throw new RequestError("A login name is 3 to 40 lower-case letters or digits (dot, dash and underscore allowed), for example jwells or d0001.");
  }
  return username;
}

export function readRole(value) {
  const role = text(value, 20);
  if (!ROLE_GROUPS.includes(role)) throw new RequestError(`role must be one of ${ROLE_GROUPS.join(", ")}.`);
  return role;
}

// Meets the pool's rule (12 or more, upper, lower, digit) with room to spare, and avoids characters
// that are easy to misread when a password is read aloud or copied off a screen: 0/O, 1/l/I.
const LOWER = "abcdefghijkmnpqrstuvwxyz";
const UPPER = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const DIGITS = "23456789";
export function temporaryPassword(pick = randomInt) {
  const from = (set) => set[pick(set.length)];
  const chars = [from(UPPER), from(LOWER), from(DIGITS)];
  const all = LOWER + UPPER + DIGITS;
  while (chars.length < 14) chars.push(from(all));
  for (let index = chars.length - 1; index > 0; index -= 1) {
    const other = pick(index + 1);
    [chars[index], chars[other]] = [chars[other], chars[index]];
  }
  return chars.join("");
}

function attribute(user, name) {
  const found = (user.Attributes || user.UserAttributes || []).find((item) => item.Name === name);
  return found ? found.Value : "";
}

export async function listUsers(cognito) {
  const users = new Map();
  for (const user of await cognito.listUsers()) {
    users.set(user.Username, { username: user.Username, name: attribute(user, "name"), enabled: user.Enabled !== false, status: user.UserStatus || "", createdAt: user.UserCreateDate ? new Date(user.UserCreateDate).toISOString() : "", groups: [] });
  }
  for (const group of ROLE_GROUPS) {
    for (const member of await cognito.listUsersInGroup(group)) {
      const user = users.get(member.Username);
      if (user) user.groups.push(group);
    }
  }
  return [...users.values()]
    .map((user) => ({ ...user, role: roleOf(user.groups) }))
    .sort((a, b) => (RANKS[b.role] || 0) - (RANKS[a.role] || 0) || a.username.localeCompare(b.username));
}

export async function createUser(cognito, body = {}, { actor }) {
  const username = readUsername(body.username);
  const role = readRole(body.role);
  const name = text(body.name, 80);
  if (!name) throw new RequestError("A login needs the person's name, or the phone's name.");
  const password = temporaryPassword();
  try {
    await cognito.createUser({ username, name, password });
  } catch (error) {
    if (error && error.name === "UsernameExistsException") throw new RequestError(`The login ${username} already exists.`, 409, "login_exists");
    throw error;
  }
  await cognito.addToGroup(username, role);
  return { username, name, role, temporaryPassword: password, createdBy: actor };
}

// Role changes, turning a login off or on, and a new temporary password. The Admin cannot change
// their own login this way: the pool must never lose its only Admin by a slip in a form.
export async function updateUser(cognito, username, body = {}, { actor }) {
  const target = readUsername(username);
  if (target === String(actor || "").toLowerCase()) throw new RequestError("You cannot change your own login here. Another Admin must.", 409, "own_login");
  const result = { username: target };
  if (body.role !== undefined) {
    const role = readRole(body.role);
    const current = await cognito.groupsFor(target);
    for (const group of current.filter((item) => ROLE_GROUPS.includes(item) && item !== role)) await cognito.removeFromGroup(target, group);
    if (!current.includes(role)) await cognito.addToGroup(target, role);
    result.role = role;
  }
  if (body.enabled === false) {
    await cognito.disable(target);
    // A disabled login's phone or console must stop at its next refresh, not in 180 days.
    await cognito.signOutEverywhere(target);
    result.enabled = false;
  } else if (body.enabled === true) {
    await cognito.enable(target);
    result.enabled = true;
  }
  if (body.resetPassword === true) {
    const password = temporaryPassword();
    await cognito.setTemporaryPassword(target, password);
    await cognito.signOutEverywhere(target);
    result.temporaryPassword = password;
  }
  return result;
}

// The real client, through the AWS SDK the Lambda runtime ships. Loaded on first use.
export function createCognito(userPoolId) {
  let sdk;
  let client;
  async function send(command, input) {
    if (!client) {
      sdk = await import("@aws-sdk/client-cognito-identity-provider");
      client = new sdk.CognitoIdentityProviderClient({});
    }
    return client.send(new sdk[command]({ UserPoolId: userPoolId, ...input }));
  }
  // ListUsers pages with PaginationToken; the group listings with NextToken.
  async function pages(command, input, key, tokenName = "NextToken") {
    const all = [];
    let token;
    do {
      const page = await send(command, { ...input, ...(token ? { [tokenName]: token } : {}) });
      all.push(...(page[key] || []));
      token = page[tokenName];
    } while (token);
    return all;
  }
  return {
    listUsers: () => pages("ListUsersCommand", { Limit: 60 }, "Users", "PaginationToken"),
    listUsersInGroup: (group) => pages("ListUsersInGroupCommand", { GroupName: group, Limit: 60 }, "Users"),
    groupsFor: async (username) => (await pages("AdminListGroupsForUserCommand", { Username: username, Limit: 60 }, "Groups")).map((group) => group.GroupName),
    createUser: ({ username, name, password }) => send("AdminCreateUserCommand", { Username: username, TemporaryPassword: password, MessageAction: "SUPPRESS", UserAttributes: [{ Name: "name", Value: name }] }),
    addToGroup: (username, group) => send("AdminAddUserToGroupCommand", { Username: username, GroupName: group }),
    removeFromGroup: (username, group) => send("AdminRemoveUserFromGroupCommand", { Username: username, GroupName: group }),
    disable: (username) => send("AdminDisableUserCommand", { Username: username }),
    enable: (username) => send("AdminEnableUserCommand", { Username: username }),
    setTemporaryPassword: (username, password) => send("AdminSetUserPasswordCommand", { Username: username, Password: password, Permanent: false }),
    signOutEverywhere: (username) => send("AdminUserGlobalSignOutCommand", { Username: username })
  };
}
