const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { chromium } = require(process.env.VIDEO_PLAYWRIGHT || 'C:/Users/luarz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const root = path.resolve(__dirname, '../docs/media/refresh-v2');
(async () => {
  const browser = await chromium.launch({ executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe', headless: true, args: ['--autoplay-policy=no-user-gesture-required', '--allow-file-access-from-files'] });
  try {
    const page = await browser.newPage();
    const report = [];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await page.goto(pathToFileURL(path.join(root, 'index.html')).href);
      for (const name of ['customer', 'walkthrough']) {
        await page.locator(`#${name}-tab`).click();
        const result = await page.locator(`#${name} video`).evaluate(async video => {
          if (video.readyState < 1) await new Promise((resolve, reject) => { video.onloadedmetadata=resolve; video.onerror=()=>reject(new Error('Video failed')); });
          video.currentTime = 2;
          await video.play();
          await new Promise(resolve => setTimeout(resolve, 500));
          video.pause();
          return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, playingConfirmed: video.currentTime > 2.1, audioTracks: video.webkitAudioDecodedByteCount > 0 };
        });
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
        if (overflow || result.width !== 1920 || result.height !== 1080 || !result.playingConfirmed || !result.audioTracks) throw new Error(JSON.stringify({name, width,overflow,result}));
        await page.screenshot({ path: path.join(root, `review-${name}-${width}.png`), fullPage: true });
        report.push({ name, viewport: width, overflow, ...result });
      }
    }
    fs.writeFileSync(path.join(root, 'playback-verification.json'), JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode=1; });
