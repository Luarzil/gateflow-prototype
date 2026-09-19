const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const storageKey = "lot-watch.gateflow.v0.7.state";

// Listen on an OS-assigned port and keep it; closing and re-listening would let another process take it.
function listenOnFreePort(server) {
  return new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => resolve(server.address().port));
  });
}

// Chrome started with --remote-debugging-port=0 binds its own port and writes it to DevToolsActivePort.
async function waitDevToolsPort(profile, chrome) {
  const file = path.join(profile, "DevToolsActivePort");
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (chrome.exitCode !== null || chrome.signalCode !== null) throw new Error(`Chrome exited before opening DevTools (code ${chrome.exitCode})`);
    try { const [port, browserPath] = fs.readFileSync(file, "utf8").split(/\r?\n/); if (/^\d+$/.test(port) && browserPath) return Number(port); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${file}`);
}

function createServer() {
  const types = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const filename = path.resolve(root, pathname === "/" ? "index.html" : pathname.replace(/^\/+/, ""));
    if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) return response.writeHead(404).end("Not found");
    response.writeHead(200, { "Content-Type": types[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(filename).pipe(response);
  });
}

async function waitJson(url) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try { const response = await fetch(url); if (response.ok) return response.json(); } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function connect(webSocketUrl) {
  const socket = new WebSocket(webSocketUrl);
  await new Promise((resolve, reject) => { socket.addEventListener("open", resolve, { once: true }); socket.addEventListener("error", reject, { once: true }); });
  let nextId = 0;
  const pending = new Map();
  const events = [];
  socket.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (!message.id) { events.push(message); return; }
    if (!pending.has(message.id)) return;
    const handlers = pending.get(message.id); pending.delete(message.id);
    if (message.error) handlers.reject(new Error(message.error.message)); else handlers.resolve(message.result);
  });
  return { events, close: () => socket.close(), send(method, params = {}) { const id = ++nextId; return new Promise((resolve, reject) => { pending.set(id, { resolve, reject }); socket.send(JSON.stringify({ id, method, params })); }); } };
}

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.exception?.description || result.exceptionDetails.text);
  return result.result.value;
}

async function waitReady(cdp) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, "document.readyState === 'complete' && Boolean(document.querySelector('#startScanButton'))")) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("GateFlow did not finish loading");
}

async function reload(cdp) {
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitReady(cdp);
}

async function performMovement(cdp, driverMethod, vehicleMethod, sequence) {
  await evaluate(cdp, "document.querySelector('#startScanButton').click()");
  // CR-V14 items 1 and 2: the manual-entry dialogs are gone. Tapping the field is the manual path,
  // so "manual" fires a pointerdown first and "scanner_field" is a wedge scan landing in a field
  // nobody touched. The four-way provenance matrix is unchanged; only how it is reached moved.
  if (vehicleMethod === "manual") {
    await evaluate(cdp, `(() => { const input=document.querySelector('#barcodeInput'); input.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); input.value='GFV-0001'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#barcodeNext').click(); })()`);
  } else {
    await evaluate(cdp, `(() => { const input=document.querySelector('#barcodeInput'); input.value='GFV-0001'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#barcodeNext').click(); })()`);
  }
  if (driverMethod === "manual") {
    await evaluate(cdp, `(() => { const input=document.querySelector('#driverInput'); input.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true})); input.value='1001'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#driverNext').click(); })()`);
  } else {
    await evaluate(cdp, `(() => { const input=document.querySelector('#driverInput'); input.value='1001'; input.dispatchEvent(new Event('input',{bubbles:true})); document.querySelector('#driverNext').click(); })()`);
  }
  const direction = sequence % 2 === 0 ? "OUT" : "IN";
  await evaluate(cdp, `document.querySelector(${JSON.stringify(sequence % 2 === 0 ? "#directionOut" : "#directionIn")}).click()`);
  const review = await evaluate(cdp, "document.querySelector('#scanSummary').innerText");
  assert.match(review, /Movement\s+Vehicle (IN|OUT)/i, "review keeps the simplified movement summary");
  assert.doesNotMatch(review, /\bScan\b/, "ordinary direct typing must never display as verified Scan");
  await evaluate(cdp, "document.querySelector('#submitTransactionButton').click()");
  const result = await evaluate(cdp, `(() => { const saved=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})); return { transaction:saved.transactions[0], audit:saved.auditEvents[0].description, backAtHome:!document.querySelector('#scannerHome').classList.contains('hidden'), wizardHidden:document.querySelector('#scanWizard').classList.contains('hidden') }; })()`);
  assert.equal(result.transaction.driverEntryMethod, driverMethod, `matrix ${driverMethod}/${vehicleMethod}: driver method`);
  assert.equal(result.transaction.vehicleEntryMethod, vehicleMethod, `matrix ${driverMethod}/${vehicleMethod}: vehicle method`);
  assert.equal(result.transaction.barcodeEntryMethod, vehicleMethod, "legacy vehicle property remains compatible");
  assert.equal(result.transaction.direction, direction, `matrix ${driverMethod}/${vehicleMethod}: ${direction} path`);
  assert.match(result.audit, new RegExp(`Driver entry path: ${driverMethod === "scanner_field" ? "Scanner field" : "Manual"}; vehicle entry path: ${vehicleMethod === "scanner_field" ? "Scanner field" : "Manual"}`));
  // 081526 v7 edit #9: no post-submit screen; a clean submission returns to the scanner home.
  assert.ok(result.backAtHome, "a clean submission returns to the scanner home for the next scan");
  assert.ok(result.wizardHidden, "the scan wizard is closed after a clean submission");
  result.transaction.testSequence = sequence;
  await reload(cdp);
  const reloaded = await evaluate(cdp, `(() => { const saved=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})); return saved.transactions[0]; })()`);
  assert.equal(reloaded.driverEntryMethod, driverMethod, `matrix ${driverMethod}/${vehicleMethod}: driver method survives reload`);
  assert.equal(reloaded.vehicleEntryMethod, vehicleMethod, `matrix ${driverMethod}/${vehicleMethod}: vehicle method survives reload`);
  return `${driverMethod}/${vehicleMethod}`;
}

async function verifyLegacyMigration(cdp) {
  await evaluate(cdp, `(() => {
    const saved=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)}));
    const source=saved.transactions[0];
    const prior={...source,id:'legacy-prior',note:'LEGACY_PRIOR',barcodeEntryMethod:'scanner'};
    delete prior.driverEntryMethod; delete prior.vehicleEntryMethod;
    const explicitManual={...source,id:'legacy-manual',note:'LEGACY_MANUAL',barcodeEntryMethod:'manual'};
    delete explicitManual.driverEntryMethod; delete explicitManual.vehicleEntryMethod;
    const missing={...source,id:'legacy-missing',note:'LEGACY_MISSING'};
    delete missing.driverEntryMethod; delete missing.vehicleEntryMethod; delete missing.barcodeEntryMethod;
    saved.transactions.unshift(missing,prior,explicitManual); localStorage.setItem(${JSON.stringify(storageKey)},JSON.stringify(saved));
  })()`);
  await reload(cdp);
  const persisted = await evaluate(cdp, `(() => { const saved=JSON.parse(localStorage.getItem(${JSON.stringify(storageKey)})); return Object.fromEntries(saved.transactions.filter(item => ['legacy-prior','legacy-manual','legacy-missing'].includes(item.id)).map(item => [item.id,{driver:item.driverEntryMethod,vehicle:item.vehicleEntryMethod}])); })()`);
  assert.deepEqual(persisted["legacy-prior"], { driver: "legacy_unknown", vehicle: "legacy_unknown" });
  assert.deepEqual(persisted["legacy-manual"], { driver: "legacy_unknown", vehicle: "manual" });
  assert.deepEqual(persisted["legacy-missing"], { driver: "legacy_unknown", vehicle: "legacy_unknown" });
  await evaluate(cdp, "document.querySelector('[data-view=\"searchView\"]').click()");
  const rows = await evaluate(cdp, `Array.from(document.querySelectorAll('#searchResultsBody tr')).map(row => Array.from(row.cells).map(cell => cell.innerText.trim()))`);
  const prior = rows.find((cells) => cells.includes("LEGACY_PRIOR"));
  const explicitManual = rows.find((cells) => cells.includes("LEGACY_MANUAL"));
  const missing = rows.find((cells) => cells.includes("LEGACY_MISSING"));
  assert.ok(prior && explicitManual && missing, "legacy records must remain visible in Search");
  assert.equal(prior[4], "Legacy / unknown", "missing driver method must not infer scan");
  assert.equal(prior[6], "Legacy / unknown", "ambiguous prior barcode scanner method must remain unknown");
  assert.equal(explicitManual[4], "Legacy / unknown");
  assert.equal(explicitManual[6], "Manual", "explicit prior manual entry may remain manual");
  assert.equal(missing[4], "Legacy / unknown");
  assert.equal(missing[6], "Legacy / unknown", "missing vehicle method must not infer scan");
  const limitation = await evaluate(cdp, "document.querySelector('#searchView .view-heading p:last-child').innerText");
  assert.match(limitation, /does not verify scanner hardware/i);
  return { prior: { driver: prior[4], vehicle: prior[6] }, explicitManual: { driver: explicitManual[4], vehicle: explicitManual[6] }, missing: { driver: missing[4], vehicle: missing[6] } };
}

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome required: ${chromePath}`);
  const server = createServer(); const webPort = await listenOnFreePort(server);
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gateflow-provenance-browser-"));
  const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, "--remote-debugging-port=0", "--remote-allow-origins=*", "about:blank"], { stdio: "ignore" });
  let cdp;
  try {
    const debugPort = await waitDevToolsPort(profile, chrome);
    const pages = await waitJson(`http://127.0.0.1:${debugPort}/json/list`); cdp = await connect(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable"); await cdp.send("Runtime.enable");
    await cdp.send("Page.navigate", { url: `http://127.0.0.1:${webPort}/` }); await waitReady(cdp);
    const matrix = [];
    for (const [driver, vehicle] of [["scanner_field", "scanner_field"], ["scanner_field", "manual"], ["manual", "scanner_field"], ["manual", "manual"]]) matrix.push(await performMovement(cdp, driver, vehicle, matrix.length + 1));
    const legacy = await verifyLegacyMigration(cdp);
    assert.equal(cdp.events.filter((event) => event.method === "Runtime.exceptionThrown").length, 0, "browser console must have no uncaught exceptions");
    console.log(`V0.7 provenance browser checks passed: ${JSON.stringify({ matrix, legacy })}`);
  } finally {
    if (cdp) cdp.close();
    if (process.platform === "win32") await new Promise((resolve) => { const cleanup=spawn("taskkill",["/pid",String(chrome.pid),"/t","/f"],{stdio:"ignore"}); cleanup.once("exit",resolve); cleanup.once("error",resolve); }); else chrome.kill();
    if (chrome.exitCode === null && chrome.signalCode === null) await new Promise((resolve) => chrome.once("exit", resolve));
    await new Promise((resolve) => server.close(resolve));
    // Chrome's child processes can hold profile files for a moment after the browser exits on Windows.
    for (let attempt=0; attempt<100; attempt+=1) { try { fs.rmSync(profile,{recursive:true,force:true}); break; } catch (error) { if (attempt===99) throw error; await new Promise((resolve)=>setTimeout(resolve,100)); } }
  }
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
