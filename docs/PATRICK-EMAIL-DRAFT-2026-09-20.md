# Draft email to Patrick — 2026-09-20

**Every link below was opened and checked today. All return 200.** Paste as plain text or HTML; the
links are ordinary public web addresses with no login, no redirect and no attachment, so they open
in any mail client on a phone or a computer.

---

**Subject:** Veri-Gate — the gates and the office now share one set of records

Patrick,

Since we last spoke, the biggest piece is done: **every gate phone and every office computer now
work from the same records.** A vehicle scanned at a gate is in the log for everyone, without anyone
typing it again.

Everything is on one page:

**https://gateflow-prototype.vercel.app/review.html**

That page has the app, the manual, the Android file and the two walkthrough videos, each behind its
own clearly labelled button so nothing gets clicked by mistake.

If you only have a few minutes, these are the two worth opening:

**Try it yourself —** https://gateflow-prototype.vercel.app/index.html?demo=1
Opens in any browser, no login. On a computer you get the full supervisor console; on a phone you
get the gate scanner, exactly as an operator sees it. The records in it are made up and stay in your
browser.

**The manual —** https://gateflow-prototype.vercel.app/manual.html
Rewritten this week. It now covers signing in and what each role may do, the shared records and what
happens when a phone has no signal, printing a vehicle label, and the new Actions menu on driver
rows.

**What changed:**

- **One set of records.** Every gate and every office computer read the same database.
- **No signal is no longer a problem.** A phone with no coverage keeps working and holds what it
  recorded. When the signal returns it sends everything, in the order it happened. Days, not
  minutes.
- **Everyone signs in, and the record says who did what.** Changes are recorded under a person's
  name instead of "Supervisor Console".
- **Roles are enforced by the service, not by the screen.** A gate phone records movements; a Fleet
  Lead can also authorize a driver; a Supervisor can also edit one; only an Admin touches the
  override switches and the logins. Changing that on a phone changes nothing.
- **You manage the logins yourself**, from a Users tab. Turning one off cuts that person off on
  every device immediately.
- **From your 13 September call:** one Actions menu per driver row instead of the three-line block,
  the one-line authorization list, the label print after saving a vehicle, the keyboard no longer
  covering what the operator is typing, and the date box that refuses a bad year.

**Where this stands.** It works end to end, and it is running in the development account — the one
we prove things in before they move to the live account. That move is a couple of days and changes
nothing about how the app works.

**What I need from you.** Two things:

1. **The driver list** — employee number, name, licence expiry. Vehicles look after themselves,
   because a phone that meets an unknown vehicle at the gate creates its record on the spot. A
   driver is different: he has to be on the roster before anyone can authorize him. If that list is
   hard to get hold of, tell me on our call — there are a couple of ways round it and they change
   what we build next.
2. **Which gate goes first**, and roughly when. One gate running for a week tells us things no
   amount of testing will.

I am also putting together a short walkthrough of the office side — how the records come in from
the gates and what a supervisor sees. I will send that separately once it is cut.

Raul

---

## Notes for Raul — not part of the email

**Every link verified today:**

| Link | Status |
|---|---|
| `review.html` | 200 |
| `manual.html` | 200 |
| `index.html?demo=1` | 200 |
| `Veri-Gate-V0.8.apk` | 200 |
| customer video mp4 | 200 |
| walkthrough video mp4 | 200 |

**Why the videos are not linked directly.** They are on the review page behind their own buttons,
where they play inline. A 13 MB and a 16 MB MP4 linked straight from an email will often download
rather than play, and some mail scanners baulk at large media links. Sending him to the page is
more reliable.

**Why the Android file is not linked directly either.** It is on the review page. A direct `.apk`
link in an email is the single most likely thing to be stripped by a mail filter — and it only
works if he opens the mail on the phone itself.

**The service video is deliberately not promised with a date.** Three of its eleven frames are
captured. The last line of the email says it is coming without committing to when.

**If he asks whether this is still a prototype:** it is a working system in a development account.
The honest sentence is "it is finished and proven, it just is not in its permanent home yet."
