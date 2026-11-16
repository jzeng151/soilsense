import { chromium } from 'playwright';
import { mkdir, writeFile, readdir, stat } from 'node:fs/promises';
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:8818';
const label = process.argv[2] ?? 'measurement';
const browser = await chromium.launch();
const results = [];
try {
  // Warm Wrangler's asset compression/index, not Chromium's (fresh contexts below).
  const warm = await browser.newPage();
  for (const hash of ['#/', '#/how-it-works']) {
    await warm.goto(base + '/' + hash, { waitUntil: 'load' });
    await warm.waitForTimeout(2000);
  }
  await warm.close();
  for (const mobile of [false, true]) for (const hash of ['#/', '#/how-it-works']) for (let run = 1; run <= 3; run++) {
    const context = await browser.newContext({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 }, isMobile: mobile, deviceScaleFactor: 1, reducedMotion: 'reduce' });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    if (mobile) {
      await cdp.send('Network.emulateNetworkConditions', { offline: false, latency: 150, downloadThroughput: 1.6 * 1024 * 1024 / 8, uploadThroughput: 750 * 1024 / 8 });
      await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
    }
    await page.addInitScript(() => {
      window.__perf = { lcp: null, ready: null };
      new PerformanceObserver(list => { window.__perf.lcp = list.getEntries().at(-1).startTime; }).observe({ type: 'largest-contentful-paint', buffered: true });
      // Interactive means a real enabled planner action, or the guide's menu, has painted.
      function check() {
        const button = location.hash.includes('how-it-works') ? document.querySelector('button[aria-label="English"]') : [...document.querySelectorAll('button')].find(el => el.textContent.trim() === 'Kansas');
        if (button && !button.disabled && button.getBoundingClientRect().width) window.__perf.ready ??= performance.now();
        requestAnimationFrame(check);
      }
      requestAnimationFrame(check);
    });
    let jsBytes = 0;
    const scriptIds = new Set();
    cdp.on('Network.responseReceived', e => { if (e.type === 'Script') scriptIds.add(e.requestId); });
    cdp.on('Network.loadingFinished', e => { if (scriptIds.has(e.requestId)) jsBytes += e.encodedDataLength; });
    await page.goto(base + '/' + hash, { waitUntil: 'load' });
    await page.waitForFunction(() => window.__perf.ready !== null, { timeout: 60000 });
    await page.waitForTimeout(4000);
    const metrics = await page.evaluate(() => window.__perf);
    const transferred = jsBytes;
    // Separate navigation: no four-second LCP observation delay in this journey.
    // Real local Worker + cached upstream field evidence; never submit a plan here.
    let planButtonReadyMs = null;
    if (hash === '#/') {
      await page.reload({ waitUntil: 'load' });
      await page.getByRole('button', { name: 'Kansas', exact: true }).click();
      await page.getByRole('button', { name: 'Yes, this is my field' }).click({ timeout: 120000 });
      const planButton = page.getByRole('button', { name: 'Show my plan' });
      await planButton.waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll('button')].some(b => b.textContent.includes('Show my plan') && !b.disabled));
      planButtonReadyMs = await page.evaluate(() => performance.now());
    }
    results.push({ profile: mobile ? 'Fast 3G / 4x CPU' : 'desktop', hash, run, ...metrics, jsTransferredBytes: transferred, planButtonReadyMs });
    console.log(JSON.stringify(results.at(-1)));
    await context.close();
  }
  const chunks = [];
  for (const name of await readdir('dist/web/assets')) if (name.endsWith('.js')) chunks.push({ name, bytes: (await stat('dist/web/assets/' + name)).size });
  await mkdir('docs/performance', { recursive: true });
  await writeFile(`docs/performance/${label}.json`, JSON.stringify({ browser: browser.version(), base, results, chunks }, null, 2) + '\n');
} finally { await browser.close(); }
