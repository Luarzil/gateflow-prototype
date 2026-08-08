# Lot Watch / GateFlow V0.7 Scanner and Device Control Review

Static HTML, CSS, and JavaScript PWA prototype for Zebra TC-series style gate operations. V0.7 preserves the V0.6 gate rules while adding numeric employee-number input, manual barcode entry, compact next-scan confirmation, driver profiles, and a Device Control Center.

## Run locally

Open `index.html` for a quick review, or serve the repository for service-worker and offline behavior:

```powershell
python -m http.server 8800 --bind 127.0.0.1
```

Open `http://127.0.0.1:8800/`.

## V0.7 workflow

1. Choose one Working Location: Division Street, North Ave, EWR, or Linden.
2. Scan or enter Driver Employee #.
3. Scan the assigned Vehicle Barcode, such as `GFV-0001`.
4. GateFlow resolves the active vehicle profile and shows its barcode, year, make, model, color, VIN, and plate.
5. Select IN or OUT and submit.

OUT still requires active driver authorization and an unexpired license. Unauthorized OUT remains blocked for Supervisor temporary authorization. Unauthorized IN remains allowed and is flagged for operational review. Inactive inventory vehicles are blocked from new IN and OUT movements.

## Supervisor

The Supervisor view contains Drivers and Vehicles sub-sections:

- Drivers: create, edit, mark inactive/reactivate, bulk-authorize, revoke authorizations, and review license urgency.
- Vehicles: create, edit, remove from inventory, restore to inventory, filter status, and search barcode/VIN/plate/make/model/year/color.

Vehicle removal is a soft deactivation. Historical records and assigned barcode values remain searchable; a removed barcode cannot be reused.

## Data and migration

V0.7 stores data in `lot-watch.gateflow.v0.7.state`. It preserves V0.6, V0.5, and V0.4 keys and migrates a valid V0.6 state without deleting or overwriting that source key. Migration adds the five deterministic prototype devices and preserves historical movement records.

`Elizabeth Repair Facility` remains historical-only: it is searchable but cannot be selected for a new scan.

## Device control

Supervisor > Devices manages simulated Fixed and Floater devices. A Fixed device supplies and locks its assigned location. A Floater must select and confirm an active location before scanning; changing that location requires confirmation and resets an unfinished scan. New movements store device metadata and whether each value came through the scanner field or the explicit manual-entry workflow. This entry-path metadata does not verify scanner hardware.

## Validation

Open `gateflow-validator/` through the same local HTTP server and select **Run full validation**. The V0.7 stabilization suite drives 84 distinct UI scenarios, including every retained V0.6 regression, and restores the pre-run browser data when complete.

The in-house `gateflow-validator/` runs UI regression checks. Serve the repository, then open `http://127.0.0.1:8800/gateflow-validator/`. It restores the browser's prior local state after each full run.

## Prototype boundaries

This is not production software. It has no shared database, real authentication, secure server-side role enforcement, printer integration, barcode-image generation, Samsung/Verizon integration, native Android app, or real Zebra device integration. Future production may use DataWedge, Android Intents, Enterprise Browser or native Android, customer-owned hosting, and offline synchronization.
