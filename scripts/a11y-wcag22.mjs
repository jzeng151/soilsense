// WCAG 2.2 A/AA automated audit of the BUILT app (Explore, demo, planner, info routes).
// Usage: A11Y_BASE_URL=http://127.0.0.1:8819 A11Y_OUTPUT=docs/screenshots/a11y/after.json node scripts/a11y-wcag22.mjs
// Optional: A11Y_SCREENSHOTS=<dir> (selected JPEGs), A11Y_LANGS=en,es,ko, A11Y_WIDTHS=1440,390.
// axe 'incomplete' color-contrast nodes are kept as incomplete AND resolved separately by sampling the
// rendered background pixels behind the element (text made transparent) — worst case, no text-shadow credit.
import { chromium } from 'playwright';
import axe from 'axe-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8819';
const output = process.env.A11Y_OUTPUT ?? 'docs/screenshots/a11y/latest.json';
const shots = process.env.A11Y_SCREENSHOTS;
const tags = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const languages = (process.env.A11Y_LANGS ?? 'en,es').split(',');
const widths = (process.env.A11Y_WIDTHS ?? '1440,390').split(',').map(Number);
const only = process.env.A11Y_STATES?.split(',');
const copy = {
  en: { confirm: 'Yes, this is my field →', showPlan: 'Show my plan →' },
  es: { confirm: 'Sí, esta es mi parcela →', showPlan: 'Ver mi plan →' },
  ko: { confirm: '네, 제 포장입니다 →', showPlan: '내 계획 보기 →' },
};
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { timestamp: new Date().toISOString(), revision: process.env.A11Y_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), label: process.env.A11Y_LABEL ?? null, base, axe: axe.version, browser: browser.version(), tags, reducedMotion: 'reduce', scans: [] };

const parseColor = s => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const p = m[1].split(/[ ,/]+/).filter(Boolean).map(Number); return { r: p[0], g: p[1], b: p[2], a: p[3] ?? 1 }; };

async function resolveContrast(page, nodes) {
  const resolved = [];
  for (const node of nodes.slice(0, 40)) {
    const selector = node.target?.[0];
    if (typeof selector !== 'string') { resolved.push({ target: node.target, skipped: 'shadow/iframe target' }); continue; }
    const info = await page.evaluate(sel => {
      const el = document.querySelector(sel); if (!el) return null;
      el.scrollIntoView({ block: 'center', inline: 'nearest' });
      const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); const svg = el instanceof SVGElement; const px = k => parseFloat(cs[k]) || 0;
      // Content box only: borders/padding are not behind the glyphs.
      const l = px('borderLeftWidth') + px('paddingLeft'), t = px('borderTopWidth') + px('paddingTop');
      return { x: r.x + l, y: r.y + t, w: r.width - l - px('borderRightWidth') - px('paddingRight'), h: r.height - t - px('borderBottomWidth') - px('paddingBottom'), color: svg ? cs.fill : cs.color, svg, fontSize: parseFloat(cs.fontSize), fontWeight: Number(cs.fontWeight), text: el.textContent.trim().slice(0, 60) };
    }, selector);
    if (!info || info.w < 1 || info.h < 1) { resolved.push({ target: node.target, skipped: 'not rendered' }); continue; }
    const vp = page.viewportSize();
    const clip = { x: Math.max(0, info.x), y: Math.max(0, info.y), width: Math.min(info.w, vp.width - Math.max(0, info.x)), height: Math.min(info.h, vp.height - Math.max(0, info.y)) };
    if (clip.width < 1 || clip.height < 1) { resolved.push({ target: node.target, skipped: 'offscreen' }); continue; }
    await page.evaluate(sel => { const el = document.querySelector(sel); el.dataset.a11yProbe = '1'; const st = document.createElement('style'); st.id = 'a11y-probe'; st.textContent = '[data-a11y-probe], [data-a11y-probe] * { color: transparent !important; fill: transparent !important; stroke: transparent !important; -webkit-text-fill-color: transparent !important; text-shadow: none !important; caret-color: transparent !important; } [data-a11y-probe] img { visibility: hidden !important; }'; document.head.append(st); }, selector);
    const png = await page.screenshot({ clip, animations: 'disabled' });
    await page.evaluate(sel => { document.querySelector(sel)?.removeAttribute('data-a11y-probe'); document.getElementById('a11y-probe')?.remove(); }, selector);
    const fg = parseColor(info.color);
    const stats = await page.evaluate(async ({ b64, fg }) => {
      const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
      const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
      const d = ctx.getImageData(0, 0, c.width, c.height).data;
      const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
      const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
      const ratios = [];
      for (let i = 0; i < d.length; i += 4 * 3) {
        const r = d[i], g = d[i + 1], b = d[i + 2];
        const fr = fg.r * fg.a + r * (1 - fg.a), fgG = fg.g * fg.a + g * (1 - fg.a), fb = fg.b * fg.a + b * (1 - fg.a);
        const l1 = L(fr, fgG, fb), l2 = L(r, g, b);
        ratios.push((Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05));
      }
      ratios.sort((a, b) => a - b);
      const q = p => ratios[Math.min(ratios.length - 1, Math.floor(p * ratios.length))];
      return { samples: ratios.length, min: q(0), p05: q(0.05), median: q(0.5) };
    }, { b64: png.toString('base64'), fg });
    const large = info.fontSize >= 24 || (info.fontSize >= 18.66 && info.fontWeight >= 700);
    const required = large ? 3 : 4.5;
    resolved.push({ target: node.target, text: info.text, fg: info.color, fontSize: info.fontSize, fontWeight: info.fontWeight, required, ...Object.fromEntries(Object.entries(stats).map(([k, v]) => [k, typeof v === 'number' ? Math.round(v * 100) / 100 : v])), axeMessage: node.any?.[0]?.message ?? null, verdict: stats.p05 >= required ? 'pass (p05 background)' : 'fail', worstPixelPasses: stats.min >= required });
  }
  return resolved;
}

