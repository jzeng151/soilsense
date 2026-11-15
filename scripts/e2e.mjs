import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';

// Match the existing a11y scripts: reuse playwright's Chromium, no second runner dependency.
const base = new URL(process.env.E2E_BASE_URL ?? 'http://127.0.0.1:8785');
assert(['http:', 'https:'].includes(base.protocol), 'E2E_BASE_URL must be HTTP(S)');
assert(!base.username && !base.password, 'Do not put credentials in E2E_BASE_URL');
const output = process.env.E2E_OUTPUT ?? 'test-results/e2e';
const replayEnabled = process.env.E2E_REPLAY === '1';
const aiEnabled = process.env.E2E_AI === '1';
const browser = await chromium.launch();
const report = {
  timestamp: new Date().toISOString(),
  revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  base: base.href, browser: browser.version(), replayEnabled, aiEnabled, tests: [],
};
await mkdir(output, { recursive: true });

async function until(check, message, timeout = 30_000, interval = 250) {
  const deadline = Date.now() + timeout;
  do {
    if (await check()) return;
    await new Promise(resolve => setTimeout(resolve, Math.min(interval, Math.max(0, deadline - Date.now()))));
  } while (Date.now() < deadline);
  throw new Error(`Timed out: ${message}`);
}

async function smoke(name, run) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
  const page = await context.newPage();
  page.setDefaultTimeout(30_000);
  page.setDefaultNavigationTimeout(30_000);
  const result = { name, status: 'passed', consoleErrors: [], pageErrors: [], failedResponses: [], blockedWrites: [] };
  const started = Date.now();
  page.on('pageerror', error => result.pageErrors.push(error.message));
  page.on('console', message => { if (message.type() === 'error') result.consoleErrors.push(message.text()); });
  page.on('response', response => {
    if (response.status() >= 400) result.failedResponses.push({ url: response.url(), status: response.status() });
  });
  // Fail closed: no admin, uploads, recurring watches, live checks, account or other mutations.
  // Plan/explanation POSTs are normal demo reads/computation (the server may cache/audit them).
  await context.route('**/*', async route => {
    const request = route.request();
    if (['GET', 'HEAD', 'OPTIONS'].includes(request.method())) return route.continue();
    const url = new URL(request.url());
    const normalDemo = ['/api/plan', '/api/research/explain', '/api/wind-screen'].includes(url.pathname);
    const replay = replayEnabled && name === 'field-watch' && url.pathname === '/api/fieldwatch/agent/finney-ks/check'
      && request.postDataJSON()?.mode === 'replay';
    const chat = aiEnabled && name === 'sprout' && url.pathname === '/api/scout';
    if (url.origin === base.origin && request.method() === 'POST' && (normalDemo || replay || chat)) return route.continue();
    result.blockedWrites.push(`${request.method()} ${url.pathname}`);
    return route.abort('blockedbyclient');
  });
  try {
    const details = await run(page, result);
    if (details?.skip) { result.status = 'skipped'; result.reason = details.skip; }
    assert.deepEqual(result.pageErrors, [], 'Uncaught JavaScript errors');
    assert.deepEqual(result.blockedWrites, [], 'Unexpected mutating request blocked');
    // HTTP resource errors are retained separately: optional evidence may explicitly be unavailable.
    assert.deepEqual(result.consoleErrors.filter(text => !/^Failed to load resource:/.test(text)), [], 'Application console errors');
  } catch (error) {
    result.status = 'failed';
    result.error = error.stack ?? String(error);
    result.inventory = await page.locator('h1,h2,h3,section[aria-label]').evaluateAll(nodes => nodes.map(node => ({ tag: node.tagName, label: node.getAttribute('aria-label'), text: node.matches('section') ? undefined : node.textContent }))).catch(() => []);
    await page.screenshot({ path: `${output}/${name}.png`, fullPage: true }).catch(() => {});
  } finally {
    result.durationMs = Date.now() - started;
    report.tests.push(result);
    console.log(`${result.status.toUpperCase()} ${name} (${result.durationMs} ms)${result.reason ? ` — ${result.reason}` : ''}`);
    if (result.error) console.error(result.error);
    await context.close();
  }
}

