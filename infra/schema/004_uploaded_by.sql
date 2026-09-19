-- Who uploaded a movement.
-- CR-V17-AWS-CONNECT-001, found in the review after step 4.
--
-- submitted_by is the scanner station that recorded the movement at the gate. It says nothing about
-- whose sign-in carried it into the shared records, and for a log that may be printed for a
-- termination or a criminal matter, that is the other half of "who". The API fills this from the
-- Cognito sign-in, never from anything the device claims.
--
-- Additive. The append-only guard from 003 compares whole rows, so a new column changes nothing
-- about what may be edited: this one is written once, at insert, like every other column.

BEGIN;

ALTER TABLE movements ADD COLUMN IF NOT EXISTS uploaded_by text;

COMMENT ON COLUMN movements.uploaded_by IS
  'Cognito username whose sign-in uploaded this movement. Set by the API from the token, never by the device.';

COMMIT;
