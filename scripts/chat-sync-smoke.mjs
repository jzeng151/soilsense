// Built-app smoke with explicit API fixtures; no model, credentials or remote services.
// Run: npm run build && node scripts/chat-sync-smoke.mjs (owns port 8832 only).
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';
import { chromium } from 'playwright';

const plan = { generatedAt: '2026-11-15T00:00:00Z', explanation: { summary: 'Browser fixture plan' }, facts: [{ text: 'Browser fixture soil fact', source: 'Fixture' }], assumptions: ['Rain-fed fixture'], plans: [{ years: [{ year: 2027, crop: 'oats', cropName: 'Oats' }] }] };
let requests = [];
let live;
const event = (res, e) => res.write(`data: ${JSON.stringify(e)}\n\n`);
function finish(text) {
  assert(live, 'a live response exists');
  event(live, { type: 'text-delta', id: 't', delta: text });
  event(live, { type: 'text-end', id: 't' }); event(live, { type: 'finish' });
  live.end('data: [DONE]\n\n'); live = null;
}
const server = createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  const json = (body, status = 200) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(body)); };
  if (url.pathname === '/api/scout/chat') {
    let body = ''; for await (const chunk of req) body += chunk;
    requests.push(JSON.parse(body)); live = res;
    res.writeHead(200, { 'content-type': 'text/event-stream', 'x-vercel-ai-ui-message-stream': 'v1', 'cache-control': 'no-cache' });
    event(res, { type: 'start', messageId: `answer-${requests.length}` }); event(res, { type: 'text-start', id: 't' }); event(res, { type: 'text-delta', id: 't', delta: 'Smoke partial' }); return;
  }
  if (url.pathname === '/api/auth/me') return json({ user: null });
  if (url.pathname === '/api/scout/status') return json({ configured: true, model: 'fixture', research: 'available' });
  if (url.pathname === '/api/ui/status') return json({ exploreLanding: true });
  if (url.pathname === '/api/plan') return json(plan);
  if (url.pathname === '/api/fields') return json({ fields: [] });
  if (url.pathname.startsWith('/api/')) return json({ error: 'Smoke fixture: unsupported endpoint' }, 404);
  try {
    const path = resolve('dist/web', '.' + (url.pathname === '/' ? '/index.html' : url.pathname));
    if (!path.startsWith(resolve('dist/web'))) return json({}, 403);
    const data = await readFile(path);
    res.writeHead(200, { 'content-type': ({ '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml' })[extname(path)] ?? 'application/octet-stream' }); res.end(data);
  } catch { res.writeHead(404); res.end(); }
});
await new Promise((ok, fail) => { server.once('error', fail); server.listen(8832, '127.0.0.1', ok); });
let browser;
try {
  browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  // Avoid network-dependent map tiles. The actual Explore + assistant + Shell are built code.
  await page.route(/https?:\/\/(?!127\.0\.0\.1)/, route => route.abort());
  const explore = '#/explore?lat=42.03&lon=-93.62&label=Ames';
  await page.goto(`http://127.0.0.1:8832/${explore}`);
  await page.getByRole('button', { name: 'Why is this rotation recommended?' }).click();
  await page.locator('.fa-thread').getByText('Smoke partial', { exact: true }).waitFor();
  await page.getByLabel('Assistant options').click();
  const styleMatch = await page.locator('.fa-menu').evaluate(el => {
    const keys = ['padding', 'border', 'backgroundColor', 'borderRadius', 'minHeight'];
    const a = getComputedStyle(el.querySelector('a')), b = getComputedStyle(el.querySelector('button'));
    return keys.every(k => a[k] === b[k]);
  }); assert(styleMatch, 'Open full chat matches Clear chat style');
  await page.getByRole('link', { name: 'Open full chat' }).click();
  await page.locator('.sc-thread').getByText('Smoke partial', { exact: true }).waitFor();
  assert.equal(requests.length, 1, 'navigation sends no second LLM request');
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  await page.evaluate(hash => { location.hash = hash; }, explore);
  await page.locator('.fa-thread').getByText('Smoke partial', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Stop', exact: true }).waitFor();
  finish(' completed in full chat');
  await page.locator('.fa-thread').getByText('Smoke partial completed in full chat', { exact: true }).waitFor();
  assert.equal(requests.length, 1, 'return to Explore sends no model request');
  await page.getByLabel('Assistant options').click(); await page.getByRole('link', { name: 'Open full chat' }).click();
  assert.equal(await page.locator('.sb-chats li').count(), 1, 'one Recent chat');
  await page.getByLabel('Message Sprout').fill('Follow-up from full chat');
  await Promise.all([page.waitForResponse(r => r.url().endsWith('/api/scout/chat')), page.getByRole('button', { name: 'Send', exact: true }).click()]);
  assert.equal(requests.length, 2);
  assert.match(JSON.stringify(requests[1].messages.at(-1)), /Browser fixture soil fact/, 'full page retains the current field plan');
  finish(' follow-up');
  await page.locator('.sc-thread').getByText('Smoke partial follow-up', { exact: true }).waitFor();
  await page.reload();
  await page.locator('.sc-thread').getByText('Smoke partial follow-up', { exact: true }).waitFor();
  assert.equal(requests.length, 2, 'reload restores history without replay');
  await page.getByRole('button', { name: 'New chat', exact: true }).click();
  await page.getByRole('heading', { name: "Hi, I'm Sprout. What's growing on your field?" }).waitFor();
  assert.equal(await page.locator('.sb-chats li').count(), 1, 'New retains Recent history');
  await page.locator('.sb-chats li button').first().click();
  await page.locator('.sc-thread').getByText('Smoke partial follow-up', { exact: true }).waitFor();
  await page.getByRole('button', { name: /^Delete chat/ }).click();
  assert.equal(await page.locator('.sb-chats li').count(), 0, 'Delete removes Recent chat');
  await page.reload(); await page.getByRole('heading', { name: "Hi, I'm Sprout. What's growing on your field?" }).waitFor();
  assert.equal(await page.locator('.sb-chats li').count(), 0, 'Delete persists on reload');
  await page.evaluate(hash => { location.hash = hash; }, explore);
  await page.getByRole('button', { name: 'Why is this rotation recommended?' }).click();
  await page.locator('.fa-thread').getByText('Smoke partial', { exact: true }).waitFor();
  await page.getByLabel('Assistant options').click(); await page.getByRole('button', { name: 'Clear chat', exact: true }).click();
  await page.waitForFunction(() => !document.querySelector('.fa-thread')?.textContent.trim());
  // Finishing a cancelled server response must not resurrect the deleted client conversation.
  finish(' must never reappear');
  await page.reload();
  await page.getByRole('button', { name: 'Why is this rotation recommended?' }).waitFor();
  assert.equal(await page.locator('.fa-turn').count(), 0, 'Clear during stream persists on reload');
  assert.equal(requests.length, 3, 'three explicit sends, no navigation/reload requests');
  await page.getByLabel('Assistant options').click(); await page.getByRole('link', { name: 'Open full chat' }).click();
  assert.equal(await page.locator('.sb-chats li').count(), 0, 'Clear removes Recent history too');
  assert.deepEqual(errors, [], 'no uncaught browser errors');
  console.log(JSON.stringify({ result: 'PASS', chatRequests: requests.length, checks: ['live Explore → Scout handoff exactly once', 'return to Explore during stream', 'full-page field plan context', 'reload without replay', 'Recent chats', 'new/open/delete', 'clear during stream without resurrection', 'matching menu styles', 'no page errors'], persistence: 'browser localStorage only; fixture server does not save transcripts' }, null, 2));
} finally { await browser?.close(); if (live) live.end(); await new Promise(resolve => server.close(resolve)); }
