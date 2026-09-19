# CR-V08-BETA-CRITICAL-APP-001 — Provisional inbound vehicle creation

**Status:** Plan — awaiting owner go-ahead to implement
**Branch:** `change/CR-V08-BETA-CRITICAL-APP-001-provisional-inbound`
**Base commit:** `efe40a6` (V0.8 user-abilities tip)
**Worktree:** `../gateflow-prototype-cr-v08-beta`
**Author:** Implementation Agent
**Date:** 2026-09-03

## 1. Requirement / source

Primary source: Patrick Amaral, email `thought`, 2026-09-01, as transcribed in
`RECENT_PATRICK_EMAILS_2026-09-03.md` §5.

Patrick's requested behavior when a vehicle arrives INBOUND and is not in inventory:

1. Accept the inbound transaction.
2. Auto-add the unknown vehicle to inventory.
3. Do not interrupt the scanner operator with a prompt or special notice.
4. Surface the new/incomplete record under Supervisor.
5. Tell the Supervisor additional vehicle information must be completed.

Governing business rule (§5, "Critical security/business rule"):

```
Allowed IN != Authorized OUT
```

Secondary source: `AGENTS.md` change discipline; `patrick-os/01_PROJECT_BRAIN/PROJECT_STATE.md`.

## 2. Current behavior (verified in code)

`app.js:1008` — `readTransactionDraft()` rejects any unknown vehicle for **both**
directions:

```js
if (!vehicle || !vehicle.active) {
  setNotice("An active vehicle barcode must be scanned before submitting.", "warning");
  return null;
}
```

`app.js:907` and `app.js:856` produce the same hard stop at scan time. There is
currently no provisional inventory state: `normalizeVehicle()` (`app.js:511`)
has no status/provenance fields, and OUT authorization (`app.js:941`, `app.js:948`)
is keyed entirely on the **driver**, never on the vehicle.

Consequence if implemented naively: an auto-created vehicle would be
indistinguishable from a fully vetted one and would pass OUT as soon as the
driver held an authorization — a direct violation of the rule above.

## 3. Affected components

| Component | Change |
|---|---|
| `app.js` — vehicle data model (`normalizeVehicle`, `seedVehicle`) | Add provisional state + provenance fields |
| `app.js` — `readTransactionDraft` | IN with unknown barcode auto-creates instead of rejecting |
| `app.js` — new `createProvisionalVehicle` | Single creation point, duplicate-safe |
| `app.js` — `completeTransaction` / OUT gate | New vehicle-level OUT block for provisional records |
| `app.js` — `renderVehicles` + supervisor view | Incomplete-inventory queue and completion action |
| `app.js` — audit trail (`addAudit`) | Provenance and block events |
| `index.html` / `styles.css` | Queue markup, provisional badge |
| `tests/` | New `v08-provisional-inbound.test.js` |

## 4. Data model

Added to every vehicle record, defaulting existing records to complete:

```
inventoryStatus            "complete" | "provisional"
createdSource              "seed" | "migration" | "supervisor" | "inbound_scan"
needsSupervisorCompletion  boolean
provisionalFromTxId        string   // originating inbound transaction
provisionalAt              ISO timestamp
completedBy / completedAt  supervisor identity + timestamp
```

Migration rule: any vehicle loaded without `inventoryStatus` is treated as
`complete` with `createdSource: "migration"`. No existing record becomes
provisional retroactively.

Natural key for duplicate prevention is the canonical barcode
(`canonicalVehicleBarcode`), which is already the lookup key in
`findVehicleByBarcode` (`app.js:1099`).

## 5. Acceptance criteria

Traced to `RECENT_PATRICK_EMAILS_2026-09-03.md` §5 "Acceptance criteria proposal":

- **AC1** Unknown vehicle scanned on IN does not block or interrupt the scanner workflow.
- **AC2** Exactly one provisional vehicle record is created per unknown barcode.
- **AC3** Re-scanning the same unknown barcode reuses the existing provisional record — no duplicate.
- **AC4** The inbound movement is recorded as a normal transaction.
- **AC5** The Supervisor area shows an incomplete-inventory work item for each provisional vehicle.
- **AC6** A Supervisor can complete the missing vehicle information, clearing provisional state.
- **AC7** A provisional vehicle is **blocked** for OUT regardless of driver authorization status.
- **AC8** Audit history records that the vehicle originated from an inbound scan, with timestamp, location, device, operator, scanned identifier, entry method, and transaction ID.
- **AC9** Rapid repeat scans of the same unknown barcode do not create duplicate records.
- **AC10** Existing vehicles, drivers, transactions, and the V0.7 regression suite are unaffected.

## 6. Test cases

New file `tests/v08-provisional-inbound.test.js`:

1. IN + unknown barcode → transaction recorded, vehicle created, `inventoryStatus === "provisional"`.
2. IN + unknown barcode twice → vehicle count increases by exactly 1.
3. OUT + provisional vehicle + **authorized** driver → blocked (this is the security-critical case).
4. OUT + provisional vehicle + supervisor temp authorization → still blocked; driver auth must not substitute for vehicle completion.
5. Supervisor completes record → `inventoryStatus === "complete"`, OUT then permitted.
6. Legacy vehicle with no `inventoryStatus` → normalizes to complete, OUT permitted.
7. Audit contains a `provisional_vehicle_created` entry carrying the originating transaction ID.
8. Supervisor queue count matches the number of provisional records.

