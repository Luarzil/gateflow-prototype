# Lot Watch / GateFlow V0.5 Patrick Response Review

Static HTML, CSS, and JavaScript review prototype for vehicle gate tracking. This V0.5 build was rebuilt from the latest local V0.4 files, not an older GitHub copy.

## What V0.5 Represents

- One station account per active location: Division Street Scanner, North Ave Scanner, EWR Scanner, and Linden Scanner.
- The selected Working Location determines the station account shown on the scanner and saved with each movement.
- Station identity is not individual guard accountability. Individual login, PIN, and shift identification are future requirements.
- The customer-facing Audit page has been removed. Internal event history remains in local state for troubleshooting and future reporting.
- Driver authorization applies to **All current locations**. The administrative action location is retained internally but does not limit a valid authorization.

## Scanner Flow

1. Select Working Location for the scanner session.
2. Scan or enter the Driver Employee #, or use manual employee-number entry.
3. Confirm driver status, then scan or enter the vehicle VIN.
4. Choose Vehicle OUT or Vehicle IN and submit an optional note.

Enter after the driver moves to VIN; Enter after VIN moves to Vehicle IN/OUT. VIN input is normalized to uppercase. A non-17-character VIN warns but remains available for demo review.

Vehicle OUT requires an active authorization. A blocked OUT can receive a Supervisor temporary authorization for 9 Hours, 12 Hours, or Today. Vehicle IN can still be recorded when unauthorized and is flagged for operational review. The unclear SIM Scan control remains removed.

## Authorization Rules

Admin and Manager simulation controls support these non-permanent durations:

- 9 Hours: exactly nine elapsed hours after approval.
- 12 Hours: exactly twelve elapsed hours after approval.
- Today: 11:59:59 PM on the approval date in America/New_York.
- 48 Hours: exactly forty-eight elapsed hours after approval.
- 3 Days: 11:59:59 PM, three local calendar days after the approval date.

Times are stored as ISO/UTC and displayed in local business time. Authorizations are global across Division Street, North Ave, EWR, and Linden. Elizabeth Repair Facility remains historical-only for searches.

## Admin and Roles

License warnings remain in the Admin/Manager area. The most urgent applicable warning is shown once: 30 days, 15 days, 5 days, or Expired. A license remains valid through its printed expiration date and becomes blocked after that date ends in America/New_York.

The prototype data model explains four roles: Owner / System Administrator, Manager, Supervisor, and Scanner User. Only Owner / System Administrator may create or promote a Manager. A Manager may manage Supervisor and Scanner User accounts. This is a visual business-rule simulation, not secure production RBAC: real enforcement requires backend authentication and server/API/database authorization.

## Run Locally

Open `index.html` for a quick review. For the manifest and offline cache, serve the folder over HTTP(S). Demo data is stored in browser `localStorage`; scanner actions, Admin, and Search all read from the same local state.

V0.5 first tries `lot-watch.gateflow.v0.5.state`. If it does not exist, it safely migrates V0.4 state from `lot-watch.gateflow.v0.4.state`, preserving drivers, vehicles, locations, transactions, internal events, and original authorization expiration timestamps. The V0.4 key is not deleted during review.

## Internal Validation

The separate `gateflow-validator/` app runs repeatable in-house regression checks against this prototype. Serve the repository folder over HTTP and open `http://127.0.0.1:8800/gateflow-validator/`, then select **Run full validation**. It drives the real Scanner, Admin, and Search UI and restores the pre-run browser data afterwards. Do not use it against a customer or production deployment.

## Prototype Boundaries

This is a static review build. It has no production backend, customer database, authentication, email, SMS, real Zebra integration, native Android app, photo capture, or secure role enforcement. Future production may use Zebra DataWedge, Android Intents, Zebra Enterprise Browser, or native Android, plus customer-owned or customer-approved hosted data, offline sync, and server-side authorization.
