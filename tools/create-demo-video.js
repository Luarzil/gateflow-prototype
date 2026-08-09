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
const voiceName = "Microsoft Zira Desktop";

const slides = [
  {
    file: "01-scanner-home.png",
    mode: "phone",
    title: "Scanner Home",
    caption: "Start on the phone-sized scanner. The operator confirms the working location and begins a vehicle scan.",
    narration: "GateFlow V0.7 opens on the scanner home screen. The operator confirms the working location and starts a vehicle scan.",
    duration: 4600
  },
  {
    file: "02-scanner-feedback.png",
    mode: "phone",
    title: "Scanner Feedback",
    caption: "The scanner feedback button records the current location and screen context with a short local note.",
    narration: "Scanner feedback is available from the same screen. It captures the gate location and the current scanner context, but it stays local in this prototype.",
    duration: 5200
  },
  {
    file: "03-driver-entry.png",
    mode: "phone",
    title: "Driver Entry",
    caption: "Driver IDs now use the shorter E number format. E1003 is used here to show the blocked OUT path.",
    narration: "Driver entry now uses the shorter E number format. In this walkthrough, E1003 is used so the OUT authorization rule can be shown.",
    duration: 5600
  },
  {
    file: "04-barcode-recovery.png",
    mode: "phone",
    title: "Barcode Recovery",
    caption: "A bad barcode shows a blocking warning. Correcting it to G0003 clears the warning and confirms the vehicle.",
    narration: "If the operator enters a bad vehicle barcode, the scanner blocks the movement. When the barcode is corrected to G0003, the red warning clears immediately.",
    duration: 6400
  },
  {
    file: "05-movement-choice.png",
    mode: "phone",
    title: "Movement Choice",
    caption: "After the driver and vehicle are found, the operator chooses Vehicle IN or Vehicle OUT.",
    narration: "After the driver and vehicle are found, the operator chooses whether the vehicle is coming in or going out.",
    duration: 4800
  },
  {
    file: "06-out-blocked.png",
    mode: "phone",
    title: "OUT Blocked",
    caption: "Unauthorized Vehicle OUT is blocked and requires supervisor approval before the scan can continue.",
    narration: "Vehicle OUT remains blocked when the driver is not currently authorized. The operator is sent to supervisor authorization instead of being allowed to submit.",
    duration: 5700
  },
  {
    file: "07-supervisor-approval.png",
    mode: "phone",
    title: "Supervisor Approval",
    caption: "Supervisor S1001 approves the fixed 9-hour temporary authorization. Old SUP-1001 entry is also accepted.",
    narration: "The supervisor enters S1001 and approves a fixed nine hour temporary authorization. The older SUP dash one zero zero one style is also normalized.",
    duration: 6200
  },
  {
    file: "08-review-out.png",
    mode: "phone",
    title: "Review OUT",
    caption: "After approval, the scan returns to Review Vehicle OUT with five operational summary lines.",
    narration: "After approval, GateFlow advances to the Vehicle OUT review screen. The summary stays lean: movement, location, driver, vehicle, and authorization.",
    duration: 5600
  },
  {
    file: "09-complete.png",
    mode: "phone",
    title: "Movement Recorded",
    caption: "Submitting the movement records it locally and returns the operator to the next scan path.",
    narration: "Submitting the movement records the transaction locally for this browser prototype and returns the operator to the next scan path.",
    duration: 5000
  },
  {
    file: "10-recent-activity.png",
    mode: "phone",
    title: "Recent Activity",
    caption: "The scanner home shows current gate counts and recent activity for quick review.",
    narration: "Back on the scanner home screen, the operator can see the current gate counts and recent activity.",
    duration: 5000
  },
  {
    file: "11-supervisor-drivers.png",
    mode: "desktop",
    title: "Supervisor: Drivers",
    caption: "Drivers shows the roster, license status, active authorizations, and bulk authorization controls.",
    narration: "The Supervisor Drivers page manages the driver roster, license warnings, active authorizations, and bulk authorization controls.",
    duration: 6400
  },
  {
    file: "12-driver-form.png",
    mode: "desktop",
    title: "Add/Edit Driver",
    caption: "Driver records include employee number, driver name, license expiration, and active/inactive status.",
    narration: "The driver form includes employee number, driver name, license expiration, and whether the driver is active.",
    duration: 5700
  },
  {
    file: "13-supervisor-vehicles.png",
    mode: "desktop",
    title: "Supervisor: Vehicles",
    caption: "Vehicles supports barcode, VIN, plate, make, model, year, color, and active/inactive inventory review.",
    narration: "The Vehicles page manages the active inventory and supports searches across barcode, VIN, plate, make, model, year, and color.",
    duration: 6400
  },
  {
    file: "14-vehicle-form.png",
    mode: "desktop",
    title: "Add/Edit Vehicle",
    caption: "Vehicle records keep the assigned G barcode, VIN, plate, description, and inventory status together.",
    narration: "The vehicle form keeps the assigned G barcode, VIN, plate, vehicle description, and inventory status together.",
    duration: 5900
  },
  {
    file: "15-supervisor-devices.png",
    mode: "desktop",
    title: "Supervisor: Devices",
    caption: "Device setup is no longer inside the scan path. It lives under Supervisor > Devices.",
    narration: "Device setup was removed from the operator scan path. It now lives in Supervisor, under Devices, where fixed and floater scanners can be managed.",
    duration: 6500
  },
  {
    file: "16-supervisor-users.png",
    mode: "desktop",
    title: "Supervisor: Users",
    caption: "Prototype desktop users are separate from driver records. Real authentication is still a future AWS-backed step.",
    narration: "The Users page separates prototype desktop users from driver records. Real authentication and backend role enforcement are still future AWS backed work.",
    duration: 6400
  },
  {
    file: "17-search.png",
    mode: "desktop",
    title: "Movement Search",
    caption: "Search filters movement history by barcode, VIN, plate, driver, location, date, and IN or OUT.",
    narration: "The Search page lets a manager filter movement history by vehicle, driver, location, date, and whether the movement was in or out.",
    duration: 6200
  },
  {
    file: "18-supervisor-feedback.png",
    mode: "desktop",
    title: "Supervisor Feedback",
    caption: "Supervisor feedback allows a longer local note with context for review.",
    narration: "Supervisor feedback supports a longer note and captures desktop review context. Like scanner feedback, it remains local until the shared backend is built.",
    duration: 6000
  },
  {
    file: "19-review-boundaries.png",
    mode: "desktop",
    title: "Prototype Boundaries",
    caption: "V0.7 is ready for review, but production still needs AWS data, real auth, shared devices, printing, and final hardware integration.",
    narration: "This V0.7 package is ready for review, but it is still a browser local prototype. The production system still needs AWS data, real authentication, shared devices, printing, and final hardware integration.",
    duration: 7000
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
  await setViewport(cdp, 390, 844, true);
  await cdp.send("Page.navigate", { url: `${appUrl}?demo=${Date.now()}` });
  await waitForReady(cdp);
  await evaluate(cdp, "localStorage.clear()");
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForReady(cdp);
  await screenshot(cdp, "01-scanner-home.png");

  await evaluate(cdp, "document.querySelector('#openScannerFeedbackButton').click()");
  await screenshot(cdp, "02-scanner-feedback.png");
  await evaluate(cdp, "document.querySelector('#closeFeedbackButton').click()");

  await evaluate(cdp, `(() => {
    document.querySelector('#startScanButton').click();
    const driver = document.querySelector('#driverInput');
    driver.value = 'E1003';
    driver.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#driverNext').click();
  })()`);
  await screenshot(cdp, "03-driver-entry.png");

  await evaluate(cdp, `(() => {
    const barcode = document.querySelector('#barcodeInput');
    barcode.value = 'G9999';
    barcode.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#barcodeNext').click();
    barcode.value = 'G0003';
    barcode.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await screenshot(cdp, "04-barcode-recovery.png");

  await evaluate(cdp, "document.querySelector('#barcodeNext').click()");
  await screenshot(cdp, "05-movement-choice.png");

  await evaluate(cdp, "document.querySelector('#directionOut').click(); document.querySelector('#submitTransactionButton').click()");
  await screenshot(cdp, "06-out-blocked.png");

  await evaluate(cdp, `(() => {
    const supervisor = document.querySelector('#supervisorInput');
    supervisor.value = 'S1001';
    supervisor.dispatchEvent(new Event('input', { bubbles: true }));
  })()`);
  await screenshot(cdp, "07-supervisor-approval.png");

  await evaluate(cdp, "document.querySelector('#approveSupervisorButton').click()");
  await screenshot(cdp, "08-review-out.png");

  await evaluate(cdp, "document.querySelector('#submitTransactionButton').click()");
  await screenshot(cdp, "09-complete.png");

  await evaluate(cdp, "document.querySelector('#confirmationDoneButton').click()");
  await screenshot(cdp, "10-recent-activity.png");

  await setViewport(cdp, 1366, 900, false);
  await evaluate(cdp, "document.querySelector('[data-view=\"supervisorView\"]').click()");
  await screenshot(cdp, "11-supervisor-drivers.png");

  await evaluate(cdp, "document.querySelector('#addDriverButton').click()");
  await screenshot(cdp, "12-driver-form.png");
  await evaluate(cdp, "document.querySelector('#closeDriverModalButton').click()");

  await evaluate(cdp, "document.querySelector('[data-supervisor-section=\"vehiclesSection\"]').click()");
  await screenshot(cdp, "13-supervisor-vehicles.png");

  await evaluate(cdp, "document.querySelector('#addVehicleButton').click()");
  await screenshot(cdp, "14-vehicle-form.png");
  await evaluate(cdp, "document.querySelector('#closeVehicleModalButton').click()");

  await evaluate(cdp, "document.querySelector('[data-supervisor-section=\"devicesSection\"]').click()");
  await screenshot(cdp, "15-supervisor-devices.png");

  await evaluate(cdp, "document.querySelector('[data-supervisor-section=\"usersSection\"]').click()");
  await screenshot(cdp, "16-supervisor-users.png");

  await evaluate(cdp, `(() => {
    document.querySelector('[data-view="searchView"]').click();
    const driver = document.querySelector('#filterDriver');
    driver.value = 'E1003';
    driver.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('#searchForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await screenshot(cdp, "17-search.png");

  await evaluate(cdp, "document.querySelector('[data-view=\"supervisorView\"]').click(); document.querySelector('#openSupervisorFeedbackButton').click()");
  await screenshot(cdp, "18-supervisor-feedback.png");
  await evaluate(cdp, "document.querySelector('#closeFeedbackButton').click()");

  await cdp.send("Page.navigate", { url: `${appUrl}docs/GATEFLOW_V0.7_RELEASE_PACKET.md` });
  await waitForReady(cdp);
  await screenshot(cdp, "19-review-boundaries.png");
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
  await cdp.send("Page.navigate", { url: `${appUrl}docs/media/gateflow-v07-demo.html?record=1` });
  await waitForReady(cdp);
  const result = await evaluate(cdp, `recordGateFlowDemo(${JSON.stringify(timelineSlides)})`);
  fs.writeFileSync(videoPath, Buffer.from(result.base64, "base64"));
  return result;
}

function writeFallbackHtml(timelineSlides) {
  const slidesMarkup = slides.map((slide, index) => `
      <section class="slide">
        <img src="gateflow-v07-demo-frames/${slide.file}" alt="${slide.title}">
        <div>
          <p class="step">Step ${index + 1} of ${slides.length}</p>
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
  <title>GateFlow V0.7 Full Walkthrough</title>
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
    <h1>GateFlow V0.7 Full Walkthrough</h1>
  </header>
  <main>
    <p>This walkthrough shows the scanner flow, temporary authorization, Supervisor pages, Search, Feedback, and prototype boundaries.</p>
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
