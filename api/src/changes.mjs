// Changes to drivers, vehicles, authorizations and the override switches — CR-V17-AWS-CONNECT-001.
//
// Every device keeps a copy of these records so the gate works with no signal. Each change a device
// makes is queued and sent here, in the order it was made, alongside the movements. Other devices
// then take the result in. This module decides what each change does to the shared copy.
//
// What it promises:
//
//   1. The same change sent twice is applied once (client_id, unique in reference_changes).
//   2. An older edit never overwrites a newer one. A phone that was offline all day can send a
//      driver edit from this morning after the console changed the same driver this afternoon; the
//      morning edit is kept in reference_changes as "superseded" and does not win.
//   3. An authorization's window is never rewritten once shared. It can only end: be revoked,
//      replaced or expire. That is what lets a movement be judged as of the moment it happened.
//   4. Only an Admin can move a location's override switch (Patrick, 2026-09-13: "under manager
//      authority only"; there is one Admin, not a Manager and an Admin).

import { RequestError } from "./queries.mjs";
import { canonicalBarcode } from "./writes.mjs";

const KINDS = ["driver", "vehicle", "authorization", "location"];
const DURATIONS = ["9_hours", "12_hours", "today", "48_hours", "3_days"];
const ROLES = ["Scanner", "Fleet Lead", "Supervisor", "Admin"];
const ENDED = ["revoked", "replaced", "expired"];
const CLOCK_AHEAD_REFUSE_HOURS = 24;

function text(value, max = 200) {
  return String(value === null || value === undefined ? "" : value).trim().slice(0, max);
}

function instant(value, field) {
  const when = new Date(text(value));
  if (!text(value) || Number.isNaN(when.getTime())) throw new RequestError(`${field} is not a time this API can read.`);
  return when;
}

function optionalInstant(value) {
  if (!text(value)) return null;
  const when = new Date(text(value));
  return Number.isNaN(when.getTime()) ? null : when;
}

function employeeNumber(value, field = "employeeNumber") {
  const employee = text(value).toUpperCase();
  if (!/^[A-Z0-9]+$/.test(employee)) throw new RequestError(`${field} may contain only letters and digits.`);
  return employee;
}

function calendarDate(value, field) {
  const raw = text(value);
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(raw);
  if (match) {
    const [year, month, day] = match.slice(1).map(Number);
    const date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day) return raw;
  }
  throw new RequestError(`${field} must be a real date written YYYY-MM-DD.`);
}

// API Gateway passes the Cognito groups claim through as text, "[Admin Supervisor]", rather than as
// the list it is in the token.
export function groupsFrom(claims = {}) {
  const raw = claims["cognito:groups"];
  if (Array.isArray(raw)) return raw.map(String);
  return String(raw || "").replace(/^\[|\]$/g, "").split(/[\s,]+/).filter(Boolean);
}

export function readChangeBody(body = {}, now = new Date()) {
  const clientId = text(body.clientId, 120);
  if (!clientId) throw new RequestError("clientId is required.");
  const kind = text(body.kind);
  if (!KINDS.includes(kind)) throw new RequestError(`kind must be one of ${KINDS.join(", ")}.`);
  const occurredAt = instant(body.occurredAt, "occurredAt");
  if (occurredAt.getTime() - now.getTime() > CLOCK_AHEAD_REFUSE_HOURS * 3600000) {
    throw new RequestError(`occurredAt is more than ${CLOCK_AHEAD_REFUSE_HOURS} hours in the future. Check the device clock.`);
  }
  if (!body.data || typeof body.data !== "object" || Array.isArray(body.data)) throw new RequestError("data must be the record as the device holds it.");
  // A device clock running fast must not make its edits win forever, so no edit is treated as
  // newer than the moment it arrived.
  const effectiveAt = new Date(Math.min(occurredAt.getTime(), now.getTime()));
  return { clientId, kind, occurredAt: occurredAt.toISOString(), effectiveAt: effectiveAt.toISOString(), data: body.data };
}

// --- drivers ----------------------------------------------------------------

export function readDriver(data) {
  const name = text(data.name, 120);
  if (!name) throw new RequestError("A driver needs a name.");
  return {
    employeeNumber: employeeNumber(data.employeeNumber),
    name,
    licenseExpires: calendarDate(data.licenseExpires, "licenseExpires"),
    active: data.active !== false
  };
}

