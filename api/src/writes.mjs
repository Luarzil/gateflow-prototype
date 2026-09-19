// Recording a gate movement into the shared database — CR-V17-AWS-CONNECT-001 step 3.
//
// A scanner decides at the gate, offline if it has to, and then sends what it recorded. This
// module's job is to store that faithfully and to say where the server disagrees, not to silently
// correct it: the movement happened either way, and a supervisor needs to see both what the gate
// did and what the records say about it.
//
// Three properties matter more than anything else here:
//
//   1. Sending the same movement twice records it once. A handheld that loses its signal
//      mid-upload retries, and client_id (unique in the database) is what makes that safe.
//   2. A movement is never edited or deleted, only added - the append-only trigger from 003
//      enforces that, and the only later change allowed is a supervisor's conflict review.
//   3. What the gate saw is written down as a snapshot on the movement itself, so a printout made
//      months later still shows the driver, vehicle and device as they were that day.
//
// And one the review after step 4 added: a movement is judged as of when it happened at the gate,
// never as of when it arrived. With an offline queue those can be days apart.

import { RequestError, utc } from "./queries.mjs";

// A movement recorded more than this long before it arrived was queued on a device without a
// signal, rather than being recorded at the gate just now.
const DELAYED_AFTER_MINUTES = 5;
// A device clock this far ahead is flagged but the movement is kept. Beyond a day it is refused:
// a time that far in the future would sit at the top of every gate log until real time caught up.
const CLOCK_AHEAD_FLAG_MINUTES = 10;
const CLOCK_AHEAD_REFUSE_HOURS = 24;
// Patrick: outages "could be minutes or days". Older than this, the device clock is suspect.
const CLOCK_BEHIND_FLAG_DAYS = 30;

const DIRECTIONS = ["IN", "OUT"];
const ENTRY_METHODS = ["scanner_field", "manual", "legacy_unknown"];
const STATUSES = ["Authorized", "Unauthorized", "Location override"];

function text(value) {
  return String(value === null || value === undefined ? "" : value).trim();
}

function required(body, field) {
  const value = text(body[field]);
  if (!value) throw new RequestError(`${field} is required.`);
  return value;
}

function oneOf(body, field, allowed, fallback) {
  const value = text(body[field]) || fallback;
  if (!allowed.includes(value)) throw new RequestError(`${field} must be one of ${allowed.join(", ")}.`);
  return value;
}

function timestamp(value, field) {
  const raw = text(value);
  if (!raw) throw new RequestError(`${field} is required.`);
  const when = new Date(raw);
  if (Number.isNaN(when.getTime())) throw new RequestError(`${field} is not a time this API can read.`);
  return when;
}

// The app writes every barcode as G followed by at least four digits (CR-V15). The server insists
// on the same, because an unknown barcode creates a vehicle: "g42" and "G0042" must not become
// two vehicles, and a garbled scan must not become one at all.
export function canonicalBarcode(value) {
  const barcode = text(value).toUpperCase();
  if (!/^G\d{4,}$/.test(barcode)) throw new RequestError("vehicleBarcode must be G followed by at least four digits, for example G0001.");
  return barcode;
}

// Employee numbers may contain letters since CR-V14; the roster stores them upper-case.
function employeeNumber(value) {
  const employee = text(value).toUpperCase();
  if (!employee) throw new RequestError("driverEmployee is required.");
  if (!/^[A-Z0-9]+$/.test(employee)) throw new RequestError("driverEmployee may contain only letters and digits.");
  return employee;
}

// What the device knew when it let the vehicle through: the authorization it relied on, if any.
// Until authorizations are written to the shared records, this is how the server can tell "there
// was no authorization" apart from "there was one, on the device, that we have not been told of".
function deviceAuthorization(value) {
  if (!value || typeof value !== "object") return null;
  const expires = new Date(text(value.expiresAt));
  if (Number.isNaN(expires.getTime())) return null;
  const from = value.validFrom ? new Date(text(value.validFrom)) : null;
  return {
    validFrom: from && !Number.isNaN(from.getTime()) ? from.toISOString() : null,
    expiresAt: expires.toISOString(),
    authorizedBy: text(value.authorizedBy).slice(0, 120)
  };
}

export function readMovementBody(body = {}, now = new Date()) {
  const occurredAt = timestamp(body.occurredAt, "occurredAt");
  const aheadMinutes = (occurredAt.getTime() - now.getTime()) / 60000;
  if (aheadMinutes > CLOCK_AHEAD_REFUSE_HOURS * 60) {
    throw new RequestError(`occurredAt is more than ${CLOCK_AHEAD_REFUSE_HOURS} hours in the future. Check the device clock.`);
  }

  return {
    clientId: required(body, "clientId"),
    direction: oneOf(body, "direction", DIRECTIONS),
    driverEmployee: employeeNumber(body.driverEmployee),
    vehicleBarcode: canonicalBarcode(body.vehicleBarcode),
    location: required(body, "location"),
    authorizationStatus: oneOf(body, "authorizationStatus", STATUSES),
    driverEntryMethod: oneOf(body, "driverEntryMethod", ENTRY_METHODS, "legacy_unknown"),
    vehicleEntryMethod: oneOf(body, "vehicleEntryMethod", ENTRY_METHODS, "legacy_unknown"),
    submittedBy: text(body.submittedBy),
    note: text(body.note),
    deviceId: text(body.deviceId),
    workingLocation: text(body.workingLocation) || required(body, "location"),
    occurredAt: occurredAt.toISOString(),
    deviceAuthorization: deviceAuthorization(body.deviceAuthorization),
    clockAheadMinutes: aheadMinutes,
    clockBehindDays: -aheadMinutes / (60 * 24)
  };
}

