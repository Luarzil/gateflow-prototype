// The history entries a device writes — CR-V17-AWS-CONNECT-001, 2026-09-19.
//
// A device sends what it has written in batches. Each entry keeps the device's own id, so a batch
// sent again after a dropped signal adds nothing twice. Entries are evidence, so a malformed field is
// trimmed or defaulted rather than the whole batch refused: one odd entry must not hold up the rest
// forever. Only a batch that is not a batch at all is refused.

import { RequestError } from "./queries.mjs";

export const MAX_BATCH = 50;
const CLOCK_AHEAD_LIMIT_MS = 24 * 3600000;

function text(value, max) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

export function readAuditEntry(entry, now = new Date()) {
  if (!entry || typeof entry !== "object") throw new RequestError("Each entry must be an object.");
  const clientId = text(entry.clientId, 120);
  if (!clientId) throw new RequestError("Each entry needs its clientId.");
  const stated = new Date(text(entry.occurredAt, 40));
  // A device clock a day or more ahead would put this entry at the top of every history until real
  // time caught up. It is kept, at the moment it arrived, and says so.
  let occurredAt = Number.isNaN(stated.getTime()) ? now : stated;
  let note = Number.isNaN(stated.getTime()) ? " [Device time unreadable; recorded at arrival.]" : "";
  if (occurredAt.getTime() - now.getTime() > CLOCK_AHEAD_LIMIT_MS) {
    occurredAt = now;
    note = ` [Device clock was ahead: it said ${stated.toISOString()}; recorded at arrival.]`;
  }
  const type = text(entry.type, 60).toLowerCase().replace(/[^a-z0-9_]/g, "_") || "device_event";
  return {
    client_id: clientId,
    type,
    description: (text(entry.description, 1000) || type) + note,
    actor: text(entry.actor, 120) || "device",
    location: text(entry.location, 120) || null,
    source: text(entry.source, 40) || "device",
    occurred_at: occurredAt.toISOString()
  };
}

export async function recordAuditEntries(db, body = {}, { actor = "", now = () => new Date() } = {}) {
  const entries = Array.isArray(body.entries) ? body.entries : null;
  if (!entries || entries.length === 0) throw new RequestError("entries must be a list of history entries.");
  if (entries.length > MAX_BATCH) throw new RequestError(`Send at most ${MAX_BATCH} entries at a time.`);
  const arrived = now();
  const rows = entries.map((entry) => ({ ...readAuditEntry(entry, arrived), uploaded_by: actor || null }));
  // One statement for the whole batch. An entry already recorded is skipped, not an error.
  const inserted = await db.query(
    `insert into audit_events (client_id, type, description, actor, location, source, occurred_at, uploaded_by)
     select r.client_id, r.type, r.description, r.actor, r.location, r.source, CAST(r.occurred_at AS timestamptz), r.uploaded_by
       from jsonb_to_recordset(CAST(:rows AS jsonb))
         as r(client_id text, type text, description text, actor text, location text, source text, occurred_at text, uploaded_by text)
     on conflict (client_id) do nothing
     returning client_id`,
    { rows: JSON.stringify(rows) });
  return { received: rows.length, recorded: inserted.length, alreadyRecorded: rows.length - inserted.length };
}
