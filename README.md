# Lot Watch / GateFlow V0.2

Static HTML/CSS/JS prototype for enterprise-style vehicle gate tracking on a Zebra TC-series Android handheld or a desktop browser. It opens directly to the GateFlow scanner workflow and needs no backend or Zebra hardware for this version.

## V0.2 Workflow

The scanner captures the confirmed gate fields in one fast flow:

1. Location
2. Driver employee number
3. Vehicle VIN
4. Vehicle IN or OUT
5. Optional note
6. Submit transaction

Vehicle OUT requires a driver to be authorized for the current day. A blocked OUT transaction can be approved by a valid supervisor ID, which authorizes that driver for today and writes both authorization and supervisor-approval audit events. Vehicle IN always records the movement; unauthorized IN activity is flagged in the audit view.

The built-in demo data includes the seeded locations, drivers, VINs/plates, supervisors, daily authorizations, transactions, and audit history. All prototype data is stored in browser `localStorage`. Use `Reset demo` to restore the seed data.

## Run It

Open `index.html` in a browser for the desktop prototype. When served over HTTP(S), the included `manifest.webmanifest` and `service-worker.js` allow an installable, offline-friendly static demo.

The scanner fields accept normal typing and the `Sim scan` / demo buttons. This mirrors how a keyboard-wedge scanner can fill the focused field without requiring real device hardware.

## Changes From V0.1

- Simplified the scanner around driver employee number and vehicle VIN.
- Added a location selector that is saved with every transaction.
- Improved daily authorization and supervisor override behavior.
- Expanded manager search for VIN, partial VIN, plate, driver, location, date, and IN/OUT.
- Rebuilt recent activity and audit history around the simplified movement model.
- Removed the photo requirement. Photo capture is intentionally excluded from V0.2 because the client confirmed it is not needed at this stage.

## Zebra Device Notes

V0.2 uses ordinary browser inputs by design. A Zebra DataWedge profile can later send scans through keyboard wedge behavior into the focused employee number, VIN, or supervisor field. A production implementation could also use Android Intents, Zebra Enterprise Browser, or a native Android application. None of those integrations are required for this prototype.

## Future Production Architecture

The prototype intentionally has no real backend yet. Possible production placeholders include:

- AWS Cognito for authentication.
- API Gateway and Lambda, or an Amplify backend, for application APIs.
- DynamoDB or RDS/Postgres for driver, vehicle, transaction, and audit records.
- S3 only if approved file storage is ever needed.
- Customer-owned or customer-approved data hosting and retention.
- Role-based permissions for guards, supervisors, managers, and administrators.
- Offline sync for small scanner transaction packets.
- Device management for managed Zebra handhelds.
- Export and reporting workflows for managers.

Fleet remains the current provider and future integration decisions should follow the client-provided Fleet access and screenshots. Label printing is also deferred until the client provides the printer model and workflow.
