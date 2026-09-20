# Veri-Gate V0.8 — Operator Manual

**Every gate and every office computer now share one set of records.** Everyone signs in, the
record says who did what, and what each person may do is decided by the service rather than by the
screen in front of them. A phone with no signal keeps working and catches up when the signal
returns.

This is running in the development account, which is where it is proved before it moves to the live
one. Nothing about how it works changes in that move. See **Known boundaries** at the end for what
is genuinely still outstanding.

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

## Signing in, and what each person may do

**The console asks who you are.** Open it and it shows a sign-in panel before anything else,
because the console changes shared records and every change is recorded under a person's name.

**A gate phone is signed in once and stays signed in.** The Admin signs it in with its own login —
one per phone, not one per operator — using **Phone sign-in** at the bottom of the scanner screen.
It stays signed in for about six months. If that ever lapses the phone **keeps scanning** and holds
its records until somebody signs it in again; nothing is lost.

**What each role may do:**

| Role | Can do |
|---|---|
| Gate phone | Record movements, add vehicles met at the gate, send Fleet Lead gate approvals |
| Fleet Lead | Also search the gate log, and authorize or revoke drivers |
| Supervisor | Also add and edit drivers and vehicles |
| Admin | Also the per-location override switches, and the logins |

The console hides what a role may not use, but that is only tidiness. **The service checks the role
on every request**, so changing anything on a phone changes nothing — the refusal comes from the
service, with the reason.

**Logins are managed in the Users tab.** The Admin adds a person and picks their role. The app shows
a one-time password **once** — hand it over, and the person chooses their own when they first sign
in. An Admin can change someone's role, issue a new one-time password, or turn a login off, which
cuts that person off on every device they use, not just the one in front of them.

---

## The records are shared

**Every gate and every office computer read the same records.** A movement scanned at one gate is in
the log for everyone. A driver authorized in the console reaches the phones within about five
minutes.

**No signal is not a problem.** The phone works exactly as it does with signal, and holds everything
it recorded. When the signal returns it sends it all, in the order it happened. A phone can be out of
coverage for days without losing a scan. Movements that arrive late are marked as delayed, so the log
tells the truth about when each was recorded and when it arrived.

**The records survive the phone.** They are in the database, not on the handheld, so a lost, broken
or wiped phone costs no history.

**The gate log names both.** Search shows a **Gate device** column — which gate recorded the
movement — and a **Recorded by** column, the login that sent it. Movements recorded before sign-ins
existed show `-` rather than borrowing the gate's name.

---

## Printing a vehicle label

Save a new vehicle, or change an existing vehicle's barcode, and the app offers to print its label.
**Print label** prints only the label, on a 4 × 2 inch page; **Not now** closes the box. The label
carries the barcode, the number in large type, the VIN, and the year, make, model and colour when
they are known. Printing is recorded in the history.

The barcode is Code 128, which every handheld and wedge scanner reads.

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

**Users** — the logins people actually sign in with, and the role each one has. Adding, changing a
role, issuing a new one-time password and turning a login off all happen here. Separate from
drivers: a driver is a record, a login is a way in.

**Admin** — the scanned-badge override switch for each location, described above.

**Search** — every movement by driver, vehicle, plate, VIN, gate or date, 50 at a time, with Print.
Signed in, this reads the shared database, so it finds movements from every gate, not only the ones
recorded on the computer you are sitting at. The printout says which it came from.

Each driver row has one **Actions** menu — Edit, Mark inactive or Reactivate, Authorize, Revoke —
so the list stays one line per driver with thousands on it. The name still opens the profile.
Anything that changes a driver asks first.

---

## Known boundaries of this build

These are expected, not defects:

- **It runs in the development account.** That is where things are proved before they move to the
  live one. Before a real gate depends on it, the live account needs backups, an alert when
  something stops, and a database that does not go to sleep when nobody is using it. Nothing about
  how the app works changes in that move.
- **No real driver roster has been loaded.** Vehicles look after themselves — a phone that meets an
  unknown vehicle creates its record on the spot — but a driver has to be on the roster before a
  Fleet Lead can authorize him. Somebody has to supply that list.
- **The Android app is a debug build.** Fine for sideloading and demos, not a Play Store release.
- **The scanner trigger is untested on an XCover.** It has been tested on a standard Android
  phone. The hardware scan button behaves as a keyboard, which should work, but that has not been
  confirmed on the rugged device.
- **A printed label has not been scanned by a gate scanner yet**, and no label printer has been
  chosen. The label is 4 × 2 inches today; that may need to change once the printer is known.

---

## Installing the Android app

1. Download the APK link.
2. Open it on the phone. Android will warn about installing from an unknown source — allow it for
   whichever app you downloaded with. This is normal for any app not from the Play Store.
3. Install, then open **Veri-Gate**.

The app runs entirely on the phone, so it works with no signal.
