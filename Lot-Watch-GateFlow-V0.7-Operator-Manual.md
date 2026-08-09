# Lot Watch / GateFlow V0.7 Operator Manual

## Purpose

GateFlow V0.7 is a browser review prototype for gate operations. It is built around a phone-sized scanner flow for guards and a desktop-style Supervisor area for managers.

The scanner is intentionally simple: confirm location, scan or type the driver, scan or type the vehicle, choose IN or OUT, and submit. Administrative work has been moved out of the scanner and into Supervisor.

## What To Review First

Use this review order when testing V0.7:

1. Scanner home and working location.
2. Scanner feedback.
3. Driver lookup with the new `E####` format.
4. Vehicle barcode lookup with the new `G####` format.
5. Invalid barcode recovery.
6. Vehicle IN path.
7. Vehicle OUT blocked path.
8. Supervisor 9-hour temporary approval.
9. Movement confirmation and recent activity.
10. Supervisor Drivers.
11. Supervisor Vehicles.
12. Supervisor Devices.
13. Supervisor Users.
14. Search.
15. Supervisor feedback.

## Review Test Values

| Purpose | Value | Expected behavior |
|---|---:|---|
| Authorized driver | `E1001` | Can complete normal OUT when authorization and license rules pass |
| Unauthorized driver | `E1003` | OUT is blocked until supervisor temporary authorization |
| Active vehicle | `G0001` | Resolves to an active inventory vehicle |
| Alternate active vehicle | `G0003` | Used for the blocked OUT review path |
| Bad vehicle barcode | `G9999` | Shows a blocking red warning |
| Supervisor approver | `S1001` | Approves fixed 9-hour temporary authorization |
| Legacy supervisor entry | `SUP-1001` | Accepted and normalized to `S1001` |

## Scanner Page

### Working Location

The working location appears at the top of the scanner. Active locations are:

- Division Street
- North Ave
- EWR North
- Linden

The invalid/nonexistent yard from earlier versions has been removed from active scanner data. If a stored browser state still contains older location names, V0.7 migrates supported values to the current names.

### Scanner Feedback

Use **Feedback** from the scanner when the operator notices a problem during gate work. The scanner feedback form is compact because it is meant for phone use.

Scanner feedback records:

- scanner context;
- current working location;
- current screen;
- short note;
- optional operator name.

In V0.7 this feedback is saved only in the local browser. It is not sent to a shared inbox, AWS database, or reporting dashboard yet.

## Standard Scanner Workflow

### Step 1: Driver Employee Number

Enter or scan the driver employee number. V0.7 uses the shorter `E####` format, such as `E1003`.

Older `EMP-####` values are normalized during prototype migration, but operators should use the shorter visible format going forward.

Expected behavior:

- Valid driver: success notice appears and the scanner can continue.
- Missing/unknown driver: blocking notice remains until corrected.
- Driver change: stale authorization state is cleared so a prior approval is not reused incorrectly.

### Step 2: Vehicle Barcode

Enter or scan the assigned vehicle barcode. V0.7 uses the shorter `G####` format, such as `G0001`.

Expected behavior:

- Valid active barcode: success notice appears and the vehicle record is shown.
- Unknown barcode: red blocking warning appears.
- Correcting a bad barcode: the stale red warning clears immediately.
- Inactive vehicle: the record remains searchable, but new IN/OUT movements are blocked.

### Step 3: Movement Choice

Choose **Vehicle IN** or **Vehicle OUT**.

Vehicle IN can proceed for review even if the driver is not currently authorized, because the vehicle is returning to the lot. It is flagged for operational review when needed.

Vehicle OUT is stricter. OUT requires:

- active driver;
- unexpired license;
- active authorization, or supervisor temporary authorization;
- active vehicle.

### Step 4: Review Movement

The review screen intentionally shows only five operational lines:

- Movement
- Location
- Driver
- Vehicle
- Authorization

The guard can add an optional note before submitting.

## Blocked Vehicle OUT Workflow

Use this path to verify the supervisor approval behavior:

1. Start a vehicle scan.
2. Enter driver `E1003`.
3. Enter vehicle `G0003`.
4. Choose **Vehicle OUT**.
5. Submit the movement review.
6. GateFlow blocks OUT and opens Supervisor Authorization Required.
7. Enter supervisor `S1001`.
8. Select **Approve temporary authorization**.
9. Confirm the scanner advances to **Review Vehicle OUT**.
10. Submit the movement.

