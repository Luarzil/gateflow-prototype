# CR-V15-BARCODE-INTEGRITY-001

## Requirement / source

Owner decision, 2026-09-12, closing the question left open since CR-V13: typing `G00` was padded
into `G0000` and created a vehicle under a barcode nobody had entered.

The owner's proposal was a soft warning at the gate plus an automatic flag to the supervisor. That
is implemented here, with one addition: the padding itself is treated as the defect, because a
warning alone would still have written a false record.

## The distinction this rests on

Patrick's rule, 2026-09-06, is that a movement is **never gated on whether the vehicle is known**.
It says nothing about accepting half a barcode. A part-typed code is not an unknown vehicle, it is
an unfinished entry, so refusing it does not touch the principle he cares about.

The other half of the distinction only became possible in CR-V14: the app now knows whether a value
was **typed or scanned**, because tapping the field marks it. Padding was always meant to normalise
scanner and legacy variants (`GFV-0001`, `G-1`, `1` all meaning `G0001`). Applied to typed input it
is fabrication. So scanner input is still normalised and typed input is not.

## What changed

**1. Typing is no longer rewritten.** `handleScanInput` padded on every keystroke, so typing `G0`
jumped the field to `G0000` — it was fighting the operator as well as inventing data. Typed input is
now only upper-cased.

**2. An incomplete typed barcode is refused.** Fewer than four digits gets *"Barcode looks
incomplete. Enter all 4 digits, for example G0001."* Nothing is created.

**3. A complete typed barcode that is unknown warns, and continues.** *"Check this barcode. G0044 is
not in inventory. Continue if it is right."* The movement proceeds and the vehicle is created, as
CR-V11 requires. Continuing past the warning is recorded as `typed_barcode_unverified`.

**4. The vehicle carries a review flag.** `barcodeNeedsReview` is set from the **entry path**, never
from being unknown. A scanned unknown vehicle is not flagged, because flagging every new vehicle
would fire constantly and be ignored within a week.

**5. The supervisor can see it and settle it.** The vehicle is marked **Check barcode** in Vehicles
Added By Scan and in the inventory table, with a **Barcode is correct** action. Confirming records
`typed_barcode_confirmed`; opening and saving the record records `typed_barcode_resolved`. Both
clear the mark, so it never lingers after it has been dealt with.

## Bug found while building this

**The added-by-scan panel's Edit button had never worked.** `handleVehicleTableAction` was bound to
`#vehiclesTableBody` only, so the identical `data-vehicle-action` buttons in
`#incompleteInventoryBody` did nothing at all — inert since the panel was built in CR-V08. Now
bound. A blank `year` also rendered as a literal `0` once CR-V14 made it optional.

## What this deliberately does not catch

If someone types `G0004` meaning `G0044`, nothing here helps. A well-formed wrong barcode that is
not in inventory is **indistinguishable** from a legitimately new vehicle, and if `G0004` does
exist, nothing is flagged at all: the system logs a movement against a real vehicle, the wrong one.

That is a different and arguably worse problem, and it is caught by reconciliation later, not at the
gate. It is recorded here so nobody assumes the hole is closed.

## Acceptance criteria

- Typing a partial barcode leaves the field alone and does not advance.
- No vehicle is ever created under a barcode the operator did not enter.
- A typed unknown barcode warns and still completes the movement.
- A scanned unknown vehicle is neither warned about nor flagged.
- A supervisor can confirm or correct a flagged barcode, and both are recorded.

## Verification performed

- 142 static tests across six files; the 84-case regression is still exactly 84.
- Both Chrome/CDP browser tests.
- Click-path validator: **95/95**, including five new cases covering each rule above.
- By hand in the browser: typing `G0` stays `G0`; `G00` is refused with no `G0000` created; `G0001`
  passes silently; `G0044` warns and completes with `barcodeNeedsReview: true`; scanned `G0077`
  completes with no warning and no flag; confirming clears the flag and writes the audit entry; the
  previously dead Edit button now opens the record.

## Still not included

The APK rebuild still waits for Patrick's remaining issue lists, so he installs one build rather
than several.
