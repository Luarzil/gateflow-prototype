# Lot Watch / GateFlow V0.7 Call Update Guide

## Scanner workflow

1. Confirm you are at the displayed working location.
2. Select **Start vehicle scan**.
3. Scan or type the driver's employee number, such as `E1003`.
4. Scan or type the vehicle barcode, such as `G0001`.
5. Choose **Vehicle IN** or **Vehicle OUT**.
6. Confirm the movement, location, driver, vehicle, and authorization status.

The scanner no longer shows device setup, network, local-save, or hardware-input diagnostics. If it is unavailable, contact a supervisor.

## Feedback

Use **Feedback** in the scanner for a short report. The prototype automatically records the current location and scanner screen. Use **Feedback** in the Supervisor view for a longer report with additional details. Both are saved only in that browser until an approved AWS-backed service exists.

## Supervisor controls

- **Drivers**: maintain the driver roster and temporary authorizations.
- **Vehicles**: maintain active vehicle inventory.
- **Devices**: select and manage the simulated current scanner.
- **Users**: maintain prototype desktop users, usernames, demo password-reset status, roles, and ability dropdowns. Every ability starts as **Restricted** and can be changed to **View only** or **Assign**. Drivers are not desktop application users.

Configured gates are Division Street, North Ave, EWR North, and Linden. The old invalid yard is not used.

## Prototype limits

This release is a browser-local prototype. It does not provide real authentication, server-side permissions, shared data, immutable audit history, or cloud feedback delivery. Demo password fields are not saved as production passwords, and reset actions do not send email. AWS work is limited to a read-only inventory until a separate approval is granted.
