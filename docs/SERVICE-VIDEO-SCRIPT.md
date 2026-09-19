# The service video — script and shot list

**Audience:** Patrick.
**Argument:** this is real infrastructure, not a prototype.
**Rule:** the argument is made by showing things a prototype cannot do. No vendor name until the
last frame.

Everything is on a computer. The phone appears only as the thing whose work shows up on the
computer, which is the point.

---

## Why most of this has to be recorded live

The demo link runs with no sign-in, as an Admin, with nothing hidden, and records changes as
"Supervisor Console". That is correct for a demo — but it means the scenes that carry the argument
cannot be faked from it. A person's name on a change, real logins with real roles, a phone's scan
arriving: none of those exist without a real signed-in session.

Narrating "the server enforces roles" over a demo screen would be telling, not showing — and Patrick
can open the demo himself and see it does no such thing. So the scenes marked **LIVE** below are
recorded against the real service, signed in.

**What is needed from Raul:** sign in to the console as `raul`, and have the gate phone to hand
signed in as `d0001`. About fifteen minutes. Claude drives the capture from there and never handles
either password.

---

## The shot list

| # | Scene | Shot | Proves |
|---|---|---|---|
| 1 | Sign in to continue | **LIVE** | The console is not open to whoever opens the page |
| 2 | Signed in, name in the corner | **LIVE** | There is an identity behind every action |
| 3 | A scan on the phone arrives | **LIVE** | Two devices, one set of records |
| 4 | The gate log, with who recorded each | **LIVE** | The record answers "who", not just "what" |
| 5 | The Users tab | **LIVE** | Access is administered, given and taken away |
| 6 | Vehicles the gate created on its own | auto | The list fills itself as the gates run |
| 7 | Authorize on the computer | auto | Office decisions reach the gate |
| 8 | The phone with no signal | **LIVE** | Nothing is lost when the network is |
| 9 | Per-location override switches | auto | Exceptions are deliberate and recorded |
| 10 | Where this runs | auto | The closing frame, and the only place a vendor is named |

A scene showing a Fleet Lead being refused was cut: it would have needed a throwaway Fleet Lead
login made only for the recording. The same point — that roles are decided by the service and not by
the screen — is made in scene 5 instead, which uses logins that already exist.

---

## Narration

Written for the same voice as the other two videos. Spell out anything the reader should hear as
letters: "V I N", "E one zero zero one", "D zero zero zero one".

### 1 — Sign in to continue *(LIVE)*

> This is the office side of Veri Gate, on a computer. It does not open to whoever opens the page. It
> asks who you are first.

**Shot:** the console at a clean browser, showing the sign-in panel. Do not film the password being
typed.

### 2 — Signed in *(LIVE)*

> Signed in, the console knows who is working. From here, every change carries a name. Not a
> console, not a device. A person.

**Shot:** the console after sign-in, with the name visible.

### 3 — A scan arrives *(LIVE)*

> A vehicle is scanned at the gate, on the phone. Nobody types it in again. It is here, on the
> computer, because the phone and this console are looking at the same records.

**Shot:** gate log before, the scan on the phone, the same log after. This is the single most
important shot in the video; it is worth doing twice to get it clean.

### 4 — Who recorded it *(LIVE)*

> The log answers more than what moved and when. It answers who recorded it, and from which gate.
> That is the difference between a list and a record.

**Shot:** the gate log with the uploader column readable.

### 5 — Who gets in, and what they may do *(LIVE)*

> Access is given here, and taken away here. Each person has a role, and the role is not a matter of
> hiding buttons on a screen. A gate phone records movements. A Fleet Lead can also authorize a
> driver. A Supervisor can also edit one. The service checks that on every single request, so
> changing it on a phone changes nothing.
>
> A new person gets a one-time password and chooses their own. Turn a login off, and that person
> stops working on every device they touch, not just this one.

**Shot:** the Users tab with the existing logins and their roles visible. **Never film the
temporary password** — it appears once. Do not create a login during the recording.

### 6 — The gate fills the list *(auto)*

> Nobody typed these in. A vehicle nobody had seen before arrived at the gate, the phone recorded
> the movement and created the record on the spot. The inventory fills itself as the gates run.

### 7 — Decided here, honoured there *(auto)*

> A driver is authorized on the computer, for a set number of hours. The gate phones have it within
> a few minutes, without anyone walking anything out to them.

### 8 — When the signal goes *(LIVE)*

> Coverage is not guaranteed at a gate. So the phone does not depend on it. With no signal it keeps
> working exactly as it does now, and holds what it recorded. When the signal comes back, it sends
> everything, in the order it happened. A phone can be out of touch for days without losing a scan.

**Shot:** phone in airplane mode, record two movements, restore signal, both appear on the computer
in order. Worth rehearsing once before recording.

### 9 — Deliberate exceptions *(auto)*

> Every location can be given an override, and every one is off until somebody turns it on. When one
> is used, it is saved as an override, never as an authorization, and the record says so.

### 10 — Where this runs *(auto, closing)*

> The records are not on the phones. They are in a database that is backed up, that survives a phone
> being lost or wiped, and that every gate and every office computer reads from. It runs on Amazon
> Web Services, in an account that belongs to Veri Gate.

**Shot:** a plain closing card. This is the only place the vendor is named.

---

## Things not to film

- Any password being typed, including on the phone.
- The one-time password in the Users tab — it appears once, and it must not be in a file that gets
  sent anywhere.
- Real driver names or employee numbers, if any real ones have been loaded by then.
