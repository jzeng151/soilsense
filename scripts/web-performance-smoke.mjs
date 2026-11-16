import assert from 'node:assert/strict';
import { chromium } from 'playwright';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base = process.env.PERF_BASE_URL ?? 'http://127.0.0.1:8818';
const browser = await chromium.launch();
const report = { routes: [], headers: {}, fallback: null };
try {
  for (const width of [1440, 390]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const scripts = [];
    page.on('request', request => { if (request.resourceType() === 'script') scripts.push(new URL(request.url()).pathname); });
    for (const hash of ['#/', '#/how-it-works', '#/sources']) {
      await page.goto(base + '/' + hash);
      await page.locator('h1').waitFor();
      await page.waitForTimeout(300);
      assert(!scripts.some(s => /i18n-(?:pages-)?ko/.test(s)), 'English must not fetch Korean dictionaries');
      if (hash === '#/how-it-works') {
        await page.addScriptTag({ content: axe.source });
        const result = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
        assert.equal(result.violations.length, 0);
        report.routes.push({ hash, width, violations: result.violations.length, incomplete: result.incomplete.length });
      }
    }
    await page.goto(base + '/#/how-it-works');
    await page.locator('#content').getByRole('button', { name: '한국어', exact: true }).click();
    await page.waitForFunction(() => /[가-힣]/.test(document.querySelector('h1')?.textContent ?? ''));
    assert(scripts.some(s => /i18n-ko/.test(s)) && scripts.some(s => /i18n-pages-ko/.test(s)), 'Korean selection must load both dictionaries');
    report.routes.push({ width, englishKoreanRequests: 0, selectedKoreanLoads: 2 });
    await context.close();
  }
  // A failed chunk request must leave the page usable in English, without crashing.
  const context = await browser.newContext();
  await context.route('**/assets/i18n*ko-*.js', route => route.abort());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(base + '/#/how-it-works');
  await page.locator('#content').getByRole('button', { name: '한국어', exact: true }).click();
  await page.waitForTimeout(500);
  assert.equal(await page.locator('h1').innerText(), 'How it works');
  assert.deepEqual(errors, []);
  report.fallback = 'English remains usable when Korean chunks fail';
  const asset = await page.locator('script[src*="/assets/"]').first().getAttribute('src');
  for (const path of ['/', '/index.html', asset]) {
    const response = await context.request.get(new URL(path, base).href, { maxRedirects: 0 });
    const cache = response.headers()['cache-control'];
    report.headers[path] = { status: response.status(), cacheControl: cache };
    assert.equal(cache, path.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache');
  }
  await context.close();
  await mkdir('docs/performance', { recursive: true });
  await writeFile('docs/performance/smoke.json', JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report));
} finally { await browser.close(); }
