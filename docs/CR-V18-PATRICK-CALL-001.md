# CR-V18-PATRICK-CALL-001 — the rest of Patrick's 2026-09-13 call

CR-V16 did most of the list Patrick sent before the call. This is what the call itself added, taken
from the recording's transcript and checked item by item against the build, so that nothing already
done was redone.

## What changed

| # | Patrick, on the call | Change |
|---|---|---|
| 1 | Driver rows: "the stuff on the green, where it's like 3 lines... make it just maybe something within the drop down, because this is going to end up having thousands of lines" | Each driver row has one **Actions** menu: Edit, Mark inactive / Reactivate, Authorize or Revoke authorization. The name still opens the profile. Anything that changes a driver asks first (see below). |
| 2 | Vehicles: "literally thousands of vehicles" | Nothing to do. Since CR-V14 a vehicle row has one action, its VIN, which opens the record. |
| 3 | Active Driver Authorizations: "the more narrow we can make these lines, the better" - 4 locations, 15-20 drivers each | One line per driver: name with the employee # beside it, duration, expiry, Revoke. The Scope column said "All current locations" on every row; it is said once above the table instead. |
| 4 | "Once you do the add vehicle... and you hit save vehicle, then another pop-up comes. Do you want to print it?" | After **Save Vehicle** on a new vehicle, or one whose barcode was changed, a pop-up shows the label and asks. **Print label** prints only the label, on a 4 x 2 inch page; **Not now** closes it. Printing is recorded in the history. |
| 5 | "My keyboard comes up... I'm afraid that keyboard is going to block the operator's ability to see what he's typing" | The Android app now shrinks above the keyboard (`adjustResize`) instead of letting the phone decide. A scanner field opened for typing is kept in view above the keyboard and the Continue bar, and again whenever the keyboard changes the screen size. |
| 6 | "A search is going to look for a 4 digit date... I just want to make sure that it doesn't cause a conflict" | The date box takes years 2020 to 2099 only, which also stops the browser accepting a six-digit year. A date that is half typed, or outside that range, stops the search with a message instead of searching every date. |
| 7 | "Next to search, we would have that manager little button" | Already there since CR-V16, as the **Admin** tab (one Admin, not a Manager and an Admin - Patrick, 2026-09-06). Its override switches now need the Admin sign-in on the server (CR-V17). |

## Decisions to confirm with Patrick

1. **The Actions menu asks before it acts.** A menu is easier to set off by accident than a button -
   a slip of the mouse, or the arrow keys on a menu that has focus - so Mark inactive, Authorize and
   Revoke each ask "are you sure". Edit does not. If that is one click too many, it is a one-line change.
2. **The label is Code 128, printed through the browser's own print dialog.** No label printer has
   been chosen. Code 128 is read by every handheld and wedge scanner, and the page is sized 4 x 2
   inches. Once the printer is known, the size may need to change.
3. **The label shows** the barcode, the barcode number in large type, the VIN, and year, make, model
   and colour when known. Nothing else.

## Found on the way

- **The label pop-up was wider than a phone screen** when first drawn: Print label was cut off and the
  pop-up scrolled sideways. Fixed before commit.
- **The half-typed date.** The browser reports a date with no year as empty, which would have meant
  "every date". The form itself refuses to submit in that state; the new check covers every other way
  a search starts, and says what is wrong.

## Verification

Live, in the console signed in to Veri-Gate Dev:

- Actions menu: answering No to "Revoke the authorization for Dana Fox?" left her authorized; Yes to
  "Authorize Tyrone Brooks for 9 Hours?" authorized him, and the change reached the shared records.
- Add Vehicle with a VIN, then Save: the pop-up offered G0006's label; Print label sent only the label
  (barcode, G0006, VIN, 2021 Ford Transit White) and recorded it; the page was restored afterwards.
- Date box: 09/13 with no year, and a year of 0619, were both stopped.
- Keyboard, at 360 px wide: the barcode field opened for typing, then the screen cut to 430 px as a
  keyboard does. With the fix switched off the field sat at 561-608 px, below the visible 430 - hidden.
  With it on, the field moved to 293-340 px, above the Continue bar at 352. (The test browser does not
  send the resize signal a real keyboard sends, so that signal was sent by hand.)

Tests: 313 device tests, 13 of them new for this CR, with the barcode, the menu, the date check and
the keyboard logic run as the app's own code. Nine rules broken on purpose, one at a time, including a
one-digit typo in the barcode table; the tests caught all nine. Click-path validator 113/113, updated
to use the Actions menu and now also checking that a No leaves the driver unchanged.

The APK was rebuilt: the seven web files are byte-identical to the tree, and the compiled Android
manifest carries `adjustResize`.

**Still to prove on real hardware:** scan a printed label with a gate scanner, and type in a scanner
field on the Samsung with its keyboard up.

## Known flake, not from this change

The two browser suites (`v07-presentation`, `v07-provenance`) each pick a free port by opening and
closing one, then reuse the number. Run side by side they can occasionally collide and fail; alone, and
in repeated full runs, they pass.
