# CR-V09-API-DESIGN-001 — GateFlow API surface, auth, and offline model

**Status:** DESIGN ONLY. No code, no AWS resources. For review before anything is built.
**Date:** 2026-09-03
**Depends on:** CR-V08-AWS-DEV-ENV-001 (database + schema), Patrick creating `gateflow-dev`

---

## 1. What this replaces

Today `app.js` reads and writes `localStorage`. That means one device, one browser, no sharing,
and no enforcement — every rule is a UI convention. The API turns GateFlow into a system:
shared data, real identity, and rules enforced where the client cannot reach them.

---

## 2. The decision that shapes everything else: offline behaviour

**Open question #7 is still unanswered and it is now blocking.** A gate loses signal. What may
the handheld still do?

This is not a technical detail. It determines the API contract, the client, and the risk model.

### Option A — Offline IN, never offline OUT *(recommended)*

The handheld queues inbound movements locally and replays them when signal returns. Outbound
movements require a live server decision and are refused offline.

The reasoning is Patrick's own rule. `Allowed IN != Authorized OUT` exists because letting a
vehicle *in* is low-risk and letting one *out* is not. An offline device cannot know whether a
driver's authorization was revoked five minutes ago, whether a licence expired, or whether a
vehicle's record is still provisional. Deciding OUT offline means guessing about exactly the
things the system exists to control.

- Gate keeps working for arrivals during an outage.
- No vehicle leaves on stale data.
- Cost: departures stop during an outage. **Patrick must accept this explicitly.**

### Option B — Offline OUT against a cached snapshot

The device caches authorizations and vehicle status, decides locally, and flags the movement as
offline-decided for supervisor review.

- Gate keeps working entirely.
- A revoked driver or an incomplete vehicle can leave, and it is only caught after the fact.
- Needs cache TTL, conflict rules, and a review queue — materially more work.

### Option C — No offline at all

Simplest. Any outage stops the gate completely. Almost certainly unacceptable at a real site.

**Recommendation: A for the pilot.** It is the smallest thing that is honest about risk. If
Cavalry's outages turn out to be frequent or long, B becomes a real conversation — but that
should be driven by observed data, not assumed.

**Ask Patrick:** how long can a gate be offline, and is stopping departures during an outage
acceptable?

---

## 3. Identity and authentication

Patrick, 2026-08-12: *"how are these users logging in? There is no fields to add a username and
password."* Nothing today answers that.

### Model

- **Amazon Cognito user pool** for application users. Username + password, forced reset on
  first login, MFA available but not mandatory for the pilot.
- **Roles as Cognito groups**, matching `app_role`: Scanner, Fleet Lead, Supervisor, Manager,
  Admin.
- **Drivers are not users.** They never authenticate. This is already enforced in the schema and
  in the UI copy, and it stays that way.
- **The operator logs in, not the device.** A shared device credential would make every audit
  entry say "the handheld" instead of naming a person, which defeats the audit trail. The device
  is recorded as metadata on the movement, which the schema already supports.

### Abilities

Patrick, 2026-08-12 (`Role ability`): each ability should be assignable per user as
**Restricted / View only / Assign**, rather than fixed per role.

The role gates the coarse shape; the ability matrix refines it per user. Both are enforced
server-side. The V0.8 prototype already models this in the UI — the API makes it real.

**Server-side enforcement is the point.** The shell split is presentational; a Scanner-role token
must be rejected by the API when it calls a supervisor endpoint, regardless of what the client
shows.

---

## 4. Shape

**API Gateway (HTTP API) → Lambda → Aurora via the RDS Data API.**

The Data API is already enabled on the dev cluster, so Lambda needs no VPC attachment, no NAT
gateway, and no RDS Proxy. That removes the single most expensive and fiddly piece of a
private-database serverless stack. If connection volume ever outgrows it, moving to Lambda-in-VPC
with RDS Proxy is a deployment change, not a rewrite.

Every endpoint is a thin handler: authorise, validate, delegate to SQL. The business rules that
matter already live in the database as constraints and triggers, so a handler bug cannot release
a provisional vehicle.

---

