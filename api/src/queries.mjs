// Read queries for the console and the scanners.

// CR-V16: Patrick 2026-09-13, "limit to searches to 50 data lines". The server enforces the page
// size, so no client can ask for the whole log in one go.
export const PAGE_SIZE = 50;
export const MAX_PAGE_SIZE = 100;
const BUSINESS_TIMEZONE = "America/New_York";

// The Data API returns a timestamptz as "2026-09-18 22:59:47.718031" - the right instant, in UTC,
// but with nothing to say so. A browser reads that as local time, which put every gate movement
// hours out on the first read. Every timestamp therefore leaves here as an explicit UTC instant.
//
// To the microsecond, not the millisecond: the paging cursor is built from this value, and a
// millisecond cursor silently skipped any movement recorded in the same millisecond as the last row
// of a page. Proven against the database in the review after step 4. Browsers read the extra digits.
export const utc = (expression, alias) =>
  `to_char(${expression} AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') as ${alias}`;

export class RequestError extends Error {
  constructor(message, status = 400, code = "bad_request") {
    super(message);
    this.status = status;
    this.code = code;
  }
}

// Everything a scanner needs to decide at the gate, including with no signal: who may drive,
// who is authorized now, what vehicles exist, which badges can approve, and each location's
// override switch.
export async function referenceData(db) {
  const [locations, drivers, vehicles, devices, approvers, authorizations] = [
    await db.query(`select name, active, historical_only, scan_override_enabled, scan_override_changed_by,
                           ${utc("scan_override_changed_at", "scan_override_changed_at")}
                      from locations order by name`),
    await db.query(`select employee_number, name, license_expires::text as license_expires, active,
                           ${utc("updated_at", "updated_at")}
                      from drivers order by name`),
    await db.query(`select id, assigned_barcode, vin, plate, make, model, year, color, active, created_source::text as created_source,
                           barcode_needs_review, ${utc("added_at", "added_at")}
                      from vehicles order by assigned_barcode`),
    await db.query(`select id, name, imei, type, assigned_location, status, active, ${utc("last_used_at", "last_used_at")}
                      from devices order by id`),
    await db.query(`select badge_id, name, role::text as role
                      from approvers where active order by badge_id`),
    await db.query(`select id, client_id, driver_employee, duration, ${utc("authorized_at", "authorized_at")},
                           ${utc("expires_at", "expires_at")}, authorized_by, authorized_role::text as authorized_role, scope_type
                      from authorizations where status = 'active' and expires_at > now() order by expires_at`)
  ];
  return { generatedAt: new Date().toISOString(), locations, drivers, vehicles, devices, approvers, authorizations };
}

export function buildMovementQuery(query = {}) {
  const where = [];
  const params = {};
  const requested = Number.parseInt(query.limit ?? PAGE_SIZE, 10);
  const limit = Math.min(Math.max(Number.isFinite(requested) ? requested : PAGE_SIZE, 1), MAX_PAGE_SIZE);

  const text = (value) => String(value ?? "").trim();

  if (text(query.vehicle)) {
    where.push("(m.vehicle_barcode ILIKE :vehicle OR m.vin ILIKE :vehicle OR m.plate ILIKE :vehicle)");
    params.vehicle = `%${escapeLike(text(query.vehicle))}%`;
  }
  if (text(query.driver)) {
    where.push("(m.driver_employee ILIKE :driver OR m.driver_name ILIKE :driver)");
    params.driver = `%${escapeLike(text(query.driver))}%`;
  }
  if (text(query.location)) {
    where.push("m.location = :location");
    params.location = text(query.location);
  }
  if (text(query.date)) {
    if (!isCalendarDate(text(query.date))) throw new RequestError("date must be a real date written YYYY-MM-DD.");
    // A gate day is a New York day, whatever time zone the database runs in.
    where.push(`(m.occurred_at AT TIME ZONE '${BUSINESS_TIMEZONE}')::date = CAST(:date AS date)`);
    params.date = text(query.date);
  }
  if (text(query.direction)) {
    const direction = text(query.direction).toUpperCase();
    if (!["IN", "OUT"].includes(direction)) throw new RequestError("direction must be IN or OUT.");
    where.push("m.direction = CAST(:direction AS movement_dir)");
    params.direction = direction;
  }

  const filters = where.slice();
  const filterParams = { ...params };

  if (text(query.before)) {
    const cursor = decodeCursor(text(query.before));
    where.push("(m.occurred_at, m.id) < (CAST(:beforeAt AS timestamptz), :beforeId)");
    params.beforeAt = cursor.at;
    params.beforeId = cursor.id;
  }

  const clause = (parts) => (parts.length ? `where ${parts.join(" and ")}` : "");
  const sql = `select m.id, m.client_id, m.direction::text as direction, m.driver_employee, m.driver_name, m.vehicle_barcode, m.vin, m.plate,
                      m.location, m.authorization_status, m.note, m.submitted_by,
                      m.driver_entry_method::text as driver_entry_method, m.vehicle_entry_method::text as vehicle_entry_method,
                      ${utc("m.occurred_at", "occurred_at")}, ${utc("m.received_at", "received_at")}, m.delayed, m.conflict,
                      m.uploaded_by
                 from movements m
                 ${clause(where)}
                order by m.occurred_at desc, m.id desc
                limit ${limit + 1}`;
  // The total is only worth counting for the first page; after that the client already has it.
  const countSql = text(query.before) ? null : `select count(*) as total from movements m ${clause(filters)}`;
  return { sql, params, limit, countSql, countParams: filterParams };
}

export async function movementPage(db, query) {
  const { sql, params, limit, countSql, countParams } = buildMovementQuery(query);
  const rows = await db.query(sql, params);
  const movements = rows.slice(0, limit);
  const last = movements[movements.length - 1];
  const result = { movements, next: rows.length > limit && last ? encodeCursor(last) : null };
  if (countSql) {
    const [count] = await db.query(countSql, countParams);
    result.total = Number(count?.total ?? movements.length);
  }
  return result;
}

export function encodeCursor(row) {
  return Buffer.from(JSON.stringify({ at: row.occurred_at, id: Number(row.id) })).toString("base64url");
}

// A forged or damaged cursor used to reach the database and fail there, answering 500. It is the
// caller's mistake, so it is refused here with a 400 before any query runs.
export function decodeCursor(value) {
  try {
    const cursor = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    const timeIsReal = typeof cursor.at === "string" && /^\d{4}-\d{2}-\d{2}T/.test(cursor.at) && !Number.isNaN(Date.parse(cursor.at));
    if (timeIsReal && Number.isInteger(cursor.id) && cursor.id > 0) return cursor;
  } catch { /* fall through */ }
  throw new RequestError("before is not a cursor this API issued.");
}

// "2026-02-30" has the right shape and used to reach the database, which refused it with a 500.
function isCalendarDate(value) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const [year, month, day] = match.slice(1).map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function escapeLike(value) {
  return value.replace(/[\\%_]/g, (char) => `\\${char}`);
}
