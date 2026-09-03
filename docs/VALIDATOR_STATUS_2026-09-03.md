# 84-Scenario Validator — Status and Attribution

**Date:** 2026-09-03
**Runner:** `gateflow-validator/` (browser click-path runner, 84 scenarios)
**Method:** served each tree over local HTTP and ran "Run full validation" against both.

## Headline

**The validator is stale and is not currently a usable release gate.**

| Tree | Commit | Score |
|---|---|---|
| Baseline, before any of today's work | `efe40a6` | **32 / 84** |
| This branch, after CR-V08-BETA-CRITICAL-APP-001/002 | working tree | **25 / 84** |

The baseline result is the important one. **52 scenarios were already failing on untouched
code** before today's changes. The validator has drifted badly from the application it tests.

## Why the baseline fails

The runner was written against a pre-V0.7 build and still drives identifiers and controls that
V0.7 deliberately changed or removed:

| Validator expects | V0.7 reality |
|---|---|
| `EMP-1001`, `EMP-1003` | canonical employee IDs are `E1001`, `E1003` |
| `SUP-1001` | approver IDs are `S1001` |
| `GFV-0003` | vehicle barcodes are `G0003` |
| `DEV-DIV-01`, `DEV-EWR-01` | device IDs are `D0001`… |
| `#deviceSetupButton`, `#onlineStatus`, `#lastRawScan` | removed from the scanner in V0.7 |

Most of the 52 failures are "Missing target element", i.e. the runner cannot find controls that
no longer exist under those names. They are not application defects.

## Attribution of today's 7 additional failures

Every one of the 7 was identified and accounted for. **None is a regression.**

| Scenario | Cause | Verdict |
|---|---|---|
| Compact confirmation appears | asserts `#confirmationTitle` | obsolete — screen removed by 081526 #9 |
| Start Next Scan works | waits for `#confirmationDoneButton` | obsolete — button removed by 081526 #9 |
| Automatic reset works | asserts `#confirmationTitle` | obsolete — 4.5s auto-return removed by 081526 #9 |
| Authorized Vehicle OUT | asserts `#confirmationTitle` after submit | obsolete assertion; the movement itself still records |
| Unauthorized Vehicle IN review | same | obsolete assertion |
| Barcode entry method is stored | same | obsolete assertion |
| Invalid supervisor cannot approve | asserts the literal text `/invalid supervisor ID/i` | **false alarm** — see below |

### The one that looked like a security bypass

`testInvalidSupervisor` reports "Invalid supervisor ID was accepted." That is a copy-string
assertion (`gateflow-validator/app.js:345`) which fires before the substantive check on the
next line. The approver copy changed to "Invalid approver ID" under 081526 #10, so the regex
misses.

Verified directly against the running app instead:

| Attempt | Result | Authorization created |
|---|---|---|
| `SUP-BAD` (not a real ID) | rejected | no |
| `S3090` Casey Rowe, role **Scanner** | rejected — below threshold | no |
| `S2040` Jordan Wells, role **Fleet Lead** | approved | yes |

No bypass. The rule is enforced, including the new rank check.

## What this means

1. The validator cannot certify this or any build until it is refreshed. Treating 84/84 as the
   gate is right; treating the current runner as that gate is not.
2. Refreshing it is its own change request: retarget the identifiers, drop assertions for
   removed V0.7 surfaces, and add scenarios for provisional inbound, the vehicle-level OUT
   gate, and the Fleet Lead rank rule.
3. Until then, the `node --test` suites are the working gate. They pass, including the 84-case
   V0.7 regression file, which is a different artifact from this browser runner despite the
   coincidental number.
