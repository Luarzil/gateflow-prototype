-- Veri-Gate migration 003 — a place for everything the application records
-- CR-V17-AWS-CONNECT-001
--
-- 001 and 002 describe the rules. The application, meanwhile, has been recording things the
-- database had no column for: the location override switches (CR-V16), the typed-barcode review
-- flag (CR-V15), device details, feedback, approver badges, and the snapshot of who and what was
-- at the gate when a movement happened. Without these, connecting the app would lose data.
--
-- It also adds what offline scanners need: a client-generated id on every movement, so an upload
-- that is retried after a dropped signal is recognised rather than recorded twice, and the time
-- the server received it, so a late upload is visibly Delayed.
--
-- Everything here is additive. No existing column is dropped or renamed.

BEGIN;

-- Locations ------------------------------------------------------------------------------------

ALTER TABLE locations ADD COLUMN IF NOT EXISTS historical_only boolean NOT NULL DEFAULT false;
-- CR-V16: Patrick 2026-09-13, one scanned-badge override switch per location, off by default.
ALTER TABLE locations ADD COLUMN IF NOT EXISTS scan_override_enabled boolean NOT NULL DEFAULT false;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS scan_override_changed_by text;
ALTER TABLE locations ADD COLUMN IF NOT EXISTS scan_override_changed_at timestamptz;

-- Drivers --------------------------------------------------------------------------------------

ALTER TABLE drivers ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE drivers ADD COLUMN IF NOT EXISTS updated_by text;

-- Approvers ------------------------------------------------------------------------------------
--
-- The IDs scanned on the blocked-OUT screen (S1001 and so on). They are badges, not logins: a
-- Fleet Lead approving at the gate does not sign in to anything. The rank rule itself stays where
-- 001 put it, on authorizations.approver_rank.

CREATE TABLE IF NOT EXISTS approvers (
  badge_id    text PRIMARY KEY,
  name        text NOT NULL,
  role        app_role NOT NULL,
  active      boolean NOT NULL DEFAULT true,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

-- Application users ----------------------------------------------------------------------------

-- The prototype's own user number (U0001), kept so existing records still line up.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS user_code text UNIQUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS abilities jsonb NOT NULL DEFAULT '{}'::jsonb;
-- Links the row to its Cognito sign-in once one exists. Passwords never live in this database.
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS cognito_sub text UNIQUE;
ALTER TABLE app_users ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Vehicles -------------------------------------------------------------------------------------

-- CR-V15: a hand-typed barcode that was not in inventory, waiting for a supervisor to confirm it.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS barcode_needs_review boolean NOT NULL DEFAULT false;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS updated_by text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS removed_at timestamptz;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS removed_by text;
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS reactivated_at timestamptz;

-- Devices --------------------------------------------------------------------------------------

ALTER TABLE devices ADD COLUMN IF NOT EXISTS phone text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS notes text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_used_at timestamptz;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS last_transaction_location text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE devices ADD COLUMN IF NOT EXISTS created_by text;
ALTER TABLE devices ADD COLUMN IF NOT EXISTS updated_by text;
-- The handheld's own sign-in, if scanners sign in as devices (a decision still open with Patrick).
ALTER TABLE devices ADD COLUMN IF NOT EXISTS cognito_username text UNIQUE;

-- Authorizations -------------------------------------------------------------------------------

-- A Fleet Lead can approve at a gate with no signal, so the phone creates the authorization and
-- names it. The same id arriving twice is the same authorization.
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS client_id text UNIQUE;
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS authorized_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS revocation_reason text;
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS action_location text;
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS location text;
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS scope_type text NOT NULL DEFAULT 'all_current_locations';
ALTER TABLE authorizations ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

ALTER TABLE authorizations DROP CONSTRAINT IF EXISTS authorizations_status_known;
ALTER TABLE authorizations ADD CONSTRAINT authorizations_status_known
  CHECK (status IN ('active', 'revoked', 'replaced', 'expired'));

-- Movements ------------------------------------------------------------------------------------

ALTER TABLE movements ADD COLUMN IF NOT EXISTS client_id text UNIQUE;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS received_at timestamptz NOT NULL DEFAULT now();
ALTER TABLE movements ADD COLUMN IF NOT EXISTS delayed boolean NOT NULL DEFAULT false;

-- Set when an upload from an offline scanner disagrees with what the server knew by then, for
-- example a driver revoked while the phone had no signal. The movement is still recorded, because
-- the vehicle really left; a supervisor clears the flag.
ALTER TABLE movements ADD COLUMN IF NOT EXISTS conflict text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS conflict_reviewed_by text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS conflict_reviewed_at timestamptz;

-- What was true at the gate. A driver renamed or a vehicle re-plated later must not rewrite the
-- log, so the movement keeps its own copy.
ALTER TABLE movements ADD COLUMN IF NOT EXISTS driver_name text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS vehicle_barcode text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS vin text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS plate text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS device_name text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS device_type text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS device_imei text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS device_assigned_location text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS working_location text;
ALTER TABLE movements ADD COLUMN IF NOT EXISTS location_confirmed boolean;

-- CR-V16 added "Location override". Anything else is a bug in whoever wrote it.
ALTER TABLE movements DROP CONSTRAINT IF EXISTS movements_authorization_status_known;
ALTER TABLE movements ADD CONSTRAINT movements_authorization_status_known
  CHECK (authorization_status IN ('Authorized', 'Unauthorized', 'Location override'));

-- Search pages 50 at a time, newest first (CR-V16). Paging by (occurred_at, id) stays fast however
-- long the log gets, where an offset would read every skipped row.
CREATE INDEX IF NOT EXISTS movements_page_idx ON movements (occurred_at DESC, id DESC);

-- Feedback -------------------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS feedback (
  id          bigserial PRIMARY KEY,
  client_id   text UNIQUE,
  surface     text NOT NULL CHECK (surface IN ('scanner', 'supervisor')),
  name        text,
  note        text NOT NULL,
  details     text,
  context     jsonb NOT NULL DEFAULT '{}'::jsonb,
  device_id   text REFERENCES devices(id),
  location    text,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- Audit events ---------------------------------------------------------------------------------

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user action';
ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS client_id text UNIQUE;

-- The log is evidence. Patrick expects search printouts to back a termination or a criminal
-- matter, which only holds if nothing in the log can be quietly changed. Audit events can be
-- added and never edited or removed; movements can never be removed, and the only thing that can
-- change on one is a supervisor clearing its conflict flag.

CREATE OR REPLACE FUNCTION forbid_audit_change() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS audit_events_append_only ON audit_events;
CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW EXECUTE FUNCTION forbid_audit_change();

CREATE OR REPLACE FUNCTION guard_movement_change() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RAISE EXCEPTION 'movements cannot be deleted' USING ERRCODE = 'insufficient_privilege';
  END IF;
  IF (to_jsonb(NEW) - 'conflict_reviewed_by' - 'conflict_reviewed_at')
     IS DISTINCT FROM (to_jsonb(OLD) - 'conflict_reviewed_by' - 'conflict_reviewed_at') THEN
    RAISE EXCEPTION 'movements are append-only; only the conflict review can be recorded'
      USING ERRCODE = 'insufficient_privilege';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS movements_append_only ON movements;
CREATE TRIGGER movements_append_only
  BEFORE UPDATE OR DELETE ON movements
  FOR EACH ROW EXECUTE FUNCTION guard_movement_change();

COMMIT;
