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

## Step 2 — the console reads the shared database (2026-09-18)

The console can now read the movements in the Veri-Gate Dev database instead of only the ones in
its own browser. This is the half of "the silo" that lets the owner review gate activity from his
own computer; scanners writing into that database is step 3.

### The client

`cloud.js`, a plain script loaded before `app.js`:

- signs in against the Cognito user pool (`USER_PASSWORD_AUTH`), including the new-password
  challenge every Admin-created login starts with, and refreshes a token a minute before it
  expires;
- keeps the session in `sessionStorage`, so closing the tab signs out - deliberate on a shared
  supervisor computer. A handheld that stays signed in across shifts is step 5;
- reads `GET /v1/movements` and `GET /v1/reference`, and `GET /health`, which needs no sign-in so
  "no signal" can be told from "not signed in";
- turns a database row into the shape the console's renderers already use;
- translates Cognito's developer wording into something an operator can act on, and never lets a
  wrong username be distinguished from a wrong password.

### The console

- A pill in the header says where the records on screen come from: **This device only** or
  **Shared records: <user>**. Clicking it signs in or out. The scanner shell never shows it.
- Search reads the shared database when signed in. **Show next 50** then *fetches* the next page
  by cursor rather than revealing rows already held - the resource saving Patrick asked for on
  2026-09-13.
- The count and "Showing x of y" come from the server's total, not from the rows loaded so far.
- A failed read falls back to this device's records, labelled: a dropped connection must never
  look like an empty gate log.
- The printout and its audit entry state which records they came from, because a search printed
  for a termination or a criminal matter has to say whether it is the shared log or one device.

### Demo records

`infra/seed/dev_demo.sql` - the same drivers, vehicles, devices and movements the app has always
seeded into localStorage, so the console shows familiar records. Dev only; production gets the
beta records imported in step 6. Every insert is guarded, so it is safe to run twice: the second
run reported 0 rows for all eight statements.

### Two faults this found in step 1

- **The preflight was being authorized.** `ANY /v1/{proxy+}` also matched the unauthenticated
  `OPTIONS` request a browser sends before a cross-origin call, so the JWT authorizer rejected it
  and the console could only report "no connection". The methods are now listed one at a time,
  leaving `OPTIONS` for API Gateway's own CORS handling. Preflight now answers 204 with the
  allow-origin, allow-methods and allow-headers the browser needs.
- **Timestamps had no time zone.** The Data API renders a `timestamptz` as
  `2026-09-18 22:59:47.718031` - the right instant, in UTC, with nothing to say so - and the
  browser read it as local time, putting every movement four hours out. Every timestamp now leaves
  the API as an explicit UTC instant, and the client insists on one.

### Verification, 2026-09-18

- API unit tests 28, cloud client tests 36, existing static suites 183, both browser suites, and
  the click-path validator at 113/113.
- Live in Veri-Gate Dev: signed in as `raul` (Admin group), Search returned the three seeded
  movements from the database with the server's total, and the first row displayed 6:59 PM for the
  22:59:47Z it was recorded at.
- `GET /health` from the app's origin returns 200 with all three migrations; reading without a
  sign-in is refused before a request leaves the browser; a rejected token signs the console out.

### Deliberately still not done

- Nothing writes. The scanner still records to the device; step 3 changes that.
- The Supervisor tables still read this device's records. They are edit surfaces, and a screen
  that reads from one place and writes to another would be lying about what it shows.
- Roles are not enforced yet. The login is in the Admin group, but the API does not read the group
  claim until sign-in is finished in step 5.

## Step 3 — scanners record into the shared database (2026-09-18)

A movement submitted at the gate is now written to the shared database as well as to the device,
so a second screen can see it. That is the other half of "the silo".

### The rule this is built around

The scanner decides at the gate, offline if it has to. The server stores that decision faithfully
and says where its own records disagree - it never quietly rewrites it, because the vehicle moved
either way. The disagreement is recorded in `conflict` for a supervisor to review, which is the
only change an already-written movement allows.

`api/src/writes.mjs`, `POST /v1/movements`:

- **Sending the same movement twice records it once.** The device makes a `client_id` for every
  movement; the column is unique, the duplicate is asked about before anything is written, and a
  race that slips past that is caught by the insert itself. The answer is 201 for a new movement
  and 200 for one already recorded, so a handheld can tell "stored once" from "stored twice", and
  neither is an error.
- **What the gate saw is written down as a snapshot**: driver name, VIN, plate, device name, type
  and assigned location, so a printout made months later still reads as it did that day.
- **An unknown barcode becomes a vehicle**, marked `inbound_scan` and tied back to the movement
  that created it. A *typed* unknown barcode is flagged `barcode_needs_review`, because a typo
  invents a vehicle (CR-V15).
- **Flags** (`conflict`): `authorization_expired`, `driver_inactive`, `license_expired`,
  `override_needs_scan` (the CR-V16 override covers scanned badges only), `vehicle_removed`. An
  Unauthorized movement is never flagged - it already says what it is.
- **`delayed`** is set when the movement was recorded more than five minutes before it arrived,
  which is what an offline queue looks like.
- An employee number that is not on the shared roster is refused, 422, and nothing is written.
- The audit entry goes in with the movement, in the same transaction, carrying the movement's id
  with `:movement` appended so a retry cannot double the trail either.

### On the device

`completeTransaction` saves locally first and then uploads - the local record never depends on the
upload. On success the notice says the movement is in the shared records; on a flag it says what
was flagged and writes it to the audit trail; on failure the movement stays on the device marked
`pending` and the notice says it is not shared yet. The queue that retries on its own is step 4.

### Verification, 2026-09-18 (live in Veri-Gate Dev)

- A scan driven through the app's own screens (G0005 / E1001, Vehicle IN) arrived as movement 8
  with the driver name, VIN, plate and device name filled in, and displayed at the New York gate
  time it was recorded.
- The same movement sent twice: one row, second answer `alreadyRecorded`.
- An OUT claiming "Authorized" for a driver with no authorization: stored, flagged
  `authorization_expired`.
- An unknown barcode G0042: stored, vehicle created as `inbound_scan`, tied to movement 6.
- A movement timed 20 hours earlier: stored with `delayed`.
- Employee E9999: refused, "Employee E9999 is not in the shared roster."
- `update movements set note = ...` on the new row: refused by the append-only trigger.
- Search from the console then showed all 8 movements from the shared database.
- Tests: 52 API tests (24 new for the write path), 231 static tests (12 new for the client),
  both browser suites, validator 113/113.
