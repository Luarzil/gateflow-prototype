## Summary

Splits the scanner and supervisor experiences out of one codebase, and designs the API that will replace `localStorage`.

Three commits:

1. `5541a93` — the shell split
2. `0f1b085` — API surface, auth, and offline design
3. `0b5a248` — the supervisor-approved offline option

## The shell split

A gate operator on a handheld and a supervisor at a desk are doing different jobs. Until now they got the same interface with three tabs.

- **`scanner`** — the gate handheld. Scanner view only. Supervisor and Search are not reachable, so there is nothing to tap into by accident mid-shift.
- **`console`** — the desktop. Everything, including the scanner view, because a supervisor legitimately needs to see what the operator sees.

Selected by `?shell=` (remembered, so a handheld is provisioned once by opening the URL), then a stored preference, then inferred from screen width.

**This is deliberately not a security boundary.** Hiding a tab is a usability decision; real restriction needs the server-side permissions in the API design. `showView` refuses views outside the active shell so deep links cannot cross it, but that is tidiness, not access control.

**Confirmed on real hardware.** The Android build was installed on a physical phone and showed the scanner shell only.

## The API design

`docs/CR-V09-API-DESIGN-001.md` — design only, no code. It answers Patrick's 2026-08-12 question *"how are these users logging in?"* with Cognito, roles as groups, the Restricted/View-only/Assign ability matrix he asked for, and drivers never authenticating.

Three decisions worth reviewing rather than skimming:

**Offline behaviour is the decision that shapes everything else.** Open question #7 had been unanswered since July. The document originally recommended queueing IN offline and refusing OUT, on the reasoning that an offline device cannot know whether an authorization was revoked, a licence expired, or a vehicle is still provisional.

`0b5a248` adds a middle option: the device still refuses to release a vehicle on its own judgement, but a Fleet Lead or above physically present can approve a specific vehicle out with their own ID, flagged `offline_decided` and queued for review. That converts *"the system decides on stale data"* into *"a named human decided and is accountable."*

**Patrick has since answered, and it supersedes both.** On 2026-09-04 he replied: *"we can not hold up the gate... store that data locally then upload once signal returns"*, transactions marked `delayed`, and *"Enterprise will not tolerate a pause."* Outages *"could be minutes or days."*

So the shipped design will be full offline operation in both directions with a `delayed` flag — not what this document recommends. **This file needs updating to match his answer**, and that is tracked as follow-up work rather than silently rewritten here, so the reasoning and the override are both on record.

**Idempotency keys are mandatory on movements.** Without them, a replayed offline queue duplicates movements — the most likely data-integrity failure in the system, and now much more likely given the answer above.

**The client migrates behind a storage adapter**, `local` and `api`, rather than a direct rewrite. That keeps the 90-scenario validator green throughout the migration instead of switching off the only regression net during the riskiest change.

## Validation

Validator **90/90** with the split in place. Static node suites pass.

Three tests were added covering the shell constants, the deep-link refusal, and that the split is presentational rather than a permission boundary.

## Reviewer notes

- Base is the CR-V08 provisional-inbound branch (PR #7), so this diff shows only the split and the design.
- PR #8 builds on this branch and is already open.
- The offline section is out of date relative to Patrick's answer; see above.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
