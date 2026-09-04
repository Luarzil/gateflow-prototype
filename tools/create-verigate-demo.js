const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const mediaDir = path.join(root, "docs", "media");
const frameDir = path.join(mediaDir, "verigate-v08-demo-frames");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const audioPath = path.join(mediaDir, "verigate-v08-demo-audio.wav");
const videoPath = path.join(mediaDir, "verigate-v08-demo.webm");
const htmlPath = path.join(mediaDir, "verigate-v08-demo.html");
const voiceName = "Microsoft Zira Desktop";

const slides = [
  {
    file: "01-scanner-home.png",
    mode: "phone",
    title: "The Scanner",
    caption: "A gate operator opens Veri-Gate on the handheld. On a phone it shows the scanner and nothing else.",
    narration: "This is Veri-Gate version zero point eight. On a handheld, the operator sees only the scanner. The supervisor screens are not there at all, so there is nothing to tap into by accident during a shift.",
    duration: 5200
  },
  {
    file: "02-driver-entry.png",
    mode: "phone",
    title: "Step One: The Driver",
    caption: "The operator scans or types the driver employee number.",
    narration: "The workflow is four guided steps. First, the driver employee number is scanned or entered.",
    duration: 4200
  },
  {
    file: "03-unknown-vehicle.png",
    mode: "phone",
    title: "A Vehicle We Have Never Seen",
    caption: "An unknown barcode is accepted. The operator is not interrupted.",
    narration: "Here is the change Patrick asked for. This vehicle is not in inventory. The scanner accepts it anyway and does not stop to ask for approval. Vehicles coming in are not the risk.",
    duration: 6200
  },
  {
    file: "04-movement-choice.png",
    mode: "phone",
    title: "Step Three: Direction",
    caption: "The operator chooses Vehicle IN or Vehicle OUT.",
    narration: "The operator chooses the direction of travel.",
    duration: 3600
  },
  {
    file: "05-submitted-home.png",
    mode: "phone",
    title: "Straight Back to Work",
    caption: "After submitting, the scanner returns immediately to the home screen.",
    narration: "After submitting, the scanner goes straight back to the start. The old confirmation screen and its extra tap are gone, exactly as requested in the August fifteenth notes. At a busy gate that time adds up.",
    duration: 6000
  },
  {
    file: "06-out-blocked.png",
    mode: "phone",
    title: "The Rule That Matters",
    caption: "The same vehicle is refused on the way OUT.",
    narration: "Now the same vehicle tries to leave. It is blocked. Being allowed in did not make it authorised to go out. That rule is enforced in the database itself, not just on this screen, so it holds even if something goes wrong in the app.",
    duration: 7000
  },
  {
    file: "07-console-shell.png",
    mode: "desktop",
    title: "The Supervisor Console",
    caption: "On a computer, the same build shows the full console.",
    narration: "On a computer, the same application shows the full supervisor console. One codebase, two experiences, decided by the screen it opens on.",
    duration: 5200
  },
  {
    file: "08-incomplete-queue.png",
    mode: "desktop",
    title: "Incomplete Inventory",
    caption: "Vehicles added by an inbound scan appear in a queue for completion.",
    narration: "Every vehicle the scanner added automatically appears here, with the missing information listed. This is the supervisor work item Patrick asked for.",
    duration: 5600
  },
  {
    file: "09-complete-record.png",
    mode: "desktop",
    title: "Completing the Record",
    caption: "The supervisor fills in the vehicle details.",
    narration: "The supervisor completes the record with the vehicle details.",
    duration: 4200
  },
  {
    file: "10-out-allowed.png",
    mode: "phone",
    title: "Released",
    caption: "With the record complete, the vehicle is allowed OUT.",
    narration: "With the record complete, the same vehicle is now allowed out. Nothing was blocked permanently. It simply waited for a person to confirm what it was.",
    duration: 5600
  },
  {
    file: "11-override-role.png",
    mode: "phone",
    title: "Fleet Lead And Above",
    caption: "An under-ranked approver cannot authorise a blocked OUT.",
    narration: "When a driver needs an override, only a Fleet Lead or above can approve it. A scanner-level ID is refused and the refusal is recorded. This was checked and confirmed.",
    duration: 6000
  },
  {
    file: "12-search.png",
    mode: "desktop",
    title: "Search And History",
    caption: "Movements remain searchable by driver, vehicle, plate, VIN, location and date.",
    narration: "Everything recorded stays searchable by driver, vehicle, plate, licence number, location and date.",
    duration: 5200
  }
];

