// Built-app boundary smoke + scoped axe evidence. No API responses are mocked.
// node scripts/csb-smoke.mjs <scratch-output-dir> [http://localhost:8801]
import { chromium } from 'playwright';
import { createRequire } from 'node:module';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
const require=createRequire(import.meta.url);
const out=process.argv[2];
if(!out)throw new Error('Supply a scratch output directory');
await fs.mkdir(out,{recursive:true});
const base=process.argv[3]??'http://localhost:8801';
const browser=await chromium.launch({headless:true});
const sourceHashes={};
for(const file of ['web/src/components/FieldBoundaryPicker.tsx','web/src/components/MapPicker.tsx','web/src/App.tsx','web/src/i18n-fields.ts','src/worker/routes/fields.ts']) sourceHashes[file]=createHash('sha256').update(await fs.readFile(file)).digest('hex');
const report={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),workingTree:execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim(),sourceHashes,browser:browser.version(),axe:require('axe-core/package.json').version,playwright:require('playwright/package.json').version,checks:[],states:[]};
try{
  const page=await browser.newPage({viewport:{width:1280,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(String(e)));
  await page.goto(base);
  const card=page.locator('section[aria-labelledby="field-boundary-title"]');
  await card.locator('input[type=checkbox]').nth(62).waitFor({state:'attached'});
  assert.equal(await page.locator('.leaflet-overlay-pane path').count(),63);
  await card.getByRole('button',{name:'Show boundaries on map',exact:true}).click();
  await page.waitForTimeout(1000);
  await page.locator('.map').screenshot({path:path.join(out,'finney-map.png')});
  // Exercise actual SVG event dispatch with/without additive modifiers.
  await page.locator('.leaflet-overlay-pane path').nth(0).dispatchEvent('click',{bubbles:true});
  assert.equal(await card.locator('input:checked').count(),1);
  await page.locator('.leaflet-overlay-pane path').nth(1).dispatchEvent('click',{bubbles:true,shiftKey:true});
  assert.equal(await card.locator('input:checked').count(),2);
  await page.locator('.leaflet-overlay-pane path').nth(0).dispatchEvent('click',{bubbles:true,ctrlKey:true});
  assert.equal(await card.locator('input:checked').count(),1);
  report.checks.push('polygon replace / Shift-add / Ctrl-remove');
  const list=card.locator('details').first();
  await list.locator('summary').click();
  const first=card.locator('input[type=checkbox]').first();
  await first.focus();await page.keyboard.press('Space');
  assert.equal(await first.isChecked(),true);
  await page.keyboard.press('Space');assert.equal(await first.isChecked(),false);
  report.checks.push('real keyboard Space toggles checkbox');
  // Compare API counts for every official bounded subset; never intercept/fabricate.
  const status=await (await page.request.get(base+'/api/fields/status')).json();
  for(const area of status.areas){
    const data=await (await page.request.get(base+'/api/fields?area='+area.id)).json();
    await card.getByLabel('Boundary area',{exact:true}).selectOption(area.id);
    await page.waitForFunction(count=>document.querySelectorAll('section[aria-labelledby="field-boundary-title"] input[type=checkbox]').length===count,data.fields.length);
    assert.equal(await page.locator('.leaflet-overlay-pane path').count(),data.fields.length);
    report.checks.push(area.id+': '+data.fields.length+' API fields / map outlines / checkboxes');
  }
  await card.getByLabel('Boundary area',{exact:true}).selectOption('finney');
  await page.waitForFunction(()=>document.querySelectorAll('section[aria-labelledby="field-boundary-title"] input[type=checkbox]').length===63);
  await card.locator('input[type=checkbox]').first().check();
  for(const language of ['en','es']){
    await page.getByRole('button',{name:language==='es'?'ES Español':'EN English',exact:true}).click();
    await page.waitForFunction(lang=>document.documentElement.lang===lang,language);
    for(const width of [1280,375,320]){
      await page.setViewportSize({width,height:900});
      await card.evaluate(el=>el.querySelectorAll('details').forEach(d=>d.open=true));
      await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
      const result=await page.evaluate(async()=>await window.axe.run('section[aria-labelledby="field-boundary-title"]',{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}}));
      const inventory=await card.evaluate(el=>({width:el.getBoundingClientRect().width,scrollWidth:el.scrollWidth,closed:el.querySelectorAll('details:not([open])').length,checkboxes:el.querySelectorAll('input[type=checkbox]').length,selected:el.querySelectorAll('input:checked').length,heading:el.querySelector('h3')?.textContent}));
      const overflow=await page.evaluate(()=>({clientWidth:document.documentElement.clientWidth,scrollWidth:document.documentElement.scrollWidth}));
      await fs.writeFile(path.join(out,`axe-${language}-${width}.json`),JSON.stringify(result,null,2));
      await card.screenshot({path:path.join(out,`fields-${language}-${width}.png`)});
      report.states.push({language,width,inventory,overflow,violations:result.violations.map(v=>({id:v.id,nodes:v.nodes.length})),incomplete:result.incomplete.map(v=>({id:v.id,nodes:v.nodes.length}))});
      assert.equal(inventory.closed,0);
      assert.equal(result.violations.length,0,JSON.stringify(result.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))));
      assert.ok(inventory.scrollWidth<=inventory.width+1,'boundary card must reflow');
    }
  }
  report.pageErrors=errors;
  assert.equal(errors.length,0);
}finally{
  await browser.close();
  await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));
  console.log(JSON.stringify(report,null,2));
}
