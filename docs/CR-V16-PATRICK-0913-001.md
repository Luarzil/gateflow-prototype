# CR-V16-PATRICK-0913-001 — Patrick's 2026-09-13 list

**Branch:** `change/CR-V16-PATRICK-0913-001`, stacked on `change/CR-V15-BARCODE-INTEGRITY-001`
**Source:** Patrick Amaral, email "Email for you, not AI", received 2026-09-12 23:02 ET
**Date:** 2026-09-13

Patrick asked that this not go ahead of the AWS work. It was done after the dev database had moved
into the Veri-Gate Dev account, at the owner's direction.

## What changed

| # | Patrick's item | What was done |
|---|---|---|
| 1 | Licenses Approaching Expiration still says "Expired - Authorizations Blocked" | The panel uses the same short labels as the roster (Exp, 5d, 15d, 30d), with the full wording on hover. CR-V14 changed only the roster. |
| 2 | Active Driver Authorizations is empty, "but if you look left there are 2 active drivers", and the count reads zero | Not a counting fault. Both panels read the same authorizations. **Active** on the roster means a driver may work, not that they are authorized today, and the seed data has exactly two active drivers without an authorization. The panel now says so in one line, recounting from the roster as Patrick suggested: "3 authorized now. 2 active drivers are not authorized today." If the two counts ever disagree, it says that instead. |
| 3 | Remove the Supervisor Locations and Label Printer sections | Removed. No printer tab was added, because there is no printer to configure yet. |
| 4 | Sort Supervisor Drivers and Vehicles by recent activity | Both tables are sorted by the latest gate movement, newest first, then by name or barcode for anything that has never moved. |
| 5 | Do not display the employee ID during any scan operation | The scanned value in the employee # and approver fields is drawn as dots (`-webkit-text-security`, display only). The review step, blocked-OUT screen, approver status and saved notice name the person instead. Tapping a field to type removes the mask, because Patrick also said the operator "will need to see what he is typing in during a manual entry". |
| 6 | Remove the scanner's Gate activity | Removed. The three counts above it stay; they carry no identities. |
| 7 | Limit search to 50 rows, with an option for the next 50 | The search renders 50 rows and a **Show next 50** button. A new search starts at the first page again. The data is still local, so this pages the rendering. The AWS API will page the query with the same size, which is the resource saving Patrick is after. |
| 8 | A saveable, printable search with the person's name, date, time of the search and the criteria | **Print** beside Clear, with a **Your name (for printouts)** field. Printing needs a name. The page prints the results with a footer: criteria, when the search ran, rows printed out of rows matched, and who printed it and when. It is the browser's own print dialog, which also saves as PDF on the user's machine, so nothing is generated on a server. Each print is recorded in the audit trail. |
| 9 | Dates in six-digit format | Every date is MM/DD/YY, with the time after it where there is one. The formatter is pinned to en-US, because the order is the requirement. The Search date box is a native date picker and is unaffected. |
| 10 | A manager-only override toggle, per location, for scanned badges of non-revoked drivers | An **Admin** tab lists each active location with an override switch, all off by default. See below. |

## The location override

With a location's switch on, a Vehicle OUT that would otherwise stop for a Fleet Lead goes
through when **all** of these hold:

- the driver's employee # was **scanned**, not typed;
- the driver is active;
- the driver's license is not expired (the license check runs first, unchanged);
- nobody revoked the driver's authorization today.

The movement is saved as **Location override**, never as Authorized, and a
`location_override_exit` audit event records the driver and vehicle. No daily authorization is
created. Turning a switch on or off asks for confirmation and writes `location_override_enabled`
or `location_override_disabled`. When the override does not apply because the entry was typed or
the driver was revoked today, the blocked-OUT screen says why.

Assumptions to confirm with Patrick:

1. **"Not revoked" includes a supervisor revoking the driver today.** Without this, Deauthorize all
   would not stop anyone at a location with the override on.
2. **The switch stays on until someone turns it off.** It does not reset overnight.
3. **Admin, not a separate Manager role.** Since CR-V11 there is one Admin. In this build anyone at
   the console can flip the switch; the Admin-only restriction arrives with AWS sign-in, and the
   rule itself belongs in the server as well as the interface.

## Not done

- **Device power button under App Lock.** A Samsung/Verizon device-management question, not
  application code.
- **Scanner layout after the Gate activity removal.** Patrick will look at it when testing restarts.

## Verification

- Static suites: 183 passing, including `tests/v16-patrick-0913.test.js` (39 new) and the
  regression suite, still at exactly 84 cases.
- Browser suites: `v07-presentation.browser` and `v07-provenance.browser` pass. The presentation
  suite now asserts the approver is named and that the ID is not shown.
- Click-path validator: 113 scenarios, 18 of them new for this change.
