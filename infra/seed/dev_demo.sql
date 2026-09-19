-- Demo records for a development database, and only a development database.
--
-- These are the same drivers, vehicles, devices and movements the browser app has always seeded
-- into localStorage, so the console shows Patrick the records he already recognises once it starts
-- reading from the shared database. Production gets real records imported from the beta phones
-- instead (CR-V17 step 6), never this file.
--
-- Safe to run twice: every insert is guarded, so nothing is duplicated and nothing is overwritten.

INSERT INTO locations (name, active) VALUES
  ('Division Street', true),
  ('North Ave', true),
  ('EWR North', true),
  ('Linden', true)
ON CONFLICT (name) DO NOTHING;

-- License dates are relative to the day the seed runs, so the expiry warnings stay meaningful:
-- E1003 falls inside 5 days, E1004 inside 15, E1002 inside 30, and E1005 has already expired.
INSERT INTO drivers (employee_number, name, license_expires, active, created_by) VALUES
  ('E1001', 'Nina Patel',    (current_date + 84),  true,  'System seed'),
  ('E1002', 'Marcus Reed',   (current_date + 30),  true,  'System seed'),
  ('E1003', 'Tyrone Brooks', (current_date + 4),   true,  'System seed'),
  ('E1004', 'Maria Torres',  (current_date + 14),  true,  'System seed'),
  ('E1005', 'Phil Grant',    (current_date - 3),   true,  'System seed'),
  ('E1006', 'Angela Cruz',   (current_date + 180), false, 'System seed')
ON CONFLICT (employee_number) DO NOTHING;

INSERT INTO vehicles (assigned_barcode, vin, plate, make, model, year, color, active, created_source, created_by) VALUES
  ('G0001', '1HGCM82633A004352', 'TRK-8877',  'Ford',    'Transit', 2022, 'White',  true, 'seed', 'System seed'),
  ('G0002', '2T1BURHE5JC034789', 'NJK-2214',  'Toyota',  'Camry',   2021, 'Silver', true, 'seed', 'System seed'),
  ('G0003', '3FA6P0H75HR123456', 'YARD-104',  'Ford',    'Fusion',  2019, 'Blue',   true, 'seed', 'System seed'),
  ('G0004', '5NPE24AF8FH001234', 'EWR-5521',  'Hyundai', 'Sonata',  2020, 'Gray',   true, 'seed', 'System seed'),
  ('G0005', '1FTFW1EF1EFA00001', 'LIND-7710', 'Ford',    'F-150',   2023, 'Black',  true, 'seed', 'System seed')
ON CONFLICT (assigned_barcode) DO NOTHING;

INSERT INTO devices (id, name, imei, type, assigned_location, status, active, created_by) VALUES
  ('D0001', 'Division Gate Scanner',  '000000000000001', 'Fixed',   'Division Street', 'Active', true, 'System seed'),
  ('D0002', 'North Ave Gate Scanner', '000000000000002', 'Fixed',   'North Ave',       'Active', true, 'System seed'),
  ('D0003', 'EWR North Gate Scanner', '000000000000003', 'Fixed',   'EWR North',       'Active', true, 'System seed'),
  ('D0004', 'Linden Gate Scanner',    '000000000000004', 'Fixed',   'Linden',          'Active', true, 'System seed'),
  ('D0005', 'Floater Gate Scanner',   '000000000000005', 'Floater', NULL,              'Active', true, 'System seed')
ON CONFLICT (id) DO NOTHING;

-- Casey Rowe is deliberately a Scanner, below the override threshold, so the refusal stays
-- testable during the beta.
INSERT INTO approvers (badge_id, name, role, active) VALUES
  ('S1001', 'Morgan Lee',   'Supervisor', true),
  ('S2040', 'Jordan Wells', 'Fleet Lead', true),
  ('S3090', 'Casey Rowe',   'Scanner',    true)
ON CONFLICT (badge_id) DO NOTHING;

-- Three drivers authorized for nine hours from now. E1003 and E1005 are left unauthorized on
-- purpose: they are the pair Patrick's "2 active drivers are not authorized today" line counts.
INSERT INTO authorizations (client_id, driver_employee, duration, valid_from, expires_at, status,
                            authorized_by, authorized_role, location, action_location, scope_type)