## 5. Endpoints

Auth: `Authorization: Bearer <Cognito JWT>` on everything except `/health`.

### Movements — the hot path

```
POST /movements
```
The only endpoint the handheld needs in normal operation.

```json
{
  "idempotencyKey": "uuid-generated-on-device",
  "direction": "IN" | "OUT",
  "driverEmployee": "E1003",
  "barcode": "G0001",
  "location": "Division Street",
  "deviceId": "D0001",
  "driverEntryMethod": "scanner_field" | "manual",
  "vehicleEntryMethod": "scanner_field" | "manual",
  "note": "",
  "occurredAt": "2026-09-03T18:22:04Z"
}
```

**`idempotencyKey` is mandatory.** The device generates it before the first attempt and reuses it
on every retry. Without it, a replayed offline queue creates duplicate movements — the most
likely data-integrity failure in the whole system. The server stores it and returns the original
result on a repeat.

**`occurredAt` is the device's time, not the server's.** A movement queued offline happened when
it happened. The server records both and flags clock skew beyond a threshold rather than silently
trusting either.

Responses:

| Code | Meaning |
|---|---|
| 201 | Recorded |
| 200 | Idempotent replay; original result returned |
| 409 | Blocked — provisional vehicle on OUT, expired licence, unauthorized driver |
| 422 | Unknown barcode on OUT (a provisional record is created only on IN) |

A 409 carries a machine-readable `reason` so the handheld shows the operator the right message.

### Supervisor and console

```
GET    /vehicles?status=provisional        incomplete-inventory queue
PATCH  /vehicles/{id}                      complete a provisional record
GET    /vehicles /drivers /devices /users  listing with filters
POST   /drivers  PATCH /drivers/{id}
POST   /authorizations                     override; server checks rank >= Fleet Lead
DELETE /authorizations/{id}                revoke
GET    /movements?vin=&plate=&employee=&location=&from=&to=
GET    /audit?type=&from=&to=
POST   /users  PATCH /users/{id}           create, suspend, soft-delete (60-day retention)
```

`GET /movements` carries the supervisor search Patrick uses. It is the endpoint whose query
flexibility justified Postgres over DynamoDB.

---

## 6. Client migration — keep the prototype working

The client change is the risky part, because `localStorage` calls are spread through `app.js` and
the 90-scenario validator depends on them.

**Introduce a storage adapter.** One module with the same shape as today's state access, and two
implementations: `local` (current behaviour) and `api` (network). Selected at runtime.

This means:

- The validator keeps running against `local` and stays green throughout the migration, so it
  remains a real regression net rather than something switched off during the risky part.
- The API client can be built and tested without breaking the demo Patrick can already show.
- Cutover is a flag, and rollback is the same flag.

Doing it the other way round — rewriting `app.js` to call the network directly — throws away the
only regression coverage we have at exactly the moment it is most needed.

---

## 7. What gets enforced where

| Rule | Client | API | Database |
|---|---|---|---|
| Provisional vehicle cannot go OUT | message | 409 | **trigger** |
| Override requires Fleet Lead+ | hides control | 403 | **CHECK** |
| Expired licence blocks OUT | message | 409 | — |
| Role/ability permissions | shell + UI | **403** | — |
| Duplicate movement on replay | idempotency key | **dedupe** | unique index |

The database column is the one that matters. Everything to its left is user experience.

---

## 8. Sequence

1. Patrick creates the accounts *(blocking)*
2. Answer open question #7 — offline model *(blocking this design)*
3. Cognito pool + roles
4. Lambda handlers, `POST /movements` first — it is the hot path and the riskiest
5. Storage adapter in the client, `local` still default
6. Validator green against `local`; new integration tests against `api`
7. Flip dev to `api`, beta test
8. Release gate, then production

## 9. Open questions this design cannot answer

- **#7 offline duration and whether stopping departures is acceptable** — blocking
- **#8 retention** — affects audit and movement archiving
- **#2 QR contents** — affects barcode handling
- Whether Cavalry needs multi-site data separation on day one

## 10. Not authorised by this document

No AWS resources, no code, no deployment. Design for review.
