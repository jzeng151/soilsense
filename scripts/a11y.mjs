import { chromium } from 'playwright';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8790';
const output = process.env.A11Y_OUTPUT ?? 'docs/a11y/latest.json';
const browser = await chromium.launch();
const report = { timestamp: new Date().toISOString(), revision: process.env.A11Y_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), base, axe: axe.version, browser: browser.version(), tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], scans: [] };
try {
  for (const language of ['en', 'es']) for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    await page.addInitScript(language => localStorage.setItem('soilsense.language', language), language);
    const confirm = language === 'es' ? 'Sí, esta es mi parcela' : 'Yes, this is my field';
    const showPlan = language === 'es' ? 'Ver mi plan' : 'Show my plan';
    page.setDefaultTimeout(180000);
    const scan = async (state, include) => {
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: axe.source });
      const result = await page.evaluate(async ({ tags, include }) => window.axe.run(include ? { include: [include] } : document, { runOnly: {type:'tag', values:tags} }), { tags: report.tags, include });
      const inventory = await page.evaluate(() => ({ headings: [...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent.trim()), details: [...document.querySelectorAll('details')].map(d=>({summary:d.querySelector('summary')?.textContent.trim(),open:d.open})), fieldWatchRows: document.querySelectorAll('.fw-row').length, selectedGoals: [...document.querySelectorAll('.farmer-goals input:checked')].map(e=>e.closest('label').textContent.trim()), goalScoreDisclosures: document.querySelectorAll('.goal-score').length, vegetation: document.querySelector('[aria-label="Historical vegetation evidence"]')?.textContent.trim() ?? null, harvestTables: document.querySelectorAll('.vd-table').length, pageLanguage: document.documentElement.lang, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
      report.scans.push({ state, language, width, fixture: state === 'admin-docs-review-fixture' ? 'Synthetic local-only document API interception; not authenticated server coverage' : null, url: page.url(), inventory, ...result });
      if (process.env.A11Y_SCREENSHOTS) {
        await mkdir(process.env.A11Y_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:`${process.env.A11Y_SCREENSHOTS}/${language}-${width}-${state}.png`});
      }
      console.log(`${language} ${width} ${state}: ${result.violations.length} rules, ${result.violations.reduce((n,v)=>n+v.nodes.length,0)} nodes; ${result.incomplete.length} incomplete`);
    };
    await page.goto(base);
    await page.locator('.map.leaflet-container').waitFor();
    await page.waitForTimeout(2000);
    await scan('landing');
    await page.getByRole('button', {name:'Kansas', exact:true}).click();
    await page.getByRole('button', {name:confirm}).waitFor();
    await scan('field-confirmation');
    await page.getByRole('button', {name:confirm}).click();
    await scan('three-questions');
    await page.getByRole('checkbox', { name: /^Water conservation/ }).check();
    await page.getByRole('checkbox', { name: /^Organic matter/ }).check();
    if (await page.locator('.farmer-goals input:checked').count() !== 2 || await page.locator('.farmer-goals input:disabled').count() !== 3) throw new Error('Goal limit state not exercised');
    await scan('two-goals-selected');
    await page.getByRole('button', {name:showPlan}).click();
    await page.locator('.jr-answer').waitFor();
    // Exercise opt-in evidence cards as well as automatically fetched card contents.
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await page.getByRole('button', {name:'Compare timing', exact:true}).click();
    await page.getByRole('button', {name:'Load field history', exact:true}).click();
    await page.waitForFunction(() => ![...document.querySelectorAll('main p, main button')].some(e => /^Loading(?: |…)/.test(e.textContent.trim())));
    // Async evidence can add disclosures after the plan shell first appears.
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
    if (await page.locator('details:not([open])').count()) throw new Error('Plan disclosures were not fully expanded');
    if (await page.locator('.goal-score').count() === 0) throw new Error('Goal score card was not rendered');
    await scan('kansas-plan-expanded');
    await page.goto(base);
    await page.locator('.fw').waitFor();
    await page.waitForTimeout(2000);
    await page.locator('.fw details').evaluateAll(ds=>ds.forEach(d=>{d.open=true;}));
    await scan('field-watch', '.fw');
    await page.goto(`${base}/#/admin/docs`);
    await page.getByRole('heading', {name:'Document review'}).waitFor();
    await scan('admin-docs');
    // Explicitly synthetic operator UI coverage: intercept only this local browser's GETs.
    // No real admin secret, upload, review, or remote write is involved.
    const doc = { docId: 'a11y-fixture', r2Key: 'a11y-fixture.txt', title: 'Accessibility review fixture', status: 'pending_review', updatedAt: '2026-11-15T00:00:00Z', chunkCounts: { pending: 2 } };
    const text = 'Synthetic accessibility fixture only. Not research evidence or an ingested document.';
    await page.route('**/api/docs**', route => {
      if (route.request().method() !== 'GET') return route.abort();
      return route.fulfill({ json: route.request().url().endsWith('/api/docs') ? { docs: [doc] } : { doc, versions: [], chunks: [
        { chunkId: 'a11y-chunk-1', start: 0, end: text.length, text, status: 'pending' },
        { chunkId: 'a11y-chunk-2', start: 0, end: 62, text: 'ConstructedMissingSpacesFixtureForTheDocumentReviewWarningOnly', status: 'pending' },
      ] } });
    });
    await page.getByLabel('Admin token', { exact: true }).fill('local-a11y-fixture-not-a-secret');
    await page.getByRole('button', { name: 'Refresh documents', exact: true }).click();
    await page.getByRole('button', { name: doc.title, exact: true }).click();
    await page.getByRole('heading', { name: `Review ${doc.title}`, exact: true }).waitFor();
    await scan('admin-docs-review-fixture');
    await page.close();
  }
} finally {
  await browser.close();
  await mkdir(output.replace(/[/\\][^/\\]+$/, ''), {recursive:true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
if (report.scans.length !== 32 || report.scans.some(s=>s.violations.length || s.inventory.horizontalOverflow)) process.exitCode = 1;