SELECT seed.client_id, seed.driver_employee, seed.duration, now(), now() + interval '9 hours', 'active',
       'System seed', 'Supervisor'::app_role, seed.location, seed.location, 'all_current_locations'
FROM (VALUES
  ('seed-auth-001', 'E1001', '9_hours', 'Division Street'),
  ('seed-auth-002', 'E1002', '9_hours', 'North Ave'),
  ('seed-auth-003', 'E1004', '9_hours', 'Linden')
) AS seed (client_id, driver_employee, duration, location)
WHERE NOT EXISTS (SELECT 1 FROM authorizations a WHERE a.client_id = seed.client_id);

-- The three movements the gate log has always opened with. Each carries the driver, vehicle and
-- device as they were at the gate, which is what a printed record relies on.
INSERT INTO movements (client_id, direction, driver_employee, driver_name, vehicle_id, vehicle_barcode, vin, plate,
                       location, working_location, authorization_status, note, submitted_by, device_id, device_name,
                       device_type, device_assigned_location, driver_entry_method, vehicle_entry_method, occurred_at)
SELECT seed.client_id, seed.direction::movement_dir, seed.driver_employee, seed.driver_name,
       (SELECT v.id FROM vehicles v WHERE v.assigned_barcode = seed.vehicle_barcode),
       seed.vehicle_barcode, seed.vin, seed.plate, seed.location, seed.location,
       seed.authorization_status, seed.note, seed.submitted_by, seed.device_id, seed.device_name,
       'Fixed', seed.location, 'legacy_unknown'::entry_method, 'legacy_unknown'::entry_method,
       now() - (seed.minutes_ago || ' minutes')::interval
FROM (VALUES
  ('seed-tx-001', 'OUT', 'E1001', 'Nina Patel',    'G0001', '1HGCM82633A004352', 'TRK-8877', 'Division Street', 'Authorized',   'Customer delivery',                   'Division Street Scanner', 'D0001', 'Division Gate Scanner',  '16'),
  ('seed-tx-002', 'IN',  'E1003', 'Tyrone Brooks', 'G0003', '3FA6P0H75HR123456', 'YARD-104', 'EWR North',       'Unauthorized', 'Unauthorized IN - operational review', 'EWR North Scanner',       'D0003', 'EWR North Gate Scanner', '41'),
  ('seed-tx-003', 'OUT', 'E1004', 'Maria Torres',  'G0004', '5NPE24AF8FH001234', 'EWR-5521', 'Linden',          'Authorized',   NULL,                                  'Linden Scanner',          'D0004', 'Linden Gate Scanner',    '68')
) AS seed (client_id, direction, driver_employee, driver_name, vehicle_barcode, vin, plate, location,
           authorization_status, note, submitted_by, device_id, device_name, minutes_ago)
WHERE NOT EXISTS (SELECT 1 FROM movements m WHERE m.client_id = seed.client_id);

-- The audit trail cannot be edited or deleted, only added to, so these go in once.
INSERT INTO audit_events (type, description, actor, location, occurred_at)
SELECT seed.type, seed.description, seed.actor, seed.location,
       now() - (seed.minutes_ago || ' minutes')::interval
FROM (VALUES
  ('out_transaction',        'Vehicle OUT recorded for E1001 / TRK-8877.',    'Division Street Scanner', 'Division Street', '16'),
  ('in_transaction',         'Vehicle IN recorded for E1003 / YARD-104.',     'EWR North Scanner',       'EWR North',       '41'),
  ('unauthorized_in_review', 'Unauthorized IN - operational review.',         'EWR North Scanner',       'EWR North',       '41'),
  ('out_transaction',        'Vehicle OUT recorded for E1004 / EWR-5521.',    'Linden Scanner',          'Linden',          '68'),
  ('driver_authorized',      'Driver E1001 authorized for 9 Hours.',          'System seed',             'Division Street', '130')
) AS seed (type, description, actor, location, minutes_ago)
WHERE NOT EXISTS (SELECT 1 FROM audit_events e WHERE e.actor = 'System seed' AND e.type = 'driver_authorized');
