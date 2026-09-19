-- The history each device writes, shared.
-- CR-V17-AWS-CONNECT-001, 2026-09-19.
--
-- Until now the only history the shared records held was one line per movement and per change. A
-- blocked OUT, an approval denied to a badge below Fleet Lead, a typed barcode, a printed search:
-- all of it lived on the one device that saw it. That is evidence Patrick expects to be able to
-- print, and it was also the part of a phone's storage that could never be cleared. Devices now
-- send every entry they write.
--
-- Additive. audit_events stays append-only (003), and client_id already makes a resend harmless.

BEGIN;

ALTER TABLE audit_events ADD COLUMN IF NOT EXISTS uploaded_by text;

COMMENT ON COLUMN audit_events.uploaded_by IS
  'Cognito username whose sign-in sent this entry from a device. Set by the API from the token. Empty for entries the server wrote itself.';

COMMIT;
