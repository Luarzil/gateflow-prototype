const assert = require("node:assert/strict");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      server.close(() => resolve(port));
    });
  });
}

function staticServer() {
  const contentTypes = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".svg": "image/svg+xml", ".webmanifest": "application/manifest+json" };
  return http.createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url, "http://localhost").pathname);
    const relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
    const filename = path.resolve(root, relative);
    if (!filename.startsWith(`${root}${path.sep}`) || !fs.existsSync(filename) || !fs.statSync(filename).isFile()) {
      response.writeHead(404).end("Not found");
      return;
    }
    response.writeHead(200, { "Content-Type": contentTypes[path.extname(filename)] || "application/octet-stream", "Cache-Control": "no-store" });
    fs.createReadStream(filename).pipe(response);
  });
}

async function waitForJson(url, attempts = 80) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error(`Timed out waiting for ${url}`);
}

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

async function evaluate(cdp, expression) {
  const result = await cdp.send("Runtime.evaluate", { expression, awaitPromise: true, returnByValue: true });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForReady(cdp) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    if (await evaluate(cdp, "document.readyState === 'complete'")) return;
    await new Promise((resolve) => setTimeout(resolve, 50));
  }
  throw new Error("Page did not finish loading");
}

async function verifyViewport(cdp, url, width, height) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile: true });
  await cdp.send("Page.navigate", { url: `${url}?viewport=${width}x${height}` });
  await waitForReady(cdp);
  await evaluate(cdp, "document.querySelector('#startScanButton').click()");

  const step1 = await evaluate(cdp, `(() => {
    const action = document.querySelector('#driverNext').getBoundingClientRect();
    const input = document.querySelector('#driverInput').getBoundingClientRect();
    const dock = document.querySelector('[data-step="0"] .wizard-actions');
    return {
      actionVisible: action.top >= 0 && action.bottom <= innerHeight,
      inputVisible: input.top >= 0 && input.bottom <= innerHeight,
      inputDockOverlap: input.left < dock.getBoundingClientRect().right && input.right > dock.getBoundingClientRect().left && input.top < dock.getBoundingClientRect().bottom && input.bottom > dock.getBoundingClientRect().top,
      inputCenterHitId: document.elementFromPoint(input.left + input.width / 2, input.top + input.height / 2)?.id,
      dockPosition: getComputedStyle(dock).position,
      dockBottomGap: innerHeight - dock.getBoundingClientRect().bottom,
      viewportHeight: innerHeight,
      inputRect: { top: input.top, bottom: input.bottom },
      actionRect: { top: action.top, bottom: action.bottom },
      dockRect: { top: dock.getBoundingClientRect().top, bottom: dock.getBoundingClientRect().bottom },
      transformedAncestors: (() => { const values=[]; for (let node=dock.parentElement; node; node=node.parentElement) { const transform=getComputedStyle(node).transform; if (transform !== 'none') values.push({ tag: node.tagName, id: node.id, classes: node.className, transform }); } return values; })()
    };
  })()`);
  assert.equal(step1.actionVisible, true, `${width}x${height}: Step 1 primary action must be immediately visible (${JSON.stringify(step1)})`);
  assert.equal(step1.inputVisible, true, `${width}x${height}: Step 1 input must remain visible`);
  assert.equal(step1.inputDockOverlap, false, `${width}x${height}: Step 1 input must not overlap the action dock`);
  assert.equal(step1.dockPosition, "fixed", `${width}x${height}: Step 1 action must be viewport-docked`);
  assert.ok(step1.dockBottomGap >= 0 && step1.dockBottomGap <= 20, `${width}x${height}: Step 1 dock must remain anchored near the viewport bottom (${JSON.stringify(step1)})`);

  await evaluate(cdp, `(() => {
    const input = document.querySelector('#driverInput'); input.value = '1001'; input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#driverNext').click();
    const barcode = document.querySelector('#barcodeInput'); barcode.value = 'G0001'; barcode.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#barcodeNext').click(); document.querySelector('#directionIn').click();
  })()`);
  const step4 = await evaluate(cdp, `(() => {
    const submit = document.querySelector('#submitTransactionButton').getBoundingClientRect();
    const heading = document.querySelector('#reviewStepTitle').getBoundingClientRect();
    return {
      submitVisible: submit.top >= 0 && submit.bottom <= innerHeight,
      headingVisible: heading.top >= 0 && heading.bottom <= innerHeight,
      activeId: document.activeElement.id,
      submitPosition: getComputedStyle(document.querySelector('[data-step="3"] .wizard-actions')).position
    };
  })()`);
  assert.equal(step4.submitVisible, true, `${width}x${height}: Step 4 Submit must remain visible`);
  assert.equal(step4.headingVisible, true, `${width}x${height}: Step 4 must open at its heading`);
  assert.equal(step4.activeId, "reviewStepTitle", `${width}x${height}: Step 4 must not focus Submit`);
  assert.equal(step4.submitPosition, "fixed", `${width}x${height}: Step 4 action must be viewport-docked`);

  const state = await evaluate(cdp, `({
    scannerLocations: Array.from(document.querySelector('#scannerLocation').options).map(option => option.textContent),
    feedbackVisible: !document.querySelector('#openScannerFeedbackButton').hidden,
    networkControlPresent: Boolean(document.querySelector('#onlineStatus')),
    deviceSetupPresent: Boolean(document.querySelector('#deviceSetupButton')),
    reviewRows: document.querySelectorAll('#scanSummary li').length
  })`);
  assert.deepEqual(state.scannerLocations, ["Division Street", "North Ave", "EWR North", "Linden"]);
  assert.equal(state.feedbackVisible, true, "scanner feedback must be available");
  assert.equal(state.networkControlPresent, false, "scanner must not render a connectivity diagnostic");
  assert.equal(state.deviceSetupPresent, false, "scanner must not render device setup");
  assert.equal(state.reviewRows, 5, "step 4 must show exactly five operational values");
  return { viewport: `${width}x${height}`, step1, step4 };
}

