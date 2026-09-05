# Veri-Gate V0.8 — Operator Manual

**Review build.** Data is stored in the browser or on the phone only. Nothing is shared between
devices yet, and nothing connects to a server. That comes next.

---

## Two ways to open it

**On a phone or handheld** you get the **scanner only**. No Supervisor, no Search. That is
deliberate — a gate operator should not be able to wander into the supervisor console mid-shift.

**On a computer** you get the **full console**: Scanner, Supervisor, and Search.

The app decides from the screen size. You can force it either way by adding to the address:

- `?shell=scanner` — scanner only
- `?shell=console` — everything

Once opened that way, the device remembers. That is how a handheld gets set up: open the scanner
link on it once.

---

## Test values for review

| Employee | Name | State |
|---|---|---|
| `E1001` | Nina Patel | Authorized |
| `E1002` | Marcus Reed | Authorized, licence expires within 30 days |
| `E1003` | Tyrone Brooks | **Not** authorized — use to see the blocked path |
| `E1004` | Maria Torres | Authorized |
| `E1005` | Phil Grant | **Licence expired** — always blocked for OUT |

| Vehicle barcode | Vehicle |
|---|---|
| `G0001` | 2022 Ford Transit, white, TRK-8877 |
| `G0002` | 2021 Toyota Camry, silver, NJK-2214 |
| `G0003` | 2019 Ford Fusion, blue, YARD-104 |
| **Any unused code** (e.g. `G9001`) | Not in inventory — use to see provisional creation |

| Approver | Role | Can approve an override? |
|---|---|---|
| `S1001` Morgan Lee | Supervisor | Yes |
| `S2040` Jordan Wells | Fleet Lead | Yes |
| `S3090` Casey Rowe | Scanner | **No** — deliberately below the line |

---

## The scanner, step by step

1. **Driver** — scan or type the employee number. Veri-Gate shows the name, licence status and
   whether they are authorized.
2. **Vehicle** — scan or type the barcode. Known vehicles show make, model, colour, VIN and plate.
3. **Direction** — Vehicle IN or Vehicle OUT.
4. **Review and submit.**

After submitting, the scanner returns **straight to the home screen**. There is no confirmation
step and no extra tap. This was changed in this release.

If a scan will not read, **Manual entry** is available at both the driver and vehicle steps. The
record shows whether each value was scanned or typed.

---

## What is new in V0.8

### Unknown vehicles arriving are accepted

Scan a barcode that is not in inventory, choose **Vehicle IN**, and it goes through. The vehicle
is created automatically. The operator is not asked to approve anything and is not interrupted.

*Try it:* driver `E1001`, barcode `G9001`, Vehicle IN.

### The same vehicle cannot leave

Try `G9001` again with **Vehicle OUT**. It is refused:

> Vehicle OUT blocked. Vehicle G9001 has an incomplete inventory record. A supervisor must
> complete the vehicle record first.

**The driver being authorized does not matter.** Being allowed in never means being authorized
out. There is no supervisor override for this block, because the missing information is about the
vehicle, not the driver.

### Supervisors see what needs completing

**Supervisor → Vehicles → Vehicles Awaiting Completion.** Every auto-created vehicle is listed
with what is missing and a **Complete record** action. Fill in the details and the vehicle
becomes normal inventory — and can then leave.

### Overrides require Fleet Lead or above

When a driver is not authorized, Vehicle OUT is blocked and an approver ID is requested.

*Try it:* driver `E1003`, vehicle `G0003`, Vehicle OUT, then enter `S3090`. It is refused:

> S3090 / Casey Rowe holds Scanner and cannot approve a Vehicle OUT override. Fleet Lead or above
> is required.

Enter `S2040` instead and it is approved for nine hours. Both the approval and the refusal are
recorded.

### Scanner and console are separate

Described above. Same application, same data.

---

## The supervisor console

**Drivers** — roster, licence expiry warnings at 30, 15 and 5 days, expired licences, and
temporary authorizations individually or in bulk. Drivers are records, not logins.

**Vehicles** — the incomplete-inventory queue, then full inventory. Vehicles are removed from
active use rather than deleted, so history stays intact.

**Devices** — each handheld registered to a gate, or a floater assigned at the start of a shift.
A device that is not Active cannot scan.

**Users** — staff accounts and what each can do. Separate from drivers.

**Search** — every movement by driver, vehicle, plate, VIN, gate or date range.

---

## Known boundaries of this build

These are expected, not defects:

- **Data lives on the device.** Two phones will not see each other's movements. The shared
  database exists but the app does not talk to it yet.
- **No login.** Anyone opening the app has full access to whatever shell they open. Real
  authentication is designed but not built.
- **Offline behaviour is not implemented yet.** The agreed design — keep working offline, store
  locally, upload when the signal returns, mark those movements as delayed — is next.
- **The Android app is a debug build.** Fine for sideloading and demos, not a Play Store release.
- **The scanner trigger is untested on an XCover.** It has been tested on a standard Android
  phone. The hardware scan button behaves as a keyboard, which should work, but that has not been
  confirmed on the rugged device.

---

## Installing the Android app

1. Download the APK link.
2. Open it on the phone. Android will warn about installing from an unknown source — allow it for
   whichever app you downloaded with. This is normal for any app not from the Play Store.
3. Install, then open **Veri-Gate**.

The app runs entirely on the phone, so it works with no signal.
