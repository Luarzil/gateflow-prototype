## The updated workflow.

Patrick, this walkthrough shows the current vehicle first workflow and the latest barcode integrity changes. We will also check the console updates and one remaining record control issue.

## Vehicle first.

Step one is the vehicle barcode. The field opens in scan mode, with keyboard input suppressed. Tapping the field enables typing and marks the entry as manual. There is no separate manual entry button.

## Driver second.

Step two is the driver employee number. This field also opens scan ready. After the driver, choose the direction, then review and submit.

## Letters are supported.

Employee numbers can contain letters. Here, A B one two three identifies our demonstration driver. Numeric forms one zero zero three, E one zero zero three, and E M P dash one zero zero three all resolve to E one zero zero three.

## Choose the direction.

With the vehicle and driver captured, choose Vehicle In or Vehicle Out. The next screen is the review step.

## Review, then submit.

Choose the direction, then review the movement before submitting. The scanner returns to the start after recording it.

## Unknown, scanned.

This unknown barcode arrived through the scanner input path. It advances without the typed barcode warning. When submitted, its vehicle record is created without a Check barcode flag. Normal driver checks still apply.

## Complete the barcode.

When typing is needed, tap the barcode field. That tap enables typing and records manual entry. A partial barcode such as G zero zero is refused. Enter all four digits.

## Check a typed barcode.

A complete typed barcode that is not in inventory warns: Check this barcode. Continue if it is right. The movement can proceed, and the vehicle is marked Check barcode for supervisor review.

## Visible for review.

Here is the vehicle created from the typed unknown barcode. Check barcode is visible on its record. The unknown scanned vehicle was verified without that flag. That distinction is deliberate.

## Review the exit.

The scanned vehicle can leave through the normal driver and license checks. This is the exit review screen, before submission. Missing inventory details do not block the movement.

## Role refusal verified.

This is the actual role refusal. Casey Rowe holds the Scanner role and cannot approve the override. This driver has a current license but lacks authorization, so we are showing a role refusal, not an expired license screen.

## Choose the duration.

Authorization is selectable. The choices are nine hours, twelve hours, today, forty eight hours, and three days. Nine hours is the default, not a fixed duration.

## Supervisor Console.

This is the desktop supervisor console, showing vehicle inventory. Records open through their identifiers instead of separate per row Edit buttons.

## Open the vehicle record.

A vehicle opens from its V I N, or Add V I N when missing. There is one remaining discrepancy: the intended removal button is still hidden inside this record in the current build. That control needs correction before we can demonstrate removal.

## Add with only a VIN.

Adding a vehicle requires only its V I N. Leave the optional barcode blank and save. The application assigns the next free G barcode.

## Barcode assigned.

The vehicle has been saved. Here the next free barcode was G zero zero zero six, and the inventory shows it beside the V I N we entered.

## Open by user identity.

In the user list, select the User I D or name to open that existing user. The old per row Edit and Remove controls are gone.

## Edit the existing user.

This is the existing user record. The available roles are Scanner, Fleet Lead, Supervisor, and Admin. These are prototype accounts, with the limitations shown in the form.

## Open by Device ID.

Device records open from Device I D. The list retains operational status and history controls.

## Device record.

The selected device opens here, with its location and configuration details.

## Review the history.

Movement history remains searchable. This is a device local review build. Shared cloud data and synchronization remain future work. The videos are ready for review, with deployment handled separately.