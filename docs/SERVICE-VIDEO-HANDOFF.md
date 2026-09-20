# Handoff: build the service video

**For whoever builds the video, including Codex.**

Everything you need is in one machine-readable file:

```
docs/media/verigate-service-frames/manifest.json
```

It holds all eleven scenes in order, each with its frame file, title, takeaway, chapter, narration,
what the scene is there to prove, and editing notes where they matter. Regenerate it after any
capture run:

```bash
node tools/build-service-manifest.js
```

---

## Read this before you start

**Check `captured` on every scene.** A scene with `"captured": false` has **no picture**. Do not
substitute a frame from another video, do not re-use a demo screenshot, and do not generate one. If
frames are missing, say so and stop — a hole is recoverable, a fabricated frame shown to a client is
not.

Scene 11 is the exception: `"captured": "n/a - build this card"`. It is a plain closing card with no
screenshot, and you build it.

**Every frame is the real service.** They were captured signed in as `raul`, with a real gate phone
signed in as `d0001`, against the live database — not the demo. That is the entire point of the
video, so do not swap in anything from `verigate-customer-frames` or `verigate-v08-demo-frames`,
which are demo data.

**Do not name the vendor until the last card.** Scenes 1 to 10 say "the shared database" or "the
service". Scene 11 is the only place Amazon Web Services is named. This is deliberate: for this
audience the vendor name explains nothing, and the argument is stronger made from evidence first.

**Never show a password**, a one-time password, or any real driver name or employee number. The
capture tool refuses to take a frame while a password is visible, so the frames are clean — keep
them that way in the edit.

---

## House style

The other two videos are built by `tools/create-video-refresh.py`. Read its `frame()` function for
the exact composition: 1920×1080, the Veri-Gate mark top left, the chapter label, the title, the
screenshot inset, the progress rule along the bottom, and the scene counter bottom right. The
`desktop` layout is the one this video uses throughout — light background, dark text, screenshot
centred.

- **Voice:** `en-US-JennyNeural`, the same as the other two, timed to the narration.
- **Palette:** ink `#152321`, paper `#F4F7F6`, green `#16A365`, muted `#587169`.
- **Pronunciation:** spell out anything that should be heard as letters — "V I N", "D zero zero zero
  one", "E one zero zero one".

## The one cut that matters

Scenes 3 and 4 are a pair: the gate log before a scan, and the same log after it. They were captured
minutes apart from the same screen, and the only difference is the new row. **Cut between them, do
not dissolve** — the viewer should see a row appear, not a screen fade. This pair is the whole
argument that two devices share one set of records; everything else supports it.

Scene 5 rewards a slow zoom onto the last two columns, **Gate device** and **Recorded by**. Those
answer "which gate" and "which login", which is the audit question.

## Pacing

Scene 6 and scene 9 carry the longest narration over a single still. Let them run; they answer the
two questions an operations person asks first — who can do what, and what happens when the signal
goes. Everything else can move briskly.

## If something is wrong

Frames can be re-taken one at a time without redoing the session:

```bash
node tools/capture-service-frames.js --scene 5
```

Scenes 3, 4 and 9 need a person with the gate phone, because they wait for a real movement to reach
the database. The rest are automatic.
