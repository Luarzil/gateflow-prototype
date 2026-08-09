const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const mediaDir = path.join(root, "docs", "media");
const frameDir = path.join(mediaDir, "gateflow-v07-demo-frames");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const audioPath = path.join(mediaDir, "gateflow-v07-demo-audio.wav");
const videoPath = path.join(mediaDir, "gateflow-v07-demo.webm");
const htmlPath = path.join(mediaDir, "gateflow-v07-demo.html");

const narration = [
  "GateFlow V0.7 starts with a clean scanner screen for the current gate location.",
  "The driver can be scanned or typed with the shorter E number format.",
  "The vehicle barcode uses the shorter G number format. If a bad code is corrected, the warning clears right away.",
  "Vehicle OUT remains blocked when the driver is not authorized.",
  "A supervisor can approve the fixed nine hour temporary authorization.",
  "After approval, GateFlow advances to the Vehicle OUT review screen without restarting the scan.",
  "The final review shows only movement, location, driver, vehicle, and authorization."
];

const slides = [
  { file: "01-start.png", title: "Start Scanner", caption: "The scanner opens on the working location with a simple start action.", duration: 3200 },
  { file: "02-driver.png", title: "Driver Entry", caption: "Enter or scan the driver as E1003. The old EMP prefix is no longer needed.", duration: 3900 },
  { file: "03-barcode-recovered.png", title: "Vehicle Barcode", caption: "After a bad code, correcting to G0003 clears the red warning and confirms the vehicle.", duration: 4800 },
  { file: "04-out-blocked.png", title: "OUT Blocked", caption: "Vehicle OUT is blocked when the driver needs authorization.", duration: 4300 },
  { file: "05-supervisor-ready.png", title: "Supervisor Approval", caption: "Enter S1001 to approve the fixed 9-hour temporary authorization.", duration: 4200 },
  { file: "06-review-out.png", title: "Review Vehicle OUT", caption: "After approval, the scan advances to the OUT review screen.", duration: 4200 },
  { file: "07-complete.png", title: "Movement Recorded", caption: "The submitted movement appears in recent activity.", duration: 3600 }
];

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
  const contentTypes = {
    ".html": "text/html",
    ".js": "text/javascript",
    ".css": "text/css",
    ".svg": "image/svg+xml",
    ".webmanifest": "application/manifest+json",
    ".png": "image/png",
    ".wav": "audio/wav",
    ".webm": "video/webm"
  };
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

async function waitForJson(url, attempts = 100) {
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    try {
      const response = await fetch(url);
      if (response.ok) return response.json();
    } catch {}
    await new Promise((resolve) => setTimeout(resolve, 80));
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
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (await evaluate(cdp, "document.readyState === 'complete'")) return;
    await new Promise((resolve) => setTimeout(resolve, 80));
  }
  throw new Error("Page did not finish loading");
}

async function screenshot(cdp, filename) {
  await new Promise((resolve) => setTimeout(resolve, 250));
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(frameDir, filename), Buffer.from(result.data, "base64"));
}