const slim = rules => rules.map(v => ({ id: v.id, impact: v.impact, tags: v.tags, help: v.help, nodes: v.nodes.map(n => ({ target: n.target, html: n.html.slice(0, 200), failureSummary: n.failureSummary, any: n.any.map(a => ({ id: a.id, message: a.message, data: a.data })) })) }));

async function scan(page, ctx, state) {
  if (only && !only.includes(state)) return;
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(300);
  if (!(await page.evaluate(() => !!window.axe))) await page.addScriptTag({ content: axe.source });
  const result = await page.evaluate(async t => window.axe.run(document, { runOnly: { type: 'tag', values: t }, resultTypes: ['violations', 'incomplete'] }), tags);
  const inventory = await page.evaluate(() => ({
    lang: document.documentElement.lang,
    h1: [...document.querySelectorAll('h1')].filter(e => e.getClientRects().length).map(e => e.textContent.trim().slice(0, 80)),
    landmarks: Object.fromEntries(['main', 'nav', 'header', 'footer', 'aside', '[role=region],section[aria-label]'].map(s => [s, document.querySelectorAll(s).length])),
    liveRegions: [...document.querySelectorAll('[aria-live],[role=status],[role=log],[role=alert]')].map(e => `${e.tagName.toLowerCase()}.${e.className}`.slice(0, 60)),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    languageSwitchers: [...document.querySelectorAll('button,select')].filter(e => e.getClientRects().length && /language|idioma|언어|^EN|^ES/i.test((e.getAttribute('aria-label') ?? '') + e.textContent)).length,
  }));
  const contrastIncomplete = result.incomplete.find(r => r.id === 'color-contrast');
  const contrastResolved = contrastIncomplete ? await resolveContrast(page, contrastIncomplete.nodes) : [];
  report.scans.push({ ...ctx, state, url: page.url(), inventory, violations: slim(result.violations), incomplete: slim(result.incomplete), contrastResolved });
  const nodes = result.violations.reduce((n, v) => n + v.nodes.length, 0);
  console.log(`${ctx.language} ${ctx.width} ${state}: ${result.violations.length} rules/${nodes} nodes [${result.violations.map(v => v.id).join(',')}]; incomplete ${result.incomplete.length}; contrast-resolved fail ${contrastResolved.filter(r => r.verdict === 'fail').length}/${contrastResolved.length}; h1=${inventory.h1.length} lang=${inventory.lang} overflow=${inventory.overflow}`);
  if (shots && ['explore-globe', 'explore-map', 'explore-assistant', 'planner-plan', 'demo'].includes(state) && ctx.language !== 'ko') {
    await mkdir(shots, { recursive: true });
    await page.evaluate(() => scrollTo(0, 0));
    await page.screenshot({ path: `${shots}/${ctx.language}-${ctx.width}-${state}.jpg`, type: 'jpeg', quality: 70 });
  }
}