async function verifyRecoveryBehavior(cdp, url) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send("Page.navigate", { url: `${url}?recovery` });
  await waitForReady(cdp);
  await evaluate(cdp, `(() => {
    document.querySelector('#startScanButton').click();
    const driver = document.querySelector('#driverInput'); driver.value = 'E1003'; driver.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#driverNext').click();
    const barcode = document.querySelector('#barcodeInput'); barcode.value = 'G0003'; barcode.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#barcodeNext').click();
    document.querySelector('#directionOut').click(); document.querySelector('#submitTransactionButton').click();
  })()`);
  await evaluate(cdp, `(() => { const state = JSON.parse(localStorage.getItem('lot-watch.gateflow.v0.7.state')); state.supervisors[0].id = 'SUP-1001'; state.migrationVersion = 7; localStorage.setItem('lot-watch.gateflow.v0.7.state', JSON.stringify(state)); })()`);
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForReady(cdp);
  const migratedSupervisor = await evaluate(cdp, "JSON.parse(localStorage.getItem('lot-watch.gateflow.v0.7.state')).supervisors[0].id");
  assert.equal(migratedSupervisor, "S1001", "legacy supervisor ID must persist as S1001 after migration");
  await evaluate(cdp, `(() => {
    document.querySelector('#startScanButton').click();
    const driver = document.querySelector('#driverInput'); driver.value = 'E1003'; driver.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#driverNext').click();
    const barcode = document.querySelector('#barcodeInput'); barcode.value = 'G9999'; barcode.dispatchEvent(new Event('input', { bubbles: true })); document.querySelector('#barcodeNext').click();
  })()`);
  const invalidNotice = await evaluate(cdp, "document.querySelector('#scannerNotice').textContent");
  assert.match(invalidNotice, /not found/i, "invalid barcode must show a clear blocking notice");
  await evaluate(cdp, `(() => { const barcode = document.querySelector('#barcodeInput'); barcode.value = 'G0003'; barcode.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const recoveredBarcode = await evaluate(cdp, `({ notice: document.querySelector('#scannerNotice').textContent, tone: document.querySelector('#scannerNotice').className, status: document.querySelector('#barcodeStatus').textContent })`);
  assert.match(recoveredBarcode.notice, /Vehicle found/i, "valid barcode must replace the stale red warning");
  assert.match(recoveredBarcode.tone, /success/, "valid barcode must use success feedback");
  assert.match(recoveredBarcode.status, /G0003/, "valid barcode must resolve the inventory record");

  await evaluate(cdp, `(() => { document.querySelector('#barcodeNext').click(); document.querySelector('#directionOut').click(); document.querySelector('#submitTransactionButton').click(); const supervisor = document.querySelector('#supervisorInput'); supervisor.value = 'SUP-1001'; supervisor.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const supervisorReady = await evaluate(cdp, `({ notice: document.querySelector('#scannerNotice').textContent, status: document.querySelector('#supervisorStatus').textContent })`);
  assert.match(supervisorReady.notice, /Supervisor found/i, "legacy supervisor ID must normalize before approval");
  assert.match(supervisorReady.status, /S1001/, "supervisor status must show the canonical ID");
  await evaluate(cdp, "document.querySelector('#approveSupervisorButton').click()");
  const approval = await evaluate(cdp, `(() => { const state = JSON.parse(localStorage.getItem('lot-watch.gateflow.v0.7.state')); const authorization = state.authorizations.find(item => item.driverEmployee === 'E1003' && item.status === 'active'); return { heading: document.querySelector('#reviewStepTitle').textContent, notice: document.querySelector('#scannerNotice').textContent, summary: document.querySelector('#scanSummary').innerText, authorizedAt: authorization?.authorizedAt, expiresAt: authorization?.expiresAt }; })()`);
  assert.match(approval.heading, /Review Vehicle OUT/, "approval must advance to the OUT review step");
  assert.match(approval.notice, /approved 9 Hours/i, "approval result must be clear");
  assert.match(approval.summary, /AUTHORIZATION/, "review must remain available after approval");
  assert.equal(new Date(approval.expiresAt).getTime() - new Date(approval.authorizedAt).getTime(), 9 * 60 * 60 * 1000, "temporary authorization must last exactly nine hours");
  return { barcode: recoveredBarcode.status, approval: approval.heading };
}

async function main() {
  assert.ok(fs.existsSync(chromePath), `Chrome is required for browser regression tests: ${chromePath}`);
  const webPort = await freePort();
  const debugPort = await freePort();
  const server = staticServer();
  await new Promise((resolve, reject) => server.listen(webPort, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gateflow-v07-browser-"));
  const chrome = spawn(chromePath, ["--headless=new", "--disable-gpu", "--no-first-run", "--no-default-browser-check", `--user-data-dir=${profile}`, `--remote-debugging-port=${debugPort}`, "--remote-allow-origins=*", "about:blank"], { stdio: "ignore" });
  let cdp;
  try {
    const pages = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    cdp = await connectCdp(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const url = `http://127.0.0.1:${webPort}/`;
    const results = [await verifyViewport(cdp, url, 360, 800), await verifyViewport(cdp, url, 412, 915), await verifyRecoveryBehavior(cdp, url)];
    console.log(`V0.7 browser regression checks passed: ${JSON.stringify(results)}`);
  } finally {
    if (cdp) cdp.close();
    if (process.platform === "win32") {
      await new Promise((resolve) => {
        const cleanup = spawn("taskkill", ["/pid", String(chrome.pid), "/t", "/f"], { stdio: "ignore" });
        cleanup.once("exit", resolve);
        cleanup.once("error", resolve);
      });
    } else {
      chrome.kill();
    }
    await new Promise((resolve) => server.close(resolve));
    for (let attempt = 0; attempt < 20; attempt += 1) {
      try {
        fs.rmSync(profile, { recursive: true, force: true });
        break;
      } catch (error) {
        if (attempt === 19) throw error;
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
    }
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
