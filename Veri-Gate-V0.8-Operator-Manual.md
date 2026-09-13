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
| **Any unused code** (e.g. `G9001`) | Not in inventory — use to see it added automatically |

| Approver | Role | Can approve an override? |
|---|---|---|
| `S1001` Morgan Lee | Supervisor | Yes |
| `S2040` Jordan Wells | Fleet Lead | Yes |
| `S3090` Casey Rowe | Scanner | **No** — deliberately below the line |

---

## The scanner, step by step

1. **Vehicle** — scan or type the barcode. Known vehicles show make, model, colour, VIN and plate.
2. **Driver** — scan or type the employee number. Veri-Gate shows the name, licence status and
   whether they are authorized.
3. **Direction** — Vehicle IN or Vehicle OUT.
4. **Review and submit.**

After submitting, the scanner returns **straight to the home screen**. There is no confirmation
step and no extra tap. This was changed in this release.

If a scan will not read, **tap the field** and the keyboard appears. There is no separate manual
entry button any more: the field is the manual path. The keyboard stays out of the way until you
ask for it, so the scanner trigger works the moment a step opens.

The record still shows whether each value was scanned or typed.

---

## What is new in V0.8

### Unknown vehicles are added automatically

Scan a barcode that is not in inventory and the movement goes through. The vehicle is added to
inventory exactly as if a supervisor had entered it. The operator is not asked to approve
anything and is not interrupted.

This works in **both directions**. Vehicles move around a national inventory constantly, so a
vehicle nobody has seen before is ordinary traffic, not an exception. It comes in like any other
vehicle and it leaves like any other vehicle. The purpose is the log.

*Try it:* driver `E1001`, barcode `G9001`, Vehicle IN. Then run the same barcode again with
Vehicle OUT — it goes straight through and both movements are recorded.

### The gate log shows what arrived on its own

**Supervisor → Vehicles → Vehicles Added By Scan.** Every vehicle the gate added automatically
is listed here, with any details still blank.

This is a **record, not a task list**. Nothing is waiting on a supervisor and nothing is held up.
A supervisor can fill in the make, model and plate whenever they get to it, using the same Edit
button as any other vehicle. The vehicle works either way.

### Users can be edited

Every row in **Supervisor → Users** has an **Edit** button. It opens the same form used to add a
user, pre-filled, and saving updates that user in place rather than creating a duplicate. A role
change is recorded in the audit trail.

Roles are **Scanner, Fleet Lead, Supervisor, Admin**. There is no separate Manager role — one
Admin account is issued, and that admin creates everyone else.

### Overrides require Fleet Lead or above

When a driver is not authorized, Vehicle OUT is blocked and an approver ID is requested. This is
about the **driver**, not the vehicle.

*Try it:* driver `E1003`, vehicle `G0003`, Vehicle OUT, then enter `S3090`. It is refused:

> S3090 / Casey Rowe holds Scanner and cannot approve a Vehicle OUT override. Fleet Lead or above
> is required.

Enter `S2040` instead and it is approved. Both the approval and the refusal are
recorded.

### Typed barcodes are checked, scanned ones are not

A vehicle arriving that nobody has seen before is ordinary traffic. Scan it and it goes through
with no interruption, exactly as before.

Typing a barcode by hand is the one case that gets checked, because that is the only place a
digit can be mistyped:

- **A part-typed barcode is refused.** `G00` is not a vehicle, it is half a barcode. Veri-Gate
  asks for all four digits rather than quietly filling in the rest. It used to turn `G00` into
  `G0000` and create a vehicle under a barcode nobody had entered.
- **A complete typed barcode that is not in inventory shows a caution.** *Check this barcode.
  G0044 is not in inventory. Continue if it is right.* It does **not** stop you. If the vehicle
  really is new, carry on; the operator is the only person who still remembers what they typed.

### Supervisors see typed barcodes that were never verified