async function captureFrames(cdp, appUrl) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await cdp.send("Page.navigate", { url: `${appUrl}?demo=${Date.now()}` });
  await waitForReady(cdp);
  await evaluate(cdp, "localStorage.clear()");
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForReady(cdp);
  await screenshot(cdp, "01-start.png");

  await evaluate(cdp, `(() => {
    document.querySelector('#startScanButton').click();
    const driver = document.querySelector('#driverInput');
    driver.value = 'E1003';
    driver.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#driverNext').click();
  })()`);
  await screenshot(cdp, "02-driver.png");

  await evaluate(cdp, `(() => {
    const barcode = document.querySelector('#barcodeInput');
    barcode.value = 'G9999';
    barcode.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#barcodeNext').click();
    barcode.value = 'G0003';
    barcode.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await screenshot(cdp, "03-barcode-recovered.png");

  await evaluate(cdp, `(() => {
    document.querySelector('#barcodeNext').click();
    document.querySelector('#directionOut').click();
    document.querySelector('#submitTransactionButton').click();
  })()`);
  await screenshot(cdp, "04-out-blocked.png");

  await evaluate(cdp, `(() => {
    const supervisor = document.querySelector('#supervisorInput');
    supervisor.value = 'S1001';
    supervisor.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await screenshot(cdp, "05-supervisor-ready.png");

  await evaluate(cdp, "document.querySelector('#approveSupervisorButton').click()");
  await screenshot(cdp, "06-review-out.png");

  await evaluate(cdp, "document.querySelector('#submitTransactionButton').click()");
  await screenshot(cdp, "07-complete.png");
}

function createNarration() {
  const text = narration.join(" ");
  const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile('${audioPath.replace(/'/g, "''")}')
$synth.Speak('${text.replace(/'/g, "''")}')
$synth.Dispose()
`;
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Speech synthesis failed");
}

async function createWebm(cdp, appUrl) {
  await cdp.send("Page.navigate", { url: `${appUrl}docs/media/gateflow-v07-demo.html?record=1` });
  await waitForReady(cdp);
  const result = await evaluate(cdp, `recordGateFlowDemo(${JSON.stringify(slides)})`);
  fs.writeFileSync(videoPath, Buffer.from(result.base64, "base64"));
  return result;
}

function writeFallbackHtml() {
  const slidesMarkup = slides.map((slide) => `
      <section class="slide">
        <img src="gateflow-v07-demo-frames/${slide.file}" alt="${slide.title}">
        <div>
          <h2>${slide.title}</h2>
          <p>${slide.caption}</p>
        </div>
      </section>`).join("\n");
  const recorderScript = `
    async function recordGateFlowDemo(slides) {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const audio = new Audio('gateflow-v07-demo-audio.wav');
      let stream = canvas.captureStream(30);
      try {
        const audioContext = new AudioContext();
        const source = audioContext.createMediaElementSource(audio);
        const destination = audioContext.createMediaStreamDestination();
        source.connect(destination);
        stream = new MediaStream([...stream.getVideoTracks(), ...destination.stream.getAudioTracks()]);
        await audioContext.resume();
      } catch (error) {
        console.warn('Audio capture unavailable, recording video only.', error);
      }
      const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : 'video/webm';
      const chunks = [];
      const recorder = new MediaRecorder(stream, { mimeType });
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
      const images = await Promise.all(slides.map((slide) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = 'gateflow-v07-demo-frames/' + slide.file;
      })));
      const drawSlide = (slide, image, progress) => {
        ctx.fillStyle = '#f4f7f4';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#0f3f36';
        ctx.fillRect(0, 0, canvas.width, 84);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 32px Arial';
        ctx.fillText('Lot Watch / GateFlow V0.7', 42, 54);
        const phoneX = 80;
        const phoneY = 118;
        const phoneH = 552;
        const phoneW = Math.round(image.width * (phoneH / image.height));
        ctx.fillStyle = '#10241f';
        ctx.roundRect(phoneX - 14, phoneY - 14, phoneW + 28, phoneH + 28, 28);
        ctx.fill();
        ctx.drawImage(image, phoneX, phoneY, phoneW, phoneH);
        ctx.fillStyle = '#10241f';
        ctx.font = '700 44px Arial';
        ctx.fillText(slide.title, 580, 212);
        ctx.fillStyle = '#30423c';
        ctx.font = '28px Arial';
        const words = slide.caption.split(' ');
        let line = '';
        let y = 274;
        for (const word of words) {
          const testLine = line ? line + ' ' + word : word;
          if (ctx.measureText(testLine).width > 590) {
            ctx.fillText(line, 580, y);
            line = word;
            y += 40;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, 580, y);
        ctx.fillStyle = '#0a7d68';
        ctx.fillRect(580, 620, Math.round(560 * progress), 10);
        ctx.fillStyle = '#cbd9d5';
        ctx.fillRect(580 + Math.round(560 * progress), 620, Math.round(560 * (1 - progress)), 10);
      };
      recorder.start();
      audio.play().catch(() => {});
      for (let i = 0; i < slides.length; i += 1) {
        const started = performance.now();
        while (performance.now() - started < slides[i].duration) {
          drawSlide(slides[i], images[i], (i + (performance.now() - started) / slides[i].duration) / slides.length);
          await new Promise((resolve) => requestAnimationFrame(resolve));
        }
      }
      recorder.stop();
      await new Promise((resolve) => { recorder.onstop = resolve; });
      const blob = new Blob(chunks, { type: mimeType });
      const buffer = await blob.arrayBuffer();
      let binary = '';
      const bytes = new Uint8Array(buffer);
      const chunkSize = 0x8000;
      for (let i = 0; i < bytes.length; i += chunkSize) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
      }
      return { mimeType, size: bytes.length, base64: btoa(binary) };
    }
  `;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>GateFlow V0.7 Scanner Walkthrough</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #10241f; background: #f4f7f4; }
    header { background: #0f3f36; color: white; padding: 22px; }
    main { max-width: 980px; margin: 0 auto; padding: 24px; }
    video, audio { width: 100%; margin: 16px 0; }
    .slide { display: grid; grid-template-columns: minmax(240px, 390px) 1fr; gap: 24px; padding: 20px 0; border-top: 1px solid #cbd9d5; align-items: center; }
    .slide img { width: 100%; border: 1px solid #aebfba; border-radius: 8px; background: white; }
    .slide h2 { margin: 0 0 8px; font-size: 24px; }
    .slide p { margin: 0; font-size: 17px; line-height: 1.5; }
    @media (max-width: 720px) { .slide { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>GateFlow V0.7 Scanner Walkthrough</h1>
  </header>
  <main>
    <p>This short walkthrough shows the updated scanner flow, blocked OUT path, 9-hour supervisor approval, and return to review.</p>
    <video controls src="gateflow-v07-demo.webm"></video>
    <audio controls src="gateflow-v07-demo-audio.wav"></audio>
${slidesMarkup}
  </main>
  <script>${recorderScript}</script>
</body>
</html>
`;
  fs.writeFileSync(htmlPath, html);
}

