# CR-V13-SCANNER-ORDER-001

## Requirement / source

Patrick Amaral's 2026-09-11 email labeled `challenges` says the scanner workflow needs to scan the vehicle before the employee. The owner approved restarting from the latest V0.8/V11/V12 review baseline and applying this change on 2026-09-12.

## Scope

- Start the gate scan wizard on the vehicle barcode step.
- Move driver employee number entry to the second step.
- Preserve the V11 rule that unknown inbound vehicles are added as ordinary inventory.
- Keep driver changes from wiping the selected vehicle, while clearing movement authorization state that depends on the driver.
- Update Patrick-facing operator/review docs and regression tests.
- Rebuild the Android APK after the web bundle is verified. **Deferred on 2026-09-12** — Patrick's
  2026-09-11 email says he is sending two or three further lists of issues. The APK is rebuilt once
  those land, so he installs one build rather than three. The web bundle carries the change now;
  the shipped APK is still the CR-V11 build and still scans the driver first.

## Affected components

- `index.html`
- `app.js`
- `README.md`
- `Veri-Gate-V0.8-Operator-Manual.md`
- `manual.html`
- `review.html`
- `gateflow-validator/app.js`
- `tests/`
- `Veri-Gate-V0.8.apk`

## Acceptance criteria

- New scans begin with vehicle barcode entry, then continue to driver employee number entry.
- Manual vehicle and manual driver entry follow the same order as scanning.
- Direction selection remains after the driver step.
- Changing the driver clears authorization review/approval state but keeps the already-scanned vehicle.
- Known vehicles, unknown inbound vehicles, authorized outbound, blocked outbound, and supervisor override flows still pass.
- Patrick-facing docs no longer describe driver-first scanning.

## Regressions found and fixed while verifying this change

- `tools/build-review-pages.js` still emitted the pre-CR-V12 review page, so regenerating
  `review.html` silently reverted the refreshed videos back to the old autoplaying HTML slideshows.
  The generator now produces the CR-V12 page, so the fix survives the next regeneration.
- The same generator dropped wrapped list lines into their own paragraph, which restarted the
  numbering in the operator manual. "The scanner, step by step" rendered as 1, 2 then 1, 2.
- `testBarcodeEntryMethod` in the validator chose a direction straight after manual barcode entry.
  With the vehicle first, that step now lands on the driver, so the run timed out at 88/89.
- `tests/v07-presentation.browser.test.js` still expected "Supervisor found". CR-V11 changed the
  copy to "Fleet Lead or above found", so this had been failing since before CR-V13.

## Open question for Patrick

Unknown barcodes are accepted by design, but the canonicaliser pads short input: typing `G00`
becomes `G0000` and creates a vehicle under that barcode. A mistyped code at the gate therefore
creates a plausible-looking inventory record. The manual-entry dialog also still claims "the same
exact-match checks as scans", which is no longer true. Both wait on his answer, since the copy
depends on whether he wants typos caught.

## Test cases

- `node --test tests\v07-84-regression.test.js`
- `node --test tests\v11-scan-created-inventory.test.js`
- `node --test tests\v07-provenance.test.js`
- `node --test tests\v08-user-auth-abilities.test.js`
- `node tests\v07-presentation.browser.test.js`
- `node tests\v07-provenance.browser.test.js`

## Rollback plan

Switch the release candidate back to the CR-V12 review/video baseline and restore the prior APK. No production data migration is involved because this is a local prototype workflow change.
