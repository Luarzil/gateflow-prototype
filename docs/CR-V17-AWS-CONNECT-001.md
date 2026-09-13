# CR-V17-AWS-CONNECT-001 — connecting Veri-Gate to its AWS database

**Branch:** `change/CR-V17-AWS-CONNECT-001`, stacked on `change/CR-V16-PATRICK-0913-001`
**Plan:** "Veri-Gate AWS Connection Plan" (artifact shared with the owner, 2026-09-13)
**Status:** step 1 of 6 (foundation) deployed to Veri-Gate Dev on 2026-09-13

## Why

Every phone keeps its own records, so Patrick can't review scanner activity from anywhere else;
he calls this "the silo". This change set moves the application onto the shared database that
already runs in the Veri-Gate Dev account.

## Step 1 — foundation (this commit)

### Database: migration 003

`infra/schema/003_application_fields.sql`. It gives the database a place for everything the
application records that 001 and 002 have no column for:

- the location override switches (CR-V16) and historical-only locations;
- the typed-barcode review flag (CR-V15);
- device details;
- approver badges, in a new `approvers` table;
- feedback, in a new `feedback` table;
- application user codes and abilities;
- a snapshot on each movement of the driver, vehicle and device as they were at the gate.

For offline scanners it adds:

- `client_id` on movements, authorizations and audit events, so an upload retried after a dropped
  signal is recognised rather than recorded twice;
- `received_at` and `delayed` on movements;
- a `conflict` flag, set when an offline movement disagrees with what the server knew by then.

It also makes the log evidence-grade, since Patrick expects search printouts to support a
termination or a criminal matter:

- `audit_events` is append-only (trigger `audit_events_append_only`);
- movements can't be deleted, and the only change allowed on one is recording a supervisor's
  conflict review (trigger `movements_append_only`).

Everything is additive. No column is dropped or renamed.

### Migration runner

`api/src/migrate.mjs`, deployed as the Lambda `gateflow-dev-migrate`. It applies every
`infra/schema/NNN_*.sql` not yet listed in `schema_migrations`, in order, one transaction per file.
Statements are split by `api/src/sql-split.mjs`, which respects strings, dollar-quoted bodies and
comments.

That splitter fixes the fault that broke the naive split on the way into Dev: a trailing comment
in 001 ("soft delete; purge ...") split a table in two.

001 and 002 were applied by hand before tracking existed. The runner detects that from their
effects and records them, rather than assuming it.

```
aws --profile verigate-dev lambda invoke --function-name gateflow-dev-migrate --cli-binary-format raw-in-base64-out --payload '{"dryRun":true}' out.json
```

A dry run only reads. It doesn't even create the tracking table.

### The service

`infra/gateflow-api.yaml`, stack `gateflow-dev-api`:

- **Cognito user pool** `gateflow-dev-users`:
  - no self sign-up;
  - passwords of 12 or more characters, with authenticator-app MFA available;
  - recovery by the Admin only;
  - groups Admin, Supervisor, FleetLead, Scanner and Device.

  No users exist yet. The Admin creates real logins.
- **HTTP API**:
  - `GET /health` is public;
  - `ANY /v1/{proxy+}` requires a Cognito token, checked by API Gateway and again by the handler;
  - CORS allows the Vercel console, the local preview and the Android app (`https://localhost`);
  - throttled to 25 requests per second, bursting to 50.
- **Lambda `gateflow-dev-api`** (Node.js 22, arm64). It reaches the database only through the RDS
  Data API. Its IAM role allows that one cluster and that one secret, nothing else.

  Routes live now:
  - `/health`;
  - `/v1/reference`, the lists a scanner needs to decide at the gate;
  - `/v1/movements`, search at 50 rows per page, keyset-paged by `(occurred_at, id)`, with the
    total on the first page, New York gate days, and parameterised filters.

`infra/gateflow-artifacts.yaml`, stack `gateflow-artifacts`, is a private, encrypted, versioned
bucket for packaged code. It accepts TLS only, and old packages expire.

### Deploying

```
node tools/build-api.mjs
aws --profile verigate-dev cloudformation package --template-file infra/gateflow-api.yaml --s3-bucket verigate-artifacts-043262085191-us-east-1 --s3-prefix gateflow-api --output-template-file build/gateflow-api.packaged.yaml
aws --profile verigate-dev cloudformation deploy --stack-name gateflow-dev-api --template-file build/gateflow-api.packaged.yaml --capabilities CAPABILITY_IAM --parameter-overrides ClusterArn=<gateflow-dev cluster ARN> SecretArn=<gateflow-dev DbSecretArn>
```

## Verification, 2026-09-13

- API unit tests: 26 passing.
  - `api/test/sql.test.mjs`: the splitter on the real 001–003 files, and the runner's baseline,
    empty-database, dry-run and re-run behaviour.
  - `api/test/api.test.mjs`: routing, the sign-in check, error mapping, and the paging and filter
    query.
- The runner's dry run reported 001 and 002 as applied by hand and 003 as pending with 63
  statements. The real run applied 003 in one transaction.
- `GET /health` returns 200 with all three migrations listed.
- `/v1/reference` without a token returns 401, and `/v1/movements` with a forged token returns 401.
- The schema read back shows the new tables, both append-only triggers, 28 movement columns and
  the location override columns.
- The audit trail's append-only guard was exercised inside a transaction that was then rolled
  back: an `UPDATE` of a freshly inserted audit row was refused.

## Deliberately not in step 1

- No real user logins. Creating those is the Admin's job.
- The web app and the Android app still use on-device storage; they switch over in steps 2 to 4.
- The Lambda connects as the database's master user. A least-privilege application role, with
  `UPDATE`/`DELETE` revoked on `audit_events` and `movements`, is a go-live task.
