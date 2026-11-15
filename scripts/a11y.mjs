import { chromium } from 'playwright';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8790';
const output = process.env.A11Y_OUTPUT ?? 'docs/a11y/latest.json';
const browser = await chromium.launch();
const report = { timestamp: new Date().toISOString(), revision: process.env.A11Y_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], {encoding:'utf8'}).trim(), base, axe: axe.version, browser: browser.version(), tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], scans: [] };
try {
  for (const width of [1280, 375]) {
    const page = await browser.newPage({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
    page.setDefaultTimeout(180000);
    const scan = async (state, include) => {
      await page.evaluate(() => document.fonts.ready);
      await page.addScriptTag({ content: axe.source });
      const result = await page.evaluate(async ({ tags, include }) => window.axe.run(include ? { include: [include] } : document, { runOnly: {type:'tag', values:tags} }), { tags: report.tags, include });
      const inventory = await page.evaluate(() => ({ headings: [...document.querySelectorAll('h1,h2,h3')].map(e=>e.textContent.trim()), details: [...document.querySelectorAll('details')].map(d=>({summary:d.querySelector('summary')?.textContent.trim(),open:d.open})), fieldWatchRows: document.querySelectorAll('.fw-row').length, horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth }));
      report.scans.push({ state, width, url: page.url(), inventory, ...result });
      if (process.env.A11Y_SCREENSHOTS) {
        await mkdir(process.env.A11Y_SCREENSHOTS,{recursive:true});
        await page.screenshot({path:`${process.env.A11Y_SCREENSHOTS}/${width}-${state}.png`});
      }
      console.log(`${width} ${state}: ${result.violations.length} rules, ${result.violations.reduce((n,v)=>n+v.nodes.length,0)} nodes; ${result.incomplete.length} incomplete`);
    };
    await page.goto(base);
    await page.locator('.map.leaflet-container').waitFor();
    await page.waitForTimeout(2000);
    await scan('landing');
    await page.getByRole('button', {name:'Kansas', exact:true}).click();
    await page.getByRole('button', {name:'Yes, this is my field'}).waitFor();
    await scan('field-confirmation');
    await page.getByRole('button', {name:'Yes, this is my field'}).click();
    await scan('three-questions');
    await page.getByRole('button', {name:'Show my plan'}).click();
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
    await scan('kansas-plan-expanded');
    await page.goto(base);
    await page.locator('.fw').waitFor();
    await page.waitForTimeout(2000);
    await page.locator('.fw details').evaluateAll(ds=>ds.forEach(d=>{d.open=true;}));
    await scan('field-watch', '.fw');
    await page.goto(`${base}/#/admin/docs`);
    await page.getByRole('heading', {name:'Document review'}).waitFor();
    await scan('admin-docs');
    await page.close();
  }
} finally {
  await browser.close();
  await mkdir(output.replace(/[/\\][^/\\]+$/, ''), {recursive:true});
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
}
if (report.scans.length !== 12 || report.scans.some(s=>s.violations.length || s.inventory.horizontalOverflow)) process.exitCode = 1;
