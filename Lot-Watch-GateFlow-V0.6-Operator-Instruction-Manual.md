# Lot Watch / GateFlow V0.6 Operator Instruction Manual

## Start a shift

1. Open **Scanner**.
2. Choose the Working Location. The shared station identity updates to the matching scanner account.
3. Keep that location selected for the shift. It is saved with every movement.

## Record a movement

1. Select **Start vehicle scan**.
2. Scan or manually enter the Driver Employee #. Press Enter to continue.
3. Review the driver result. Inactive or unknown drivers cannot continue.
4. Scan the assigned **Vehicle Barcode**. Use the barcode printed for that vehicle, not the VIN.
5. Confirm the returned vehicle profile: barcode, year, make, model, color, VIN, and plate.
6. Choose **Vehicle OUT** or **Vehicle IN**, enter an optional note, and submit.

## Vehicle OUT

OUT requires an active authorization and a driver license valid through the printed expiration date. If authorization is missing, GateFlow blocks OUT and asks for a valid Supervisor ID. The Supervisor can grant 9 Hours, 12 Hours, or Today, then the guard resumes the OUT transaction.

## Vehicle IN

IN records a returning vehicle even when the driver is not authorized. GateFlow saves the record as **Unauthorized** and adds `Unauthorized IN - operational review`.

## Vehicle inventory rule

Only active inventory vehicles can be used for new movements. If the barcode resolves to a removed/inactive vehicle, GateFlow blocks IN and OUT. The movement history is preserved.

## Supervisor: Drivers

Use **Supervisor > Drivers** to add or edit a driver, mark a driver inactive, reactivate a driver, authorize selected active drivers, revoke one authorization, or deauthorize all drivers after confirmation. Expired and inactive drivers cannot be authorized.

## Supervisor: Vehicles

Use **Supervisor > Vehicles** to add, edit, search, filter, remove, or restore inventory. Every vehicle needs a unique VIN and unique assigned barcode. VIN values warn when not 17 characters but remain available for review-prototype flexibility. Removing a vehicle is a soft deactivation; it does not delete the profile, history, VIN, or barcode.

## Search

Use **Search** to find movements by assigned barcode, VIN, plate, driver, employee number, location, date, and IN/OUT direction. Historical records remain available when a driver or vehicle becomes inactive. Elizabeth Repair Facility remains searchable as a historical-only location.

## Prototype limits

V0.6 stores review data in the local browser only. It does not include real authentication, a shared database, printer or label generation, Zebra device integration, offline synchronization, or a customer-facing Audit screen.
