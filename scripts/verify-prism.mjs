// Opt-in real-provider browser smoke; run after build and local Wrangler on the assigned port.
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { mkdir, writeFile } from 'node:fs/promises';
import assert from 'node:assert/strict';
const require = createRequire(import.meta.url);
const base = process.env.PRISM_BASE_URL ?? 'http://localhost:8798';
const output = process.env.PRISM_OUTPUT ?? 'test-results/prism';
await mkdir(output, { recursive: true });
const browser = await chromium.launch();
const report = { timestamp: new Date().toISOString(), browser: browser.version(), audit: [] };
try {
for (const [width, language] of [[1280, 'en'], [320, 'en'], [320, 'es']]) {
const page = await browser.newPage({ viewport: { width, height: 900 } });
const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto(base);
  await page.getByRole('button', { name: 'Kansas', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, this is my field' }).click({ timeout: 120000 });
  await page.getByRole('button', { name: 'Show my plan' }).click();
  await page.locator('.jr-answer').waitFor({ timeout: 180000 });
  if (language === 'es') {
    await page.getByRole('button', { name: 'ES Español', exact: true }).click();
    await page.locator('summary').filter({ hasText: /^Comparación PRISM/ }).waitFor();
  }
  const summary = page.locator('summary').filter({ hasText: language === 'es' ? /^Comparación PRISM/ : /^PRISM \/ POWER/ });
  assert.equal(await summary.count(), 1);
  await summary.click();
  const card = summary.locator('..');
  await card.getByRole('button', { name: language === 'es' ? 'Consultar estimaciones' : 'Fetch source estimates' }).click();
  await card.getByText('prism: AN91d', { exact: true }).waitFor({ timeout: 70000 });
  await card.locator('details').evaluateAll(nodes => nodes.forEach(node => node.open = true));
  assert(await card.locator('tbody tr').count() > 0);
  const rows = await card.locator('tbody tr').allTextContents();
  assert.equal(await page.locator('html').getAttribute('lang'), language);
  const cardOverflow = await card.evaluate(e => e.scrollWidth > e.clientWidth);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  const dimensions = await page.evaluate(() => ({ scroll: document.documentElement.scrollWidth, client: document.documentElement.clientWidth, body: document.body.scrollWidth }));
  const overflowNodes = overflow ? await page.evaluate(() => Array.from(document.querySelectorAll('body *')).filter(e => e.scrollWidth > e.clientWidth && getComputedStyle(e).overflowX === 'visible').map(e => ({ tag: e.tagName, cls: e.className, text: e.textContent.slice(0, 90), scroll: e.scrollWidth, client: e.clientWidth })).slice(0, 30)) : [];
  await card.screenshot({ path: `${output}/${language}-${width}.png` });
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const scan = await card.evaluate(async element => window.axe.run(element, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  report.audit.push({ width, language, rows, errors, cardOverflow, overflow, dimensions, overflowNodes, scan });
  await page.close();
}
await writeFile(`${output}/report.json`, JSON.stringify(report, null, 2));
assert(report.audit.every(a => a.errors.length === 0), 'Uncaught browser errors');
assert(report.audit.every(a => a.scan.violations.length === 0), 'PRISM card axe violations');
assert(report.audit.every(a => !a.cardOverflow), 'PRISM card overflows at audited viewport');
console.log(JSON.stringify({ browser: report.browser, audit: report.audit.map(a => ({ width: a.width, language: a.language, rowCount: a.rows.length, violations: a.scan.violations.length, incomplete: a.scan.incomplete.length, overflow: a.overflow, errors: a.errors })) }));
} finally { await browser.close(); }
