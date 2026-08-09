# Lot Watch / GateFlow V0.7 Operator Manual

## Purpose

GateFlow V0.7 is a browser review prototype for recording gate vehicle movements. It is designed for a phone-sized scanner screen and keeps the scanner focused on one job: identify the driver, identify the vehicle, choose IN or OUT, and submit the movement.

## Quick Start

1. Open the GateFlow V0.7 link.
2. Confirm the working location at the top of the scanner.
3. Select **Start vehicle scan**.
4. Enter or scan the driver employee number, for example `E1003`.
5. Enter or scan the vehicle barcode, for example `G0001`.
6. Choose **Vehicle IN** or **Vehicle OUT**.
7. Review the five-line confirmation.
8. Select **Submit movement**.

## Test Values

Use these values when reviewing the prototype:

| Item | Test value | Notes |
|---|---:|---|
| Authorized driver | `E1001` | Can complete OUT when license/authorization rules pass |
| Unauthorized driver | `E1003` | OUT is blocked until supervisor temporary authorization |
| Vehicle barcode | `G0001` | Active inventory vehicle |
| Alternate vehicle barcode | `G0003` | Active inventory vehicle used in the blocked OUT test |
| Supervisor approver | `S1001` | Approves temporary Fleet Lead authorization |
| Legacy-compatible supervisor entry | `SUP-1001` | Accepted and normalized to `S1001` |

## Scanner Flow

### Driver

The driver field accepts the simplified `E####` format. Older `EMP-####` values are normalized by the prototype during migration, but the screen now shows and expects the shorter format.

When a valid driver is entered, GateFlow shows a success message and lets the scan continue. If a driver is not found, the blocking message stays visible until the driver is corrected.

### Vehicle Barcode

Vehicle barcodes use the simplified `G####` format. Older vehicle IDs are migrated where possible.

If an invalid barcode is entered, GateFlow shows a red blocking notice. When the value is corrected to a valid barcode, the red notice clears immediately and is replaced by a success message.

### Movement

Choose **Vehicle IN** or **Vehicle OUT** after the driver and vehicle are found.

Vehicle OUT enforces active driver authorization and unexpired license status. Unauthorized OUT is blocked until a supervisor grants a temporary authorization. Unauthorized IN can proceed, but it is flagged for operational review.

### Supervisor Temporary Authorization

When OUT is blocked, enter a supervisor ID such as `S1001`. The temporary authorization is fixed at 9 hours.

After approval, GateFlow advances back to the OUT review step and shows the movement summary. The reviewer does not need to restart the scan.

## Supervisor View

The Supervisor area has four sections:

| Section | Use |
|---|---|
| Drivers | Add/edit drivers, mark inactive/reactivate, bulk authorize, revoke authorization, and review license status |
| Vehicles | Add/edit vehicles, remove from active inventory, restore vehicles, and search by barcode, VIN, plate, make, model, year, or color |
| Devices | Manage the simulated scanner device and fixed/floater location behavior |
| Users | Maintain prototype desktop users and roles |

Drivers are operational records. They are not desktop application users.

## Locations

The active gate locations are:

- Division Street
- North Ave
- EWR North
- Linden

The invalid/nonexistent yard from earlier versions has been removed from active scanner data.

## Feedback

Scanner feedback is available from the **Feedback** button on the scanner. It records the current location and screen context with a short note.

Supervisor feedback supports a longer note from the desktop-style Supervisor view.

Feedback is saved locally in the browser for this prototype. It is not sent to a shared server until the AWS-backed version is approved and built.

## What Changed In V0.7

- Shortened driver IDs from `EMP-####` style to `E####`.
- Shortened vehicle barcode IDs to `G####`.
- Normalized supervisor IDs to `S####`, while still accepting old `SUP-####` entry.
- Removed scanner device setup, network diagnostics, save diagnostics, keyboard-wedge language, and vendor-specific hardware wording from the scanner.
- Moved device management into Supervisor > Devices.
- Added compact scanner feedback and longer Supervisor feedback.
- Added prototype desktop Users separate from driver records.
- Removed the invalid yard and kept Division Street, North Ave, EWR North, and Linden.
- Reduced scan review to five operational lines: movement, location, driver, vehicle, and authorization.
- Fixed the stale red barcode warning after correcting a bad barcode.
- Fixed temporary supervisor approval so it accepts the normalized supervisor ID and advances to review.

## Prototype Boundaries

This is still a browser-local review prototype. It does not yet provide:

- real login/authentication;
- server-side permissions;
- shared multi-device data;
- immutable audit records;
- AWS database/API;
- live barcode printing;
- native Android scanner integration.

The AWS step remains a planned architecture and inventory step only until separately approved.
