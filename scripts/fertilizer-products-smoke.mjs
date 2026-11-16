// Built offline Worker, real API responses, no route interception. Run with a scratch output directory.
import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
const sourceRevision = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const require = createRequire(import.meta.url);
const out = process.argv[2];
if (!out) throw Error('Supply scratch output directory');
await fs.mkdir(out, { recursive: true });
const base = 'http://localhost:8812';
const browser = await chromium.launch({ headless: true });
const report = [];
try {
  for (const language of ['en', 'es']) for (const width of [1280, 375]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage(); const errors = [];
    page.on('pageerror', e => errors.push(String(e)));
    await page.goto(base, { waitUntil: 'domcontentloaded' });
    if (language === 'es') await page.locator('#content').getByRole('button', { name: 'ES Español', exact: true }).click();
    await page.getByRole('button', { name: language === 'es' ? 'Kansas' : 'Kansas', exact: true }).click();
    await page.getByRole('button', { name: language === 'es' ? 'Sí, esta es mi parcela →' : 'Yes, this is my field →', exact: true }).click({ timeout: 60000 });
    await page.getByRole('button', { name: /Full irrigation|Riego completo/ }).click();
    const responsePromise = page.waitForResponse(r => r.url().endsWith('/api/plan') && r.request().method() === 'POST', { timeout: 120000 });
    await page.getByRole('button', { name: language === 'es' ? 'Ver mi plan →' : 'Show my plan →', exact: true }).click();
    const response = await responsePromise; assert.equal(response.status(), 200);
    const data = await response.json(); assert.ok(data.plans.every(p => p.fertilizer));
    await page.locator('.fertilizer-guide').first().waitFor();
    await page.evaluate(() => {
      document.querySelectorAll('.fertilizer-guide').forEach(guide => {
        for (let a = guide.parentElement; a; a = a.parentElement) if (a.tagName === 'DETAILS') a.open = true;
        guide.open = true; guide.querySelectorAll('details').forEach(d => d.open = true);
      });
    });
    const productSummary = page.locator('.fertilizer-guide').getByText(language === 'es' ? 'Productos y aplicación' : 'Products & timing', { exact: true }).first();
    await productSummary.focus(); await page.keyboard.press('Enter');
    assert.equal(await productSummary.evaluate(s => s.parentElement.open), false);
    await page.keyboard.press('Space');
    assert.equal(await productSummary.evaluate(s => s.parentElement.open), true);
    const text = await page.locator('.fertilizer-guide').first().innerText();
    assert.ok(text.includes(language === 'es' ? 'Productos y aplicación' : 'Products & timing'));
    assert.ok(text.includes(language === 'es' ? '¿Cómo se calculó?' : 'How was this calculated?'));
    assert.ok(text.includes('MF2586'));
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const audit = await page.evaluate(async () => window.axe.run('.fertilizer-guide', { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
    await fs.writeFile(path.join(out, `axe-${language}-${width}.json`), JSON.stringify(audit, null, 2));
    await page.locator('.fertilizer-guide').first().screenshot({ path: path.join(out, `guide-${language}-${width}.png`) });
    assert.equal(audit.violations.length, 0, JSON.stringify(audit.violations.map(v => ({ id: v.id, nodes: v.nodes.length }))));
    assert.deepEqual(errors, []);
    const inventory = await page.locator('.fertilizer-guide').evaluateAll(guides => ({ guides: guides.length, closed: guides.flatMap(g => [g, ...g.querySelectorAll('details')]).filter(d => !d.open).length, summaries: guides.flatMap(g => [...g.querySelectorAll('summary')]).map(s => s.textContent) }));
    assert.equal(inventory.closed, 0);
    report.push({ sourceRevision, language, width, overflow, errors, inventory, violations: audit.violations.length, incomplete: audit.incomplete.length, axeVersion: audit.testEngine.version, browser: browser.version(), apiStatus: response.status() });
    await context.close();
  }
} finally {
  await fs.writeFile(path.join(out, 'report.json'), JSON.stringify(report, null, 2));
  await browser.close();
  console.log(JSON.stringify(report.map(({ inventory, ...r }) => ({ ...r, guides: inventory.guides, closed: inventory.closed })), null, 2));
}
