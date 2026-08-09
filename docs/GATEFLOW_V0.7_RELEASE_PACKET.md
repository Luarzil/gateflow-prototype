# GateFlow V0.7 Release Packet

## Change Request

CR-V07-PATRICK-CALL-20260809

## Release Summary

This candidate applies Patrick's call feedback to the V0.7 review prototype. The scanner has been simplified for phone use, IDs have been shortened, locations have been corrected, and the two owner-reported blocking defects have been fixed.

## User-Visible Changes

- Scanner now uses `E####` driver IDs, `G####` vehicle barcode IDs, and `S####` supervisor IDs.
- Legacy `EMP-####`, `GFV-####`, and `SUP-####` values are normalized where the prototype has existing stored data.
- Scanner screen no longer shows device setup, network/save status, keyboard-wedge wording, Zebra wording, or side-panel diagnostics.
- Device setup now lives in Supervisor > Devices.
- Scanner and Supervisor feedback forms were added and clearly marked as local-only prototype feedback.
- Active locations are Division Street, North Ave, EWR North, and Linden.
- The invalid/nonexistent yard has been removed from active flow data.
- Vehicle OUT remains blocked for unauthorized drivers until a supervisor grants a fixed 9-hour temporary authorization.
- The scan review step shows only movement, location, driver, vehicle, and authorization.

## Defects Fixed From Owner Testing

1. Invalid-to-valid barcode recovery now clears the stale red warning immediately.
2. Supervisor approval accepts legacy-compatible `SUP-1001`, normalizes it to `S1001`, grants exactly 9 hours, and advances to the OUT review step.

## Validation Evidence

Validated locally with the bundled Node runtime:

```powershell
node --check app.js
node --test tests\v07-presentation.test.js
node --test tests\v07-provenance.test.js
node --test tests\v07-84-regression.test.js
node tests\v07-presentation.browser.test.js
git diff --check
```

The 84-case suite is a V0.7 contract/release-gate suite. The browser regression test drives the high-risk UI behavior directly in Chrome: phone viewports, invalid-to-valid barcode recovery, legacy supervisor migration, temporary authorization, and advancement to the OUT review screen.

## Demo Package

The media package is stored under `docs/media/`:

- `gateflow-v07-demo.webm` - short browser walkthrough video with captions and narration when generated successfully.
- `gateflow-v07-demo-audio.wav` - narration audio file.
- `gateflow-v07-demo.html` - fallback walkthrough page with the demo frames, captions, and audio.

## Vercel Review Links

- App: https://gateflow-prototype-git-c-0e719a-raul-hernandez-watchdesk-github.vercel.app/?_vercel_share=R7SZutlcUR531fPc8nbh0K4ApNCQu2s2
- Walkthrough: https://gateflow-prototype-git-c-0e719a-raul-hernandez-watchdesk-github.vercel.app/docs/media/gateflow-v07-demo.html?_vercel_share=R7SZutlcUR531fPc8nbh0K4ApNCQu2s2

## Release Boundary

This prototype uses browser local storage. It is not production security, not a shared AWS-backed system, and not a final scanner-device integration.

## Rollback

Rollback to the current V0.7 review baseline commit:

`ef5903a6edf440c18fb4182ae29b535115cd6f28`

If promoted to the public production alias, rollback by re-promoting the prior verified Vercel deployment for that alias.
