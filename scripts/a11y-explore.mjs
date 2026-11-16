import { chromium } from 'playwright';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
const base=process.env.A11Y_BASE_URL??'http://127.0.0.1:8809';
const out='docs/screenshots/explore';await mkdir(out,{recursive:true});
const browser=await chromium.launch();const scans=[];
try {
 for(const language of ['en','es']) for(const width of [1440,375]) for(const state of ['globe','map']){
  const page=await browser.newPage({viewport:{width,height:width===375?812:900},reducedMotion:'reduce'});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.addInitScript(lang=>localStorage.setItem('soilsense.language',lang),language);
  await page.goto(base+(state==='globe'?'/#/explore':'/#/explore?lat=42.0563&lon=-93.495&label=Story%20County%2C%20Iowa'));
  await page.locator('.explore-map canvas').waitFor();await page.waitForTimeout(6000);
  await page.addScriptTag({content:axe.source});
  const result=await page.evaluate(async()=>{
    const r=await window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21a','wcag21aa']}});
    return {violations:r.violations.map(v=>({id:v.id,impact:v.impact,nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))})),incomplete:r.incomplete.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)}))};
  });
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth);
  scans.push({language,width,state,errors,overflow,...result});console.log(language,width,state,'violations',result.violations.length,'errors',errors.length,'overflow',overflow);
  await page.close();
 }
 await writeFile(`${out}/axe.json`,JSON.stringify({base,axe:axe.version,scans},null,2));
}finally{await browser.close();}
if(scans.some(s=>s.violations.length||s.errors.length||s.overflow))process.exitCode=1;