**Supervisor -> Vehicles -> Vehicles Added By Scan.** A vehicle created from a typed barcode is
marked **Check barcode** and offers **Barcode is correct**. Confirming it, or opening the record
and correcting the barcode, clears the mark. Both are recorded.

Vehicles added by an actual scan are not marked. Nothing is waiting on a supervisor for those.

### Employee numbers can contain letters

`AB123` and `J5000` are accepted and kept exactly as entered. Purely numeric numbers still
resolve the way they always did, so `1003`, `E1003` and `EMP-1003` all mean the same driver.

### Authorizations can run longer than nine hours

Both the gate override and **Supervisor -> Drivers** now offer 9 Hours, 12 Hours, Today, 48 Hours
and 3 Days. Nine hours is still the default, so nothing changes unless you choose otherwise.

### Records open from their own identifier

Click a **VIN** to open a vehicle, a **User ID** or name to open a user, a **Device ID** to open a
device, a **driver name** to open a driver. Editing and removing happen inside that record rather
than from buttons on the row, so the tables are narrower and there is one way in instead of two.

### Adding a vehicle needs only a VIN

Make, model, year, colour, plate and barcode are all optional. If you leave the barcode blank,
Veri-Gate assigns the next free one, because a vehicle with no barcode could never be found at
the gate. This does not change what happens when an unknown vehicle is scanned in at a gate.

### Supervisor tables fit the screen

Column headings are abbreviated -- Emp #, Lic Exp, Auth, Auth Exp -- and the tables no longer
need a horizontal scrollbar to read.

### The scanner does not show employee numbers

Once a badge is scanned, the scanner shows the driver's **name**, never the employee number. The
number in the box is drawn as dots, the review step and the blocked-OUT screen name the driver, and
an approver is shown by name and role, not by ID. The **Gate activity** list is gone from the
scanner home. An ID that can be read off the screen can be typed in later to let someone out.

Tapping the box to type is different: the operator can see what they are typing, as before.

### Location override (Admin tab)

The **Admin** tab has one switch per location. All of them start **Off**. When a location's
switch is on, a driver whose badge is **scanned** there can leave without a daily authorization,
provided the driver is active, the licence is current, and nobody revoked the driver's
authorization today. A **typed** employee number is never covered; it still needs a Fleet Lead or
above. Every exit the override allows is saved as **Location override**, not as Authorized, and
turning a switch on or off is confirmed and recorded.

In this review build anyone at the console can flip the switches. Once sign-in moves to AWS, only
the Admin will be able to.

### Search shows 50 at a time, and prints

Search shows the first **50** matching movements, with **Show next 50** under the table for more.
**Print** sits beside Clear. Type your name in **Your name (for printouts)** first. The printout
carries the search criteria, when the search ran, how many rows are on the page, and who printed it
and when. The print window can also save the page as a PDF, on your own computer, with no server
involved.

### Dates are MM/DD/YY

Every date on screen reads like 11/22/26, with the time after it where there is one. The date box
in Search is a date picker, so how you enter a date there does not change.

### Scanner and console are separate

Described above. Same application, same data.

---

## The supervisor console

**Drivers** — roster, most recent gate activity first, licence expiry warnings at 30, 15 and 5
days, expired licences, and temporary authorizations individually or in bulk. Beside the roster,
**Active Driver Authorizations** lists who is authorized right now and says, in one line, how many
active drivers are not. Drivers are records, not logins.

**Vehicles** — vehicles added by a gate scan, then full inventory, most recent gate activity
first. Vehicles are removed from active use rather than deleted, so history stays intact.

**Devices** — each handheld registered to a gate, or a floater assigned at the start of a shift.
A device that is not Active cannot scan.

**Users** — staff accounts and what each can do. Separate from drivers.

**Admin** — the scanned-badge override switch for each location, described above.

**Search** — every movement by driver, vehicle, plate, VIN, gate or date, 50 at a time, with Print.

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
