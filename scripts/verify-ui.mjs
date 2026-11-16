import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
const base=process.env.VERIFY_BASE_URL??'http://127.0.0.1:8792';
const remote=!base.includes('127.0.0.1');
const out=process.env.VERIFY_OUTPUT??'test-results/ui-local';
await mkdir(out,{recursive:true});
const browser=await chromium.launch();
const report={timestamp:new Date().toISOString(),base,cases:[]};
async function run(name,fn){if(process.env.VERIFY_CASE && !name.includes(process.env.VERIFY_CASE))return;const row={name,errors:[],http:[]};const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});page.setDefaultTimeout(120000);page.on('pageerror',e=>row.errors.push(String(e)));page.on('console',m=>{if(m.type()==='error')row.errors.push(m.text())});page.on('response',r=>{if(r.status()>=400)row.http.push({url:r.url(),status:r.status()})});try{await fn(page,row);row.status='passed'}catch(e){row.status='failed';row.error=String(e)}await page.screenshot({path:`${out}/${name}.png`,fullPage:true});await page.close();report.cases.push(row);await writeFile(`${out}/report.json`,JSON.stringify(report,null,2));console.log(name,row.status,row.error??'')}
try{
 await run('zip-and-location',async(page,row)=>{
  await page.goto(base);await page.locator('.leaflet-container').waitFor();
  await page.getByRole('button',{name:'Go',exact:true}).click();await page.getByRole('status').filter({hasText:'Enter a 5-digit US ZIP code.'}).waitFor();
  await page.getByRole('textbox',{name:'ZIP code',exact:true}).fill('50010');await page.getByRole('button',{name:'Go',exact:true}).click();await page.getByRole('status').filter({hasText:'Showing Ames'}).waitFor();row.zip=await page.getByRole('status').allTextContents();
  await page.context().grantPermissions(['geolocation']);await page.context().setGeolocation({latitude:38.1095,longitude:-100.706});await page.getByRole('button',{name:/Use my location/}).click();await page.getByRole('button',{name:'Yes, this is my field'}).waitFor();row.location='Browser geolocation permission + simulated Finney coordinates; real field API response';row.field=await page.locator('.jr-found').innerText();
 });
 await run('farms-and-inputs',async(page,row)=>{
  await page.goto(base);await page.locator('.leaflet-container').waitFor();
  row.farms=[];
  for(const farm of ['Iowa','Illinois','Kansas','Nebraska']){await page.getByRole('button',{name:farm,exact:true}).click();await page.getByRole('button',{name:'Yes, this is my field'}).waitFor();row.farms.push({farm,text:await page.locator('.jr-found').innerText()})}
  await page.getByRole('button',{name:'Yes, this is my field'}).click();await page.locator('.jr-tiles-crops button').first().click();
  for(const group of ['Water supply','Your priority']){const g=page.getByRole('group',{name:group,exact:true});for(const b of await g.getByRole('button').all()){await b.click();assert.equal(await b.getAttribute('aria-pressed'),'true')}}
  await page.getByRole('checkbox',{name:/^Water conservation/}).check();await page.getByRole('checkbox',{name:/^Organic matter/}).check();assert.equal(await page.locator('.farmer-goals input:disabled').count(),3);
  await page.locator('.measurements > summary').click();await page.locator('input[name=ph]').fill('15');assert(await page.getByRole('button',{name:'Show my plan'}).isDisabled());await page.locator('input[name=ph]').fill('6.5');
  await page.getByRole('button',{name:'Add a yield year · Corn',exact:true}).click();assert(await page.getByRole('button',{name:'Show my plan'}).isDisabled());await page.getByLabel('Harvest year',{exact:true}).fill('2025');await page.getByLabel('Yield (bu/acre)',{exact:true}).fill('140');assert(await page.getByRole('button',{name:'Show my plan'}).isEnabled());
  row.measurements=await page.locator('.measurements').innerText();
  await page.reload();await page.getByRole('button',{name:'Nebraska',exact:true}).click();await page.getByRole('button',{name:'Yes, this is my field'}).click();await page.locator('.measurements > summary').click();assert.equal(await page.locator('input[name=ph]').inputValue(),'6.5');assert.equal(await page.getByLabel('Yield (bu/acre)',{exact:true}).inputValue(),'140');
  // Local calibration really travels through the planner; remote uncached plan is already owned elsewhere.
  if(!remote){const responsePromise=page.waitForResponse(r=>r.url().endsWith('/api/plan')&&r.request().method()==='POST');await page.getByRole('button',{name:'Show my plan'}).click();const response=await responsePromise;row.planStatus=response.status();const plan=await response.json();assert.equal(plan.request.soilTest.ph,6.5);assert.equal(plan.request.yieldRecords[0].value,140);await page.locator('.jr-answer').waitFor();row.measurementFacts=plan.facts.filter(f=>f.id.startsWith('farmer-'));}
  row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert.equal(row.overflow,false);
 });
 await run('kansas-expanded',async(page,row)=>{
  await page.goto(base);await page.getByRole('button',{name:'Kansas',exact:true}).click();await page.getByRole('button',{name:'Yes, this is my field'}).click();await page.getByRole('button',{name:'Show my plan'}).click();await page.locator('.jr-answer').waitFor();
  await page.evaluate(()=>document.querySelectorAll('details').forEach(d=>d.open=true));
  await page.getByRole('button',{name:'Compare timing',exact:true}).click();await page.getByRole('button',{name:'Load field history',exact:true}).click();await page.waitForFunction(()=>![...document.querySelectorAll('main button')].some(e=>e.textContent==='Loading…'));await page.waitForTimeout(3000);await page.waitForFunction(()=>![...document.querySelectorAll('.px[aria-busy=true]')].length,{},{timeout:90000});
  row.sections=await page.locator('h1,h2,h3,h4').allTextContents();row.text=await page.locator('main').innerText();row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert.equal(row.overflow,false);
  const def=page.locator('.term-definition button').first();if(await def.count()){await def.click();assert(await page.locator('.term-popover:popover-open').isVisible());await page.keyboard.press('Escape')}
 });
 for(const lang of ['en','es'])for(const route of ['how-it-works','sources','scout','live','settings','admin/docs'])await run(`${route.replace('/','-')}-${lang}`,async(page,row)=>{
  await page.addInitScript(lang=>localStorage.setItem('soilsense.language',lang),lang);await page.goto(`${base}/#/${route}`);await page.waitForTimeout(1800);row.lang=await page.locator('html').getAttribute('lang');assert.equal(row.lang,lang);row.headings=await page.locator('h1,h2,h3').allTextContents();row.text=(await page.locator(route==='scout'?'.scout':'main').innerText()).slice(0,18000);row.overflow=await page.evaluate(()=>document.documentElement.scrollWidth>document.documentElement.clientWidth);assert.equal(row.overflow,false);assert(row.text.trim());
 });
}finally{await browser.close()}
console.log(JSON.stringify(report.cases.reduce((a,c)=>(a[c.status]=(a[c.status]??0)+1,a),{})));if(report.cases.some(c=>c.status==='failed'))process.exitCode=1;
