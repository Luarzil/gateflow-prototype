// Writes the handoff Codex reads to build the service video.
//
// One source of truth for the scenes: the narration lives here, beside the frame each line belongs
// to, and the manifest records whether that frame has actually been captured yet. Nothing in it is
// aspirational - a scene marked "captured": false has no picture, and a video built from it would
// have a hole. Re-run this after every capture run.
//
// Usage: node tools/build-service-manifest.js

const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const frameDir = path.join(root, "docs", "media", "verigate-service-frames");
const manifestPath = path.join(frameDir, "manifest.json");

// A PNG's width and height are the first two big-endian ints of the IHDR chunk, at byte 16.
function pngSize(file) {
  const handle = fs.openSync(file, "r");
  const head = Buffer.alloc(24);
  fs.readSync(handle, head, 0, 24, 0);
  fs.closeSync(handle);
  if (head.toString("ascii", 1, 4) !== "PNG") return null;
  return { width: head.readUInt32BE(16), height: head.readUInt32BE(20) };
}

const SCENES = [
  {
    n: 1, id: "sign-in", frame: "01-sign-in.png", chapter: "WHO IS WORKING", layout: "desktop",
    title: "It asks who you are.",
    takeaway: "The console does not open to whoever opens the page.",
    narration: "This is the office side of Veri Gate, on a computer. It does not open to whoever opens the page. It asks who you are first.",
    proves: "Access is controlled before anything is shown."
  },
  {
    n: 2, id: "signed-in", frame: "02-signed-in.png", chapter: "WHO IS WORKING", layout: "desktop",
    title: "Signed in.",
    takeaway: "Every change from here carries a person's name.",
    narration: "Signed in, the console knows who is working. From here, every change carries a name. Not a console, not a device. A person.",
    proves: "There is an identity behind every action."
  },
  {
    n: 3, id: "log-before", frame: "03a-log-before.png", chapter: "ONE SET OF RECORDS", layout: "desktop",
    title: "The gate log, before.",
    takeaway: "Every gate's movements, in one place.",
    narration: "This is the gate log. Every movement, from every gate, in one place.",
    proves: "The log is read from the shared database, not from this computer."
  },
  {
    n: 4, id: "log-after", frame: "03b-log-after.png", chapter: "ONE SET OF RECORDS", layout: "desktop",
    title: "A scan arrives.",
    takeaway: "Scanned at the gate. Nobody typed it again.",
    narration: "A vehicle is scanned at the gate, on the phone. Nobody types it in again. It is here, on the computer, because the phone and this console are looking at the same records.",
    proves: "Two devices, one set of records. Cut 03a to 03b so the new row is the only thing that changes.",
    editing: "This pair is the centre of the video. Hold the before shot, then cut - do not dissolve."
  },
  {
    n: 5, id: "who-recorded", frame: "04-who-recorded.png", chapter: "ONE SET OF RECORDS", layout: "desktop",
    title: "And who recorded it.",
    takeaway: "Gate device, and the login that recorded it.",
    narration: "The log answers more than what moved and when. It answers which gate recorded it, and which login. That is the difference between a list and a record.",
    proves: "The audit question. Highlight the last two columns.",
    editing: "Worth a gentle zoom onto the Gate device and Recorded by columns."
  },
  {
    n: 6, id: "users", frame: "05-users.png", chapter: "WHAT EACH PERSON MAY DO", layout: "desktop",
    title: "Who gets in, and what they may do.",
    takeaway: "Roles are checked by the service, not hidden on a screen.",
    narration: "Access is given here, and taken away here. Each person has a role, and the role is not a matter of hiding buttons on a screen. A gate phone records movements. A Fleet Lead can also authorize a driver. A Supervisor can also edit one. The service checks that on every single request, so changing it on a phone changes nothing. A new person gets a one-time password and chooses their own. Turn a login off, and that person stops working on every device they touch, not just this one.",
    proves: "Access is administered, and can be withdrawn everywhere at once.",
    editing: "Long narration over one still. Consider holding on the roles column."
  },
  {
    n: 7, id: "gate-created", frame: "06-gate-created.png", chapter: "IT FILLS ITSELF", layout: "desktop",
    title: "The gate fills the list.",
    takeaway: "Vehicles nobody entered by hand.",
    narration: "Nobody typed these in. A vehicle nobody had seen before arrived at the gate, the phone recorded the movement and created the record on the spot. The inventory fills itself as the gates run.",
    proves: "No data-entry project is needed for vehicles."
  },
  {
    n: 8, id: "authorize", frame: "07-authorize.png", chapter: "IT FILLS ITSELF", layout: "desktop",
    title: "Decided here, honoured there.",
    takeaway: "An authorization reaches the phones on its own.",
    narration: "A driver is authorized on the computer, for a set number of hours. The gate phones have it within a few minutes, without anyone walking anything out to them.",
    proves: "Office decisions reach the gate without a person carrying them."
  },
  {
    n: 9, id: "caught-up", frame: "08-caught-up.png", chapter: "WHEN THE SIGNAL GOES", layout: "desktop",
    title: "Nothing is lost.",
    takeaway: "No signal, still scanning. Back in order when it returns.",
    narration: "Coverage is not guaranteed at a gate. So the phone does not depend on it. With no signal it keeps working exactly as it does now, and holds what it recorded. When the signal comes back, it sends everything, in the order it happened. A phone can be out of touch for days without losing a scan.",
    proves: "The offline queue, end to end.",
    editing: "Two movements arrive together. Let the shot breathe; this is the objection most operations people raise first."
  },
  {
    n: 10, id: "overrides", frame: "09-overrides.png", chapter: "DELIBERATE EXCEPTIONS", layout: "desktop",
    title: "Exceptions are deliberate.",
    takeaway: "Off by default, per location, and always recorded.",
    narration: "Every location can be given an override, and every one is off until somebody turns it on. When one is used, it is saved as an override, never as an authorization, and the record says so.",
    proves: "Exceptions are a decision, not a loophole."
  },
  {
    n: 11, id: "where-it-runs", frame: null, chapter: "WHERE THIS RUNS", layout: "card",
    title: "Where this runs.",
    takeaway: "A database that outlives any phone.",
    narration: "The records are not on the phones. They are in a database that is backed up, that survives a phone being lost or wiped, and that every gate and every office computer reads from. It runs on Amazon Web Services, in an account that belongs to Veri Gate.",
    proves: "The closing frame, and the ONLY place a vendor is named.",
    editing: "A plain card, no screenshot. Build it; there is no captured frame for this one."
  }
];

