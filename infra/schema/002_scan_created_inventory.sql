-- Veri-Gate migration 002 — unknown vehicles are logged, not gated
-- CR-V11-PATRICK-FEEDBACK-001
--
-- Patrick, 2026-09-06: "If a vehicle comes to the gate and is not known to our inventory, that
-- vehicle should be let in like any other vehicle... Regarding their exit, it should be handled
-- just like any other vehicle... The whole purpose is to create a log."
--
-- 001 built the opposite: a provisional state, and a trigger refusing OUT until a supervisor
-- completed the record. The application no longer works that way, so this brings the database
-- back in line before anything is ever connected to it.
--
-- Three things in 001 would break the current application outright:
--
--   1. The trigger would refuse every OUT for a scan-created vehicle.
--   2. The complete_records_have_details CHECK would refuse the INSERT itself, because a
--      scan-created vehicle is 'complete' but has no VIN, make, model or colour. This is the
--      more dangerous of the two: it fails at creation, not at exit.
--   3. app_role still carries 'Manager', which the application no longer issues.
--
-- What is kept is provenance. created_source still records that a vehicle arrived at the gate
-- rather than being entered by a person. It gates nothing; it is the log.

BEGIN;

-- 1 — the OUT gate goes -------------------------------------------------------

DROP TRIGGER IF EXISTS movements_out_requires_complete_vehicle ON movements;
DROP FUNCTION IF EXISTS enforce_out_requires_complete_vehicle();

-- 2 — a vehicle no longer has to be "complete" to exist ----------------------
--
-- A vehicle added by a gate scan legitimately has no VIN, make, model or colour until somebody
-- fills them in. That is expected, not an error.

ALTER TABLE vehicles DROP CONSTRAINT IF EXISTS complete_records_have_details;

DROP INDEX IF EXISTS vehicles_provisional_idx;

ALTER TABLE vehicles DROP COLUMN IF EXISTS inventory_status;
ALTER TABLE vehicles DROP COLUMN IF EXISTS needs_supervisor_completion;
ALTER TABLE vehicles DROP COLUMN IF EXISTS completed_by;
ALTER TABLE vehicles DROP COLUMN IF EXISTS completed_at;

DROP TYPE IF EXISTS inventory_status;

-- 3 — the remaining fields describe origin, not incompleteness ---------------

ALTER TABLE vehicles RENAME COLUMN provisional_from_movement TO added_from_movement;
ALTER TABLE vehicles RENAME COLUMN provisional_at TO added_at;

ALTER TABLE vehicles RENAME CONSTRAINT vehicles_provisional_movement_fk
  TO vehicles_added_from_movement_fk;

-- The log Patrick asked for: which vehicles turned up on their own.
CREATE INDEX IF NOT EXISTS vehicles_added_by_scan_idx ON vehicles (created_source)
  WHERE created_source = 'inbound_scan';

COMMENT ON COLUMN vehicles.created_source IS
  'How this vehicle entered inventory. inbound_scan means it was added automatically when it was '
  'scanned at a gate rather than entered by a person. This is provenance for the log and never '
  'gates a movement.';

-- 4 — one Admin, not Manager and Admin ---------------------------------------
--
-- Patrick, 2026-09-06: "we issue 1 admin and they create and give the users out with authority."
-- PostgreSQL cannot remove an enum value in place, so the type is rebuilt and existing Managers
-- are promoted to Admin, matching what the application does on load.

ALTER TABLE authorizations DROP CONSTRAINT IF EXISTS approver_rank;

ALTER TYPE app_role RENAME TO app_role_v1;

CREATE TYPE app_role AS ENUM ('Scanner', 'Fleet Lead', 'Supervisor', 'Admin');

ALTER TABLE app_users
  ALTER COLUMN role TYPE app_role
  USING (CASE WHEN role::text = 'Manager' THEN 'Admin' ELSE role::text END)::app_role;

ALTER TABLE authorizations
  ALTER COLUMN authorized_role TYPE app_role
  USING (CASE WHEN authorized_role::text = 'Manager' THEN 'Admin' ELSE authorized_role::text END)::app_role;

DROP TYPE app_role_v1;

-- The Fleet Lead rule is untouched by any of this. An override still cannot be granted by
-- someone holding Scanner, and it is still enforced here rather than only in the interface.
ALTER TABLE authorizations
  ADD CONSTRAINT approver_rank CHECK (authorized_role <> 'Scanner');

COMMIT;
