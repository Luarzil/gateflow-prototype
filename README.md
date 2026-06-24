# Lot Watch / GateFlow V0.3

Static HTML, CSS, and JavaScript prototype for vehicle gate tracking. V0.3 is optimized for a Zebra TC58e-style Android handheld scanner and also includes a desktop Admin, Search, and Audit dashboard.

## Scanner workflow

The guard selects a persistent **Working Location** once for the session, then completes a fast movement flow:

1. Scan or enter Driver Employee #.
2. See the driver name and today's authorization status immediately.
3. Scan or enter Vehicle VIN.
4. Choose Vehicle OUT or Vehicle IN.
5. Add an optional note and submit.

Pressing Enter after the driver field advances to VIN. Pressing Enter after VIN advances to the IN/OUT choice, matching keyboard-style scanner wedge behavior. VIN values are normalized to uppercase. Values that are not 17 characters show a warning but remain allowed for demo use.

Vehicle OUT requires same-day driver authorization. An unauthorized OUT is blocked until a valid supervisor ID authorizes that driver for today; the blocked attempt, authorization, approval, and completed movement are all recorded in Audit. Vehicle IN is always permitted. Unauthorized IN records an **Unauthorized IN - audit review** event.

The expandable **Scanner input test** panel shows the most recent raw input, receiving field, and detected Enter/Tab terminator for future device testing. Scanner connectivity placeholders show online/offline state, local-save status, sync queue count, and a future 5G/Wi-Fi indicator.

## Run it

Open `index.html` directly in a browser. For the installable offline shell, serve this folder over HTTP(S) so the included manifest and service worker can load.

All demo data is stored in browser `localStorage`. Admin actions, transactions, Search results, and Audit events all read from the same local state, so changes appear across tabs immediately. Use **Reset demo** to restore the seeded data.

## Zebra TC58e-style context

The TC58e product family is Android-based and supports Wi-Fi 6E, Bluetooth, and 5G connectivity. This prototype does not require a Zebra device: it uses focused text inputs and Enter/Tab handling to simulate keyboard-style scan input.

No real Zebra integration is included yet. Production options may include:

- Zebra DataWedge keyboard wedge profiles.
- Android Intents.
- Zebra Enterprise Browser.
- A native Android application.

## Scope

V0.3 remains a static prototype. It has no backend, AWS, Supabase, real authentication, or customer data connection. Future production work should use customer-owned or customer-approved data hosting, role-based permissions, and offline sync for field transactions.

Photo capture is intentionally not included because the client said photos are not needed.
