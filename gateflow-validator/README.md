# GateFlow V0.6 Validator

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

The current 34-check suite tests normal and negative workflow paths: Scanner cancel behavior, Supervisor navigation, driver required fields/create/edit/deactivate/reactivate behavior, bulk authorization and deauthorization confirmations, vehicle required fields/inventory/barcode uniqueness/history/restore behavior, barcode scanner lookup, inactive vehicle blocking, authorized and blocked OUT movement, unauthorized IN review, license rules, duration calculations, reset confirmation and recovery, combined Search filters, and V0.5-to-V0.6 state migration.

It does **not** turn a static browser prototype into secure software. Real user permissions, data tamper prevention, and access control require server-side authentication and authorization in a production backend.
