const { chromium } = require('C:/Users/luarz/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');

const base = process.argv[2] || 'http://127.0.0.1:8812/review.html';

(async () => {
  const browser = await chromium.launch({
    executablePath: 'C:/Program Files/Google/Chrome/Application/chrome.exe',
    headless: true,
    args: ['--autoplay-policy=no-user-gesture-required']
  });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const pageErrors = [];
    const networkErrors = [];
    page.on('pageerror', error => pageErrors.push(error.message));
    page.on('response', result => { if (result.status() >= 400) networkErrors.push(`${result.status()} ${result.url()}`); });
    const response = await page.goto(base, { waitUntil: 'networkidle' });
    if (!response || !response.ok()) throw new Error(`Review page returned ${response?.status()}`);

    const links = await page.locator('a[href], source[src], track[src], video[poster]').evaluateAll(nodes =>
      [...new Set(nodes.map(node => new URL(node.getAttribute('href') || node.getAttribute('src') || node.getAttribute('poster'), location.href).href))]
    );
    const checked = [];
    for (const url of links) {
      const result = await page.request.get(url);
      checked.push({ url, status: result.status(), bytes: Number(result.headers()['content-length'] || (await result.body()).length) });
      if (!result.ok()) throw new Error(`${url} returned ${result.status()}`);
    }

    const media = await page.locator('video').evaluateAll(async videos => Promise.all(videos.map(async video => {
      if (video.readyState < 1) await new Promise((resolve, reject) => { video.onloadedmetadata=resolve; video.onerror=reject; });
      video.currentTime = 1;
      await video.play();
      await new Promise(resolve => setTimeout(resolve, 350));
      video.pause();
      return { duration: video.duration, width: video.videoWidth, height: video.videoHeight, currentTime: video.currentTime };
    })));
    if (media.some(item => item.width !== 1920 || item.height !== 1080 || item.currentTime <= 0.15)) throw new Error(`Video playback failed: ${JSON.stringify(media)}`);
    if (await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)) throw new Error('Review page overflows on mobile');
    if (pageErrors.length || networkErrors.length) throw new Error(`Browser errors: ${[...pageErrors, ...networkErrors].join('; ')}`);
    console.log(JSON.stringify({ base, links: checked.length, media, mobileOverflow: false, browserErrors: 0 }, null, 2));
  } finally {
    await browser.close();
  }
})().catch(error => { console.error(error); process.exitCode = 1; });