// What the shared records say about this driver and vehicle AS OF THE MOMENT OF THE MOVEMENT.
// A movement queued offline yesterday, while its driver was authorized, must not be flagged just
// because the authorization ran out before the signal came back.
async function gateFacts(db, movement, transactionId) {
  const [driver] = await db.query(
    `select employee_number, name, active, license_expires::text as license_expires,
            (license_expires < (CAST(:occurredAt AS timestamptz) AT TIME ZONE 'America/New_York')::date) as license_expired,
            exists (select 1 from authorizations a
                     where a.driver_employee = d.employee_number
                       and a.valid_from <= CAST(:occurredAt AS timestamptz)
                       and a.expires_at > CAST(:occurredAt AS timestamptz)
                       and (a.revoked_at is null or a.revoked_at > CAST(:occurredAt AS timestamptz))) as authorized_then
       from drivers d where employee_number = :employee`,
    { employee: movement.driverEmployee, occurredAt: movement.occurredAt }, transactionId);

  const [vehicle] = await db.query(
    "select id, assigned_barcode, vin, plate, active from vehicles where assigned_barcode = :barcode",
    { barcode: movement.vehicleBarcode }, transactionId);

  const [device] = movement.deviceId
    ? await db.query("select id, name, type, assigned_location from devices where id = :device", { device: movement.deviceId }, transactionId)
    : [undefined];

  return { driver, vehicle, device };
}

function deviceAuthorizationCovers(movement) {
  const evidence = movement.deviceAuthorization;
  if (!evidence) return false;
  const at = new Date(movement.occurredAt).getTime();
  const from = evidence.validFrom ? new Date(evidence.validFrom).getTime() : -Infinity;
  return from <= at && new Date(evidence.expiresAt).getTime() > at;
}

// Where the gate's decision and the server's records disagree. This is recorded, not enforced:
// the vehicle already moved. A supervisor reviews it, which is the only edit a movement allows.
// There is one flag column, so the most serious disagreement wins.
export function findConflict(movement, facts) {
  const decided = movement.authorizationStatus;
  const driver = facts.driver || {};
  if (decided !== "Unauthorized") {
    if (!driver.active) return "driver_inactive";
    if (driver.license_expired) return "license_expired";
    if (decided === "Authorized" && !driver.authorized_then) {
      // The device held an authorization the shared records have never heard of. That is not the
      // same as the driver being unauthorized, and the flag must not say it is.
      return deviceAuthorizationCovers(movement) ? "authorization_not_shared" : "authorization_expired";
    }
    // The override covers a scanned badge only, never a typed employee number (CR-V16).
    if (decided === "Location override" && movement.driverEntryMethod !== "scanner_field") return "override_needs_scan";
    if (facts.vehicle && facts.vehicle.active === false) return "vehicle_removed";
  }
  // The time on the record is only as good as the device clock that wrote it.
  if (movement.clockAheadMinutes > CLOCK_AHEAD_FLAG_MINUTES) return "device_clock_ahead";
  if (movement.clockBehindDays > CLOCK_BEHIND_FLAG_DAYS) return "device_clock_behind";
  return "";
}

// A barcode nobody has seen before becomes a vehicle record on the spot, the same as the scanner
// does on the device (CR-V11). It is marked as created by an inbound scan, and a typed barcode is
// flagged for a supervisor to check, because a typo invents a vehicle (CR-V15).
async function addVehicleFromScan(db, movement, transactionId) {
  const [row] = await db.query(
    `insert into vehicles (assigned_barcode, created_source, barcode_needs_review, added_at, created_by)
     values (:barcode, 'inbound_scan', :needsReview, now(), :actor)
     on conflict (assigned_barcode) do nothing
     returning id`,
    { barcode: movement.vehicleBarcode, needsReview: movement.vehicleEntryMethod === "manual", actor: movement.submittedBy || "scanner" },
    transactionId);
  if (row && row.id) return { id: Number(row.id), added: true };
  // Another upload created it in the same instant; use theirs.
  const [existing] = await db.query("select id from vehicles where assigned_barcode = :barcode", { barcode: movement.vehicleBarcode }, transactionId);
  return { id: Number(existing.id), added: false };
}

