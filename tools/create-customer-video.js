const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const os = require("node:os");
const path = require("node:path");
const { spawn, spawnSync } = require("node:child_process");

const root = path.resolve(__dirname, "..");
const mediaDir = path.join(root, "docs", "media");
const frameDir = path.join(mediaDir, "verigate-customer-frames");
const chromePath = "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe";
const audioPath = path.join(mediaDir, "verigate-customer-audio.wav");
const videoPath = path.join(mediaDir, "verigate-customer.webm");
const htmlPath = path.join(mediaDir, "verigate-customer.html");
const voiceName = "Microsoft Zira Desktop";

const slides = [
  {
    file: "01-title.png",
    mode: "phone",
    title: "Veri-Gate",
    caption: "Vehicle movement control for gated facilities.",
    narration: "Veri-Gate. Vehicle movement control for gated facilities.",
    duration: 12000
  },
  {
    file: "02-problem.png",
    mode: "desktop",
    title: "Every Movement Is A Question",
    caption: "Who was driving, were they allowed, which vehicle, and when.",
    narration: "Every vehicle that enters or leaves a facility is a question. Who was driving. Were they allowed. Which vehicle was it. When did it happen. Most gates answer those questions on paper, or not at all, and the answer is needed weeks later, when something has already gone wrong.",
    duration: 22000
  },
  {
    file: "03-handheld.png",
    mode: "phone",
    title: "One Screen At The Gate",
    caption: "The operator sees the scan and nothing else.",
    narration: "Veri-Gate runs on a rugged Android handheld at the gate. The operator sees one screen: the scan. No menus to get lost in, no settings to change by accident. Everything else in the system is somewhere else, on another screen.",
    duration: 20000
  },
  {
    file: "04-driver.png",
    mode: "phone",
    title: "Start With The Driver",
    caption: "Scan the badge, or type the number if it is damaged.",
    narration: "A movement starts with the driver. The operator scans the employee badge, or types the number if a badge is damaged. Veri-Gate shows who they are and whether their licence and authorisation are current, before the vehicle is even involved.",
    duration: 18000
  },
  {
    file: "05-vehicle.png",
    mode: "phone",
    title: "Then The Vehicle",
    caption: "Make, model, colour and plate come straight back.",
    narration: "Then the vehicle. Scan the barcode on the windscreen and the make, model, colour and plate come straight back, so the operator can confirm the vehicle in front of them is the vehicle on the screen.",
    duration: 16000
  },
  {
    file: "06-movement.png",
    mode: "phone",
    title: "In Or Out. One Tap.",
    caption: "Recorded with driver, vehicle, gate, device and exact time.",
    narration: "In or out. One tap. The movement is recorded with the driver, the vehicle, the gate, the device, the exact time, and whether the barcode was scanned or entered by hand. Then the scanner returns straight to the start, ready for the next vehicle. At a busy gate, seconds matter.",
    duration: 20000
  },
  {
    file: "07-unknown.png",
    mode: "phone",
    title: "A Vehicle Nobody Expected",
    caption: "Accepted, recorded, and created automatically.",
    narration: "Vehicles arrive that are not on any list. A transfer nobody logged, a new unit, a contractor truck. Veri-Gate accepts it, records the arrival, and creates the vehicle automatically. The operator is not stopped and not asked to make a decision. A vehicle arriving is rarely the risk.",
    duration: 26000
  },
  {
    file: "08-blocked.png",
    mode: "phone",
    title: "Leaving Is Different",
    caption: "The same vehicle is refused on the way out.",
    narration: "Leaving is different. That same vehicle now tries to go out, and Veri-Gate refuses. Its record is incomplete, so it stays until a supervisor completes it. Look closely: the driver is fully authorised. It does not matter. Being allowed in never means being authorised out. That rule is enforced in the database itself, so it holds even if something goes wrong on the device.",
    duration: 28000
  },
  {
    file: "09-override.png",
    mode: "phone",
    title: "Exceptions On The Record",
    caption: "A Fleet Lead or above can approve. Anyone below is refused by name.",
    narration: "Real operations need exceptions. When a driver is not authorised, the gate does not simply stop. A Fleet Lead or above can approve a temporary authorisation on the spot. Anyone below that rank is refused by name and by role, and the refusal is recorded. Exceptions become evidence instead of favours.",
    duration: 24000
  },
  {
    file: "10-console.png",
    mode: "desktop",
    title: "The Supervisor Console",
    caption: "Same application, same data, different job.",
    narration: "On a computer, the same system opens as a full console. Same application, same data, different job.",
    duration: 20000
  },
  {
    file: "11-complete.png",
    mode: "desktop",
    title: "Completing The Record",
    caption: "The supervisor fills in what the gate could not know.",
    narration: "Every vehicle the gate created automatically appears here, with the missing details listed. The supervisor fills them in, and the vehicle is released for normal use. Nothing was blocked forever. It waited for a person to confirm what it was.",
    duration: 20000
  },
  {
    file: "12-drivers.png",
    mode: "desktop",
    title: "Drivers And Authorisation",
    caption: "Roster, licence expiry, and temporary authorisations.",
    narration: "Supervisors manage the driver roster, licence expiry, and temporary authorisations, individually or in groups. Drivers are records, never logins. Only staff have accounts, and what each account can do is set per person.",
    duration: 22000
  },
  {
    file: "13-devices.png",
    mode: "desktop",
    title: "Devices And Locations",
    caption: "Every handheld is registered to a gate.",
    narration: "Every handheld is registered to a gate, or assigned to one at the start of a shift. A device that is not ready cannot scan, so a movement is never recorded against the wrong location.",
    duration: 18000
  },
  {
    file: "14-search.png",
    mode: "desktop",
    title: "Every Movement, Searchable",
    caption: "By driver, vehicle, plate, licence number, gate or date.",
    narration: "Everything is searchable. By driver, vehicle, plate, licence number, gate or date range. When someone asks what left on Tuesday afternoon, the answer takes seconds and it is the same answer every time.",
    duration: 22000
  },
  {
    file: "15-yard.png",
    mode: "phone",
    title: "Built For The Yard",
    caption: "A standard Android app that keeps working without a signal.",
    narration: "Veri-Gate installs as a standard Android application. It runs on the handheld itself, so it keeps working when the signal does not. Movements are stored on the device and upload automatically when the connection returns, marked as delayed so nothing is silently lost. No cabling, no gate hardware, no site works.",
    duration: 22000
  },
  {
    file: "16-close.png",
    mode: "phone",
    title: "Veri-Gate",
    caption: "Every vehicle accounted for. Every exception on the record.",
    narration: "Veri-Gate. Every vehicle accounted for, every exception on the record, every question answered in seconds.",
    duration: 15000
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
  // Match the narration length in both directions - slides should not linger in silence.
  const targetMs = audioMs + 2500;
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
  const desktop = () => setViewport(cdp, 1280, 860, false);
  const type = (sel, value) => evaluate(cdp, `(() => { const n = document.querySelector('${sel}'); n.value = '${value}'; n.dispatchEvent(new Event('input', { bubbles: true })); })()`);
  const click = (sel) => evaluate(cdp, `document.querySelector('${sel}').click()`);
  const pause = (ms) => new Promise((r) => setTimeout(r, ms));
  const scanner = async () => { await cdp.send("Page.navigate", { url: `${appUrl}?shell=scanner` }); await waitForReady(cdp); await pause(400); };
  const console_ = async () => { await cdp.send("Page.navigate", { url: `${appUrl}?shell=console` }); await waitForReady(cdp); await pause(500); };

  await phone();
  await cdp.send("Page.navigate", { url: `${appUrl}?shell=scanner&demo=${Date.now()}` });
  await waitForReady(cdp);
  await evaluate(cdp, "localStorage.clear()");
  await cdp.send("Page.reload", { ignoreCache: true });
  await waitForReady(cdp);
  await pause(500);
  await screenshot(cdp, "01-title.png");
  await screenshot(cdp, "03-handheld.png");

  await desktop();
  await console_();
  await evaluate(cdp, "document.querySelector('[data-view=\"searchView\"]').click(); document.querySelector('#searchForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));");
  await pause(500);
  await screenshot(cdp, "02-problem.png");

  await phone();
  await scanner();
  await click('#startScanButton');
  await type('#driverInput', 'E1001');
  await pause(300);
  await screenshot(cdp, "04-driver.png");

  await click('#driverNext');
  await type('#barcodeInput', 'G0001');
  await pause(300);
  await screenshot(cdp, "05-vehicle.png");

  await click('#barcodeNext');
  await pause(300);
  await screenshot(cdp, "06-movement.png");

  await click('#directionIn');
  await click('#submitTransactionButton');
  await pause(600);

  await click('#startScanButton');
  await type('#driverInput', 'E1001');
  await click('#driverNext');
  await type('#barcodeInput', 'G9001');
  await pause(300);
  await screenshot(cdp, "07-unknown.png");

  await click('#barcodeNext');
  await click('#directionIn');
  await click('#submitTransactionButton');
  await pause(600);

  await click('#startScanButton');
  await type('#driverInput', 'E1001');
  await click('#driverNext');
  await type('#barcodeInput', 'G9001');
  await click('#barcodeNext');
  await click('#directionOut');
  await click('#submitTransactionButton');
  await pause(500);
  await screenshot(cdp, "08-blocked.png");

  await scanner();
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
  await screenshot(cdp, "09-override.png");

  await desktop();
  await console_();
  await evaluate(cdp, `document.querySelector('[data-view="supervisorView"]').click()`);
  await pause(400);
  await screenshot(cdp, "10-console.png");

  await evaluate(cdp, "document.querySelector('[data-view=\"supervisorView\"]').click(); document.querySelector('[data-supervisor-section=\"vehiclesSection\"]').click()");
  await pause(400);
  await screenshot(cdp, "11-complete.png");

  await evaluate(cdp, "document.querySelector('[data-supervisor-section=\"driversSection\"]').click()");
  await pause(400);
  await screenshot(cdp, "12-drivers.png");

  await evaluate(cdp, "document.querySelector('[data-supervisor-section=\"devicesSection\"]').click()");
  await pause(400);
  await screenshot(cdp, "13-devices.png");

  await evaluate(cdp, `(() => {
    document.querySelector('[data-view="searchView"]').click();
    const d = document.querySelector('#filterDriver');
    if (d) { d.value = 'E1001'; d.dispatchEvent(new Event('input', { bubbles: true })); }
    document.querySelector('#searchForm').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  })()`);
  await pause(500);
  await screenshot(cdp, "14-search.png");

  await phone();
  await scanner();
  await screenshot(cdp, "15-yard.png");
  await screenshot(cdp, "16-close.png");
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
  await cdp.send("Page.navigate", { url: `${appUrl}docs/media/verigate-customer.html?record=1` });
  await waitForReady(cdp);
  const result = await evaluate(cdp, `recordVeriGateCustomer(${JSON.stringify(timelineSlides)})`);
  fs.writeFileSync(videoPath, Buffer.from(result.base64, "base64"));
  return result;
}

function writeFallbackHtml(timelineSlides) {
  const slidesMarkup = slides.map((slide, index) => `
      <section class="slide">
        <img src="verigate-customer-frames/${slide.file}" alt="${slide.title}">
        <div>
          <p class="step">Step ${index + 1} of ${slides.length}</p>
          <h2>${slide.title}</h2>
          <p>${slide.caption}</p>
        </div>
      </section>`).join("\n");
  const recorderScript = `
    async function recordVeriGateCustomer(slides) {
      const canvas = document.createElement('canvas');
      canvas.width = 1280;
      canvas.height = 720;
      const ctx = canvas.getContext('2d');
      const audio = new Audio('verigate-customer-audio.wav');
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
        image.src = 'verigate-customer-frames/' + slide.file;
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
        ctx.fillText('Veri-Gate', 40, 50);
        ctx.font = '18px Arial';
        ctx.fillText('Vehicle movement control', 940, 49);

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
          const shotW = 690;
          const shotH = Math.round(image.height * (shotW / image.width));
          const shotX = 42;
          const shotY = 122;
          ctx.fillStyle = '#004B2E';
          roundRect(shotX - 10, shotY - 10, shotW + 20, shotH + 20, 16);
          ctx.fill();
          ctx.drawImage(image, shotX, shotY, shotW, shotH);
          ctx.fillStyle = '#004B2E';
          ctx.font = '700 32px Arial';
          ctx.fillText(slide.title, 770, 186);
          ctx.fillStyle = '#30423c';
          ctx.font = '25px Arial';
          wrapText(slide.caption, 770, 244, 460, 34);
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
  <title>Veri-Gate</title>
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
    <h1>Veri-Gate</h1>
  </header>
  <main>
    <p>Vehicle movement control for gated facilities.</p>
    <video controls src="verigate-customer.webm"></video>
    <audio controls src="verigate-customer-audio.wav"></audio>
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
