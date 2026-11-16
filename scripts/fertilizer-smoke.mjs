// Built Worker smoke, real API responses only. No admin token, mocked responses or deployment.
// node scripts/fertilizer-smoke.mjs http://127.0.0.1:8811 <profile-scratch-output-dir>
import { chromium } from "playwright";
import fs from "node:fs/promises";
import path from "node:path";
import assert from "node:assert/strict";
const base = process.argv[2];
const out = process.argv[3];
assert.ok(base && out, "Supply local base URL and scratch output directory");
const url = new URL(base);
assert.ok(["127.0.0.1", "localhost"].includes(url.hostname), "Loopback only");
assert.equal(url.port, "8811", "Assigned fertilizer-rates port only");
await fs.mkdir(out, { recursive: true });
const req = { lat: 38.1095, lon: -100.706, irrigated: true, priority: "balanced" };
const post = async body => {
  const r = await fetch(`${base}/api/plan`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  assert.equal(r.status, 200); return r.text();
};
const ordinary = await post(req);
const enriched = JSON.parse(await post({ ...req, includeFertilizer: true }));
const stripped = { ...enriched, plans: enriched.plans.map(({ fertilizer, ...p }) => p), currentPractice: enriched.currentPractice ? (({ fertilizer, ...p }) => p)(enriched.currentPractice) : null };
assert.equal(JSON.stringify(stripped), ordinary, "HTTP baseline differs beyond added fertilizer fields");
await fs.writeFile(path.join(out, "live-enriched-plan.json"), JSON.stringify(enriched, null, 2));
const browser = await chromium.launch({ headless: true });
const report = { node: process.version, browser: browser.version(), httpByteEqualityAfterRemovingFertilizer: true, cases: [] };
try {
  for (const language of ["en", "es"]) for (const width of [375, 1280]) {
    const context = await browser.newContext({ viewport: { width, height: 900 } });
    const page = await context.newPage();
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    await page.goto(base, { waitUntil: "domcontentloaded" });
    if (language === "es") await page.getByRole("button", { name: "ES Español", exact: true }).click();
    await page.getByRole("button", { name: "Kansas", exact: true }).click();
    await page.getByRole("button", { name: language === "es" ? "Sí, esta es mi parcela →" : "Yes, this is my field →", exact: true }).click();
    const postRequest = page.waitForRequest(r => r.url().endsWith("/api/plan") && r.method() === "POST", { timeout: 30000 });
    await page.getByRole("button", { name: language === "es" ? "Ver mi plan →" : "Show my plan →", exact: true }).click();
    assert.equal((await postRequest).postDataJSON().includeFertilizer, true);
    const guide = page.locator(".fertilizer-guide").first();
    await guide.waitFor({ timeout: 120000 });
    await guide.locator(":scope > summary").click();
    await guide.locator("table tbody tr").first().waitFor();
    await guide.scrollIntoViewIfNeeded();
    await guide.screenshot({ path: path.join(out, `guide-${language}-${width}.png`) });
    const overflow = await page.evaluate(() => ({ client: document.documentElement.clientWidth, scroll: document.documentElement.scrollWidth }));
    assert.ok(overflow.scroll <= overflow.client + 1, JSON.stringify(overflow));
    const region = guide.locator('[role="region"]');
    await region.focus();
    const scrollBefore = await region.evaluate(el => el.scrollLeft);
    await page.keyboard.press("ArrowRight"); await page.waitForTimeout(200);
    const scrollAfter = await region.evaluate(el => el.scrollLeft);
    if (width === 375) assert.ok(scrollAfter > scrollBefore, "Table does not keyboard-scroll");
    await guide.locator("details summary").click();
    await page.addScriptTag({ path: "node_modules/axe-core/axe.min.js" });
    await guide.evaluate(el => { el.id = "fertilizer-audit"; });
    const axe = await page.evaluate(async () => window.axe.run("#fertilizer-audit", { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    await fs.writeFile(path.join(out, `axe-${language}-${width}.json`), JSON.stringify(axe, null, 2));
    assert.deepEqual(axe.violations, [], "Selected WCAG axe violations");
    assert.deepEqual(errors, [], "Browser page errors");
    report.cases.push({ language, width, pageLanguage: await page.locator("html").getAttribute("lang"), visibleGuides: await page.locator(".fertilizer-guide:visible").count(), rows: await guide.locator("tbody tr").count(), overflow, keyboardScroll: { before: scrollBefore, after: scrollAfter }, axeVersion: axe.testEngine.version, violations: axe.violations.map(v => v.id), incomplete: axe.incomplete.map(v => ({ id: v.id, nodes: v.nodes.length })), errors });
    await context.close();
  }
} finally {
  await fs.writeFile(path.join(out, "report.json"), JSON.stringify(report, null, 2));
  await browser.close();
}
console.log(JSON.stringify(report, null, 2));
