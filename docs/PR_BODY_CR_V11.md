## Summary

Three changes from Patrick's 2026-09-06 email. The first reverses the centrepiece of CR-V08.

## 1. Unknown vehicles are logged, not gated

> *"If a vehicle comes to the gate and is not known to our inventory, that vehicle should be let in like any other vehicle... Regarding their exit, it should be handled just like any other vehicle... **The whole purpose is to create a log.**"*

That last line reframes everything. This was never a request for a security gate on unknown vehicles — it is a request for a log.

**Why he is right.** Enterprise does not touch vehicle inventory daily and not at all at weekends, so a completion queue nobody empties becomes vehicles stuck at the gate with no supervisor to release them. Cars move around a national inventory constantly, so an unrecognised vehicle is ordinary traffic rather than an exception.

**What comes out:** the provisional state, the supervisor completion queue, and the vehicle-level OUT block. Records previously held as provisional are released to complete on load, so nothing stays stuck from the earlier build.

**What stays:** provenance. `createdSource` still records that a vehicle arrived at the gate rather than being entered by a person, and the supervisor panel still lists those vehicles — as a record, not a task list. It gates nothing. Given the stated purpose is a log, a log that distinguishes *"someone entered this"* from *"this turned up"* seemed worth keeping at zero cost.

**One interpretation to flag.** Patrick described the inbound case explicitly and exits only as *"like any other vehicle"*. A vehicle never scanned in that tries to leave is therefore **also** created and logged, on the reasoning that refusing to record an exit would leave a hole in exactly the record he asked for. This is an inference, not his words, and is worth confirming.

## 2. One Admin, not Manager and Admin

> *"we issue 1 admin and they create and give the users out with authority."*

`Manager` is removed from the role list. Stored Managers normalize to `Admin` on load, so nothing breaks for existing users.

## 3. Users can be edited — 081526 v7 item #1

> *"there is no way to edit the users once their created"*

The add-user modal now serves both cases: pre-filled when editing, updating in place rather than creating a duplicate. The username uniqueness check ignores the user being edited, and a role change is audited.

## Also

The audit event `provisional_vehicle_created` is renamed `vehicle_added_by_scan`, and its description no longer claims OUT is blocked. Both videos and the operator manual described the old rule and are regenerated. Slide 10 of the walkthrough now shows the user-edit screen rather than a released vehicle. The Android APK is rebuilt so the phone and the web link behave identically.

## Verification

| Gate | Result |
|---|---|
| Static node suites | pass |
| Click-path validator | **89 / 89** |
| APK contents | verified by unzipping the hosted download |

Behaviour confirmed in a browser rather than only by tests: a vehicle **never entered by anyone** went straight OUT, was recorded, and was added to inventory as ordinary stock — notice read *"Vehicle OUT saved for E1001 / G7777"*, Blocks stayed at 0.

`tests/v08-provisional-inbound.test.js` is deleted and replaced by `tests/v11-scan-created-inventory.test.js`, which asserts the gate **cannot come back**.

## Reviewer notes

- This reverses CR-V08-BETA-CRITICAL-APP-001. The schema in PR #9 still carries the database trigger enforcing the old rule; that needs updating before the app is ever connected to it.
- Promoted to production before review because of the Wednesday Verizon deadline — a deviation from the normal gate, recorded deliberately.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