const visit = page => page.goto(base.href);
async function json(page, path) {
  const response = await page.request.get(new URL(path, base).href, { timeout: 15_000 });
  assert(response.ok(), `${path}: HTTP ${response.status()}`);
  return response.json();
}

try {
  await smoke('landing-language', async page => {
    await visit(page);
    await page.locator('.map.leaflet-container').waitFor();
    assert.equal(await page.locator('html').getAttribute('lang'), 'en');
    await page.getByRole('button', { name: 'Español', exact: true }).click();
    await until(async () => await page.locator('html').getAttribute('lang') === 'es', 'Spanish html lang');
    await page.getByText('Hola, soy Sprout', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'English', exact: true }).click();
    await until(async () => await page.locator('html').getAttribute('lang') === 'en', 'English html lang');
    await page.getByText("Hi, I'm Sprout", { exact: true }).waitFor();
  });

  await smoke('kansas-plan', async (page, result) => {
    await visit(page);
    await page.getByRole('button', { name: 'Kansas', exact: true }).click();
    await page.getByRole('button', { name: 'Yes, this is my field' }).click({ timeout: 120_000 });
    await page.getByRole('button', { name: 'Show my plan' }).click();
    await page.locator('.jr-answer').waitFor({ timeout: 180_000 });
    assert((await page.locator('.jr-answer h1').innerText()).trim(), 'Plan headline is empty');
    await page.getByRole('heading', { name: 'Why we suggest this', exact: true }).waitFor();
    await page.getByRole('heading', { name: 'How this plan builds your soil', exact: true }).waitFor();
    await page.getByText('Compare with other options', { exact: true }).click();
    assert(await page.locator('.plan-list > li').count() >= 2, 'Expected rotation plan cards');
    const evidence = page.getByRole('region', { name: 'Evidence and limitations', exact: true });
    await evidence.waitFor();
    await evidence.getByText('Data status — sources, dates and completeness', { exact: true }).click();
    assert(await evidence.locator('tbody tr').count() > 0, 'Missing evidence source rows');
    for (const row of await evidence.locator('tbody tr').all()) {
      assert.match(await row.innerText(), /Status: (available|historical-cached|stale|incomplete|unavailable)/, 'Source must declare its state');
      assert.match(await row.locator('a').first().getAttribute('href'), /^https?:\/\//);
    }
    // Wait for real asynchronous cards; a forever-loading card is not an unavailable state.
    const labels = ['Historical vegetation evidence', 'SMAP regional moisture evidence', 'Regional GRACE and Kansas well observations'];
    result.evidence = [];
    for (const label of labels) {
      const card = page.getByRole('region', { name: label, exact: true });
      await card.waitFor();
      await until(async () => !/Loading /i.test(await card.innerText()), `${label} settles`, 120_000);
      result.evidence.push({ label, text: await card.innerText() });
    }
  });

  await smoke('field-watch', async (page, result) => {
    if (!replayEnabled) return { skip: 'Read-only default: set E2E_REPLAY=1 to schedule one finney-ks demo replay.' };
    const options = await json(page, '/api/fieldwatch/agent/options');
    if (options.available === false) return { skip: 'Target has no FIELD_AGENT binding (available=false).' };
    assert.equal(options.available, true, 'Missing Field Agent capability flag');
    const preset = options.replays.find(replay => replay.label.startsWith('Late June 2022'));
    assert(preset, 'Late June 2022 replay preset missing');
    await visit(page);
    const agent = page.locator('.fw-agent');
    await agent.getByRole('combobox', { name: /^Farm/ }).selectOption('finney-ks');
    const button = agent.getByRole('button', { name: /Replay Late June 2022/ });
    // A previous/concurrent invocation can have a pending run; let it settle, never cancel it.
    await button.waitFor();
    await until(() => button.isEnabled(), 'existing pending run settles', 70_000);
    const scheduled = page.waitForResponse(response => response.url().endsWith('/api/fieldwatch/agent/finney-ks/check') && response.request().method() === 'POST');
    const started = Date.now();
    await button.click();
    const response = await scheduled;
    assert(response.ok(), `Schedule failed: HTTP ${response.status()}`);
    const { run } = await response.json();
    assert.equal(run.mode, 'replay');
    assert.equal(run.replayId, preset.id);
    assert.equal(run.fieldId, 'finney-ks');
    let completed;
    await until(async () => {
      const body = await json(page, '/api/fieldwatch/agent/finney-ks/runs?limit=50');
      completed = body.runs.find(candidate => candidate.runId === run.runId);
      return completed && completed.status !== 'pending';
    }, 'the exact scheduled replay completes within 70 seconds', Math.max(1, 70_000 - (Date.now() - started)), 5_000);
    assert.equal(completed.status, 'dry');
    assert(completed.completedAt, 'Completed replay has no completion timestamp');
    result.run = completed;
    result.completionMs = Date.now() - started;
    assert(result.completionMs <= 70_000, 'Replay exceeded 70 seconds');
    // Read back the same run in the browser too, not an old Dry spell row.
    await page.reload();
    const row = agent.locator('.fw-row').filter({ has: page.locator('code', { hasText: run.runId }) });
    await row.locator('.fw-dry').waitFor();
    assert.match(await row.innerText(), /Historical replay/);
  });

  await smoke('sprout', async (page, result) => {
    if (!aiEnabled) return { skip: 'Read-only default: set E2E_AI=1 to send one AI question (may incur inference cost).' };
    const status = await json(page, '/api/scout/status');
    if (status.configured === false) return { skip: 'AI unavailable: /api/scout/status configured=false.' };
    assert.equal(status.configured, true, 'Missing AI capability flag');
    await page.goto(new URL('/#/scout', base).href);
    await page.getByRole('textbox', { name: 'Message Sprout' }).fill('In two sentences, how can crop rotation help soil in Finney County, Kansas? Cite reviewed research if available; do not build a plan.');
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await until(async () => await page.locator('.sc-bot .md').count() > 0 || await page.locator('.sc-err').count() > 0, 'Sprout reply', 120_000);
    await until(async () => await page.getByRole('button', { name: 'Send', exact: true }).count() > 0, 'Sprout stream finishes', 120_000);
    assert.equal(await page.locator('.sc-err').count(), 0, 'Sprout returned an error instead of an answer');
    const reply = page.locator('.sc-bot').last();
    const answer = (await reply.locator(':scope > .md').allTextContents()).join('\n');
    assert(answer.trim(), 'Empty assistant reply');
    result.answer = answer;
    const citations = [...new Set(answer.match(/\[R\d+\]/g) ?? [])];
    result.citations = citations;
    for (const citation of citations) {
      const source = reply.locator('.sc-research-quote').filter({ hasText: citation });
      assert.equal(await source.count(), 1, `${citation} must map to exactly one source`);
      assert.match(await source.locator('a').getAttribute('href'), /^https?:\/\//);
      assert((await source.locator('blockquote').textContent()).trim(), `${citation} has no verbatim passage`);
    }
  });

  await smoke('admin-token-gate', async page => {
    const adminRequests = [];
    page.on('request', request => { if (new URL(request.url()).pathname.startsWith('/api/docs')) adminRequests.push(request.url()); });
    await page.goto(new URL('/#/admin/docs', base).href);
    await page.getByRole('heading', { name: 'Document review', exact: true }).waitFor();
    const token = page.getByLabel('Admin token', { exact: true });
    assert.equal(await token.inputValue(), '');
    assert.equal(await token.getAttribute('type'), 'password');
    assert(await page.getByRole('button', { name: 'Refresh documents', exact: true }).isDisabled());
    assert(await page.getByRole('button', { name: 'Upload document', exact: true }).isDisabled());
    assert.deepEqual(adminRequests, [], 'Token gate must not call admin APIs');
  });
} finally {
  await browser.close();
  report.counts = Object.fromEntries(['passed', 'failed', 'skipped'].map(status => [status, report.tests.filter(test => test.status === status).length]));
  await writeFile(`${output}/report.json`, `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report.counts));
  console.log(`Report: ${output}/report.json`);
}
if (report.tests.length !== 5 || report.counts.failed) process.exitCode = 1;
