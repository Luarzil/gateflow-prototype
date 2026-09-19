-- Drivers, vehicles, authorizations and the override switches, shared between devices.
-- CR-V17-AWS-CONNECT-001, the gap the review after step 4 put first.
--
-- Until now only movements reached the shared records. A driver added on the console was unknown
-- to the server, so every movement for that driver was refused; an authorization a Fleet Lead gave
-- at the gate was unknown too, so the movement it allowed was flagged. Each device now sends every
-- change it makes to these records, and takes in everybody else's.
--
-- Additive. Nothing is dropped or renamed.

BEGIN;

-- A vehicle made on a device keeps the id the device gave it, so its later edits find the same row
-- even after its barcode is changed. Vehicles the server made itself (from a gate scan) have none.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS client_id text UNIQUE;

-- Every change a device sent, exactly as it arrived. The same change sent twice (a dropped signal,
-- a retry) is recognised by its client_id and applied once. It is also the record of who changed
-- what and when, so like the audit trail it can be added to and never edited or removed.
CREATE TABLE IF NOT EXISTS reference_changes (
  id           bigserial PRIMARY KEY,
  client_id    text NOT NULL UNIQUE,
  kind         text NOT NULL CHECK (kind IN ('driver', 'vehicle', 'authorization', 'location')),
  record_key   text NOT NULL,
  data         jsonb NOT NULL,
  -- applied: the record now reads as sent. superseded: a later change had already arrived, so this
  -- one is kept here but did not overwrite it.
  outcome      text NOT NULL CHECK (outcome IN ('applied', 'superseded')),
  occurred_at  timestamptz NOT NULL,
  received_at  timestamptz NOT NULL DEFAULT now(),
  uploaded_by  text
);

CREATE INDEX IF NOT EXISTS reference_changes_record_idx ON reference_changes (kind, record_key, occurred_at DESC);

CREATE OR REPLACE FUNCTION forbid_reference_change_edit() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'reference_changes is append-only: % is not allowed', TG_OP
    USING ERRCODE = 'insufficient_privilege';
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS reference_changes_append_only ON reference_changes;
CREATE TRIGGER reference_changes_append_only
  BEFORE UPDATE OR DELETE ON reference_changes
  FOR EACH ROW EXECUTE FUNCTION forbid_reference_change_edit();

-- When a record last changed, by the clock of the device that changed it. A phone that was offline
-- all day must not overwrite a console edit made after its own, so each record remembers the time
-- of the edit it holds and an older one is set aside as superseded.
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS changed_at timestamptz;
ALTER TABLE drivers  ADD COLUMN IF NOT EXISTS changed_at timestamptz;

COMMIT;
