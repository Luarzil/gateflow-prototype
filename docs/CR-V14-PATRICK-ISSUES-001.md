# CR-V14-PATRICK-ISSUES-001

## Requirement / source

Patrick Amaral's 2026-09-12 email, subject `Current code issues` — the first of the cleaned-up
issue lists he promised in his 2026-09-11 `challenges` email. Ten items, quoted below against each
change. The owner approved implementing them on 2026-09-12.

## Scope

| # | Patrick's words | What changed |
|---|---|---|
| 1 | "Keyboard function becomes available immediately upon step progress. The default should be to allow the operator to scan." | Scan fields open with `inputmode="none"`: focus is kept so a wedge scan still lands, but no soft keyboard appears. Tapping the field switches to `inputmode="text"` and raises it. Reset on every step. |
| 2 | "Manual entry button can be removed... there is no need for duplication with a manual key button." | Both buttons and both dialogs removed. Tapping the field *is* manual entry, and the tap is what records the entry path. |
| 3 | "Employee numbers must be allowed to contain letters" | `canonicalEmployeeId` no longer strips letters. |
| 4 | "Currently there is no way to authorize personnel for more then 9 hours." | Both duration controls are selects: 9 Hours, 12 Hours, Today, 48 Hours, 3 Days. Nine hours stays the default. |
| 5 | "the size of the panel is too wide. Goal should be to limit the width so that a slide bar is not needed" | Headers abbreviated to Patrick's vocabulary, cells tightened, text wraps at spaces. Every table fits with zero overflow. |
| 6 | "change Expired -Authorization Blocked to Exp" | Roster badge shows `Exp`; the full wording stays on the scanner. |
| 7 | "Similar edits can be done to the other sections" | Applied to authorized drivers, license warnings, vehicles, devices, users and movement history. |
| 8 | "the users within the user tab should be clickable. Once clicked the user's profile should display and be editable" | User ID and name open the editable user. Device ID opens the device. Driver name already did. |
| 9 | "the VIN should be actionable. Remove the Edit and Remove from Inventory actions." | VIN opens the vehicle; removal and restore moved inside that record. The vehicles Actions column is gone. |
| 10 | "When adding a vehicle nothing is required other then the VIN under this section." | Only VIN is required. A blank barcode is assigned the next free `G####`. |

## Judgement calls

**Item 3 keeps numeric folding.** `1003`, `E1003` and `EMP-1003` still all resolve to `E1003`,
because that is how the existing records, the seed data and Patrick's own test values are written.
The fold is deliberately applied only when everything after the prefix is numeric, so `AB123` is
never mistaken for a prefixed number and two people cannot collapse onto one record.

**Item 10 assigns a barcode rather than allowing none.** Patrick's last sentence — "the system will
accept the current barcode ID along with the VIN" — is ambiguous. A vehicle with no barcode could
never be found at the gate, since lookup is by barcode, so a blank one is filled with the next free
number instead of being refused. The scanner path for unknown vehicles is untouched, which is the
part he explicitly said should not be affected.

**Item 6 is scoped to the roster.** The short `Exp` is for the table, where the column only has to
be scannable. The scanner keeps "Expired - authorization blocked", because an operator refused at
the gate needs to read why rather than decode an abbreviation.

**Provenance wording was left alone.** Abbreviating the history table's entry-path column to "Scan"
would have claimed the value came from verified scanner hardware, which the app cannot know — it
only knows the field was not tapped. `tests/v07-provenance.test.js` forbids exactly this, and the
guardrail was right: the tables fit without it.

## Two bugs found while verifying

**A temporal dead zone silently discarded all saved state.** `AUTHORIZATION_DURATIONS` was first
declared next to `selectedDuration`, well below the point where `loadState()` runs during script
evaluation. `normalizeV07State` reads it, so every load threw `Cannot access
'AUTHORIZATION_DURATIONS' before initialization` — straight into the `catch` that logs a warning and
falls back to seed data. Any real movement history would have been thrown away on the next refresh,
and the only visible symptom was data quietly reverting. The constant now sits with the other
load-time constants, with a comment saying why it must stay there.

**Every typed entry would have been recorded as scanned.** `handleScanInput` cleared the entry
method on each keystroke, which was correct while a dialog set it to "manual" afterwards. With the
tap coming first, that clearing erased the mark before the value was even typed. Clearing now
happens only in `resetFlow`, at the start of a movement.

## Affected components

`index.html`, `app.js`, `styles.css`, `service-worker.js`, `Veri-Gate-V0.8-Operator-Manual.md`,
`README.md`, `manual.html`, `review.html`, `gateflow-validator/app.js`, `tests/`.

## Acceptance criteria

- A scan step opens with no soft keyboard; tapping a field raises one and marks the entry manual.
- No manual-entry button or dialog remains anywhere.
- An employee number containing letters can be created and then found at the gate.
- A 3-day authorization can be granted and survives a reload without being shortened to 9 hours.
- No supervisor table, and not the 13-column movement history, needs a horizontal scrollbar.
- A vehicle can be saved with only a VIN and is then findable at the gate.
- Vehicles, users and devices open from their own identifier; the vehicle row has no action buttons.

## Verification performed

- 124 static tests; the 84-case regression is still exactly 84.
- Both Chrome/CDP browser tests, including the full four-way provenance matrix through the new
  tap-to-type path.
- Click-path validator: 90/90.
- Driven by hand in the browser: the keyboard behaviour and its reset between steps; creating
  employee `AB123` and resolving it at the gate; a 3-day override surviving a reload; VIN-only adds
  assigning `G0006` then `G0007` with no duplicates; a VIN-only vehicle reading as "No details
  recorded" rather than `G0006:   , .`; table overflow measured at 1280px and 1024px.

## Deliberately not included

The APK is still not rebuilt. Patrick said he may send a third list, so the rebuild waits until the
lists stop arriving and he installs one build instead of several. The shipped APK predates CR-V13
and still scans the driver first.

## Still open with Patrick

The barcode canonicaliser pads short input, so typing `G00` becomes `G0000` and creates a vehicle
under that barcode. Unknown barcodes are accepted by design, but a mistyped one produces a
plausible-looking record. Carried over from CR-V13 and still unanswered.

## Rollback plan

Revert the branch. No data migration is involved; the only persisted change is the service-worker
cache name, which is safe to move in either direction.
