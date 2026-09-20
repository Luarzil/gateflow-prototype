// Captures the frames for the service video against the REAL Veri-Gate service, signed in.
//
// The demo link cannot be used for this. It runs with no sign-in, as an Admin, with nothing hidden,
// and records changes as "Supervisor Console" - so the scenes that carry the argument (a person's
// name on a change, real logins with real roles, a phone's scan arriving) do not exist in it.
// Narrating them over demo screens would claim something Patrick could disprove by opening the same
// link. So this runs against the real thing.
//
// Chrome opens VISIBLE, and you sign in yourself. This script never types, reads or stores a
// password, and never captures a frame while the sign-in panel holds one. Between scenes it waits
// for something real to happen - a movement arriving, for example - rather than for a keypress, so
// a frame cannot be captured before the thing it is supposed to show is actually on screen.
//
// Order matters. Everything that needs nobody runs FIRST, while the console is open, so a session
// banks most of its frames before it asks for anything. The three scenes that need a person with
// the gate phone come last, and one of them timing out is not fatal: the rest still ran, and the
// run reports exactly which frames are outstanding.
//
// A console sign-in lives in the tab, not on disk - closing Chrome ends it, whatever the profile
// keeps. So Chrome is detached and left running between scenes rather than restarted.
//
// Usage:
//   node tools/capture-service-frames.js                 the whole sequence
//   node tools/capture-service-frames.js --scene 3       one scene, to redo a shot
//   node tools/capture-service-frames.js --wait 45       minutes to wait on each phone scene
//   node tools/capture-service-frames.js --close         close Chrome at the end (default: leave it)

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const frameDir = path.join(root, "docs", "media", "verigate-service-frames");
const profileDir = "C:\\VeriGate\\capture-profile";
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const SITE = process.env.VERIGATE_SITE || "https://gateflow-prototype.vercel.app";

const only = (() => {
  const at = process.argv.indexOf("--scene");
  return at >= 0 && process.argv[at + 1] ? Number(process.argv[at + 1]) : null;
})();

// How long to stand waiting for somebody to walk to the phone and back.
const phoneWaitSeconds = (() => {
  const at = process.argv.indexOf("--wait");
  const minutes = at >= 0 && process.argv[at + 1] ? Number(process.argv[at + 1]) : 45;
  return Math.max(1, minutes) * 60;
})();

// Scene 1 has to come before the sign-in, and 2 is the sign-in itself. Then everything automatic,
// so the run banks frames whether or not anyone is free. The phone scenes are last; 4 reads the log
// that 3 fills, so it follows it.
const DEFAULT_ORDER = [1, 2, 5, 6, 7, 9, 3, 4, 8];
const NEEDS_PHONE = new Set([3, 4, 8]);

const say = (message) => console.log(message);
const ask = (message) => console.log(`\n>>> ${message}\n`);

// --- CDP ------------------------------------------------------------------------------------------

async function connectCdp(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => {
    socket.addEventListener("open", resolve, { once: true });
    socket.addEventListener("error", reject, { once: true });
  });
  let nextId = 0;
  const pending = new Map();
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) reject(new Error(message.error.message));
    else resolve(message.result);
  });
  return {
    close: () => socket.close(),
    send(method, params = {}) {
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        socket.send(JSON.stringify({ id, method, params }));
      });
    }
  };
}

