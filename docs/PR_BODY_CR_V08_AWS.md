## Summary

The first real infrastructure for Veri-Gate: an isolated dev environment defined as code, and a database schema that enforces the business rules below the application.

**This is deployed and running.** The CloudFormation stack is `UPDATE_COMPLETE` in `us-east-1`, the schema is applied, and the rules were verified by watching PostgreSQL reject the operations they are meant to reject.

## Why an environment at all

Read-only AWS discovery on 2026-09-03 found that Patrick's Organization contains exactly **one account**, and that account is the **management account** — the billing root — running NJ Guard's production website and email.

It also found **five permanent IAM access keys, all active**: the oldest created January 2015, three unused for six years or more, one never used at all.

Putting Cavalry's driver records, gate movements, and audit history in that account means sharing IAM with those keys and with NJ Guard production. Hence separation.

## Scope limit — read this before approving

**This environment does not solve isolation.** It lives inside the management account and shares IAM with it. It is suitable for **dev/test only and must not hold production data.**

Real isolation needs a separate AWS member account. Patrick granted authority for that on 2026-09-04 (*"create the account and do what is necessary"*), but it is still blocked on email addresses for the new account roots. Tracked in `patrick-os/06_CURRENT_DISCOVERY/gateflow_environment_and_architecture_plan_2026-09-03.md`.

## What the stack creates

`infra/gateflow-dev.yaml` — one stack, `gateflow-dev`:

- VPC `10.42.0.0/16` — the account's default VPC is `172.31.0.0/16`, so no overlap
- Two private subnets across two availability zones
- A security group allowing Postgres only from inside the new VPC; **no public ingress**
- A generated master credential in Secrets Manager — never typed, never in a file, never in chat
- Aurora Serverless v2 PostgreSQL 17.5, encrypted, private, 7-day backups, `MinCapacity: 0` with a one-hour auto-pause

Nothing existing is modified. The default VPC, both running EC2 instances, the Backup vault, all six IAM users and all five legacy access keys are untouched. Every created resource is tagged `Project`, `Environment`, `Owner`.

## Why CloudFormation rather than console clicks

The template hardcodes **no account ID and no credentials**. Deploying it into a future `gateflow-prod` account is the same file with different credentials, not a rebuild. That directly answers the owner's constraint: *"let's not make a system that we're gonna have to redo."*

Rollback is one command:

```
aws cloudformation delete-stack --stack-name gateflow-dev --region us-east-1
```

The whole environment appears and disappears as a unit.

## The schema, and why it matters

`infra/schema/001_initial.sql` moves two rules out of the browser and into the database.

**1. `Allowed IN != Authorized OUT`** — Patrick's rule from 2026-09-01. A `BEFORE INSERT OR UPDATE` trigger on `movements` rejects any `OUT` whose vehicle is still `provisional`. No application bug can bypass it.

**2. Fleet Lead and above** — `authorizations.authorized_role` carries a CHECK rejecting `Scanner`, so an under-ranked approver cannot grant an override even by direct SQL.

It also carries the 081526 v7 items that are data-model shaped: `app_users.last_login` (#6), `suspended_at` / `deleted_at` / `purge_after` for the 60-day retention rule (#4), and app users kept strictly separate from drivers.

## Verification — actual output, not claims

```
Test 1  IN with an unknown vehicle          → "numberOfRecordsUpdated": 1
Test 2  OUT with that provisional vehicle   → ERROR: Vehicle OUT blocked: vehicle G9001 has an
                                              incomplete inventory record and must be completed
                                              by a supervisor first; SQLState: 23514
Test 3  supervisor completes the record     → "numberOfRecordsUpdated": 1
Test 4  OUT after completion                → "numberOfRecordsUpdated": 1
Test 5  Scanner-level approver              → ERROR: violates check constraint "approver_rank"
```

Test 2 is the one that matters: the movement was submitted with `authorization_status='Authorized'`. The driver was fully authorized and it still did not matter.

## Cost

`MinCapacity: 0` with auto-pause means the cluster scales to zero when idle — a few dollars a month for intermittent dev use rather than the ~$45–60/month floor a fixed 0.5 ACU would incur.

Billing visibility is currently denied to the `AdministratorAccess/raul` role, so this has not been confirmed against a real invoice. Patrick has asked JT to enable it.

## Reviewer notes

- The Data API (`EnableHttpEndpoint`) was added to reach a private database without a NAT gateway or RDS Proxy. It was added to the template and applied by stack update, so the file stays the source of truth.
- The applied schema initially drifted from this file — the `locations` table and three indexes were missed when transferring statements through a terminal. That was found, fixed, and re-verified: 8 tables and 8 indexes now match exactly.
- Test rows from the verification above are still in the dev database.
- Per `AGENTS.md`, security-affecting changes need a Security pass. This introduces a new authorization boundary.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
