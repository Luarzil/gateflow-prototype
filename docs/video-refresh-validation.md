# CR-V15 video refresh

Source application: branch change/CR-V15-BARCODE-INTEGRITY-001, application HEAD 103d5b3.
Only video tooling, captures and video artifacts are changed.

## Rebuild

Use Node with WebSocket support, Chrome, and Python with edge-tts,
imageio-ffmpeg and Pillow installed.

```text
node tools/create-verigate-demo.js --frames-only
node tools/create-customer-video.js --frames-only
python tools/create-video-refresh.py --render-only
python tools/create-video-refresh.py
python tools/verify-video-scenes.py
node tools/verify-video-refresh.cjs
```

The JavaScript entry points capture the application. The Python refresh
generator produces the requested MP4/VTT paths with en-US-JennyNeural.
Legacy fitSlidesToAudio still targets audioMs + 2500 in both directions.
The legacy desktop layout retains font 32, x 770 and shotW 690.

## Verification

- Both capture runs assert the visible workflow before key screenshots.
- Vehicle precedes driver; direction precedes review and submission.
- Scan steps use inputmode=none. A pointer tap enables manual input.
- G00 is refused. Typed G9002 warns, proceeds, and creates a flagged record.
- Scanned G9001 proceeds without the warning and creates an unflagged record.
- AB123 resolves to a synthetic demonstration driver. All three numeric
  employee number forms resolve to E1003.
- Role refusal uses a current-license, unauthorized driver and checks the
  actual refusal text. The console capture requires visible inventory controls.
- All five authorization options exist, with nine hours selected by default.
- VIN-only creation is saved and the next free barcode G0006 is asserted.
- Vehicle, user and device records are opened using identifier controls.
- All composed scenes are visually reviewed against their narration.
- verify-video-scenes.py decodes each MP4 scene midpoint, compares its image
  with the rendered scene, and checks that captions match the narration and
  stay within that scene. Machine results are in scene-verification.json.
- Browser playback checks cover both videos at desktop and mobile widths.

Capture uses disposable browser profiles and synthetic local data. Scanner
input is simulated through input events, without a pointer tap; manual input
includes the pointer event. Native Android soft-keyboard behavior is not
hardware-tested. For the duration illustration only, the existing select is
expanded with size=5 so all actual options are visible in the capture.

## Application discrepancy

The vehicle record's removal button remains invisible: index.html gives
vehicleInventoryToggle the hidden class, while openVehicleModal changes only
its hidden property. Patrick's video identifies this discrepancy; the customer
video does not claim removal works. No application workaround is applied.

## Handoff

The MP4, VTT and poster paths remain unchanged. review.html and manual.html
are untouched. No deployment, push or email is part of this change.
The public review link remains on the previous videos until the separately
managed, scoped 17-file deployment. Hold Patrick's email until that deployment.
Never deploy this repository root.