Temporary authorization is fixed at 9 hours. There is no duration chooser for this Fleet Lead approval path.

The system also accepts `SUP-1001` during review and normalizes it to `S1001`.

## Supervisor View

The Supervisor area is for setup and management. It is not part of the guard's normal scan path.

### Drivers

Drivers shows:

- full driver roster;
- employee number;
- active/inactive status;
- driver-license status;
- license warning window;
- current authorization status;
- authorization expiration;
- action buttons for each driver.

Supervisor users can:

- add a driver;
- edit driver details;
- mark a driver inactive;
- reactivate a driver;
- bulk-authorize selected drivers;
- revoke active authorizations;
- review licenses approaching expiration.

Driver records are operational records. They are not desktop login accounts.

### Vehicles

Vehicles shows active and inactive inventory records.

Vehicle records include:

- assigned `G####` barcode;
- year;
- make;
- model;
- color;
- VIN;
- plate;
- active/inactive inventory status.

Supervisor users can:

- add a vehicle;
- edit vehicle details;
- remove a vehicle from active inventory;
- restore an inactive vehicle;
- filter by inventory status;
- search by barcode, VIN, plate, make, model, year, or color.

Vehicle removal is a soft deactivation. Historical records remain available and the barcode is not reused.

### Devices

Devices is where simulated scanner setup now lives. This was removed from the guard scanner flow.

Device records include:

- device ID;
- friendly name;
- IMEI;
- Fixed or Floater type;
- assigned location;
- status;
- last used time;
- last transaction location.

Fixed devices supply and lock their assigned location. Floater devices must select and confirm a working location before scanning.

### Users

Users is a prototype-only desktop user directory. It exists to show how manager/supervisor roles may be organized later.

Important boundary: these users are not secure production accounts. Real authentication and server-side role enforcement require the future AWS-backed system.

## Search View

Search is for reviewing movement history.

Search filters include:

- assigned barcode;
- VIN;
- plate;
- employee number;
- driver name;
- location;
- date;
- IN or OUT.

Results show the movement timestamp, direction, employee number, driver, entry path, barcode, VIN, plate, location, authorization result, notes, and submitted-by context.

Search remains category-aware. It should not blend employee numbers, barcodes, VINs, plates, and device IDs into one ambiguous result.

## Feedback View Behavior

There are two feedback paths:

| Location | Intended use | Detail level |
|---|---|---|
| Scanner Feedback | Fast operator note during scan work | Short |
| Supervisor Feedback | Manager/admin review note | Longer |

Both are local-only in V0.7. Shared feedback delivery is part of the future backend work.

## Changes Made In V0.7

- Driver IDs changed from `EMP-####` style to `E####`.
- Vehicle barcode IDs changed to `G####`.
- Supervisor IDs changed to `S####`, while still accepting legacy-compatible `SUP-####` entry.
- Device IDs changed to `D####`.
- Scanner device setup was removed from the guard scan path.
- Network, local-save, keyboard-wedge, and vendor-specific hardware language were removed from the scanner.
- Device management moved to Supervisor > Devices.
- Scanner feedback and Supervisor feedback were added.
- Prototype desktop Users were added separately from driver records.
- Locations were corrected to Division Street, North Ave, EWR North, and Linden.
- The invalid/nonexistent yard was removed from active scanner data.
- Review movement was reduced to five operational lines.
- Invalid-to-valid barcode recovery now clears stale red warnings.
- Temporary supervisor approval now accepts normalized supervisor IDs and advances back to review.

## Known Prototype Boundaries

V0.7 is still a browser-local prototype. It does not yet provide:

- real login/authentication;
- backend role enforcement;
- shared AWS database;
- server-side authorization checks;
- immutable audit history;
- multi-device shared state;
- live barcode printing;
- native Android scanner integration;
- production monitoring or alerting.

## Phone Review Notes

Open the Vercel review link on the phone and use the scanner first. The primary scan controls are designed to stay visible on common phone sizes.

If the preview link asks for Vercel authentication, use the shared Vercel review URL with the `_vercel_share` parameter. That temporary share link expires, so a permanent public URL requires production promotion approval.

## Release Readiness Notes

The V0.7 branch includes:

- an 84-case V0.7 contract/release-gate suite;
- a Chrome browser regression test for the high-risk scanner paths;
- generated walkthrough media;
- this operator manual;
- a release packet;
- a client email draft.

The 84-case suite is not a substitute for final hardware testing. Physical scanner behavior, final QR/label contents, printer integration, and AWS-backed multi-device behavior remain future release work.