async function applyDriver(db, change, actor, transactionId) {
  const driver = readDriver(change.data);
  const [current] = await db.query(
    `select (changed_at is not null and changed_at > CAST(:at AS timestamptz)) as newer from drivers where employee_number = :employee`,
    { employee: driver.employeeNumber, at: change.effectiveAt }, transactionId);
  if (current && current.newer) return { key: driver.employeeNumber, outcome: "superseded", summary: `Driver ${driver.employeeNumber}: a newer edit was already in the shared records.` };
  await db.execute(
    `insert into drivers (employee_number, name, license_expires, active, created_by, updated_by, changed_at)
     values (:employee, :name, CAST(:license AS date), :active, :actor, :actor, CAST(:at AS timestamptz))
     on conflict (employee_number) do update
       set name = excluded.name, license_expires = excluded.license_expires, active = excluded.active,
           updated_by = excluded.updated_by, updated_at = now(), changed_at = excluded.changed_at`,
    { employee: driver.employeeNumber, name: driver.name, license: driver.licenseExpires, active: driver.active, actor, at: change.effectiveAt }, transactionId);
  return { key: driver.employeeNumber, outcome: "applied", summary: `Driver ${driver.employeeNumber} ${current ? "updated" : "added"}${driver.active ? "" : " (inactive)"}.` };
}

// --- vehicles ---------------------------------------------------------------

export function readVehicle(data) {
  const id = text(data.id, 120);
  if (!id) throw new RequestError("A vehicle change needs the device's id for the vehicle.");
  const year = Number.parseInt(data.year, 10);
  const serverId = Number.parseInt(data.serverId, 10);
  return {
    id,
    serverId: Number.isInteger(serverId) && serverId > 0 ? serverId : null,
    previousBarcode: text(data.previousBarcode) ? canonicalBarcode(data.previousBarcode) : "",
    assignedBarcode: canonicalBarcode(data.assignedBarcode),
    vin: text(data.vin, 40).toUpperCase() || null,
    plate: text(data.plate, 20).toUpperCase() || null,
    make: text(data.make, 60) || null,
    model: text(data.model, 60) || null,
    year: Number.isInteger(year) && year >= 1900 && year <= 2100 ? year : null,
    color: text(data.color, 40) || null,
    active: data.active !== false,
    barcodeNeedsReview: data.barcodeNeedsReview === true,
    createdSource: data.createdSource === "inbound_scan" ? "inbound_scan" : "supervisor"
  };
}

// Which shared vehicle a device's vehicle is. In order: the server's own id, which the device learned
// when it took the records in; the id the device gave it; the barcode it had before this edit; the
// barcode it has now. A barcode names one vehicle, so two devices that each met an unknown G0099
// with no signal are describing the same car.
async function findVehicle(db, vehicle, transactionId) {
  const tries = [];
  if (vehicle.serverId) tries.push(["id = :value", vehicle.serverId]);
  tries.push(["client_id = :value", vehicle.id]);
  if (vehicle.previousBarcode) tries.push(["assigned_barcode = :value", vehicle.previousBarcode]);
  tries.push(["assigned_barcode = :value", vehicle.assignedBarcode]);
  for (const [where, value] of tries) {
    const [row] = await db.query(
      `select id, client_id, assigned_barcode, active, (changed_at is not null and changed_at > CAST(:at AS timestamptz)) as newer
         from vehicles where ${where}`, { value, at: vehicle.effectiveAt }, transactionId);
    if (row) return row;
  }
  return null;
}