export async function recordMovement(db, body, { actor = "", now = () => new Date() } = {}) {
  const movement = readMovementBody(body, now());

  // Asked before anything is written: a retried upload must not begin by creating a vehicle.
  const [already] = await db.query(
    `select id, conflict, delayed, ${utc("occurred_at", "occurred_at")} from movements where client_id = :clientId`,
    { clientId: movement.clientId });
  if (already) {
    return { id: Number(already.id), clientId: movement.clientId, duplicate: true, conflict: already.conflict || "", delayed: Boolean(already.delayed) };
  }

  return db.transaction(async (transactionId) => {
    const facts = await gateFacts(db, movement, transactionId);
    if (!facts.driver) throw new RequestError(`Employee ${movement.driverEmployee} is not in the shared roster.`, 422, "unknown_driver");

    const vehicle = facts.vehicle
      ? { id: Number(facts.vehicle.id), added: false }
      : await addVehicleFromScan(db, movement, transactionId);

    const conflict = findConflict(movement, facts);
    const receivedNow = now();
    const delayed = receivedNow.getTime() - new Date(movement.occurredAt).getTime() > DELAYED_AFTER_MINUTES * 60000;
    const station = movement.submittedBy || actor || "scanner";

    const [inserted] = await db.query(
      `insert into movements (client_id, direction, driver_employee, driver_name, vehicle_id, vehicle_barcode, vin, plate,
                              location, working_location, authorization_status, note, submitted_by, device_id, device_name,
                              device_type, device_assigned_location, driver_entry_method, vehicle_entry_method,
                              occurred_at, received_at, delayed, conflict, uploaded_by)
       values (:clientId, CAST(:direction AS movement_dir), :driverEmployee, :driverName, :vehicleId, :vehicleBarcode, :vin, :plate,
               :location, :workingLocation, :authorizationStatus, :note, :submittedBy, :deviceId, :deviceName,
               :deviceType, :deviceLocation, CAST(:driverEntry AS entry_method), CAST(:vehicleEntry AS entry_method),
               CAST(:occurredAt AS timestamptz), now(), :delayed, :conflict, :uploadedBy)
       on conflict (client_id) do nothing
       returning id`,
      {
        clientId: movement.clientId,
        direction: movement.direction,
        driverEmployee: movement.driverEmployee,
        driverName: facts.driver.name,
        vehicleId: vehicle.id,
        vehicleBarcode: movement.vehicleBarcode,
        vin: (facts.vehicle && facts.vehicle.vin) || null,
        plate: (facts.vehicle && facts.vehicle.plate) || null,
        location: movement.location,
        workingLocation: movement.workingLocation,
        authorizationStatus: movement.authorizationStatus,
        note: movement.note || null,
        submittedBy: station,
        deviceId: (facts.device && facts.device.id) || null,
        deviceName: (facts.device && facts.device.name) || null,
        deviceType: (facts.device && facts.device.type) || null,
        deviceLocation: (facts.device && facts.device.assigned_location) || null,
        driverEntry: movement.driverEntryMethod,
        vehicleEntry: movement.vehicleEntryMethod,
        occurredAt: movement.occurredAt,
        delayed,
        conflict: conflict || null,
        // From the verified sign-in token, never from the request body.
        uploadedBy: actor || null
      }, transactionId);

    // Two uploads of the same movement raced and the other one won. Nothing more to do.
    if (!inserted) {
      const [theirs] = await db.query("select id, conflict, delayed from movements where client_id = :clientId", { clientId: movement.clientId }, transactionId);
      return { id: Number(theirs.id), clientId: movement.clientId, duplicate: true, conflict: theirs.conflict || "", delayed: Boolean(theirs.delayed) };
    }

    const movementId = Number(inserted.id);
    // The first movement of a vehicle that turned up at the gate is where it came from. The device may
    // have sent the vehicle itself a moment earlier, as a change, so this is not only for vehicles
    // this upload created.
    await db.execute(
      `update vehicles set added_from_movement = :movementId, updated_at = now()
        where id = :vehicleId and added_from_movement is null and created_source = 'inbound_scan'`,
      { movementId, vehicleId: vehicle.id }, transactionId);

    // The audit trail is append-only, and carries the same client_id so a retry cannot double it.
    await db.execute(
      `insert into audit_events (client_id, type, description, actor, location, occurred_at)
       values (:clientId, :type, :description, :actor, :location, CAST(:occurredAt AS timestamptz))
       on conflict (client_id) do nothing`,
      {
        clientId: `${movement.clientId}:movement`,
        type: movement.direction === "OUT" ? "out_transaction" : "in_transaction",
        description: `Vehicle ${movement.direction} recorded for ${movement.driverEmployee} / ${movement.vehicleBarcode} as ${movement.authorizationStatus}.`
          + (conflict ? ` Flagged for review: ${conflict}.` : "")
          + (vehicle.added ? " Vehicle added by this scan." : "")
          + (actor ? ` Uploaded by ${actor}.` : ""),
        actor: station,
        location: movement.location,
        occurredAt: movement.occurredAt
      }, transactionId);

    return {
      id: movementId,
      clientId: movement.clientId,
      duplicate: false,
      conflict,
      delayed,
      vehicleAdded: vehicle.added
    };
  });
}
