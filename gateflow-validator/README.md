# GateFlow V0.7 Validator

Internal regression test runner for the Lot Watch / GateFlow static prototype.

## Run it

Serve the repository folder over HTTP, then open:

`http://127.0.0.1:8800/gateflow-validator/`

From PowerShell, while in the `gateflow-prototype` folder:

```powershell
python -m http.server 8800 --bind 127.0.0.1
```

Select **Run full validation**. The runner opens the sibling GateFlow app in a same-origin frame, exercises UI controls, validates resulting browser state, and restores prior localStorage data when it finishes.

Do not run this against a production customer deployment. It is an in-house local-review validator for the static prototype.

## What it proves

The current 64-check suite tests normal and negative workflow paths: numeric and prefixed employee numbers, unknown/inactive drivers, manual and scanned barcode lookup, inactive vehicle blocking, authorized and blocked OUT movement, unauthorized IN review, invalid and valid supervisor overrides, license rules, compact confirmation and reset behavior, driver profile editing and soft deactivation, Device Control Center rules for Fixed and Floater devices, IMEI uniqueness, transaction device metadata, Search, persistence, and V0.6-to-V0.7 state migration.

It deliberately tests prohibited actions too, including an invalid supervisor approval, manual barcode entry for a missing or inactive vehicle, a Floater scan before a location is confirmed, and a duplicate device IMEI.

It does **not** turn a static browser prototype into secure software. Real user permissions, data tamper prevention, and access control require server-side authentication and authorization in a production backend.
