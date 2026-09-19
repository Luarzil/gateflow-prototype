// The Android build must not be made in a folder Windows is allowed to empty.
//
// On 2026-09-19 the build lived under %TEMP%. Windows' own disk cleanup deleted half of
// node_modules and nearly every Android resource, and the next build failed with a hundred
// compiler errors that read like a code fault and were not. This app is going in front of a
// client, so the build refuses to run in such a place rather than producing something we cannot
// account for. These tests run the real script and check it stops.

const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { test } = require("node:test");

const root = path.resolve(__dirname, "..");
const script = path.join(root, "tools", "build-apk.mjs");

function buildIn(workspace) {
  try {
    execFileSync(process.execPath, [script, "--workspace", workspace], { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
    return { refused: false, message: "" };
  } catch (error) {
    return { refused: true, message: `${error.stdout || ""}${error.stderr || ""}` };
  }
}

// It has to be THIS refusal, not merely some failure. The first version of these tests passed on
// any error whose output happened to contain the word OneDrive - and the workspace path is printed
// in the header, so every failure did. Removing the OneDrive rule altogether still passed.
function assertRefusedBecause(workspace, reason) {
  const { refused, message } = buildIn(workspace);
  assert.ok(refused, `it must stop, but it ran. Output:\n${message}`);
  assert.match(message, /STOPPED: the build workspace is inside /, `wrong failure:\n${message}`);
  assert.match(message, reason, `stopped for the wrong reason:\n${message}`);
  assert.ok(!fs.existsSync(workspace), "and must not create the folder either");
}

test("the build refuses the Windows temp folder, and says why", () => {
  assertRefusedBecause(path.join(os.tmpdir(), "verigate-guard-check"), /temp folder, which Windows empties on its own/);
});

test("the build refuses OneDrive, which can swap a file for a placeholder mid-build", (t) => {
  if (!process.env.OneDrive) return t.skip("no OneDrive on this machine");
  assertRefusedBecause(path.join(process.env.OneDrive, "verigate-guard-check"), /inside OneDrive, which syncs/);
});

test("the build refuses the Downloads folder", () => {
  assertRefusedBecause(path.join(os.homedir(), "Downloads", "verigate-guard-check"), /Downloads folder, which Windows also offers to empty/);
});

test("a permanent folder is accepted", () => {
  // Checked by reading the guard rather than by building, which needs the Android SDK.
  const source = fs.readFileSync(script, "utf8");
  const forbidden = source.slice(source.indexOf("function assertDurable("), source.indexOf("function options("));
  ["os.tmpdir()", "process.env.TEMP", "process.env.TMP", "process.env.OneDrive", '"Downloads"'].forEach((needle) => {
    assert.ok(forbidden.includes(needle), `the guard must cover ${needle}`);
  });
  assert.ok(!forbidden.includes('"C:\\\\VeriGate'), "the default workspace is not itself forbidden");
});

test("the build proves what it made, rather than trusting the build", () => {
  const source = fs.readFileSync(script, "utf8");
  // The seven files are read back out of the finished APK and compared with this tree.
  assert.match(source, /Buffer\.from\(inside, "base64"\)\.equals\(fs\.readFileSync\(path\.join\(root, file\)\)\)/);
  assert.ok(source.includes("of the seven web files in the APK do not match this tree."));
  // The keyboard fix is only in the compiled manifest, so it is checked there.
  assert.ok(source.includes("does not carry adjustResize"));
  assert.ok(source.includes("the APK is not signed"));
});

test("a half-deleted node_modules is treated as damaged, not as installed", () => {
  const source = fs.readFileSync(script, "utf8");
  // npm trusts its own bookkeeping; the cleanup left the folder there with the files gone.
  assert.ok(source.includes("Bridge.java"), "a file the compiler needs, not just the folder");
  assert.ok(source.includes('fs.rmSync(path.join(modules, "@capacitor"), { recursive: true, force: true });'));
  assert.ok(source.includes("npm install did not restore:"));
});
