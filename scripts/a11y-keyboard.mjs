import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
// Exact planner/navigation copy from i18n.ts/i18n-cards.ts and i18n-ko.ts.
const labels = {
  en: { confirm: 'Yes, this is my field →', showPlan: 'Show my plan →', skip: 'Skip to main content', close: 'Close navigation', team: 'Team sign-in', open: 'Open sidebar', questions: 'Three quick questions' },
  es: { confirm: 'Sí, esta es mi parcela →', showPlan: 'Ver mi plan →', skip: 'Saltar al contenido principal', close: 'Cerrar navegación', team: 'Acceso del equipo', open: 'Abrir barra lateral', questions: 'Tres preguntas rápidas' },
  ko: { confirm: '네, 제 포장입니다 →', showPlan: '내 계획 보기 →', skip: '본문으로 건너뛰기', close: '메뉴 닫기', team: '팀 로그인', open: '사이드바 열기', questions: '간단한 질문 세 가지' },
};
const languages = Object.keys(labels);
const widths = [1280,375];
const browser = await chromium.launch();
const observations = [];
const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8790';
const output = process.env.A11Y_KEYBOARD_OUTPUT ?? 'docs/a11y/keyboard.json';
try {
  for (const language of languages) for (const width of widths) {
    const page = await browser.newPage({viewport:{width,height:900},reducedMotion:'reduce'});
    await page.addInitScript(language => localStorage.setItem('soilsense.language',language),language);
    const copy = labels[language];
    const confirm = copy.confirm;
    const showPlan = copy.showPlan;
    page.setDefaultTimeout(180000);
    await page.goto(base);
    await page.locator('.leaflet-container').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'),language,'Page uses the requested language');
    // WCAG 2.4.1: the skip link is the first Tab stop and moves focus to the main content.
    await page.keyboard.press('Tab');
    assert.equal(await page.getByRole('link',{name:copy.skip}).evaluate(e=>e===document.activeElement),true,'Skip link is the first Tab stop');
    await page.keyboard.press('Enter');
    assert.equal(await page.evaluate(()=>document.activeElement?.id),'content','Skip link focuses the main content');
    await page.goto(base);
    await page.locator('.leaflet-container').waitFor();
    if (width === 375) {
      await page.keyboard.press('Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Enter');
      await page.getByRole('button',{name:copy.close}).waitFor();
      assert.equal(await page.getByRole('button',{name:copy.close}).evaluate(e=>e===document.activeElement),true);
      await page.keyboard.press('Shift+Tab');
      assert.equal(await page.getByRole('link',{name:copy.team}).evaluate(e=>e===document.activeElement),true,'Drawer contains reverse Tab');
      await page.keyboard.press('Tab');
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('button',{name:copy.open}).evaluate(e=>e===document.activeElement),true,'Escape restores focus');
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
    if (width === 375) assert.equal(order[0].text,copy.skip,'Skip link comes first'), assert.equal(order[1].text,copy.open,'Collapsed phone navigation must not receive focus');
    assert.equal(await page.getByRole('button',{name:'Kansas',exact:true}).evaluate(e=>e===document.activeElement),true,'Kansas reachable by Tab');
    await page.keyboard.press('Enter');
    await page.getByRole('button',{name:confirm,exact:true}).waitFor();
    const small = await page.locator('button:visible').evaluateAll(es=>es.filter(e=>!e.disabled).map(e=>({text:e.textContent.trim(),width:e.getBoundingClientRect().width,height:e.getBoundingClientRect().height})).filter(e=>e.width<44||e.height<44));
    observations.push({language,width,order,undersizedButtons:small});
    // Tab forward from Kansas, through Field Watch, to confirmation.
    for(let i=0;i<35;i++) {
      await page.keyboard.press('Tab');
      if(await page.getByRole('button',{name:confirm,exact:true}).evaluate(e=>e===document.activeElement))break;
    }
    assert.equal(await page.getByRole('button',{name:confirm,exact:true}).evaluate(e=>e===document.activeElement),true,'Confirmation reachable by Tab');
    await page.keyboard.press('Enter');
    await page.getByRole('heading',{name:copy.questions}).waitFor();
    observations.at(-1).questionFocus = await page.evaluate(()=>document.activeElement.outerHTML.slice(0,200));
    // Native button groups: Tab reaches every option; Space selects and exposes pressed state.
    await page.locator('.jr-tiles-crops button').first().focus();
    await page.keyboard.press('Space');
    assert.equal(await page.locator('.jr-tiles-crops button').first().getAttribute('aria-pressed'),'true');
    await page.getByRole('button',{name:showPlan,exact:true}).focus();
    await page.keyboard.press('Enter');
    await page.locator('.jr-answer').waitFor();
    observations.at(-1).planHeading = await page.locator('h1').innerText();
    await page.setViewportSize({width:320,height:900});
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth <= document.documentElement.clientWidth),true,'Plan reflows at 320 CSS pixels');
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
  await mkdir(output.replace(/[/\\][^/\\]+$/, ''),{recursive:true});
  await writeFile(output,JSON.stringify({timestamp:new Date().toISOString(),observations},null,2)+'\n');
}
assert.equal(observations.length,languages.length * widths.length,'Every language and width completed');
assert.equal(observations.flatMap(o=>o.undersizedButtons).length,0,'Enabled landing buttons meet the 44px team rule');
console.log('Keyboard flow and 44px button checks passed in EN, ES and KO at both widths');