const manifest = {
  title: "Veri-Gate — the service",
  audience: "Patrick",
  argument: "This is real infrastructure, not a prototype. The argument is made by showing things a prototype cannot do.",
  rules: [
    "No vendor is named until the final card. Say 'the shared database' or 'the service'.",
    "Every screenshot is of the real service, signed in as raul, with a real gate phone signed in as d0001. None of it is the demo.",
    "Never show a password, a one-time password, or any real driver name or employee number.",
    "Do not invent a shot. A scene with \"captured\": false has no picture yet."
  ],
  house: {
    resolution: "1920x1080",
    voice: "en-US-JennyNeural, the same voice as the customer and walkthrough videos",
    palette: { ink: "#152321", paper: "#F4F7F6", green: "#16A365", muted: "#587169" },
    reference: "tools/create-video-refresh.py builds the other two videos and shows the frame composition, the desktop layout and the chapter styling.",
    pronunciation: "Spell out anything that should be heard as letters: 'V I N', 'D zero zero zero one', 'E one zero zero one'."
  },
  frameDir: "docs/media/verigate-service-frames",
  scenes: SCENES.map((scene) => {
    const file = scene.frame ? path.join(frameDir, scene.frame) : null;
    const exists = Boolean(file && fs.existsSync(file));
    return {
      ...scene,
      captured: scene.frame ? exists : "n/a - build this card",
      size: exists ? pngSize(file) : null,
      bytes: exists ? fs.statSync(file).size : null
    };
  })
};

fs.mkdirSync(frameDir, { recursive: true });
fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

const missing = manifest.scenes.filter((scene) => scene.captured === false);
console.log(`Wrote ${path.relative(root, manifestPath)}`);
console.log(`  ${manifest.scenes.length} scenes, ${manifest.scenes.filter((s) => s.captured === true).length} captured`);
if (missing.length) {
  console.log(`  NOT captured yet: ${missing.map((s) => `${s.n} ${s.id}`).join(", ")}`);
  console.log("  Run tools/capture-service-frames.js, then run this again.");
}
