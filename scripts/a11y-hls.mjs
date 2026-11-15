import { chromium } from 'playwright';
import axe from 'axe-core';
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8797';
const artifact = JSON.parse(await readFile('web/public/data/hls-demo.json', 'utf8'));
const browser = await chromium.launch();
const report = { revision: execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), timestamp:new Date().toISOString(), base, browser:browser.version(), axe:axe.version, note:'Real local Worker APIs and committed source-derived HLS artifact. ARIA snapshots are accessibility-tree inspection, not NVDA/VoiceOver listening.', scans:[] };
const demos = ['Kansas','Iowa','Illinois','Nebraska'];
try {
  for (const language of ['en','es']) for (const width of [1280,375]) for (const [index, field] of artifact.fields.entries()) {
    const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    page.setDefaultTimeout(120000);
    await page.addInitScript(language=>localStorage.setItem('soilsense.language',language),language);
    const mutations=[];
    page.on('request',r=>{ if(new URL(r.url()).pathname.startsWith('/api/') && r.method()!=='GET') mutations.push({path:new URL(r.url()).pathname,method:r.method()}); });
    await page.goto(base);
    await page.getByRole('button',{name:demos[index],exact:true}).click();
    await page.getByRole('button',{name:language==='es'?'Sí, esta es mi parcela':'Yes, this is my field'}).click();
    await page.getByRole('button',{name:language==='es'?'Ver mi plan':'Show my plan'}).click();
    await page.locator('.jr-answer').waitFor();
    const card=page.locator('.hls-evidence');
    const modis=page.locator('section.jr-card').filter({has:page.getByRole('heading',{name:/MODIS/})});
    await page.waitForFunction(()=>![...document.querySelectorAll('section.jr-card [role=status]')].some(e=>/^(Loading MODIS|Cargando observaciones MODIS)/.test(e.textContent)),{},{timeout:100000});
    const before = await page.evaluate(()=>({answer:document.querySelector('.jr-answer').textContent,storage:JSON.stringify({...localStorage}),watch:document.querySelector('.fw')?.textContent??null}));
    mutations.length=0;
    await card.locator(':scope > summary').focus();
    await page.keyboard.press('Enter');
    assert.equal(await card.getAttribute('open'),'');
    await page.keyboard.press('Tab');
    assert.equal(await card.locator('button').evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Enter');
    await card.locator('table').first().waitFor();
    const actual=await page.request.get(`${base}/api/hls?lat=${field.lat}&lon=${field.lon}`);
    const data=await actual.json(); assert.equal(data.field.id,field.id);
    for(const o of field.observations) assert.ok((await card.innerText()).includes(o.meanNdvi.toFixed(4)));
    const after=await page.evaluate(()=>({answer:document.querySelector('.jr-answer').textContent,storage:JSON.stringify({...localStorage}),watch:document.querySelector('.fw')?.textContent??null}));
    assert.deepEqual(after,before,'Evidence must not mutate plan answer, browser scenarios or visible Field Watch');
    assert.deepEqual(mutations,[],'HLS load must not send mutating API calls');
    await page.keyboard.press('Tab'); // source guide
    await page.keyboard.press('Tab'); // scrollable observation table
    assert.equal(await card.locator('[role=region]').first().evaluate(e=>e===document.activeElement),true);
    await page.keyboard.press('Tab'); // first pixel disclosure
    await page.keyboard.press('Space');
    assert.equal(await card.locator('details').first().getAttribute('open'),'');
    await card.locator('details').evaluateAll(ds=>ds.forEach(d=>d.open=true));
    const aria=await card.ariaSnapshot();
    assert.ok(aria.includes(language==='es'?'NDVI medio':'Mean NDVI'));
    assert.equal(await card.locator('tbody tr').count(),20); // two scenes + eighteen pixels
    assert.equal(await card.locator('details:not([open])').count(),0);
    await page.addScriptTag({content:axe.source});
    const result=await page.evaluate(async()=>window.axe.run('.hls-evidence',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);
    await mkdir('docs/a11y/hls-screenshots',{recursive:true});
    await card.screenshot({path:`docs/a11y/hls-screenshots/${field.id}-${language}-${width}.png`});
    report.scans.push({field:field.id,language,width,aria,overflow,modis:await modis.innerText(),hls:await card.innerText(),unchangedAnswerStorageWatch:true,noMutatingRequests:true,...result});
    console.log(`${field.id} ${language} ${width}: ${result.violations.length} violations; overflow ${overflow}`);
    await page.close();
  }
  const response=await fetch(`${base}/api/hls?lat=38.11&lon=-100.706`);assert.equal((await response.json()).status,'unavailable');
} finally {
  await browser.close(); await mkdir('docs/a11y',{recursive:true});
  await writeFile('docs/a11y/hls.json',JSON.stringify(report,null,2)+'\n');
}
assert.equal(report.scans.length,16);
assert.equal(report.scans.some(s=>s.violations.length||s.overflow),false);
