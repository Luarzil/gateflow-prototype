# CR-V12-VIDEO-REFRESH-001

Source: owner request, 2026-09-06, to create two additional modern videos with a more natural female voice and better flow, preserving both originals and conserving model usage.

Plan: reuse verified V11 product captures, rewrite narration around actual prototype behavior, synthesize Jenny neural female narration per scene, compose 1080p motion graphics with readable product views, and export two H.264 MP4s with subtitles and a local comparison page. No paid API is required. Narration text is sent to Microsoft's online speech service through edge-tts.

Scope: new video-production script, new docs/media/refresh-v2 outputs, the public review page, and a Patrick email draft. Base: bb0a345. Existing videos, app, and APK stay intact.

Acceptance: both original video hashes unchanged; two playable 1920x1080 MP4s containing female narration; timing derived from each audio clip; readable chapter frames; no false shared-database or automatic-sync claims; scripts and captions available; the public review page embeds both new videos and retains links to both originals; every public review link works without sign-in.

Verification: inspect original and new contact sheets, decode both completed videos, verify audio/video streams and duration, check original hashes and Git diff. This is media verification, not application QA certification.

Rollback: promote the previous V11 Vercel deployment at commit bb0a345 and revert the V12 commit. Client send is not part of this request.

## Completed evidence

- Customer introduction: 122.85 seconds, 1920x1080 H.264/AAC MP4.
- Patrick walkthrough: 126.69 seconds, 1920x1080 H.264/AAC MP4.
- Jenny neural female narration, synthesized per scene; captions use speech-service sentence timestamps. Narration normalized to -16 LUFS per clip.
- Both complete outputs decoded without errors. Browser playback advances with audio decoded at 1440px and 390px viewport widths; review page has no horizontal overflow.
- Original and refreshed contact sheets visually inspected. User-edit view is enlarged from the original desktop capture rather than squeezed into a phone-sized full desktop screenshot.
- Original WEBM hashes unchanged; details in media/refresh-v2/verification.json. Browser results in playback-verification.json.
- New scripts distinguish current device-local storage from future shared data and synchronization.
- Created on change/CR-V12-VIDEO-REFRESH-001. Owner approved GitHub push and production Vercel deployment on 2026-09-06. No client communication or application behavior change.
- Automated checks verify audio presence, timing, and decoding; subjective voice preference remains for owner review.
