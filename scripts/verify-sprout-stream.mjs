// LOCAL FIXTURE ONLY: serves the production bundle and an actual chunked SSE response.
// No credentials, live model, Worker, database, external writes or remote requests are used.
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const output = 'docs/verification/sprout-response-polish';
const root = resolve('dist/web');
const base = 'http://127.0.0.1:8831';
const events = [];
let active;
const send = part => { events.push(part); active.write(`data: ${JSON.stringify(part)}\n\n`); };
const firstText = '## Why this option\nSorghum $\\rightarrow$ Fallow $\\rightarrow$ Sorghum fits the water assumptions.\n- More accumulated warmth in the weather history [trend-gdd].\n';
const finalText = '1. Check the plan inputs with a local agronomist.\n## Limits\nStress is modeled, not an observed crop failure or a forecast. This evidence alone does not establish fewer bad years. [soil]\n\n[Original source](https://power.larc.nasa.gov/)';
const server = createServer(async (req, res) => {
  const path = new URL(req.url, base).pathname;
  if (path === '/api/scout/chat') {
    for await (const _ of req) { /* consume request */ }
    active = res;
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', 'x-vercel-ai-ui-message-stream': 'v1' });
    res.flushHeaders();
    send({ type: 'start', messageId: `fixture-${events.length}` });
    // Deliberately inject private reasoning to exercise client defense even though server filters it.
    send({ type: 'reasoning-start', id: 'r' });
    send({ type: 'reasoning-delta', id: 'r', delta: 'PRIVATE FIXTURE REASONING MUST NEVER APPEAR' });
    return;
  }
  if (path === '/fixture/answer') {
    send({ type: 'reasoning-end', id: 'r' });
    send({ type: 'data-plan-facts', data: [{ id: 'trend-gdd', text: 'LOCAL FIXTURE: accumulated warmth increased in the supplied history.', source: 'NASA POWER (fixture)' }] });
    send({ type: 'text-start', id: 'answer' });
    send({ type: 'text-delta', id: 'answer', delta: firstText });
    res.end('ok'); return;
  }
  if (path === '/fixture/finish') {
    send({ type: 'text-delta', id: 'answer', delta: finalText });
    send({ type: 'text-end', id: 'answer' });
    send({ type: 'data-answer-incomplete', data: true });
    send({ type: 'finish', finishReason: 'length' });
    active.end('data: [DONE]\n\n'); res.end('ok'); return;
  }
  if (path.startsWith('/api/')) {
    res.setHeader('Content-Type', 'application/json');
    res.end(JSON.stringify(path === '/api/auth/me' ? { user: { id: 'local-fixture', email: 'fixture@example.invalid', createdAt: 0 } } : path === '/api/scout/status' ? { configured: true, model: 'LOCAL STREAM FIXTURE', provider: 'fixture', research: 'configured' } : {}));
    return;
  }
  try {
    const file = resolve(root, `.${path === '/' ? '/index.html' : path}`);
    if (!file.startsWith(root)) { res.writeHead(403).end(); return; }
    const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2' };
    res.setHeader('Content-Type', types[extname(file)] ?? 'application/octet-stream');
    res.end(await readFile(file));
  } catch { res.writeHead(404).end(); }
});
await mkdir(output, { recursive: true });
await new Promise((ok, reject) => { server.once('error', reject); server.listen(8831, '127.0.0.1', ok); });
let browser;
const report = { mode: 'LOCAL FIXTURE — not live AI; real HTTP chunked SSE into production UI', base, runs: [] };
try {
  browser = await chromium.launch();
  for (const [language, width, thinking, unavailable, interrupted] of [
    ['en', 1280, 'Thinking…', 'Source unavailable (soil)', 'Answer stopped early. Ask Sprout to continue.'],
    ['es', 1280, 'Pensando…', 'Fuente no disponible (soil)', 'La respuesta se interrumpió. Pide a Sprout que continúe.'],
    ['ko', 1280, '생각 중…', '출처를 확인할 수 없음 (soil)', '답변이 중간에 멈췄습니다. Sprout에게 계속해 달라고 요청하세요.'],
    ['en', 390, 'Thinking…', 'Source unavailable (soil)', 'Answer stopped early. Ask Sprout to continue.'],
  ]) {
    const context = await browser.newContext({ viewport: { width, height: 950 }, reducedMotion: 'reduce' });
    await context.route('**/*', route => new URL(route.request().url()).origin === base ? route.continue() : route.abort());
    await context.addInitScript(lang => localStorage.setItem('soilsense.language', lang), language);
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(`${base}/#/scout`);
    await page.evaluate(() => { const badge = document.createElement('div'); badge.textContent = 'LOCAL STREAM FIXTURE — NO LIVE AI'; badge.style.cssText = 'position:fixed;top:0;left:0;background:#ffd34d;color:#111;z-index:99999;font:12px sans-serif;padding:4px'; document.body.append(badge); });
    await page.locator('textarea').fill('Why is this rotation recommended? (local fixture)');
    await page.locator('textarea').press('Enter');
    const bot = page.locator('.sc-bot').last();
    await bot.getByText(thinking, { exact: true }).waitFor();
    assert(!(await bot.innerText()).includes('PRIVATE FIXTURE'));
    assert.equal(await bot.locator('details').count(), 0);
    const pending = await bot.innerText();
    await page.screenshot({ path: `${output}/${language}-${width}-thinking.png` });
    await fetch(`${base}/fixture/answer`);
    await bot.getByText('Why this option', { exact: true }).waitFor();
    assert((await bot.innerText()).includes('Sorghum → Fallow → Sorghum'));
    assert(!(await bot.innerText()).includes('PRIVATE FIXTURE'));
    const partial = await bot.innerText();
    assert(!partial.includes('Limits'));
    await fetch(`${base}/fixture/finish`);
    await bot.getByText(interrupted, { exact: true }).waitFor();
    const final = await bot.innerText();
    assert(final.includes(unavailable));
    assert(!final.includes('\\rightarrow'));
    assert(!final.includes('[trend-gdd]'));
    assert(!final.includes('PRIVATE FIXTURE'));
    assert.equal(await bot.locator('ul').count(), 1);
    assert.equal(await bot.locator('ol').count(), 1);
    assert.equal(await bot.locator('a').last().getAttribute('href'), 'https://power.larc.nasa.gov/');
    assert.deepEqual(errors, []);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
    assert.equal(overflow, false, 'horizontal page overflow');
    await page.screenshot({ path: `${output}/${language}-${width}-answer.png` });
    report.runs.push({ language, width, pending, partial, final, errors, overflow, status: 'passed' });
    await context.close();
  }
  await writeFile(`${output}/stream-events.json`, JSON.stringify(events, null, 2));
  await writeFile(`${output}/browser.json`, JSON.stringify(report, null, 2));
  console.log(JSON.stringify(report, null, 2));
} finally { await browser?.close(); await new Promise(ok => server.close(ok)); }
