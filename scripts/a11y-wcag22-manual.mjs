// Manual-style WCAG 2.2 checks axe cannot make, run against the BUILT app in Chromium.
// Records measurements only; interpretation lives in docs/ACCESSIBILITY.md.
// Usage: A11Y_BASE_URL=http://127.0.0.1:8819 A11Y_OUTPUT=docs/screenshots/a11y/manual-after.json node scripts/a11y-wcag22-manual.mjs
import { chromium } from 'playwright';
import { writeFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8819';
const output = process.env.A11Y_OUTPUT ?? 'docs/screenshots/a11y/manual-latest.json';
const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
const report = { timestamp: new Date().toISOString(), revision: process.env.A11Y_REVISION ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), label: process.env.A11Y_LABEL ?? null, base, browser: browser.version(), checks: {} };
const page0 = async (width, opts = {}) => { const p = await browser.newPage({ viewport: { width, height: width < 500 ? 844 : 900 }, reducedMotion: 'reduce', ...opts }); p.setDefaultTimeout(60000); await p.addInitScript(l => localStorage.setItem('soilsense.language', l), opts.language ?? 'en'); return p; };
const openExplore = async p => { await p.goto(base + '/#/explore'); await p.locator('.explore-map canvas').first().waitFor(); await p.waitForTimeout(3000); };
const toMap = async p => { await p.locator('.explore-zip-form input').first().fill('67846'); await p.locator('.explore-zip-form input').first().press('Enter'); await p.locator('.explore-location-chip').waitFor(); await p.waitForTimeout(6000); };

// Focused element snapshot: name, visible indicator, not fully obscured (2.4.7 / 2.4.11).
const focusInfo = p => p.evaluate(() => {
  const el = document.activeElement; if (!el || el === document.body) return { tag: 'body' };
  const cs = getComputedStyle(el); const r = el.getBoundingClientRect();
  const pts = [[r.left + r.width / 2, r.top + r.height / 2], [r.left + 2, r.top + 2], [r.right - 2, r.bottom - 2]];
  const visiblePts = pts.filter(([x, y]) => { const hit = document.elementFromPoint(x, y); return hit && (hit === el || el.contains(hit) || hit.contains(el)); }).length;
  return { tag: el.tagName.toLowerCase(), name: (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 50), outline: `${cs.outlineStyle} ${cs.outlineWidth} ${cs.outlineColor}`, boxShadow: cs.boxShadow.slice(0, 60), indicator: (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) >= 2) || cs.boxShadow !== 'none', inViewport: r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth, unobscuredPoints: visiblePts, w: Math.round(r.width), h: Math.round(r.height) };
});