async function applyVehicle(db, change, actor, transactionId) {
  const vehicle = { ...readVehicle(change.data), effectiveAt: change.effectiveAt };
  const row = await findVehicle(db, vehicle, transactionId);
  if (row && row.newer) return { key: vehicle.assignedBarcode, outcome: "superseded", summary: `Vehicle ${vehicle.assignedBarcode}: a newer edit was already in the shared records.` };

  // "Assigned Barcode must be unique and is never reused" (CR-V14). Two consoles that each gave the
  // same new barcode to a different car while offline cannot both be right; the second is refused.
  const [taken] = await db.query(
    "select id from vehicles where assigned_barcode = :barcode and (CAST(:rowId AS bigint) is null or id <> CAST(:rowId AS bigint))",
    { barcode: vehicle.assignedBarcode, rowId: row ? Number(row.id) : null }, transactionId);
  if (taken) throw new RequestError(`Barcode ${vehicle.assignedBarcode} already belongs to another vehicle in the shared records.`, 409, "barcode_taken");

  const fields = {
    barcode: vehicle.assignedBarcode, vin: vehicle.vin, plate: vehicle.plate, make: vehicle.make, model: vehicle.model,
    year: vehicle.year, color: vehicle.color, active: vehicle.active, review: vehicle.barcodeNeedsReview, actor, at: change.effectiveAt
  };
  if (!row) {
    await db.execute(
      `insert into vehicles (client_id, assigned_barcode, vin, plate, make, model, year, color, active, created_source, barcode_needs_review,
                             created_by, updated_by, changed_at, added_at, removed_at, removed_by)
       values (:clientId, :barcode, :vin, :plate, :make, :model, CAST(:year AS int), :color, :active, CAST(:source AS created_source), :review,
               :actor, :actor, CAST(:at AS timestamptz),
               case when :source = 'inbound_scan' then CAST(:at AS timestamptz) end,
               case when :active then null else CAST(:at AS timestamptz) end,
               case when :active then null else :actor end)`,
      { ...fields, clientId: vehicle.id, source: vehicle.createdSource }, transactionId);
    return { key: vehicle.assignedBarcode, outcome: "applied", summary: `Vehicle ${vehicle.assignedBarcode} added.` };
  }

  const wasActive = row.active !== false;
  await db.execute(
    `update vehicles
        set client_id = coalesce(client_id, :clientId), assigned_barcode = :barcode, vin = :vin, plate = :plate, make = :make,
            model = :model, year = CAST(:year AS int), color = :color, active = :active, barcode_needs_review = :review,
            updated_by = :actor, updated_at = now(), changed_at = CAST(:at AS timestamptz),
            removed_at = case when :removing then CAST(:at AS timestamptz) else removed_at end,
            removed_by = case when :removing then :actor else removed_by end,
            reactivated_at = case when :restoring then CAST(:at AS timestamptz) else reactivated_at end
      where id = CAST(:rowId AS bigint)`,
    { ...fields, clientId: vehicle.id, rowId: Number(row.id), removing: wasActive && !vehicle.active, restoring: !wasActive && vehicle.active }, transactionId);
  const moved = row.assigned_barcode !== vehicle.assignedBarcode ? ` Barcode changed from ${row.assigned_barcode}.` : "";
  return { key: vehicle.assignedBarcode, outcome: "applied", summary: `Vehicle ${vehicle.assignedBarcode} updated${vehicle.active ? "" : " (removed from inventory)"}.${moved}` };
}

// --- authorizations -----------------------------------------------------------

export function readAuthorization(data) {
  const id = text(data.id, 120);
  if (!id) throw new RequestError("An authorization change needs the authorization's id.");
  const type = text(data.type);
  if (!DURATIONS.includes(type)) throw new RequestError(`type must be one of ${DURATIONS.join(", ")}.`);
  const validFrom = instant(data.validFrom, "validFrom");
  const expiresAt = instant(data.expiresAt, "expiresAt");
  if (expiresAt <= validFrom) throw new RequestError("expiresAt must be after validFrom.");
  const status = text(data.status) || "active";
  if (status !== "active" && !ENDED.includes(status)) throw new RequestError("status must be active, revoked, replaced or expired.");
  const role = text(data.authorizedRole) || "Supervisor";
  if (!ROLES.includes(role)) throw new RequestError(`authorizedRole must be one of ${ROLES.join(", ")}.`);
  return {
    id,
    driverEmployee: employeeNumber(data.driverEmployee, "driverEmployee"),
    type,
    validFrom: validFrom.toISOString(),
    expiresAt: expiresAt.toISOString(),
    status,
    authorizedBy: text(data.authorizedBy, 120) || "unknown",
    authorizedRole: role,
    approverBadge: text(data.approverBadge, 20).toUpperCase(),
    revokedBy: text(data.revokedBy, 120),
    revokedAt: optionalInstant(data.revokedAt),
    revocationReason: text(data.revocationReason, 200),
    location: text(data.location, 120),
    actionLocation: text(data.actionLocation, 120)
  };
}

// When an authorization ended. Never before it began, and never later than the change arriving.
function endedAt(auth, change) {
  const stated = auth.revokedAt ? auth.revokedAt.getTime() : new Date(change.effectiveAt).getTime();
  const at = Math.min(Math.max(stated, new Date(auth.validFrom).getTime()), new Date(change.effectiveAt).getTime());
  return new Date(at).toISOString();
}