async function freshPage(language, width) {
  const page = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: 'reduce' });
  page.setDefaultTimeout(120000);
  await page.addInitScript(l => localStorage.setItem('soilsense.language', l), language);
  return page;
}
const want = s => !only || only.includes(s);

try {
  for (const language of languages) for (const width of widths) {
    const ctx = { language, width };
    const spot = language === 'ko';
    if (spot && width !== widths[0]) continue;
    // Explore: globe → ZIP 67846 → map → assistant → layers
    if (want('explore-globe') || want('explore-map') || want('explore-assistant') || want('explore-layers')) {
      const page = await freshPage(language, width);
      await page.goto(base + '/#/explore');
      await page.locator('.explore-map canvas').first().waitFor();
      await page.waitForTimeout(4000);
      await scan(page, ctx, 'explore-globe');
      await page.locator('.explore-zip-form input').first().fill('67846');
      await page.locator('.explore-zip-form input').first().press('Enter');
      await page.locator('.explore-location-chip').waitFor();
      await page.waitForTimeout(8000);
      const toggle = page.locator('.explore-assistant-toggle');
      const assistant = page.locator('.explore-assistant');
      if (await assistant.isVisible().catch(() => false) && await toggle.count()) { await toggle.click(); await page.waitForTimeout(800); }
      await scan(page, ctx, 'explore-map');
      if (await toggle.count() && !(await assistant.isVisible().catch(() => false))) await toggle.click();
      await assistant.waitFor();
      await page.locator('.fa-rotation, .field-assistant [role=log]').first().waitFor({ timeout: 90000 }).catch(() => {});
      await page.waitForTimeout(1500);
      await scan(page, ctx, 'explore-assistant');
      if (!spot) {
        await page.locator('.explore-layers button[aria-expanded]').first().click();
        await page.locator('#explore-layer-menu').waitFor();
        await scan(page, ctx, 'explore-layers');
      }
      await page.close();
    }
    if (want('demo')) { const page = await freshPage(language, width); await page.goto(base + '/#/demo'); await page.locator('.demo-card').first().waitFor(); await page.waitForTimeout(800); await scan(page, ctx, 'demo'); await page.close(); }
    for (const route of spot ? ['how-it-works'] : ['how-it-works', 'sources', 'live', 'scout', 'signin', 'settings']) {
      if (!want(route)) continue;
      const page = await freshPage(language, width); try { await page.goto(`${base}/#/${route}`); await page.locator('main, #content').first().waitFor(); await page.waitForTimeout(2500); await scan(page, ctx, route); } catch (e) { report.scans.push({ ...ctx, state: route, error: String(e.message).slice(0, 200), violations: [], incomplete: [], contrastResolved: [] }); console.log(`${language} ${width} ${route}: ERROR ${e.message.slice(0, 80)}`); } await page.close();
    }
    if (!spot && (want('planner-questions') || want('planner-plan'))) {
      const page = await freshPage(language, width);
      await page.goto(base + '/#/');
      await page.locator('.map.leaflet-container').waitFor();
      await page.getByRole('button', { name: 'Kansas', exact: true }).click();
      await page.getByRole('button', { name: copy[language].confirm, exact: true }).click();
      await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; }));
      await scan(page, ctx, 'planner-questions');
      await page.getByRole('button', { name: copy[language].showPlan, exact: true }).click();
      await page.locator('.jr-answer').waitFor({ timeout: 180000 });
      await page.waitForTimeout(4000);
      for (let i = 0; i < 3; i++) { await page.evaluate(() => document.querySelectorAll('details').forEach(d => { d.open = true; })); await page.waitForTimeout(700); }
      await page.locator('.fertilizer-guide').first().waitFor({ timeout: 30000 }).catch(() => {});
      await scan(page, ctx, 'planner-plan');
      await page.close();
    }
  }
} finally {
  await browser.close();
  await mkdir(output.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 1) + '\n');
}
const total = report.scans.reduce((n, s) => n + s.violations.length, 0);
console.log(`scans=${report.scans.length} violation rule instances=${total}`);
if (process.env.A11Y_STRICT && total) process.exitCode = 1;
