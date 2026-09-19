# Building the Android app

```bash
node tools/build-apk.mjs
```

That is the whole thing. It writes `C:\VeriGate\out\Veri-Gate-V0.8.apk` and will not tell you it
succeeded unless it can prove what it built.

| Command | What it does |
|---|---|
| `node tools/build-apk.mjs` | Build, verify, write the APK |
| `node tools/build-apk.mjs --clean` | Throw the workspace away and build from nothing |
| `node tools/build-apk.mjs --verify-only` | Check an existing APK against this tree, building nothing |

Options: `--workspace <dir>` (default `C:\VeriGate\android-build`), `--out <file>`. A clean build
takes about twelve seconds once the Gradle and npm caches are warm, a few minutes from cold.

## Why the script exists

On **19 September 2026** the Android project was being built in a copy under `%TEMP%`. Windows' own
disk cleanup deleted most of it — half of `node_modules` and nearly every Android resource. The next
build failed with a hundred compiler errors that read like a code fault and were not. `npm install`
did not fix it, because npm trusted its own bookkeeping and reported the half-deleted package as
installed.

That is not acceptable for software a client depends on, so:

- **The repository is the source of truth.** `android/` is committed, icons and all. The workspace
  holds nothing that cannot be rebuilt from this repository, and can be deleted at any time.
- **The build refuses to run anywhere Windows may delete.** `%TEMP%`, `Downloads`, and OneDrive —
  which syncs, and can hand a build a placeholder instead of the file it asked for. It stops with a
  sentence saying which, and creates nothing.
- **A damaged `node_modules` is detected by its files, not by the folder being there.** If a file
  the compiler needs is missing, the package is removed outright and reinstalled, and the build
  stops if that did not restore it.

## What it proves before it says "Done"

1. **The seven web files** — `app.js`, `cloud.js`, `index.html`, `styles.css`, `service-worker.js`,
   `manifest.webmanifest`, `icon.svg` — are read back **out of the finished APK** and compared byte
   for byte with this tree. Not the copies handed to the build: the ones actually inside it.
2. **The compiled manifest carries `adjustResize`.** Without it the phone's keyboard covers what the
   operator is typing. It is set in the manifest source, but only the compiled form proves it.
3. **The APK is signed**, v1 and v2.

Any one of these failing stops the build. Tested by tampering: swapping a different `app.js` into a
finished APK is caught and reported by file name.

`tests/build-apk-guard.test.js` runs the real script and checks it refuses each forbidden place for
the right reason, and that the three proofs above are still wired up. Nine rules were broken on
purpose, one at a time; all nine were caught.

## What you need installed

Android Studio (it ships the Java the build uses) and its SDK with build-tools. The script finds
both, and says plainly what is missing if it cannot. Nothing needs to be on your PATH, and no
environment variables need setting — though `JAVA_HOME`, `ANDROID_SDK_ROOT` and `VERIGATE_BUILD_DIR`
are honoured if you have them.

## One thing to check yourself

The script keeps the build out of the folders Windows cleans, but it cannot change your Windows
settings and should not. If you want to confirm Storage Sense is not doing anything unexpected:
**Settings → System → Storage → Storage Sense**. Nothing under `C:\VeriGate` is touched by it either
way.