function wavDurationMs(filename) {
  const buffer = fs.readFileSync(filename);
  const sampleRate = buffer.readUInt32LE(24);
  const channels = buffer.readUInt16LE(22);
  const bitsPerSample = buffer.readUInt16LE(34);
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.subarray(offset, offset + 4).toString("ascii");
    const chunkSize = buffer.readUInt32LE(offset + 4);
    if (chunkId === "data") {
      return Math.ceil((chunkSize / (sampleRate * channels * (bitsPerSample / 8))) * 1000);
    }
    offset += 8 + chunkSize;
  }
  throw new Error(`Could not find WAV data chunk in ${filename}`);
}

function fitSlidesToAudio(sourceSlides, audioMs) {
  const baseMs = sourceSlides.reduce((sum, slide) => sum + slide.duration, 0);
  const targetMs = Math.max(baseMs, audioMs + 3000);
  const scale = targetMs / baseMs;
  return sourceSlides.map((slide) => ({
    ...slide,
    duration: Math.ceil(slide.duration * scale)
  }));
}

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

async function setViewport(cdp, width, height, mobile) {
  await cdp.send("Emulation.setDeviceMetricsOverride", { width, height, deviceScaleFactor: 1, mobile });
}

async function screenshot(cdp, filename) {
  await new Promise((resolve) => setTimeout(resolve, 350));
  const result = await cdp.send("Page.captureScreenshot", { format: "png", captureBeyondViewport: false });
  fs.writeFileSync(path.join(frameDir, filename), Buffer.from(result.data, "base64"));
}