async function waitForJson(url) {
  for (let attempt = 0; attempt < 120; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return await response.json();
    } catch (error) { /* Chrome is still starting. */ }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  throw new Error(`Chrome never answered on ${url}`);
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

// Waits for something true in the page. Everything that depends on a person doing something, or on
// the service answering, goes through here, so no frame is taken before its subject exists.
async function until(cdp, expression, label, seconds = 300) {
  const deadline = Date.now() + seconds * 1000;
  let announced = false;
  while (Date.now() < deadline) {
    let value = false;
    try { value = await evaluate(cdp, `(() => { try { return Boolean(${expression}); } catch (error) { return false; } })()`); }
    catch (error) { value = false; }
    if (value) { if (announced) say("    ...there."); return true; }
    if (!announced) { say(`    waiting: ${label}`); announced = true; }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }
  throw new Error(`Gave up waiting for ${label}`);
}

async function shot(cdp, name, note) {
  // Never capture while a password is on screen, whatever else is true.
  const unsafe = await evaluate(cdp, `(() => {
    const fields = [...document.querySelectorAll('input[type="password"]')];
    return fields.some((f) => f.value.length > 0 && f.getClientRects().length > 0);
  })()`);
  if (unsafe) throw new Error(`Refusing to capture ${name}: a password is typed into a visible field. Clear it and retry.`);
  await new Promise((resolve) => setTimeout(resolve, 400));
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.mkdirSync(frameDir, { recursive: true });
  fs.writeFileSync(path.join(frameDir, name), Buffer.from(result.data, "base64"));
  say(`  captured ${name}${note ? ` - ${note}` : ""}`);
}

const go = (cdp, url) => cdp.send("Page.navigate", { url }).then(() => new Promise((r) => setTimeout(r, 1200)));
const click = (cdp, selector) => evaluate(cdp, `(() => { const n = document.querySelector(${JSON.stringify(selector)}); if (!n) throw Error('missing ' + ${JSON.stringify(selector)}); n.click(); return true; })()`);
const section = async (cdp, name) => {
  await click(cdp, '[data-view="supervisorView"]');
  await new Promise((r) => setTimeout(r, 400));
  await click(cdp, `[data-supervisor-section="${name}Section"]`);
  await new Promise((r) => setTimeout(r, 600));
};
// When the console is signed in, the gate log is read straight from the shared database, into
// ui.searchResults - not from state.transactions, which is only this device's own copy. So to see a
// phone's scan arrive, the search is re-run and the total the SERVICE reports is what changes. That
// makes the wait a real proof: the database was asked again, and it had the new row.
const runSearch = (cdp) => evaluate(cdp, "(() => { submitSearch(); return true; })()");
const serverTotal = async (cdp) => {
  await runSearch(cdp);
  await until(cdp, "ui.searchBusy === false", "the database to answer", 120);
  return evaluate(cdp, "typeof ui.searchTotal === 'number' ? ui.searchTotal : (ui.searchResults || []).length");
};
const readFromService = (cdp) => evaluate(cdp, 'ui.searchSource === "shared"');

// --- the scenes -----------------------------------------------------------------------------------

const scenes = {
  async 1(cdp) {
    say("\n== 1. Sign in to continue");
    await go(cdp, `${SITE}/index.html?shell=console`);
    await until(cdp, "document.body.classList.contains('console-locked')", "the sign-in panel", 60);
    await shot(cdp, "01-sign-in.png", "the console before anyone is signed in");
  },

  async 2(cdp) {
    say("\n== 2. Signed in");
    ask("Sign in as 'raul' in the Chrome window. Type the password yourself - I do not see it.");
    await until(cdp, "window.VeriGateCloud && window.VeriGateCloud.status().signedIn", "your sign-in", 600);
    const who = await evaluate(cdp, "window.VeriGateCloud.status().username");
    say(`    signed in as ${who}`);
    await until(cdp, "!document.body.classList.contains('console-locked')", "the console to open");
    await shot(cdp, "02-signed-in.png", `the console, working as ${who}`);
  },

  async 3(cdp) {
    say("\n== 3. A scan on the phone arrives");
    await click(cdp, '[data-view="searchView"]');
    await new Promise((r) => setTimeout(r, 800));
    const before = await serverTotal(cdp);
    if (!await readFromService(cdp)) throw new Error("This log is being read from the device, not the service. Sign in first.");
    await shot(cdp, "03a-log-before.png", `the gate log, ${before} movements in the database`);
    ask("Now record ONE movement on the gate phone (signed in as d0001).\n    I am asking the database every few seconds and will capture it the moment it is there.");
    const deadline = Date.now() + phoneWaitSeconds * 1000;
    let now = before;
    while (now <= before && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000));
      now = await serverTotal(cdp);
    }
    if (now <= before) throw new Error("The scan never reached the database. Check the phone is signed in and has signal.");
    say(`    the database went from ${before} to ${now}`);
    await shot(cdp, "03b-log-after.png", "the same log, with the scan on it");
  },

  async 4(cdp) {
    say("\n== 4. Who recorded it");
    await click(cdp, '[data-view="searchView"]');
    await serverTotal(cdp);
    const named = await evaluate(cdp, `(ui.searchResults || []).filter((row) => row.uploadedBy).length`);
    if (!named) throw new Error("No movement on this page carries a login. Scene 3 must run first, and the phone must be signed in.");
    say(`    ${named} movement(s) on this page name the login that recorded them`);
    await shot(cdp, "04-who-recorded.png", "Gate device and Recorded by, side by side");
  },

  async 5(cdp) {
    say("\n== 5. The Users tab");
    await section(cdp, "users");
    // A one-time password must never reach a frame. It is shown in its own box; if that box is on
    // screen the shot is refused rather than taken and trimmed later.
    const exposed = await evaluate(cdp, `(() => { const box = document.getElementById('loginPasswordBox'); return Boolean(box && !box.classList.contains('hidden')); })()`);
    if (exposed) throw new Error("A one-time password is on screen. Reload the page, then run --scene 5 again. Do not create a login while recording.");
    await shot(cdp, "05-users.png", "the logins and their roles");
  },

  async 6(cdp) {
    say("\n== 6. Vehicles the gate created on its own");
    await section(cdp, "vehicles");
    await until(cdp, "document.querySelectorAll('#incompleteInventoryBody tr').length > 0", "the scan-created list");
    await shot(cdp, "06-gate-created.png", "vehicles the phones met and recorded themselves");
  },

  async 7(cdp) {
    say("\n== 7. Authorize on the computer");
    await section(cdp, "drivers");
    await shot(cdp, "07-authorize.png", "the roster and its authorizations");
  },

  async 8(cdp) {
    say("\n== 8. When the signal goes");
    await click(cdp, '[data-view="searchView"]');
    await new Promise((r) => setTimeout(r, 800));
    const before = await serverTotal(cdp);
    ask(`Put the phone in airplane mode, record TWO movements, then turn the signal back on.\n    The database is at ${before} now; I will capture it when both have caught up.`);
    const deadline = Date.now() + phoneWaitSeconds * 1000;
    let now = before;
    while (now < before + 2 && Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 6000));
      now = await serverTotal(cdp);
      if (now > before && now < before + 2) say(`    ${now - before} of 2 arrived...`);
    }
    if (now < before + 2) throw new Error("Both movements never arrived. Check the phone has signal again.");
    say(`    the database went from ${before} to ${now}`);
    await shot(cdp, "08-caught-up.png", "both movements, in the order they happened");
  },

  async 9(cdp) {
    say("\n== 9. Deliberate exceptions");
    await section(cdp, "admin");
    await shot(cdp, "09-overrides.png", "the per-location override switches");
  }
};

