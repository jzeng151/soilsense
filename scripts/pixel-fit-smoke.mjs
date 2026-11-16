// Real built-app flow; no API interception or fabricated responses.
// Start the opt-in Worker on 8802, then: node scripts/pixel-fit-smoke.mjs <scratch-output.json>
import { chromium } from 'playwright';
import axe from 'axe-core';
import { writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const output=process.argv[2];
if(!output)throw new Error('Supply an explicit scratch output path');
const base='http://127.0.0.1:8802';
const browser=await chromium.launch();
const tags=['wcag2a','wcag2aa','wcag21a','wcag21aa'];
const report={revision:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),timestamp:new Date().toISOString(),base,browser:browser.version(),axe:axe.version,tags,scope:'Real demo flow; native-size inventory only. Populated per-outline state covered by client tests, not this browser scan.',scans:[]};
try {
  for(const language of ['en','es']){
    const page=await browser.newPage({viewport:{width:375,height:812},reducedMotion:'reduce'});
    page.setDefaultTimeout(180000);
    await page.addInitScript(language=>localStorage.setItem('soilsense.language',language),language);
    await page.goto(base);
    const assets=await page.locator('script[src]').evaluateAll(es=>es.map(e=>e.src));
    await page.getByRole('button',{name:'Kansas',exact:true}).click();
    await page.getByRole('button',{name:language==='es'?/Sí, esta es mi parcela/:/Yes, this is my field/}).click();
    await page.getByRole('button',{name:language==='es'?/Ver mi plan/:/Show my plan/}).click();
    await page.locator('.sensor-fit caption').waitFor();
    for(const width of [375,320]){
      await page.setViewportSize({width,height:812});
      await page.locator('.sensor-fit').scrollIntoViewIfNeeded();
      await page.addScriptTag({content:axe.source});
      const result=await page.evaluate(tags=>window.axe.run(document.querySelector('.sensor-fit'),{runOnly:{type:'tag',values:tags}}),tags);
      const inventory=await page.locator('.sensor-fit').evaluate(e=>({language:document.documentElement.lang,caption:e.querySelector('caption').textContent,rows:e.querySelectorAll('tbody tr').length,headings:[...e.querySelectorAll('h2,h3')].map(h=>h.textContent),cardWidth:e.clientWidth,cardScrollWidth:e.scrollWidth,pageWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth}));
      report.scans.push({language,width,assets,inventory,...result});
      console.log(JSON.stringify({language,width,violations:result.violations.length,incomplete:result.incomplete.length,inventory}));
      if(result.violations.length||inventory.rows!==9||inventory.cardScrollWidth>inventory.cardWidth||inventory.pageWidth>inventory.clientWidth)process.exitCode=1;
      await page.locator('.sensor-fit').screenshot({path:output.replace(/\.json$/,`-${language}-${width}.png`)});
    }
    await page.close();
  }
} finally {await writeFile(output,JSON.stringify(report,null,2));await browser.close();}
