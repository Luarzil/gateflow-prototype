# GateFlow Validator

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

The suite tests normal and negative workflow paths: invalid or inactive drivers, required VINs, VIN warnings, blocked unauthorized OUT attempts, invalid supervisor IDs, expired licenses, duration calculations, global authorization scope, search behavior, and state migration.

It does **not** turn a static browser prototype into secure software. Real user permissions, data tamper prevention, and access control require server-side authentication and authorization in a production backend.
