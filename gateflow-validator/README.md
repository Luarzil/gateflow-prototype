# GateFlow V0.7 Validator

Internal regression test runner for the Lot Watch / GateFlow static prototype.

## Run it

Serve the repository folder over HTTP, then open:

`http://127.0.0.1:8800/gateflow-validator/`

From PowerShell, while in the `gateflow-prototype` folder:

```powershell
npx http-server -p 8800 -a 127.0.0.1
```

Select **Run full validation**. The runner opens the sibling GateFlow app in a same-origin frame, exercises UI controls, validates resulting browser state, and restores prior localStorage data when it finishes.

Do not run this against a production customer deployment. It is an in-house local-review validator for the static prototype.

## What it proves

The current 90-scenario suite registers every retained V0.6 regression once and adds distinct V0.7 checks for numeric employee numbers, manual barcode entry, stale driver-state clearing, the fixed nine-hour authorization rule, Fixed/Floater device controls, submission-time device revalidation, transaction metadata, Search, persistence, and V0.6-to-V0.7 migration.

It deliberately tests prohibited actions too, including an invalid supervisor approval, manual barcode entry for a missing or inactive vehicle, a Floater scan before a location is confirmed, and a duplicate device IMEI.

It does **not** turn a static browser prototype into secure software. Real user permissions, data tamper prevention, and access control require server-side authentication and authorization in a production backend.
