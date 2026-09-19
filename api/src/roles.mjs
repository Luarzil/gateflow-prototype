// Who may do what — CR-V17-AWS-CONNECT-001 step 5.
//
// A login's role is its Cognito group, read from the verified token. Most senior wins when a login is
// in more than one. The ranks follow the app's own ladder (Scanner, Fleet Lead, Supervisor, Admin), with
// a phone signed in as itself (Device) ranked with Scanner: it records what happens at the gate and
// nothing more.

import { RequestError } from "./queries.mjs";

export const RANKS = { Device: 1, Scanner: 1, FleetLead: 2, Supervisor: 3, Admin: 4 };
export const GATE = 1;
export const FLEET_LEAD = 2;
export const SUPERVISOR = 3;
export const ADMIN = 4;

// The app's own names for the roles, as written on authorizations.
export const ROLE_NAMES = { Device: "Scanner", Scanner: "Scanner", FleetLead: "Fleet Lead", Supervisor: "Supervisor", Admin: "Admin" };

export function roleOf(groups = []) {
  return groups.filter((group) => RANKS[group]).sort((a, b) => RANKS[b] - RANKS[a])[0] || "";
}

export function rankOf(groups = []) {
  const role = roleOf(groups);
  return role ? RANKS[role] : 0;
}

const WHO = { [GATE]: "a gate phone or scanner login", [FLEET_LEAD]: "a Fleet Lead", [SUPERVISOR]: "a Supervisor", [ADMIN]: "the Admin" };

export function requireRank(groups, needed, what) {
  const rank = rankOf(groups);
  if (rank === 0) throw new RequestError("This login has no role yet. Ask the Admin to give it one.", 403, "no_role");
  if (rank < needed) throw new RequestError(`Only ${WHO[needed]} or above can ${what}.`, 403, "forbidden");
  return rank;
}