async function applyAuthorization(db, change, actor, transactionId) {
  const auth = readAuthorization(change.data);
  const [driver] = await db.query("select employee_number from drivers where employee_number = :employee", { employee: auth.driverEmployee }, transactionId);
  if (!driver) throw new RequestError(`Employee ${auth.driverEmployee} is not in the shared roster.`, 422, "unknown_driver");

  // A badge approval at the gate is checked against the shared approver list, not the device's word.
  // The rank rule itself is also a database constraint (approver_rank, 001).
  let role = auth.authorizedRole;
  if (auth.approverBadge) {
    const [approver] = await db.query("select role::text as role, active from approvers where badge_id = :badge", { badge: auth.approverBadge }, transactionId);
    if (approver) role = approver.role;
  }
  if (role === "Scanner") throw new RequestError(`${auth.authorizedBy} holds Scanner and cannot grant an authorization. Fleet Lead or above is required.`, 403, "approver_rank");

  const [existing] = await db.query("select id, status from authorizations where client_id = :id", { id: auth.id }, transactionId);
  const summaries = [];

  if (!existing) {
    await db.execute(
      `insert into authorizations (client_id, driver_employee, duration, valid_from, expires_at, status, authorized_by, authorized_role,
                                   authorized_at, revoked_by, revoked_at, revocation_reason, location, action_location)
       values (:id, :employee, :type, CAST(:validFrom AS timestamptz), CAST(:expiresAt AS timestamptz), :status, :authorizedBy,
               CAST(:role AS app_role), CAST(:validFrom AS timestamptz), :revokedBy, CAST(:revokedAt AS timestamptz), :reason, :location, :actionLocation)`,
      {
        id: auth.id, employee: auth.driverEmployee, type: auth.type, validFrom: auth.validFrom, expiresAt: auth.expiresAt, status: auth.status,
        authorizedBy: auth.authorizedBy, role, revokedBy: auth.status === "active" ? null : auth.revokedBy || actor,
        revokedAt: auth.status === "active" ? null : endedAt(auth, change), reason: auth.revocationReason || null,
        location: auth.location || null, actionLocation: auth.actionLocation || null
      }, transactionId);
    summaries.push(`Driver ${auth.driverEmployee} authorized (${auth.type}) by ${auth.authorizedBy}.`);
    // One active authorization per driver, as on every device. One granted elsewhere that this
    // device never saw ends where the new one begins.
    if (auth.status === "active") {
      const replaced = await db.execute(
        `update authorizations set status = 'replaced', revoked_by = :by, revoked_at = CAST(:validFrom AS timestamptz),
                revocation_reason = 'Replaced by newer authorization', updated_at = now()
          where driver_employee = :employee and status = 'active' and client_id is distinct from :id
            and valid_from < CAST(:validFrom AS timestamptz)`,
        { by: auth.authorizedBy, validFrom: auth.validFrom, employee: auth.driverEmployee, id: auth.id }, transactionId);
      if (replaced.updated) summaries.push(`${replaced.updated} earlier authorization${replaced.updated === 1 ? "" : "s"} replaced.`);
    }
  } else if (auth.status !== "active" && existing.status === "active") {
    await db.execute(
      `update authorizations set status = :status, revoked_by = :by, revoked_at = CAST(:at AS timestamptz), revocation_reason = :reason, updated_at = now()
        where id = CAST(:rowId AS bigint)`,
      { status: auth.status, by: auth.revokedBy || actor, at: endedAt(auth, change), reason: auth.revocationReason || null, rowId: Number(existing.id) }, transactionId);
    summaries.push(`Driver ${auth.driverEmployee} authorization ${auth.status}.`);
  } else if (auth.status === existing.status) {
    summaries.push(`Driver ${auth.driverEmployee} authorization already ${existing.status}.`);
  } else {
    // Ended stays ended: an authorization is never revived, and its window is never rewritten.
    return { key: auth.driverEmployee, outcome: "superseded", summary: `Driver ${auth.driverEmployee}: the authorization had already ended as ${existing.status}.` };
  }

  // "Deauthorize" on a device means the driver may not leave, full stop, even on an authorization
  // granted somewhere this device had not yet heard about.
  if (auth.status === "revoked") {
    const others = await db.execute(
      `update authorizations set status = 'revoked', revoked_by = :by, revoked_at = CAST(:at AS timestamptz),
              revocation_reason = :reason, updated_at = now()
        where driver_employee = :employee and status = 'active' and client_id is distinct from :id
          and valid_from <= CAST(:at AS timestamptz)`,
      { by: auth.revokedBy || actor, at: endedAt(auth, change), reason: auth.revocationReason || "Revoked with another authorization", employee: auth.driverEmployee, id: auth.id }, transactionId);
    if (others.updated) summaries.push(`${others.updated} other active authorization${others.updated === 1 ? "" : "s"} revoked with it.`);
  }
  return { key: auth.driverEmployee, outcome: "applied", summary: summaries.join(" ") };
}

