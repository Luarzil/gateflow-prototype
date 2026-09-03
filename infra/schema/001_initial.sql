-- GateFlow initial schema
-- CR-V08-AWS-DEV-ENV-001
--
-- This schema is the server-side system of record. The browser prototype's localStorage model
-- is a prototype convenience and is NOT a security boundary. Every rule that matters is
-- enforced here.

BEGIN;

CREATE TYPE inventory_status AS ENUM ('provisional', 'complete');
CREATE TYPE created_source   AS ENUM ('seed', 'migration', 'supervisor', 'inbound_scan');
CREATE TYPE movement_dir     AS ENUM ('IN', 'OUT');
CREATE TYPE entry_method     AS ENUM ('scanner_field', 'manual', 'legacy_unknown');
CREATE TYPE app_role         AS ENUM ('Scanner', 'Fleet Lead', 'Supervisor', 'Manager', 'Admin');

CREATE TABLE locations (
  id          bigserial PRIMARY KEY,
  name        text NOT NULL UNIQUE,
  active      boolean NOT NULL DEFAULT true
);

CREATE TABLE drivers (
  employee_number  text PRIMARY KEY,
  name             text NOT NULL,
  license_expires  date NOT NULL,
  active           boolean NOT NULL DEFAULT true,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

-- Application users are distinct from drivers. Patrick, 2026-08-12: drivers are operational
-- records, not login accounts, and the ability matrix never applies to them.
CREATE TABLE app_users (
  id          bigserial PRIMARY KEY,
  username    text NOT NULL UNIQUE,
  name        text NOT NULL,
  role        app_role NOT NULL,
  scope       text,
  active      boolean NOT NULL DEFAULT true,
  last_login  timestamptz,                      -- 081526 v7 edit #6
  suspended_at timestamptz,                     -- 081526 v7 edit #4
  deleted_at   timestamptz,                     -- soft delete; purge no earlier than +60 days
  purge_after  timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE vehicles (
  id                          bigserial PRIMARY KEY,
  assigned_barcode            text NOT NULL UNIQUE,
  vin                         text,
  plate                       text,
  make                        text,
  model                       text,
  year                        int,
  color                       text,
  active                      boolean NOT NULL DEFAULT true,
  -- CR-V08-BETA-CRITICAL-APP-001
  inventory_status            inventory_status NOT NULL DEFAULT 'complete',
  created_source              created_source   NOT NULL DEFAULT 'supervisor',
  needs_supervisor_completion boolean NOT NULL DEFAULT false,
  provisional_from_movement   bigint,
  provisional_at              timestamptz,
  completed_by                text,
  completed_at                timestamptz,
  created_at                  timestamptz NOT NULL DEFAULT now(),
  updated_at                  timestamptz NOT NULL DEFAULT now(),
  -- A complete record must actually be complete.
  CONSTRAINT complete_records_have_details CHECK (
    inventory_status = 'provisional'
    OR (vin IS NOT NULL AND make IS NOT NULL AND model IS NOT NULL AND color IS NOT NULL)
  )
);

CREATE INDEX vehicles_provisional_idx ON vehicles (inventory_status)
  WHERE inventory_status = 'provisional';

CREATE TABLE devices (
  id                text PRIMARY KEY,
  name              text NOT NULL,
  imei              text UNIQUE,
  type              text NOT NULL CHECK (type IN ('Fixed', 'Floater')),
  assigned_location text,
  status            text NOT NULL DEFAULT 'Active',
  active            boolean NOT NULL DEFAULT true
);

CREATE TABLE authorizations (
  id               bigserial PRIMARY KEY,
  driver_employee  text NOT NULL REFERENCES drivers(employee_number),
  duration         text NOT NULL,
  valid_from       timestamptz NOT NULL DEFAULT now(),
  expires_at       timestamptz NOT NULL,
  status           text NOT NULL DEFAULT 'active',
  authorized_by    text NOT NULL,
  authorized_role  app_role NOT NULL,
  revoked_by       text,
  revoked_at       timestamptz,
  created_at       timestamptz NOT NULL DEFAULT now(),
  -- CR-V08-BETA-CRITICAL-APP-002 (081526 v7 edit #10): only Fleet Lead and above may grant an
  -- override. Enforced in the database, not only in the UI.
  CONSTRAINT approver_rank CHECK (authorized_role <> 'Scanner')
);

CREATE INDEX authorizations_active_idx ON authorizations (driver_employee, status, expires_at);

CREATE TABLE movements (
  id                    bigserial PRIMARY KEY,
  direction             movement_dir NOT NULL,
  driver_employee       text NOT NULL REFERENCES drivers(employee_number),
  vehicle_id            bigint NOT NULL REFERENCES vehicles(id),
  location              text NOT NULL,
  authorization_status  text NOT NULL,
  note                  text,
  submitted_by          text NOT NULL,
  device_id             text REFERENCES devices(id),
  driver_entry_method   entry_method NOT NULL,
  vehicle_entry_method  entry_method NOT NULL,
  occurred_at           timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX movements_occurred_idx ON movements (occurred_at DESC);
CREATE INDEX movements_vehicle_idx  ON movements (vehicle_id);
CREATE INDEX movements_driver_idx   ON movements (driver_employee);
CREATE INDEX movements_location_idx ON movements (location);

ALTER TABLE vehicles
  ADD CONSTRAINT vehicles_provisional_movement_fk
  FOREIGN KEY (provisional_from_movement) REFERENCES movements(id);

CREATE TABLE audit_events (
  id           bigserial PRIMARY KEY,
  type         text NOT NULL,
  description  text NOT NULL,
  actor        text NOT NULL,
  location     text,
  occurred_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX audit_events_occurred_idx ON audit_events (occurred_at DESC);
CREATE INDEX audit_events_type_idx     ON audit_events (type);

-- ---------------------------------------------------------------------------
-- THE RULE: Allowed IN != Authorized OUT
--
-- Patrick Amaral, 2026-09-01. A vehicle auto-created by an inbound scan must never be
-- released on OUT until a supervisor completes its record. In the browser prototype this is
-- a UI gate; here it is a database constraint that no application bug can bypass.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION enforce_out_requires_complete_vehicle()
RETURNS trigger AS $$
DECLARE
  v_status inventory_status;
  v_barcode text;
BEGIN
  IF NEW.direction = 'OUT' THEN
    SELECT inventory_status, assigned_barcode
      INTO v_status, v_barcode
      FROM vehicles WHERE id = NEW.vehicle_id;

    IF v_status = 'provisional' THEN
      RAISE EXCEPTION
        'Vehicle OUT blocked: vehicle % has an incomplete inventory record and must be completed by a supervisor first (CR-V08-BETA-CRITICAL-APP-001)',
        v_barcode
        USING ERRCODE = 'check_violation';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER movements_out_requires_complete_vehicle
  BEFORE INSERT OR UPDATE ON movements
  FOR EACH ROW EXECUTE FUNCTION enforce_out_requires_complete_vehicle();

COMMIT;