// --- go -------------------------------------------------------------------------------------------

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome is required: ${chromePath}`);
  fs.mkdirSync(frameDir, { recursive: true });
  fs.mkdirSync(profileDir, { recursive: true });

  const debugPort = 9333 + Math.floor(Math.random() * 400);
  say(`Veri-Gate service capture`);
  say(`  site:    ${SITE}`);
  say(`  frames:  ${frameDir}`);
  say(`  profile: ${profileDir}  (kept, so a sign-in survives between runs)`);

  const chrome = spawn(chromePath, [
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    "--no-first-run",
    "--no-default-browser-check",
    "--window-size=1366,900",
    "about:blank"
  ], { stdio: "ignore", detached: true });
  // Chrome has to outlive this process. A console sign-in lives in the tab, so killing the browser
  // when a scene times out would cost the sign-in as well as the run.
  chrome.unref();

  let cdp;
  try {
    const pages = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    const page = pages.find((item) => item.type === "page");
    cdp = await connectCdp(page.webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");

    const order = only ? [only] : DEFAULT_ORDER;
    const outstanding = [];
    for (const number of order) {
      if (!scenes[number]) throw new Error(`No scene ${number}`);
      try {
        await scenes[number](cdp);
      } catch (error) {
        // A scene needing someone with the gate phone may simply not get one right now. That must
        // not throw away the frames already captured, or the sign-in that took a person to give.
        if (!NEEDS_PHONE.has(number) || only) throw error;
        say(`  scene ${number} not captured: ${error.message}`);
        outstanding.push(number);
      }
    }

    const captured = fs.readdirSync(frameDir).filter((name) => name.endsWith(".png"));
    say(`\nDone. ${captured.length} frames in ${frameDir}`);
    captured.sort().forEach((name) => say(`  ${name}`));
    if (outstanding.length) {
      say(`\nStill to capture, when someone is free with the gate phone: scene ${outstanding.join(", ")}.`);
      say(`  ${outstanding.map((number) => `node tools/capture-service-frames.js --scene ${number}`).join("\n  ")}`);
      say("Leave this Chrome open and it will not ask you to sign in again.");
    }
    say("\nThen: node tools/build-service-manifest.js");
  } finally {
    if (cdp) cdp.close();
    if (process.argv.includes("--close")) {
      spawn("taskkill", ["/pid", String(chrome.pid), "/t", "/f"], { stdio: "ignore" });
    } else {
      say("\nChrome is left open and signed in, so a follow-up run costs you nothing.");
    }
  }
}

main().catch((error) => { console.error(`\nSTOPPED: ${error.message}`); process.exit(1); });
