// Real built Worker: no mocked API responses. Usage: node scripts/field-plan-smoke.mjs <scratch-output-dir>
import {chromium} from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
const out=process.argv[2];if(!out)throw Error('Supply scratch output directory');await fs.mkdir(out,{recursive:true});
const base='http://localhost:8808';
const codes={1:'corn',4:'sorghum',5:'soybean',24:'winter_wheat',28:'oats',36:'alfalfa',61:'fallow'};
const browser=await chromium.launch({headless:true});const report=[];
try {
  for(const language of ['en','es'])for(const width of [1280,375]){
    const context=await browser.newContext({viewport:{width,height:900}});const page=await context.newPage();const errors=[];page.on('pageerror',e=>errors.push(String(e)));
    await page.goto(base);const card=page.locator('section[aria-labelledby="field-boundary-title"]');await card.waitFor();
    const data=await (await page.request.get(base+'/api/fields?area=finney')).json();
    const index=data.fields.findIndex(f=>[...f.cropSequence].sort((a,b)=>a.year-b.year).slice(-3).every(y=>codes[y.cdlCode]));assert.ok(index>=0);
    const field=data.fields[index];const history=[...field.cropSequence].sort((a,b)=>a.year-b.year).slice(-3).map(y=>codes[y.cdlCode]);
    if(language==='es')await page.getByRole('button',{name:'ES Español',exact:true}).click();
    await card.locator('details').first().locator('summary').click();await card.locator('input[type=checkbox]').nth(index).check();
    await card.locator('ul>li').first().waitFor();
    assert.equal(await card.locator('input[type=checkbox]').count(),63,'fringe centroid must retain the Finney catalog');
    assert.match(await card.locator('ul>li strong').first().innerText(),language==='es'?/^Parcela \d+/ : /^Field \d+/);
    await card.screenshot({path:path.join(out,`selection-${language}-${width}.png`)});
    await card.getByRole('button',{name:language==='es'?'Planificar esta parcela':'Plan this field',exact:true}).click();
    await page.locator('[data-field-plan] select').first().waitFor({timeout:60000});
    const controls=await page.locator('[data-field-plan] select').evaluateAll(nodes=>nodes.map(n=>n.value));assert.deepEqual(controls,history);
    const requestPromise=page.waitForRequest(r=>r.url().endsWith('/api/plan') && r.method()==='POST',{timeout:30000});
    await page.getByRole('button',{name:language==='es'?'Ver mi plan →':'Show my plan →',exact:true}).click();
    const request=(await requestPromise).postDataJSON();assert.equal(request.lat,field.centroid.lat);assert.equal(request.lon,field.centroid.lon);assert.deepEqual(request.recentCrops,history);
    await page.locator('[data-history-used]').waitFor({timeout:120000});
    const used=await page.locator('[data-history-used]').innerText();assert.ok(used.includes('2023'));assert.ok(used.includes('2025'));
    assert.ok((await page.locator('[data-field-plan]').innerText()).includes(language==='es'?'no declarado por el agricultor':'not farmer-reported'));
    await page.locator('[data-field-plan]').screenshot({path:path.join(out,`plan-history-${language}-${width}.png`)});
    await page.screenshot({path:path.join(out,`plan-${language}-${width}.png`),fullPage:true});
    const overflow=await page.evaluate(()=>({client:document.documentElement.clientWidth,scroll:document.documentElement.scrollWidth}));assert.ok(overflow.scroll<=overflow.client+1,JSON.stringify(overflow));assert.deepEqual(errors,[]);
    report.push({language,width,fieldId:field.id,request,historyUsed:used,overflow,errors});await context.close();
  }
} finally {await fs.writeFile(path.join(out,'report.json'),JSON.stringify(report,null,2));await browser.close();console.log(JSON.stringify(report,null,2));}