async function main() {
  if (!fs.existsSync(chromePath)) throw new Error(`Chrome is required: ${chromePath}`);
  fs.mkdirSync(frameDir, { recursive: true });
  for (const file of fs.readdirSync(frameDir)) fs.rmSync(path.join(frameDir, file), { force: true });
  createNarration();
  writeFallbackHtml();

  const webPort = await freePort();
  const debugPort = await freePort();
  const server = staticServer();
  await new Promise((resolve, reject) => server.listen(webPort, "127.0.0.1", (error) => error ? reject(error) : resolve()));
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), "gateflow-v07-demo-"));
  const chrome = spawn(chromePath, [
    "--headless=new",
    "--disable-gpu",
    "--no-first-run",
    "--no-default-browser-check",
    "--autoplay-policy=no-user-gesture-required",
    `--user-data-dir=${profile}`,
    `--remote-debugging-port=${debugPort}`,
    "--remote-allow-origins=*",
    "about:blank"
  ], { stdio: "ignore" });
  let cdp;
  try {
    const pages = await waitForJson(`http://127.0.0.1:${debugPort}/json/list`);
    cdp = await connectCdp(pages.find((page) => page.type === "page").webSocketDebuggerUrl);
    await cdp.send("Page.enable");
    await cdp.send("Runtime.enable");
    const appUrl = `http://127.0.0.1:${webPort}/`;
    await captureFrames(cdp, appUrl);
    const video = await createWebm(cdp, appUrl);
    console.log(JSON.stringify({ audio: audioPath, video: videoPath, html: htmlPath, videoMimeType: video.mimeType, videoBytes: video.size }, null, 2));
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
