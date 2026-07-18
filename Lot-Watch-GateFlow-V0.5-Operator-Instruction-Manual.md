# Lot Watch / GateFlow V0.5 Operator Instruction Manual

## Purpose

GateFlow records vehicle movements at Division Street, North Ave, EWR, and Linden. This V0.5 review build is designed for a shared scanner or station account at each location.

## Start of Shift

1. Open the Scanner tab.
2. Select the Working Location.
3. Confirm the station account displayed beside it. For example, selecting EWR displays `EWR Scanner`.

The selected location stays in the browser session. The station account is saved with each movement. It identifies the location/device, not the individual guard.

## Standard Employee and VIN Flow

1. Select **Start vehicle scan**.
2. Scan or enter the Driver Employee #.
3. Press Enter to continue to the VIN field.
4. Scan or enter the Vehicle VIN and press Enter.
5. Choose **Vehicle OUT** or **Vehicle IN**.
6. Add a note only when needed and submit.

VIN values are converted to uppercase. A VIN that is not 17 characters shows a demo warning but may still be submitted in this review prototype.

## Manual Employee Entry

Use **Enter Employee Number Manually** when a scan cannot be read. It follows the same driver validation as a scanner entry. Invalid and accepted manual entries are retained in internal event history.

## Vehicle OUT

Vehicle OUT requires an active authorization. An authorization applies to all four current locations, not only the location where it was granted.

When OUT is submitted, the system records the driver, VIN, direction, location, station account, time, authorization status, and optional note. The movement is immediately available in Search.

If the driver is not authorized, OUT is blocked and the Supervisor panel appears.

## Supervisor Temporary Authorization

1. Scan or enter the Supervisor ID.
2. Choose the temporary authorization duration.
3. Select **Approve temporary authorization**.
4. Return to the OUT review and submit the movement.

Scanner-side supervisor choices are 9 Hours, 12 Hours, and Today. The approval applies to all current locations and is retained in internal history.

## Vehicle IN

Vehicle IN is allowed even when the driver does not have an active authorization. When that happens, the movement is saved as Unauthorized and flagged for operational review. It still appears in Search with the submission station and note.

## Authorization Durations

| Choice | Expiration rule |
| --- | --- |
| 9 Hours | Exactly nine hours after approval |
| 12 Hours | Exactly twelve hours after approval |
| Today | 11:59:59 PM local business time on the approval date |
| 48 Hours | Exactly forty-eight hours after approval |
| 3 Days | 11:59:59 PM, three local calendar days after approval |

All stored dates are ISO/UTC; the app displays them in America/New_York business time.

## Admin and License Warnings

In Admin, authorized drivers can be authorized or revoked in bulk. License alerts show the most urgent applicable warning only: 30 days, 15 days, 5 days, or Expired. An expired license blocks new authorization and Vehicle OUT.

## Search

Use Search to find vehicle movements by VIN, plate, driver, location, date, or direction. Historical Elizabeth Repair Facility records remain searchable, but that location cannot be selected for new scanner movements.

## What Is Not Included

There is no customer-facing Audit page in V0.5. Internal history is retained for future troubleshooting but is not visible to ordinary users. This static prototype also does not include real login security, production roles, customer data hosting, email/SMS alerts, photo capture, or real Zebra hardware integration.