async function captureFrames(cdp, appUrl) {
  const phone = () => setViewport(cdp, 390, 844, true);
  const desktop = () => setViewport(cdp, 1366, 900, false);
  const type = (sel, value) => evaluate(cdp, `(() => { const n = document.querySelector('${sel}'); n.value = '${value}'; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const click = (sel) => evaluate(cdp, `document.querySelector('${sel}').click()`);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));

  await phone();
  await cdp.send("Page.navigate", { url: `${appUrl}?shell=scanner&demo=${Date.now()}` });
  await waitForReady(cdp);
  await evaluate(cdp, "localStorage.clear()");
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForReady(cdp);
  await pause(400);
  await screenshot(cdp, "01-scanner-home.png");

  await click('#startScanButton');
  await type('#driverInput', 'E1001');
  await pause(200);
  await screenshot(cdp, "02-driver-entry.png");

  await click('#driverNext');
  await type('#barcodeInput', 'G9001');
  await pause(200);
  await screenshot(cdp, "03-unknown-vehicle.png");

  await click('#barcodeNext');
  await pause(200);
  await screenshot(cdp, "04-movement-choice.png");

  await click('#directionIn');
  await click('#submitTransactionButton');
  await pause(600);
  await screenshot(cdp, "05-submitted-home.png");

  await click('#startScanButton');
  await type('#driverInput', 'E1001');
  await click('#driverNext');
  await type('#barcodeInput', 'G9001');
  await click('#barcodeNext');
  await click('#directionOut');
  await click('#submitTransactionButton');
  await pause(500);
  await screenshot(cdp, "06-out-blocked.png");

  await desktop();
  await cdp.send("Page.navigate", { url: `${appUrl}?shell=console` });
  await waitForReady(cdp);
  await pause(500);
  await screenshot(cdp, "07-console-shell.png");

  await evaluate(cdp, "document.querySelector('[data-view=\"supervisorView\"]').click(); document.querySelector('[data-supervisor-section=\"vehiclesSection\"]').click()");
  await pause(400);
  await screenshot(cdp, "08-incomplete-queue.png");

  await evaluate(cdp, `(() => {
    const btn = [...document.querySelectorAll('[data-vehicle-action="edit"]')].pop();
    if (btn) btn.click();
  })()`);
  await pause(400);
  await evaluate(cdp, `(() => {
    const set = (id, v) => { const n = document.querySelector(id); if (n) { n.value = v; n.dispatchEvent(new Event('input', { bubbles: true })); } };
    set('#vehicleMake', 'Ford'); set('#vehicleModel', 'Transit'); set('#vehicleYear', '2022');
    set('#vehicleColor', 'White'); set('#vehicleVin', '1FTBW2CM5NKA12345'); set('#vehiclePlate', 'PROV-08');
  })()`);
  await pause(300);
  await screenshot(cdp, "09-complete-record.png");

  await evaluate(cdp, "document.querySelector('#vehicleForm button[type=\"submit\"]').click()");
  await pause(500);

  await phone();
  await cdp.send("Page.navigate", { url: `${appUrl}?shell=scanner` });
  await waitForReady(cdp);
  await pause(400);
  await click('#startScanButton');
  await type('#driverInput', 'E1001');
  await click('#driverNext');
  await type('#barcodeInput', 'G9001');
  await click('#barcodeNext');
  await click('#directionOut');
  await click('#submitTransactionButton');
  await pause(600);
  await screenshot(cdp, "10-out-allowed.png");

  await click('#startScanButton');
  await type('#driverInput', 'E1003');
  await click('#driverNext');
  await type('#barcodeInput', 'G0003');
  await click('#barcodeNext');
  await click('#directionOut');
  await click('#submitTransactionButton');
  await pause(500);
  await type('#supervisorInput', 'S3090');
  await pause(200);
  await evaluate(cdp, "const b=document.querySelector('#approveSupervisorButton'); if(b) b.click();");
  await pause(400);
  await screenshot(cdp, "11-override-role.png");

  await desktop();
  await cdp.send("Page.navigate", { url: `${appUrl}?shell=console` });
  await waitForReady(cdp);
  await evaluate(cdp, `(() => {
    document.querySelector('[data-view="searchView"]').click();
    const d = document.querySelector('#filterDriver');
    if (d) { d.value = 'E1001'; d.dispatchEvent(new Event('input', { bubbles: true })); }
    document.querySelector('#searchForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await pause(500);
  await screenshot(cdp, "12-search.png");
}

function createNarration() {
  const text = slides.map((slide) => slide.narration).join(" ");
  const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq '${voiceName.replace(/'/g, "''")}' } | Select-Object -First 1
if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) }
$synth.Rate = 0
$synth.Volume = 100
$synth.SetOutputToWaveFile('${audioPath.replace(/'/g, "''")}')
$synth.Speak('${text.replace(/'/g, "''")}')
$synth.Dispose()
`;
  const result = spawnSync("powershell", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", ps], { encoding: "utf8" });
  if (result.status !== 0) throw new Error(result.stderr || "Speech synthesis failed");
}

async function createWebm(cdp, appUrl, timelineSlides) {
  await cdp.send("Page.navigate", { url: `${appUrl}docs/media/verigate-v08-demo.html?record=1` });
  await waitForReady(cdp);
  const result = await evaluate(cdp, `recordVeriGateDemo(${JSON.stringify(timelineSlides)})`);
  fs.writeFileSync(videoPath, Buffer.from(result.base64, "base64"));
  return result;
}

function writeFallbackHtml(timelineSlides) {
  const slidesMarkup = slides.map((slide, index) => `
      <section class="slide">
        <img src="verigate-v08-demo-frames/${slide.file}" alt="${slide.title}">
        <div>
          <p class="step">Step ${index + 1} of ${slides.length}</p>
          <h2>${slide.title}</h2>
          <p>${slide.caption}</p>
        </div>
      </section>`).join("\n");
  const recorderScript = `
    async function recordVeriGateDemo(slides) {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const audio = new Audio('verigate-v08-demo-audio.wav');
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
        image.src = 'verigate-v08-demo-frames/' + slide.file;
      })));
      const roundRect = (x, y, width, height, radius) => {
        ctx.beginPath();
        ctx.moveTo(x + radius, y);
        ctx.arcTo(x + width, y, x + width, y + height, radius);
        ctx.arcTo(x + width, y + height, x, y + height, radius);
        ctx.arcTo(x, y + height, x, y, radius);
        ctx.arcTo(x, y, x + width, y, radius);
        ctx.closePath();
      };
      const wrapText = (text, x, y, maxWidth, lineHeight) => {
        const words = text.split(' ');
        let line = '';
        for (const word of words) {
          const testLine = line ? line + ' ' + word : word;
          if (ctx.measureText(testLine).width > maxWidth) {
            ctx.fillText(line, x, y);
            line = word;
            y += lineHeight;
          } else {
            line = testLine;
          }
        }
        ctx.fillText(line, x, y);
      };
      const drawSlide = (slide, image, index, progress) => {
        ctx.fillStyle = '#f4f7f4';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = '#169A5A';
        ctx.fillRect(0, 0, canvas.width, 78);
        ctx.fillStyle = '#ffffff';
        ctx.font = '700 30px Arial';
        ctx.fillText('Lot Watch / GateFlow V0.7', 40, 50);
        ctx.font = '18px Arial';
        ctx.fillText('Full review walkthrough', 910, 49);

        if (slide.mode === 'phone') {
          const phoneH = 560;
          const phoneW = Math.round(image.width * (phoneH / image.height));
          const phoneX = 82;
          const phoneY = 112;
          ctx.fillStyle = '#004B2E';
          roundRect(phoneX - 14, phoneY - 14, phoneW + 28, phoneH + 28, 26);
          ctx.fill();
          ctx.drawImage(image, phoneX, phoneY, phoneW, phoneH);
          ctx.fillStyle = '#004B2E';
          ctx.font = '700 42px Arial';
          ctx.fillText(slide.title, 565, 194);
          ctx.fillStyle = '#30423c';
          ctx.font = '27px Arial';
          wrapText(slide.caption, 565, 260, 620, 39);
        } else {
          const shotW = 760;
          const shotH = Math.round(image.height * (shotW / image.width));
          const shotX = 42;
          const shotY = 122;
          ctx.fillStyle = '#004B2E';
          roundRect(shotX - 10, shotY - 10, shotW + 20, shotH + 20, 16);
          ctx.fill();
          ctx.drawImage(image, shotX, shotY, shotW, shotH);
          ctx.fillStyle = '#004B2E';
          ctx.font = '700 38px Arial';
          ctx.fillText(slide.title, 850, 186);
          ctx.fillStyle = '#30423c';
          ctx.font = '25px Arial';
          wrapText(slide.caption, 850, 248, 360, 36);
        }

        ctx.fillStyle = '#647b75';
        ctx.font = '18px Arial';
        ctx.fillText('Step ' + (index + 1) + ' of ' + slides.length, 40, 694);
        ctx.fillStyle = '#169A5A';
        ctx.fillRect(160, 681, Math.round(960 * progress), 10);
        ctx.fillStyle = '#cbd9d5';
        ctx.fillRect(160 + Math.round(960 * progress), 681, Math.round(960 * (1 - progress)), 10);
      };
      recorder.start();
      audio.play().catch(() => {});
      for (let i = 0; i < slides.length; i += 1) {
        const started = performance.now();
        while (performance.now() - started < slides[i].duration) {
          drawSlide(slides[i], images[i], i, (i + (performance.now() - started) / slides[i].duration) / slides.length);
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
      return { mimeType, size: bytes.length, durationMs: slides.reduce((sum, slide) => sum + slide.duration, 0), base64: btoa(binary) };
    }
  `;
  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Veri-Gate V0.8 Walkthrough</title>
  <style>
    body { margin: 0; font-family: Arial, sans-serif; color: #10241f; background: #f4f7f4; }
    header { background: #169A5A; color: white; padding: 22px; }
    main { max-width: 1120px; margin: 0 auto; padding: 24px; }
    video, audio { width: 100%; margin: 16px 0; }
    .slide { display: grid; grid-template-columns: minmax(280px, 560px) 1fr; gap: 24px; padding: 20px 0; border-top: 1px solid #cbd9d5; align-items: center; }
    .slide img { width: 100%; border: 1px solid #aebfba; border-radius: 8px; background: white; }
    .slide h2 { margin: 0 0 8px; font-size: 24px; }
    .slide p { margin: 0; font-size: 17px; line-height: 1.5; }
    .slide .step { color: #169A5A; font-weight: 700; text-transform: uppercase; font-size: 12px; letter-spacing: .04em; margin-bottom: 8px; }
    @media (max-width: 760px) { .slide { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>Veri-Gate V0.8 Walkthrough</h1>
  </header>
  <main>
    <p>This walkthrough shows the scanner flow, temporary authorization, Supervisor pages, Search, Feedback, and prototype boundaries.</p>
    <video controls src="verigate-v08-demo.webm"></video>
    <audio controls src="verigate-v08-demo-audio.wav"></audio>
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
  const audioMs = wavDurationMs(audioPath);
  const timelineSlides = fitSlidesToAudio(slides, audioMs);
  writeFallbackHtml(timelineSlides);

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
    const video = await createWebm(cdp, appUrl, timelineSlides);
    console.log(JSON.stringify({
      audio: audioPath,
      video: videoPath,
      html: htmlPath,
      slides: slides.length,
      voice: voiceName,
      audioSeconds: Math.round(audioMs / 10) / 100,
      plannedVideoSeconds: Math.round(video.durationMs / 10) / 100,
      videoMimeType: video.mimeType,
      videoBytes: video.size
    }, null, 2));
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
