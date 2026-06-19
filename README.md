# GateFlow V0.1

Standalone static HTML/CSS/JS prototype for a Zebra TC22R-style Android handheld gate scanner and desktop manager dashboard.

Open `index.html` directly in a browser. No build step, server, or Zebra hardware is required for the demo.

Demo scanner fields accept typed values or the `Sim scan` buttons. Demo supervisor IDs include `SUP-1001` and `SUP-2040`.

The app stores prototype data in browser `localStorage`. Use `Reset demo` to restore the seeded data. When served over HTTP(S), the included manifest and service worker allow it to behave as an installable offline-friendly prototype.
