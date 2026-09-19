# Questions for Patrick — call of 2026-09-20

Everything open, in the order it matters. The first three decide what we build next; the rest are
small and can be answered in passing.

---

## 1. The driver list — the one thing we cannot create ourselves

**Ask:** who can give us the list of drivers, and in what form?

Vehicles look after themselves. A phone that meets an unknown vehicle at the gate creates its record
on the spot, so the vehicle list fills itself as the gates run. **Drivers do not work that way.** A
driver has to be on the roster before a Fleet Lead can authorize him, so somebody has to hand us:

- employee number, name, and licence expiry date, for each driver;
- ideally which location each one normally works out of.

A spreadsheet is fine. A CSV out of whatever system already holds them is better.

**If nobody can produce it**, say so on the call, because there are two workable answers and they
change what we build:

- **A supervisor types them in.** Realistic for tens of drivers, not for hundreds. Nothing to build.
- **We add "add this driver now" to the gate phone.** A driver nobody has ever seen turns up; the
  phone records the movement and flags it for a supervisor to complete. This is how unknown
  vehicles already work, so it is a known shape — perhaps two days of work.

There is no wrong answer, but we should not guess.

## 2. Which gate goes first, and when

**Ask:** which location, how many phones, and what date are we aiming at?

We need one real gate to run for a week before anyone talks about all four. That week tells us
things no test can: how the scanner behaves on a wet badge, whether a shift hands the phone over,
what the signal is actually like at the gate.

## 3. Who gets which role

**Ask:** by name, who should be an Admin, a Supervisor, and a Fleet Lead?

The system now decides what each person can do, and it is enforced on the server, not just hidden on
the screen:

| Role | Can do |
|---|---|
| Gate phone | Record movements, add vehicles met at the gate, send Fleet Lead gate approvals |
| Fleet Lead | Also search the gate log, authorize and revoke drivers |
| Supervisor | Also edit drivers and vehicles |
| Admin | Also the per-location override switches, and the logins |

Two things worth saying out loud:

- **An Admin is a big deal.** An Admin can turn an override on for a location and can create or
  disable any login. Probably one or two people.
- **A gate phone's login is the phone's, not a person's.** One login per phone, signed in once by
  an Admin, and it stays signed in. That was the choice — worth confirming he agrees, because the
  alternative is every operator signing in at the start of a shift.

---

## 4. Smaller decisions

### The driver Actions menu asks "are you sure"

Mark inactive, Authorize and Revoke each ask before they act; Edit does not. A menu is easier to
set off by accident than a button. **If that is one click too many, it is a one-line change.**

### The label — size and what is on it

No label printer has been chosen. Today the label is 4 × 2 inches and carries the barcode, the
number in large type, the VIN, and year, make, model and colour when we know them. **Once the
printer is known, the size may need to change.** Ask what printer they intend to buy, or whether
they already have one.

### A driver revoked today, and the override switch

Still unanswered from an earlier call. With a location's override switch on, a Vehicle OUT goes
through on a scanned badge without waiting for a Fleet Lead — **except** for a driver whose
authorization was revoked today, who is still stopped. Is that right? The case is a driver revoked
this morning who turns up at the gate this afternoon.

### How long records are kept

The shared database keeps everything. Each phone keeps about three days of its own and lets the
rest go, because the database has it. **Is there a retention rule the company has to meet** — a
year, seven years? It is far easier to set now than later.

---

## 5. What to tell him about where this stands

Not a question, but worth saying plainly so nobody is surprised later.

**It works end to end.** Phones and consoles share one set of records, people sign in, roles are
enforced, and a phone out of signal keeps working and catches up when it comes back.

**It is running in the development account.** That is the account we prove things in. Before a real
gate depends on it, the live account has to be set up: backups, an alert when something stops, and a
database that does not go to sleep when nobody is using it. **That is a couple of days, not weeks** —
nothing about how the app works changes.

**Two things have never been tried on real hardware:** scanning a printed label with a gate scanner,
and typing in a scanner field on the Samsung with its keyboard up. Both are ready to try. Worth
asking whether someone there can try them this week.
