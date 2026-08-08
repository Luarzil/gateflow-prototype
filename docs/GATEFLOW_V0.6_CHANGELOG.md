# GateFlow V0.6 Changelog

## Added

- Supervisor primary navigation with Drivers and Vehicles sub-sections.
- Driver creation, editing, activation changes, authorization revocation, and internal history events.
- Detailed license-expiration list ordered by actual expiration date.
- Vehicle inventory profiles with make, model, year, color, VIN, plate, assigned barcode, and soft removal/restoration.
- Exact barcode scanner lookup with inactive and unknown vehicle blocking.
- Transaction snapshots for vehicle ID, assigned barcode, VIN, and plate.
- Search by barcode, VIN, or plate.
- V0.5 to V0.6 localStorage migration with deterministic demo vehicle barcodes.
- V0.6 service-worker cache name and network-first app-shell freshness.

## Preserved

- Approved active locations and historical-only Elizabeth Repair Facility.
- Shared station identity without individual guard login.
- Authorized OUT, Supervisor temporary override, unauthorized IN review, license blocking, authorization durations, global scope, and customer-facing Audit removal.

## Not added

- Real authentication, shared backend, printer communication, barcode generation, Samsung/Verizon integration, native Android, photo capture, and automatic retention deletion.
