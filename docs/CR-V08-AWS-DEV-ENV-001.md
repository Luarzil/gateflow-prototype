# CR-V08-AWS-DEV-ENV-001 — GateFlow dev/test environment and initial schema

**Status:** template validated; stack creation pending owner execution
**Branch:** `change/CR-V08-AWS-DEV-ENV-001-dev-environment`
**Date:** 2026-09-03

## Requirement / source

Owner instruction 2026-09-03: create an isolated environment for GateFlow so NJ Guard's existing
infrastructure is not affected, and do it without waiting on JT. Constraint added by the owner:
Patrick has signalled urgency, so avoid building something that must be thrown away.

## Why this does not have to be redone

The concern is legitimate, so it is worth being explicit about what protects against rework.

**The environment is defined as code, not clicked together.** `infra/gateflow-dev.yaml` is a
CloudFormation template that hardcodes no account ID, no credentials, and no environment name.
Deploying the same file into a future `gateflow-prod` account is the same command with different
credentials. Nothing is rebuilt.

What *would* have forced a rebuild, and was avoided:

| Decision | Rework risk if wrong | What we did |
|---|---|---|
| Hand-clicking resources in the console | Total — nothing reproducible | Single CloudFormation stack |
| DynamoDB | High — access patterns redesigned whenever Patrick adds a filter | Postgres, where new queries are just new queries |
| Enforcing the OUT gate only in the app | High — a real security gap found later | Database trigger, below the application |
| Baking the account into the template | Total on account migration | Template is account-agnostic |

The one thing that genuinely changes later is **which account it runs in**, and that is a
credentials change, not a redesign.

## What is created

`infra/gateflow-dev.yaml` — one stack, `gateflow-dev`, in `us-east-1`:

- VPC `10.42.0.0/16` (the account's default VPC is `172.31.0.0/16`; no overlap)
- Two private subnets across two availability zones
- One security group permitting Postgres only from inside the new VPC; no public ingress
- A generated master credential in Secrets Manager
- Aurora Serverless v2 PostgreSQL 17.5, encrypted, private, 7-day backups,
  `MinCapacity: 0` with a one-hour auto-pause

## What is deliberately untouched

The default VPC, the two running EC2 instances, the AWS Backup vault, all six IAM users, and all
five legacy access keys. No existing resource is read-modified-written. Everything created is new
and tagged `Project=GateFlow`, `Environment=dev`, `Owner=Veri-Gate`.

## Scope limit — this is not the isolation fix

This environment lives inside Patrick's management account `552746930767`. It shares IAM with
that account, including the five never-rotated access keys. It is therefore suitable for
**dev/test only** and **must not hold production data**.

Production isolation still requires a separate AWS member account, which requires Patrick — see
`patrick-os/06_CURRENT_DISCOVERY/gateflow_environment_and_architecture_plan_2026-09-03.md`.

## Schema

`infra/schema/001_initial.sql` carries the domain model and, critically, moves two rules out of
the browser and into the database:

1. **`Allowed IN != Authorized OUT`** — a `BEFORE INSERT OR UPDATE` trigger on `movements`
   rejects any `OUT` whose vehicle is still `provisional`. No application bug can bypass it.
2. **Fleet Lead and above** — `authorizations.authorized_role` carries a CHECK rejecting
   `Scanner`, so an under-ranked approver cannot grant an override even by direct SQL.

It also carries the 081526 v7 items that are data-model shaped: `app_users.last_login` (#6),
`suspended_at` / `deleted_at` / `purge_after` for the 60-day retention rule (#4), and app users
kept strictly separate from drivers.

## Cost

`MinCapacity: 0` with auto-pause means the cluster scales to zero when idle. Expected cost is
near zero for intermittent dev use rather than the ~$45–60/month floor a fixed 0.5 ACU would
incur. Billing visibility is currently denied to the `AdministratorAccess/raul` role, so this
should be confirmed once that is fixed.

## Rollback

```
aws cloudformation delete-stack --stack-name gateflow-dev --region us-east-1
```

The entire environment is created and destroyed as one unit. That is the primary reason for
using a stack rather than console clicks.

## Not authorised by this CR

No production account creation, no IAM changes, no production deployment, no client email.