// --- location override switches ----------------------------------------------------

async function applyLocation(db, change, actor, groups, transactionId) {
  if (!groups.includes("Admin")) throw new RequestError("Only an Admin can change a location's override switch.", 403, "admin_only");
  const name = text(change.data.name, 120);
  const override = change.data.scanOverride && typeof change.data.scanOverride === "object" ? change.data.scanOverride : null;
  if (!name || !override) throw new RequestError("A location change needs the location's name and its override switch.");
  const [location] = await db.query(
    `select name, (scan_override_changed_at is not null and scan_override_changed_at > CAST(:at AS timestamptz)) as newer
       from locations where name = :name`, { name, at: change.effectiveAt }, transactionId);
  if (!location) throw new RequestError(`${name} is not a location in the shared records.`, 422, "unknown_location");
  if (location.newer) return { key: name, outcome: "superseded", summary: `${name}: the override switch was changed more recently elsewhere.` };
  const enabled = override.enabled === true;
  await db.execute(
    `update locations set scan_override_enabled = :enabled, scan_override_changed_by = :by, scan_override_changed_at = CAST(:at AS timestamptz)
      where name = :name`,
    { enabled, by: text(override.changedBy, 120) || actor, at: change.effectiveAt, name }, transactionId);
  return { key: name, outcome: "applied", summary: `Scanned-badge override turned ${enabled ? "on" : "off"} at ${name}.` };
}

// --- the change itself ------------------------------------------------------------

export async function recordChange(db, body, { actor = "", groups = [], now = () => new Date() } = {}) {
  const change = readChangeBody(body, now());

  const [already] = await db.query("select id, outcome from reference_changes where client_id = :clientId", { clientId: change.clientId });
  if (already) return { id: Number(already.id), clientId: change.clientId, duplicate: true, outcome: already.outcome };

  return db.transaction(async (transactionId) => {
    let result;
    if (change.kind === "driver") result = await applyDriver(db, change, actor, transactionId);
    else if (change.kind === "vehicle") result = await applyVehicle(db, change, actor, transactionId);
    else if (change.kind === "authorization") result = await applyAuthorization(db, change, actor, transactionId);
    else result = await applyLocation(db, change, actor, groups, transactionId);

    const [row] = await db.query(
      `insert into reference_changes (client_id, kind, record_key, data, outcome, occurred_at, uploaded_by)
       values (:clientId, :kind, :key, CAST(:data AS jsonb), :outcome, CAST(:occurredAt AS timestamptz), :actor)
       on conflict (client_id) do nothing
       returning id`,
      { clientId: change.clientId, kind: change.kind, key: result.key, data: JSON.stringify(change.data), outcome: result.outcome, occurredAt: change.occurredAt, actor: actor || null },
      transactionId);
    // Two uploads of the same change raced. Only the first may leave its mark; this one rolls back and
    // answers "try again", and the retry finds the change already recorded.
    if (!row) throw new RequestError("This change is already being recorded. It will be checked again.", 503, "in_flight");

    await db.execute(
      `insert into audit_events (client_id, type, description, actor, occurred_at)
       values (:clientId, :type, :description, :actor, CAST(:occurredAt AS timestamptz))
       on conflict (client_id) do nothing`,
      {
        clientId: `${change.clientId}:change`,
        type: `shared_${change.kind}_${result.outcome}`,
        description: result.summary + (actor ? ` Uploaded by ${actor}.` : ""),
        actor: actor || "device",
        occurredAt: change.occurredAt
      }, transactionId);

    return { id: Number(row.id), clientId: change.clientId, duplicate: false, outcome: result.outcome, summary: result.summary };
  });
}
