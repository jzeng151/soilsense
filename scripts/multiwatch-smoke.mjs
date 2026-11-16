// Local-only, real Worker + built UI smoke. Geometry is a constructed test fixture, NOT a sourced CSB record.
import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { chromium } from "playwright";
const base = process.env.BASE_URL ?? "http://127.0.0.1:8803";
assert.equal(new URL(base).port, "8803");
assert.ok(["localhost", "127.0.0.1"].includes(new URL(base).hostname), "This mutation smoke is local-only");
const out = process.env.MULTIWATCH_ARTIFACTS;
assert.ok(out, "Set MULTIWATCH_ARTIFACTS to a scratch directory");
await mkdir(out, { recursive: true });
const sleep = ms => new Promise(r => setTimeout(r, ms));
const ids = [];
const results = { fixture: "constructed polygons; not sourced USDA data", scans: [], statuses: [], keyboard: [], assertions: [] };
async function request(path, method = "GET", body) {
  const r = await fetch(base + path, { method, headers: body ? { "content-type": "application/json" } : {}, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20_000) });
  const data = await r.json();
  assert.ok(r.ok, `${method} ${path.replace(/u_[A-Za-z0-9_-]+/g, "<capability>")}: ${r.status}: ${data.error}`);
  return data;
}
const browser = await chromium.launch({ headless: true });
try {
  assert.equal((await request("/api/fields/status")).enabled, true);
  const saved = [];
  for (let n = 0; n < 2; n++) {
    const x = -100.71 + n * .012;
    const field = { id: `csb:constructed-smoke-${n}`, source: "usda-csb", name: `Test field ${n + 1}`, polygon: [[[x,38.10],[x+.01,38.10],[x+.01,38.11],[x,38.11],[x,38.10]]], centroid: { lat: 38.105, lon: x + .005 }, areaAcres: 200, provenance: { product: "constructed smoke fixture", version: "test", url: "https://example.invalid/test", retrieved: "2026-11-15" } };
    const registered = await request("/api/fields/register", "POST", { field, watchedCrop: n ? "soybean" : "corn" });
    assert.match(registered.agentFieldId, /^u_[A-Za-z0-9_-]{32}$/);
    ids.push(registered.agentFieldId);
    assert.equal(registered.capability, registered.agentFieldId);
    const settings = (await request(`/api/fieldwatch/agent/${registered.agentFieldId}/watch`)).settings;
    assert.equal(settings.enabled, false);
    assert.equal(settings.crop, n ? "soybean" : "corn");
    saved.push({ agentFieldId: registered.agentFieldId, name: field.name, fieldId: field.id, acres: field.areaAcres });
  }
  const waiting = [];
  for (const id of ids) waiting.push((await request(`/api/fieldwatch/agent/${id}/check`, "POST", { mode: "live" })).run);
  assert.notEqual(waiting[0].runId, waiting[1].runId);
  const forged = await fetch(`${base}/api/fieldwatch/agent/u_${"x".repeat(32)}/runs`);
  assert.equal(forged.status, 404);
  results.assertions.push("two independent registrations, crops, pending histories; forged id rejected");
  const axe = await readFile(new URL("../node_modules/axe-core/axe.min.js", import.meta.url), "utf8");
  for (const language of ["en", "es"]) {
    const context = await browser.newContext({ viewport: { width: 375, height: 900 } });
    await context.addInitScript(({ saved, language }) => { localStorage.setItem("soilsense.myfields.v1", JSON.stringify(saved)); localStorage.setItem("soilsense.language", language); }, { saved, language });
    const page = await context.newPage();
    await page.goto(base, { waitUntil: "networkidle" });
    const panel = page.locator(".my-fields");
    await panel.waitFor();
    await panel.getByRole("heading", { name: language === "es" ? "Mis parcelas" : "My fields", exact: true }).waitFor();
    await panel.getByRole("button", { name: language === "es" ? "Activar vigilancia semanal" : "Enable weekly watch", exact: true }).first().waitFor();
    await page.addScriptTag({ content: axe });
    const audit = await page.evaluate(async () => await axe.run(document.querySelector(".my-fields"), { runOnly: { type: "tag", values: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"] } }));
    await writeFile(`${out}/axe-${language}-375.json`, JSON.stringify(audit, null, 2));
    const dimensions = await panel.evaluate(el => ({ width: el.getBoundingClientRect().width, scroll: el.scrollWidth, client: el.clientWidth }));
    assert.ok(dimensions.scroll <= dimensions.client, "Panel overflows at 375px");
    results.scans.push({ language, width: 375, violations: audit.violations.length, incomplete: audit.incomplete.length, dimensions });
    // Real Tab/Space checks on native controls, not synthetic click events.
    const schedule = panel.getByRole("button", { name: language === "es" ? "Programar revisión de la parcela" : "Schedule field check", exact: true }).first();
    await schedule.focus(); await page.keyboard.press("Tab");
    const focused = await page.evaluate(() => document.activeElement.textContent);
    assert.equal(focused, language === "es" ? "Activar vigilancia semanal" : "Enable weekly watch");
    results.keyboard.push({ language, scheduleToWeekly: true });
    if (language === "en") {
      await page.keyboard.press("Space");
      await panel.getByRole("button", { name: "Disable weekly watch", exact: true }).waitFor();
      const watch = await request(`/api/fieldwatch/agent/${ids[0]}/watch`);
      assert.equal(watch.settings.enabled, true); assert.equal(watch.scheduledJobs, 2);
      await sleep(13_000); // respect best-effort local fallback token refill
      await panel.getByRole("button", { name: "Disable weekly watch", exact: true }).click();
      await panel.getByRole("button", { name: "Enable weekly watch", exact: true }).first().waitFor();
      assert.equal((await request(`/api/fieldwatch/agent/${ids[0]}/watch`)).scheduledJobs, 0);
    }
    await panel.screenshot({ path: `${out}/panel-${language}-375.png` });
    await context.close();
  }
  const deadline = Date.now() + 180_000;
  let histories;
  do {
    histories = await Promise.all(ids.map(id => request(`/api/fieldwatch/agent/${id}/runs`)));
    if (histories.every(h => h.runs[0]?.status !== "pending")) break;
    await sleep(5000);
  } while (Date.now() < deadline);
  for (let i = 0; i < ids.length; i++) {
    assert.equal(histories[i].runs.length, 1);
    assert.equal(histories[i].runs[0].fieldId, ids[i]);
    assert.equal(histories[i].runs[0].runId, waiting[i].runId);
    assert.notEqual(histories[i].runs[0].status, "pending", "Scheduled callback did not finish in time");
    results.statuses.push({ field: i + 1, status: histories[i].runs[0].status, completed: !!histories[i].runs[0].completedAt });
  }
  results.assertions.push("both scheduled callbacks completed; exact run ids and isolated histories read back", "weekly enable/disable read back; native keyboard actions; EN/ES 375px reflow");
} finally {
  await browser.close();
  for (const id of ids) {
    await sleep(13_000);
    await request(`/api/fields/${id}`, "DELETE");
    const r = await fetch(`${base}/api/fieldwatch/agent/${id}/runs`);
    assert.equal(r.status, 404);
  }
  results.assertions.push("all created agents deleted; subsequent reads 404");
  await writeFile(`${out}/summary.json`, JSON.stringify(results, null, 2));
  console.log(JSON.stringify(results, null, 2));
}
assert.ok(results.scans.every(s => s.violations === 0), "axe violations need remediation");
