## Summary

Renames the product to Veri-Gate, adds an Android APK build, and produces the review package Patrick needs for his Wednesday meeting with the Verizon integration specialist.

Two commits:

1. `a966798` — Veri-Gate rename and the Capacitor Android build
2. `727bd50` — the V0.8 walkthrough and a committed dev server

## Why now

Patrick had **never seen any V0.8 work** — the production link was still serving V0.7 with none of the provisional-inbound code. His 2026-09-04 reply added a hard deadline: an APK by **Tuesday evening** for a Wednesday meeting with Verizon, with Cavalry testing the same week.

## Veri-Gate

Patrick confirmed on 2026-09-04 that Veri-Gate is the product name, not just the company: *"lets start calling/ identifying what its proper name is, Veri-Gate."*

Renamed across the app title, header, PWA manifest, and window title.

**Internal identifiers are deliberately unchanged.** The localStorage keys, the GitHub repo, and the Vercel project keep their existing names. Renaming those breaks stored demo data, the open PR #7, and the live review URL, for no visible benefit. Worth doing later as its own change, not during a client deadline.

## The APK

Capacitor wrapper producing `com.verigate.gateops`, 4 MB.

The web assets are **bundled inside the package** rather than loaded from a URL, so the app runs with no signal at all. That matters because Patrick's answer on the offline question was that outages *"could be minutes or days"* and *"Enterprise will not tolerate a pause."*

Built with the Android SDK and JDK already installed on the workstation — no new tooling. **Installed and confirmed working on a real Android phone**, showing the scanner shell only, which is the CR-V09 split behaving correctly on hardware.

This is a debug build, appropriate for sideloading and demos. A Play Store release would need a signing key and a release build; not required for Wednesday.

## The walkthrough

Twelve slides, roughly two minutes narrated, as both an HTML deck and a webm video. Every frame is captured from the **real running application** by driving headless Chrome through the actual flows — not mockups.

The arc: scanner-only on a handheld, unknown vehicle accepted on IN without interrupting the operator, straight back to work with no confirmation step, the same vehicle refused on OUT while the driver is fully authorized, the supervisor queue, completion, release, the Fleet Lead rule, and search.

### Two defects caught while building it

**Wrong scenario captured.** The first pass used driver `E1005` for the Fleet Lead slide. E1005's licence is expired in the seed data, and the expired-licence check fires before the override panel — so the frame showed a licence error while the narration described a role refusal. Sending that to a client would have misrepresented the feature. Switched to `E1003`, who is unauthorized but current; the frame now reads *"S3090 / Casey Rowe holds Scanner and cannot approve a Vehicle OUT override."*

**Broken link before it shipped.** `.vercelignore` excluded all of `docs/`, which would have made the walkthrough a 404 for Patrick after deployment. Now keeps `docs/media`.

## Dev server

`tools/dev-server.js` and `.claude/launch.json` are now committed. The app cannot be opened from disk — the service worker and the validator's same-origin iframe both require HTTP — so every session so far improvised a local server. This makes it part of the repo.

## Validation

| Gate | Result |
|---|---|
| Click-path validator | **90 / 90** |
| Static node suites | pass |
| APK on real hardware | installs, launches, scanner shell correct |
| Production link, anonymous | HTTP 200, `<title>Veri-Gate V0.8</title>`, 21 V0.8 rule matches |

The validator needed two assertions updated for the new brand label (`V0.7` → `V0.8`). Those were changed to match the new truth rather than worked around.

## Reviewer notes

- Base is the CR-V09 shell-split branch, so this diff shows only the rename, APK, and walkthrough. PR #7 and the shell split are separate.
- The production alias now serves this build. It was promoted before review because Patrick's deadline required it — that is a deviation from the normal gate and worth noting.
- Per `AGENTS.md` the implementer is not the sole verifier; this still needs Code Review and QA.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