Regression: existing `tests/v07-84-regression.test.js`, `v07-presentation`,
`v07-provenance`, and `v08-user-auth-abilities` suites must stay green.

## 7. Rollback plan

- All work is isolated on `change/CR-V08-BETA-CRITICAL-APP-001-provisional-inbound` in its own worktree; `main` and the certified V0.7 stabilization snapshot `4cfc0e5` are untouched.
- Revert path: `git revert` the CR commits, or delete the branch.
- No schema migration is destructive — the added fields are additive and absent fields normalize to `complete`.
- Prototype state lives in browser local storage; clearing it reseeds cleanly.

## 8. Security / data impact

- Introduces a **new authorization boundary at the vehicle level.** Prior to this CR, OUT was gated only by driver authorization. The provisional block must be enforced in the same place as the expired-license block (`app.js:941`) so it cannot be bypassed by the supervisor-override path.
- This remains a UI/local-storage prototype. The rule is **not** backend-enforced and must be re-implemented server-side during the AWS build. Per `RECENT_PATRICK_EMAILS_2026-09-03.md` §8, "no UI-only security boundary" is a beta-readiness requirement that this CR does not satisfy on its own.
- No secrets, credentials, or AWS resources are involved.

## 9. Explicitly out of scope

- AWS resource creation or mutation (admin access is not deployment approval).
- Production deployment or merge to `main`.
- Client email.
- Veri-Gate product rename — company is Veri-Gate LLC; product stays GateFlow.
- Backend auth / real login (Patrick's `user and log in` email, 2026-08-12) — separate CR.
- Role ability matrix restricted/view-only/assign (Patrick's `Role ability` email, 2026-08-12) — separate CR.

## 10. Blocked evidence

The `081526 v7 comments.docx` attachment (Patrick, `edits for v7`, 2026-08-15) —
the file the handoff refers to as "081726 v7" — is **not present locally** and
could not be retrieved. Per `RECENT_PATRICK_EMAILS_2026-09-03.md` §6, this is
reported as a missing source rather than guessed at. The V7/V8 client-edit
backlog **cannot be declared complete** until this document is reconciled.

---

## 11. Implementation record — 2026-09-03

**Status:** implemented on `change/CR-V08-BETA-CRITICAL-APP-001-provisional-inbound`.

### Validation method

Node.js is **not installed on this machine**, so the `node --test` suites could not be
executed. Instead the branch was served over a local static server and every acceptance
criterion was exercised against the running application in a browser.

This is weaker than a green suite in one specific way: the new
`tests/v08-provisional-inbound.test.js` has itself never been run, so it is unverified as a
test file even though the behavior it describes was confirmed by hand. The suites must be run
before this CR is certified.

### Results

| AC | Result | Evidence |
|---|---|---|
| AC1 unknown IN does not block the operator | PASS | transaction recorded, scanner returned home |
| AC2 one provisional record created | PASS | vehicle count 5 -> 6 |
| AC3 re-scan reuses the record | PASS | 1 copy of `G9911` after two inbound scans |
| AC4 inbound movement recorded | PASS | `in_transaction` audit written |
| AC5 supervisor queue | PASS | queue count 1, missing fields listed |
| AC6 supervisor completion clears state | PASS | status `complete`, `completedBy` set |
| **AC7 provisional blocked for OUT** | **PASS** | authorized driver + provisional vehicle: no transaction, no override screen, audit `blocked_out_incomplete_vehicle` |
| AC8 provenance in audit | PASS | `provisional_vehicle_created` carries transaction id, device, operator |
| AC9 no duplicates on repeat scans | PASS | covered by AC3 |
| AC10 legacy records unaffected | PASS | record with no status normalizes to `complete`/`migration` |

AC7 was verified with a **fully authorized driver**, which is the case that matters: driver
authorization does not override the vehicle gate.

### Also delivered from `081526 v7 comments.docx`

- **Item 9** — the post-submit confirmation screen is removed. A clean submission returns
  straight to the scanner home. Verified: `screenIsHome: true` immediately after submit.
- **Item 3** — `.modal-panel` is now height-bounded and scrolls. Verified at a 600px viewport:
  content 1134px inside a 566px panel, `overflow-y: auto`, scrollable.

### Existing tests changed

Two previously green assertions contradicted the new requirements and were updated rather
than worked around:

1. `tests/v07-84-regression.test.js` case 52 asserted the unknown-barcode block message. That
   block is exactly what Patrick's rule removes.
2. `tests/v07-provenance.browser.test.js` asserted `#confirmationSummary` content. That screen
   no longer exists under item 9; it now asserts the return to the scanner home.

### Remaining before certification

- Install Node.js and run all suites.
- Code Review, QA, and Security actors per `AGENTS.md` (the implementer may not be sole verifier).
- Confirm with Patrick that item 9 meant the post-submit screen only, not the pre-submit review.
- The vehicle-level OUT gate is UI-only and must be re-enforced server-side in the AWS build.
