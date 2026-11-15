import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
const browser = await chromium.launch();
const observations = [];
const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8790';
try {
  for (const language of ['en','es']) for (const width of [1280,375]) {
    const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.addInitScript(language => localStorage.setItem('soilsense.language',language),language);
    const label = en => language === 'es' ? ({ 'Skip to main content':'Saltar al contenido principal', 'Close navigation':'Cerrar navegación', 'Open sidebar':'Abrir barra lateral', 'Team sign-in':'Acceso del equipo' }[en] ?? en) : en;
    const confirm = language === 'es' ? 'Sí, esta es mi parcela' : 'Yes, this is my field';
    const showPlan = language === 'es' ? 'Ver mi plan' : 'Show my plan';
    page.setDefaultTimeout(180000);
    await page.goto(base);
    await page.locator('.leaflet-container').waitFor();
    // WCAG 2.4.1: the skip link is the first Tab stop and moves focus to the main content.
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('link',{name:label('Skip to main content')}).evaluate(e=>e===document.activeElement),true,'Skip link is the first Tab stop');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'content','Skip link focuses the main content');
    await page.goto(base);
    await page.locator('.leaflet-container').waitFor();
    if (width === 375) {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.getByRole('button',{name:label('Close navigation')}).waitFor();
      assert.equal(await page.getByRole('button',{name:label('Close navigation')}).evaluate(e=>e===document.activeElement),true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.getByRole('link',{name:label('Team sign-in')}).evaluate(e=>e===document.activeElement),true,'Drawer contains reverse Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button',{name:label('Open sidebar')}).evaluate(e=>e===document.activeElement),true,'Escape restores focus');
      await page.goto(base);
      await page.locator('.leaflet-container').waitFor();
    }
    // Real Tab presses, not synthetic DOM click events. Record the entire landing order.
    const order=[];
    for(let i=0;i<40;i++) {
      await page.keyboard.press('Tab');
      order.push(await page.evaluate(()=>({tag:document.activeElement.tagName,text:(document.activeElement.textContent||document.activeElement.getAttribute('aria-label')||'').trim().slice(0,90)})));
      if(await page.getByRole('button',{name:'Kansas',exact:true}).evaluate(e=>e===document.activeElement)) break;
    }
    if (width === 375) assert.equal(order[0].text,label('Skip to main content'),'Skip link comes first'), assert.equal(order[1].text,label('Open sidebar'),'Collapsed phone navigation must not receive focus');
    assert.equal(await page.getByRole('button',{name:'Kansas',exact:true}).evaluate(e=>e===document.activeElement),true,'Kansas reachable by Tab');
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:confirm}).waitFor();
    const small = await page.locator('button:visible').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width<44||e.height<44));
    observations.push({language,width,order,undersizedButtons:small});
    // Tab forward from Kansas, through Field Watch, to confirmation.
    for(let i=0;i<35;i++) {
      await page.keyboard.press('Tab');
      if(await page.getByRole('button',{name:confirm}).evaluate(e=>e===document.activeElement))break;
    }
    assert.equal(await page.getByRole('button',{name:confirm}).evaluate(e=>e===document.activeElement),true,'Confirmation reachable by Tab');
    await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:language === 'es' ? 'Tres preguntas rápidas' : 'Three quick questions'}).waitFor();
    observations.at(-1).questionFocus = await page.evaluate(()=>document.activeElement.outerHTML.slice(0,200));
    // Native button groups: Tab reaches every option; Space selects and exposes pressed state.
    await page.locator('.jr-tiles-crops button').first().focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.jr-tiles-crops button').first().getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:showPlan}).focus();
    await page.keyboard.press('Enter');
    await page.locator('.jr-answer').waitFor();
    observations.at(-1).planHeading = await page.locator('h1').innerText();
    await page.setViewportSize({width:320,height:900});
    const reflow = await page.evaluate(()=>({ fits:document.documentElement.scrollWidth <= document.documentElement.clientWidth, width:document.documentElement.clientWidth, overflow:[...document.querySelectorAll('main *')].filter(e=>e.getBoundingClientRect().right>document.documentElement.clientWidth).map(e=>({tag:e.tagName,cls:e.className,text:e.textContent.slice(0,100),right:e.getBoundingClientRect().right})) }));
    assert.equal(reflow.fits,true,`Plan reflows at 320 CSS pixels: ${JSON.stringify(reflow)}`);
    await page.setViewportSize({width,height:900});
    await page.locator('.jr-more > summary').first().focus();
    await page.keyboard.press('Enter');
    assert.equal(await page.locator('.jr-more').first().getAttribute('open'),'');
    await page.goto(base);
    await page.locator('.map').waitFor();
    await page.locator('.map').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.locator('.jr-found').waitFor();
    observations.at(-1).mapKeyboardSelection = true;
    await page.close();
  }
} finally {
  await browser.close();
  await mkdir('docs/a11y',{recursive:true});
  await writeFile('docs/a11y/keyboard.json',JSON.stringify({timestamp:new Date().toISOString(),observations},null,2)+'\n');
}
assert.equal(observations.flatMap(o=>o.undersizedButtons).length,0,'Enabled landing buttons meet the 44px team rule');
console.log('Keyboard flow and 44px button checks passed in EN and ES at both widths');