try {
  // 1. Keyboard-only Explore flow at desktop and phone widths.
  for (const width of [1440, 390]) {
    const p = await page0(width); const log = []; const step = async (label, ok) => log.push({ label, ok, focus: await focusInfo(p) });
    await openExplore(p);
    const tabTo = async (pred, max = 40) => { for (let i = 0; i < max; i++) { await p.keyboard.press('Tab'); const f = await focusInfo(p); log.push({ tab: i, focus: f }); if (pred(f)) return true; } return false; };
    await step('ZIP input reached by Tab', await tabTo(f => f.tag === 'input'));
    await p.keyboard.type('67846'); await p.keyboard.press('Enter');
    await p.locator('.explore-location-chip').waitFor(); await p.waitForTimeout(6000);
    await step('ZIP submitted with Enter → map + location chip', await p.locator('.explore-location-chip').isVisible());
    await p.evaluate(() => document.activeElement?.blur()); await p.locator('body').focus();
    const layersReached = await tabTo(f => /Layers|Capas/.test(f.name) && f.tag === 'button' && f.w > 60);
    await p.keyboard.press('Enter'); await p.waitForTimeout(300);
    await step('Layers menu toggled with Enter', layersReached && await p.locator('#explore-layer-menu').isVisible());
    await p.keyboard.press('Tab'); await step('Tab moves into layer options', /input/.test((await focusInfo(p)).tag));
    await p.keyboard.press('Escape'); await p.waitForTimeout(200);
    await step('Escape closes layers menu (recorded, not required)', !(await p.locator('#explore-layer-menu').isVisible()));
    const assistantVisible = () => p.locator('.explore-assistant').isVisible();
    if (await assistantVisible()) { await p.locator('.explore-assistant-toggle').focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(500); }
    await p.locator('.explore-assistant-toggle').focus();
    await step('Assistant toggle focusable', true);
    await p.keyboard.press('Enter'); await p.waitForTimeout(800);
    await step('Assistant opened with Enter', await assistantVisible());
    // The composer and suggestions stay disabled until the field plan loads; wait for that first.
    await p.locator('.fa-rotation').first().waitFor({ timeout: 90000 }).catch(() => {});
    await p.locator('.fa-composer textarea:enabled').first().waitFor({ timeout: 30000 }).catch(() => {});
    await p.waitForTimeout(500);
    const composerState = await p.evaluate(() => { const t = document.querySelector('.fa-composer textarea'); return t ? { disabled: t.disabled, notice: document.querySelector('.fa-notice, .fa-status')?.textContent?.trim().slice(0, 100) ?? null } : null; });
    log.push({ label: 'composer state (disabled when the Worker has no AI model; not a keyboard trap)', ok: !!composerState, composerState });
    const composer = composerState && !composerState.disabled ? await tabTo(f => f.tag === 'textarea', 40) : false;
    await step('Composer reached by Tab', composer);
    if (composer) {
      await p.keyboard.type('What is the top rotation?');
      const before = await p.locator('.fa-turn, .fa-user').count();
      await p.keyboard.press('Enter'); await p.waitForTimeout(4000);
      const after = await p.locator('.fa-turn, .fa-user').count();
      await step('Enter sends the question (user turn added)', after > before);
    }
    report.checks[`chatLive-${width}`] = await p.evaluate(() => [...document.querySelectorAll('.field-assistant [aria-live], .field-assistant [role=log], .field-assistant [role=status]')].map(e => ({ tag: e.tagName.toLowerCase(), role: e.getAttribute('role'), live: e.getAttribute('aria-live'), cls: e.className.slice(0, 40) })));
    const closeBtn = p.locator('.field-assistant button[aria-label]').filter({ hasText: /×|✕/ }).first();
    const closeLabel = await p.locator('.fa-header button[aria-label], .field-assistant header button[aria-label]').evaluateAll(bs => bs.map(b => b.getAttribute('aria-label')));
    const closeTarget = p.getByRole('button', { name: /^(Close assistant|Cerrar asistente)$/ }).first();
    if (await closeTarget.count()) { await closeTarget.focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(600); }
    await step('Assistant closed with keyboard', !(await assistantVisible()));
    log.push({ label: 'focus after close', focus: await focusInfo(p), headerButtons: closeLabel, closeBtnCount: await closeBtn.count() });
    // Nav rail
    if (!p.url().includes('#/explore')) await openExplore(p);
    await p.locator('.explore-rail a').first().focus();
    const rail = []; for (let i = 0; i < 9; i++) { rail.push(await focusInfo(p)); await p.keyboard.press('Tab'); }
    report.checks[`keyboard-explore-${width}`] = { log, rail, focusWithoutIndicator: log.filter(l => l.focus && l.focus.tag !== 'body' && !l.focus.indicator).map(l => l.focus.name), obscured: log.filter(l => l.focus && l.focus.tag !== 'body' && l.focus.unobscuredPoints === 0).map(l => l.focus.name) };
    console.log('keyboard', width, log.filter(l => l.label).map(l => `${l.label}:${l.ok}`).join(' | '));
    await p.close();
  }

  // 2. Target size (2.5.8) on Explore states and the planner landing, plus overlap of the attribution/toggle at 390.
  for (const width of [1440, 390]) {
    const p = await page0(width); await openExplore(p); await toMap(p);
    if (!(await p.locator('.explore-assistant').isVisible())) await p.locator('.explore-assistant-toggle').click();
    await p.waitForTimeout(1500);
    report.checks[`targets-explore-${width}`] = await p.evaluate(() => {
      const els = [...document.querySelectorAll('button, a[href], input, select, textarea, summary, [role=button]')].filter(e => e.getClientRects().length && getComputedStyle(e).visibility !== 'hidden');
      const small = els.map(e => ({ e, r: e.getBoundingClientRect() })).filter(({ r }) => r.width < 24 || r.height < 24).filter(({ e }) => !(e.tagName === 'A' && getComputedStyle(e).display === 'inline'));
      const rect = s => { const e = document.querySelector(s); return e && e.getBoundingClientRect(); };
      const overlap = (a, b) => a && b && !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);
      const attrib = rect('.maplibregl-ctrl-attrib');
      const infoIcons = (() => { const b = document.querySelector('.maplibregl-ctrl-attrib-button'); if (!b) return null; const cs = getComputedStyle(b); return { h: b.getBoundingClientRect().height, repeat: cs.backgroundRepeat, iconsRendered: cs.backgroundRepeat.includes('no-repeat') ? 1 : Math.ceil(b.getBoundingClientRect().height / 24) }; })();
      return { interactive: els.length, under24: small.map(({ e, r }) => ({ name: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 40), w: Math.round(r.width), h: Math.round(r.height) })), attribution: attrib && { w: Math.round(attrib.width), h: Math.round(attrib.height), expanded: document.querySelector('.maplibregl-ctrl-attrib')?.classList.contains('maplibregl-compact-show') }, attributionOverlapsToggle: !!overlap(attrib, rect('.explore-assistant-toggle')), attributionOverlapsAssistant: !!overlap(attrib, rect('.explore-assistant')), infoIcons };
    });
    console.log('targets', width, JSON.stringify(report.checks[`targets-explore-${width}`]).slice(0, 300));
    // 1.4.11: floating controls over imagery — light border vs surrounding pixels, plus inner edge pairs.
    const ctrls = ['.explore-location-chip', '.explore-map-controls', '.explore-layers > button', '.explore-assistant-toggle'];
    const results = [];
    for (const sel of ctrls) {
      const loc = p.locator(sel).first(); if (!(await loc.count()) || !(await loc.isVisible())) continue;
      const box = await loc.boundingBox(); const vp = p.viewportSize();
      const pad = 7; const clip = { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: Math.min(vp.width, box.x + box.width + pad) - Math.max(0, box.x - pad), height: Math.min(vp.height, box.y + box.height + pad) - Math.max(0, box.y - pad) };
      const png = await p.screenshot({ clip });
      const css = await loc.evaluate(e => { const cs = getComputedStyle(e); return { border: cs.borderTopColor, borderWidth: cs.borderTopWidth, fill: cs.backgroundColor, shadow: cs.boxShadow.slice(0, 80) }; });
      const stats = await p.evaluate(async ({ b64, css, box, clip, pad }) => {
        const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
        const c = document.createElement('canvas'); c.width = img.width; c.height = img.height; const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0); const d = ctx.getImageData(0, 0, c.width, c.height).data;
        const lin = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }; const L = (r, g, b) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
        const ratio = (a, b) => (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const parse = s => s.match(/\d+(\.\d+)?/g).map(Number); const [br, bg, bb] = parse(css.border); const lb = L(br, bg, bb);
        const ring = [];
        const ox = box.x - clip.x, oy = box.y - clip.y;
        for (let y = 0; y < c.height; y++) for (let x = 0; x < c.width; x++) {
          const dx = Math.max(ox - x, x - (ox + box.width), 0), dy = Math.max(oy - y, y - (oy + box.height), 0); const dist = Math.max(dx, dy);
          if (dist >= 4 && dist <= pad - 1) { const i = (y * c.width + x) * 4; ring.push(ratio(lb, L(d[i], d[i + 1], d[i + 2]))); }
        }
        ring.sort((a, b) => a - b);
        return { ringSamples: ring.length, borderVsImageryP05: Math.round(ring[Math.floor(ring.length * 0.05)] * 100) / 100, borderVsImageryMedian: Math.round(ring[Math.floor(ring.length / 2)] * 100) / 100 };
      }, { b64: png.toString('base64'), css, box, clip, pad });
      results.push({ selector: sel, ...css, ...stats });
    }
    report.checks[`nonTextContrast-explore-${width}`] = results;
    await p.close();
  }

  // 3. Reflow at 320 CSS px (= 1280 px at 400% zoom) and text spacing (1.4.12).
  const routes = ['#/explore', '#/demo', '#/', '#/how-it-works', '#/sources', '#/live', '#/scout', '#/signin'];
  report.checks.reflow320 = []; report.checks.textSpacing = [];
  for (const route of routes) {
    const p = await page0(320); await p.goto(base + '/' + route); await p.locator('main, .explore-page, #content').first().waitFor(); await p.waitForTimeout(route === '#/explore' ? 3000 : 1500);
    const reflow = await p.evaluate(() => ({ docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, scrollWidth: document.documentElement.scrollWidth, clientWidth: document.documentElement.clientWidth, wideElements: [...document.querySelectorAll('body *')].filter(e => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > document.documentElement.clientWidth + 1 && getComputedStyle(e).position !== 'fixed' && !e.closest('table, pre, .maplibregl-map, [role=region][tabindex], .fertilizer-scroll'); }).slice(0, 5).map(e => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}`) }));
    report.checks.reflow320.push({ route, ...reflow });
    await p.addStyleTag({ content: '* { line-height: 1.5 !important; letter-spacing: 0.12em !important; word-spacing: 0.16em !important; } p { margin-bottom: 2em !important; }' });
    await p.waitForTimeout(400);
    const spacing = await p.evaluate(() => ({ docOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, clipped: [...document.querySelectorAll('button, a, label, h1, h2, h3, p, span, li, summary')].filter(e => { const cs = getComputedStyle(e); return e.getClientRects().length && (cs.overflow === 'hidden' || cs.overflowX === 'hidden' || cs.textOverflow === 'ellipsis') && (e.scrollWidth > e.clientWidth + 1 || e.scrollHeight > e.clientHeight + 1); }).slice(0, 8).map(e => `${e.tagName.toLowerCase()}.${String(e.className).slice(0, 30)}: ${e.textContent.trim().slice(0, 30)}`) }));
    report.checks.textSpacing.push({ route, width: 320, ...spacing });
    await p.close();
  }
  console.log('reflow', JSON.stringify(report.checks.reflow320.map(r => [r.route, r.docOverflow])));
  console.log('spacing', JSON.stringify(report.checks.textSpacing.map(r => [r.route, r.docOverflow, r.clipped.length])));

  // 4. Motion (2.2.2 / 2.3.3): globe pixels over 6 s with and without reduced motion; pause control.
  report.checks.motion = [];
  for (const reducedMotion of ['reduce', 'no-preference']) {
    const p = await page0(1440, { reducedMotion }); await openExplore(p); await p.waitForTimeout(2500);
    const grab = async () => (await p.locator('.explore-map canvas').first().screenshot()).toString('base64');
    const diff = async (a, b) => p.evaluate(async ([a, b]) => { const load = async s => { const i = new Image(); i.src = 'data:image/png;base64,' + s; await i.decode(); const c = document.createElement('canvas'); c.width = i.width; c.height = i.height; const x = c.getContext('2d'); x.drawImage(i, 0, 0); return x.getImageData(0, 0, c.width, c.height).data; }; const A = await load(a), B = await load(b); let n = 0; for (let i = 0; i < A.length; i += 4) if (Math.abs(A[i] - B[i]) + Math.abs(A[i + 1] - B[i + 1]) + Math.abs(A[i + 2] - B[i + 2]) > 30) n++; return Math.round(n / (A.length / 4) * 1000) / 10; }, [a, b]);
    const a = await grab(); await p.waitForTimeout(6000); const b = await grab();
    const entry = { reducedMotion, changedPixelPct6s: await diff(a, b) };
    const pause = p.getByRole('button', { name: /Stop globe rotation|Detener|Pause/i }).first();
    entry.pauseControl = await pause.count() ? await pause.getAttribute('aria-label') : null;
    if (reducedMotion === 'no-preference' && entry.pauseControl) { await pause.click(); await p.waitForTimeout(2500); const c = await grab(); await p.waitForTimeout(6000); entry.changedPixelPctAfterPause6s = await diff(c, await grab()); }
    report.checks.motion.push(entry); console.log('motion', JSON.stringify(entry));
    await p.close();
  }

  // 5. Map text alternative / equivalents, landmarks, h1, html lang switching, form errors.
  {
    const p = await page0(1440); await openExplore(p);
    report.checks.mapAlternative = await p.evaluate(() => { const c = document.querySelector('.explore-map canvas'); const region = c?.closest('[aria-label],[role]'); return { canvasRole: c?.getAttribute('role'), canvasLabel: c?.getAttribute('aria-label'), canvasTabindex: c?.getAttribute('tabindex'), containerLabel: region?.getAttribute('aria-label') ?? null, zipForm: !!document.querySelector('.explore-zip-form input'), notes: document.querySelector('.explore-map-notes')?.textContent?.slice(0, 120) ?? null }; });
    const langs = [await p.evaluate(() => document.documentElement.lang)];
    for (let i = 0; i < 3; i++) { await p.locator('.explore-rail-bottom button').first().click(); await p.waitForTimeout(400); langs.push(await p.evaluate(() => document.documentElement.lang)); }
    report.checks.exploreLangCycle = langs;
    await p.close();
    const q = await page0(1440); await openExplore(q);
    const input = q.locator('.explore-zip-form input').first(); await input.fill('123'); await input.press('Enter'); await q.waitForTimeout(1500);
    report.checks.formError = await q.evaluate(() => { const i = document.querySelector('.explore-zip-form input'); const desc = i.getAttribute('aria-describedby'); return { ariaInvalid: i.getAttribute('aria-invalid'), describedBy: desc, describedText: desc ? desc.split(' ').map(id => document.getElementById(id)?.textContent).join(' ').slice(0, 120) : null, statusText: [...document.querySelectorAll('[role=status],[role=alert],[aria-live]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 3), validity: i.validationMessage || null, required: i.required, pattern: i.getAttribute('pattern') }; });
    await q.close();
    console.log('map', JSON.stringify(report.checks.mapAlternative), 'langs', langs.join('>'), 'formError', JSON.stringify(report.checks.formError));
  }
} finally {
  await browser.close();
  await mkdir(output.replace(/[/\\][^/\\]+$/, ''), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 1) + '\n');
}
