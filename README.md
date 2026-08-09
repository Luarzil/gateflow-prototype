# Lot Watch / GateFlow V0.7 Call Updates

Static HTML, CSS, and JavaScript PWA prototype for gate operations. This update keeps the scanner focused on recording an IN or OUT movement and moves device selection to Supervisor controls.

## Run locally

Open `index.html` for a quick review, or serve the repository for service-worker and offline behavior:

```powershell
python -m http.server 8800 --bind 127.0.0.1
```

Open `http://127.0.0.1:8800/`.

## V0.7 workflow

1. Work at one configured gate: Division Street, North Ave, EWR North, or Linden.
2. Scan or enter Driver Employee #, such as `E1003`.
3. Scan the assigned Vehicle Barcode, such as `G0001`.
4. GateFlow resolves the active vehicle profile.
5. Select IN or OUT and submit.

OUT still requires active driver authorization and an unexpired license. Unauthorized OUT remains blocked for Supervisor temporary authorization. Unauthorized IN remains allowed and is flagged for operational review. Inactive inventory vehicles are blocked from new IN and OUT movements.

## Supervisor

The Supervisor view contains Drivers, Vehicles, Devices, and Users sub-sections:

- Drivers: create, edit, mark inactive/reactivate, bulk-authorize, revoke authorizations, and review license urgency.
- Vehicles: create, edit, remove from inventory, restore to inventory, filter status, and search barcode/VIN/plate/make/model/year/color.
- Devices: manage the simulated current scanner outside the scanning workflow.
- Users: maintain prototype desktop-user roles. Drivers are operational records, not application accounts.

Vehicle removal is a soft deactivation. Historical records and assigned barcode values remain searchable; a removed barcode cannot be reused.

## Data and migration

V0.7 stores prototype data in `lot-watch.gateflow.v0.7.state`. It preserves V0.6, V0.5, and V0.4 keys and migrates a valid V0.6 state without deleting or overwriting that source key. The migration converts legacy employee and vehicle codes to `E####` and `G####`, respectively, and removes the invalid yard from active data.

The configured locations are Division Street, North Ave, EWR North, and Linden.

## Device control

Supervisor > Devices manages simulated Fixed and Floater devices. A Fixed device supplies and locks its assigned location. A Floater must select and confirm an active location before scanning; changing that location requires confirmation and resets an unfinished scan.

## Feedback

The scanner and Supervisor views provide a compact feedback form. Scanner feedback records the current location and scanner screen; desktop feedback records the current Supervisor context. In this prototype, feedback remains local browser data.

## Validation

Run the V0.7 call-update release gate with the bundled Node runtime:

```powershell
node --test tests\v07-84-regression.test.js
node tests\v07-presentation.browser.test.js
```

The first command contains exactly 84 named V0.7 checks. The browser check drives the scanner through phone-size viewports, invalid-to-valid barcode recovery, legacy supervisor-ID migration, temporary approval, and advancement to the OUT review screen.

`gateflow-validator/` is retained as a historical V0.6 harness and is not release evidence for these call updates.

## Patrick review packet

- `Lot-Watch-GateFlow-V0.7-Operator-Manual.md`: Patrick-facing operator manual.
- `docs/GATEFLOW_V0.7_RELEASE_PACKET.md`: scope, changes, validation evidence, and rollback.
- `docs/GATEFLOW_V0.7_CLIENT_EMAIL_DRAFT.md`: draft client email for approval before sending.
- `docs/media/gateflow-v07-demo.html`: full walkthrough page with video, narration audio, and captured scanner/Supervisor/Search frames.
- `docs/media/gateflow-v07-demo.webm`: browser-recorded 19-step walkthrough video.
- `docs/media/gateflow-v07-demo-audio.wav`: female narration audio generated with Microsoft Zira.

## Prototype boundaries

This is not production software. It has no shared database, real authentication, secure server-side role enforcement, printer integration, barcode-image generation, native Android app, or real device integration. The next AWS step is a read-only account and resource inventory; no cloud changes are included here.
