# 081526 V7 Edits — Reconciliation Against Code

**Source:** `081526 v7 comments.docx`, attached to Patrick Amaral's email `edits for v7`, 2026-08-15.
This is the document the Codex handoff calls the "081726 v7" edits.
**Reconciled against:** `efe40a6` (V0.8 tip) on 2026-09-03.
**Status:** evidence-based; no item marked complete without a code reference.

## Summary

Ten items. **Nine are open, one is partially done.** None were silently completed.

| # | Item | Status | Evidence |
|---|---|---|---|
| 1 | No way to edit an existing user | **OPEN** | `app.js:1761` renders only a "Mark reset" button; `handleUserTableAction` (`app.js:1782`) handles no edit action |
| 2 | User list layout — abilities column looks sloppy | **OPEN** | `abilitySummary(...)` rendered as a table column, `app.js:1761` |
| 3 | Add-user modal has no scrollbar to reach lower roles | **OPEN** | `.modal-panel` (`styles.css:552`) sets no `max-height` or `overflow-y`; the ability grid overflows the viewport with no scroll |
| 4 | Actions column needs Suspend + Delete (60-day retention) | **OPEN** | Zero occurrences of "suspend" in `app.js` or `index.html` |
| 5 | Try removing abilities from the list; show them in the user profile | **OPEN** | Depends on #1 — no user profile/detail view exists |
| 6 | Add last log-in date & time to the user list | **OPEN** | No `lastLogin` field in the user model or table |
| 7 | Driver authorization period is no longer editable (group or singular) | **OPEN** | `index.html:171` — `authorizationDuration` is `type="hidden"` fixed at `9_hours`; same at `index.html:128`. Patrick is right that the control disappeared |
| 8 | Remove the license-expiration column from the drivers table | **OPEN** | `index.html:175` still renders both "License expiration" and "Authorization expiration" |
| 9 | No post-submit review screen — go straight to the next scan | **OPEN** | `completeTransaction` calls `showTransactionConfirmation` (`app.js:1064`), which shows a confirm screen with a "Start Next Scan" button (`index.html:136`) and a 4.5s auto-return timer (`app.js:1080`) |
| 10 | Confirm the override is Fleet Lead and above, not "Supervisor" | **PARTIAL** | See below |

## Item 10 — needs a decision, not just a copy fix

Patrick asked whether the override is "actually the Fleet Lead and above." Reconciliation
found something more than a wording problem.

**There is no role gate on the override at all.** `updateSupervisorStatus` (`app.js:868`)
resolves the approver against a flat `state.supervisors` list (`app.js:257`) by ID only.
That list is entirely disconnected from `DESKTOP_USER_ROLES`
(`app.js:28` — `Scanner, Fleet Lead, Supervisor, Manager, Admin`). No role, rank, or
"and above" comparison is performed anywhere in the approval path.

Partially done: the duration copy already reads "Fleet Lead authorization is fixed at
9 hours" (`index.html:128`, `index.html:171`).
Still wrong: the scanner flow copy still says Supervisor (`app.js:878`, `app.js:957`),
and the audit event is `supervisor_approval` (`app.js:986`).

So the honest answer to Patrick's question is **no** — and the fix requires deciding the
role hierarchy and enforcing it, not just relabelling the screens.

## Item 9 — clarification worth confirming

Patrick's wording covers the **post-submit** confirmation screen, which today costs the
operator either a button press or a 4.5-second wait before the next scan. The **pre-submit**
review step (step 3, "Review Vehicle IN/OUT", `app.js:923`) is a different screen and reads
as still wanted, since it is the operator's last check before committing. Recommend removing
the post-submit screen only, and confirming that reading with Patrick.

## Relationship to CR-V08-BETA-CRITICAL-APP-001

None of these ten items overlap the provisional-inbound CR. They are additive scope.

Items 1, 4, 5, and 6 touch the same user-management surface as Patrick's separate
`user and log in` (2026-08-12) and `Role ability` (2026-08-12) emails, and should be
grouped with them rather than implemented piecemeal.

Item 9 is the cheapest real operator-experience win in the list and is beta-relevant:
it removes a delay from every single gate transaction.
