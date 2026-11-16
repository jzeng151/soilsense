// Built-UI regression: run against a local wrangler dev serving `npm run build`.
// node scripts/verify-location-dialog.mjs http://localhost:8830
import { chromium } from "playwright";
import assert from "node:assert/strict";
import { mkdir } from "node:fs/promises";
const base = process.argv[2] ?? "http://localhost:8830";
const output = "test-results/location-dialog";
await mkdir(output, { recursive: true });
const browser = await chromium.launch({ args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] });
try {
  for (const width of [1440, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 900 } });
    const errors = []; page.on("pageerror", e => errors.push(String(e)));
    await page.goto(`${base}/#/explore?lat=38.1095&lon=-100.706&label=Finney`, { waitUntil: "load" });
    await page.locator('.workspace-tabs').waitFor();
    await page.getByRole("button", { name: "Sprout", exact: true }).click();
    const chip = page.locator(".explore-location-chip");
    await chip.click();
    const dialog = page.getByRole("dialog", { name: "Change location", exact: true });
    await dialog.waitFor();
    assert(await dialog.evaluate(el => el.matches(":modal")), "Must use the browser modal top layer");
    const box = await dialog.boundingBox();
    assert(Math.abs(box.x + box.width / 2 - width / 2) < 2, "Horizontally centred");
    assert(Math.abs(box.y + box.height / 2 - 450) < 2, "Vertically centred");
    const zip = dialog.getByRole("textbox");
    assert(await zip.evaluate(el => el === document.activeElement), "ZIP receives focus");
    await zip.fill("50010");
    assert.equal(await zip.inputValue(), "50010");
    assert(await zip.evaluate(el => { const b = el.getBoundingClientRect(); return document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2) === el; }), "Input not covered by chat or sidebar");
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab");
      assert(await dialog.evaluate(el => el.contains(document.activeElement)), "Focus remains inside modal");
    }
    await page.screenshot({ path: `${output}/change-location-${width}.png` });
    await page.keyboard.press("Escape");
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert(await chip.evaluate(el => el === document.activeElement), "Escape returns focus to chip");
    assert(await page.locator('.workspace-chat').isVisible(), "Sprout stays open after cancel");
    await chip.click();
    await page.getByRole("dialog").getByRole("button", { name: "Cancel", exact: true }).click();
    assert.equal(await page.getByRole("dialog").count(), 0);
    await chip.click();
    await page.getByRole("dialog").getByRole("textbox").fill("50010");
    const lookedUp = page.waitForResponse(r => r.url().includes('/api/explore/zip/50010'), { timeout: 30000 });
    await page.getByRole("dialog").getByRole("textbox").press("Enter");
    const lookupResponse = await lookedUp;
    assert(lookupResponse.ok(), `ZIP lookup HTTP ${lookupResponse.status()}`);
    await page.waitForFunction(() => document.querySelector('.explore-location-chip')?.textContent?.includes("50010"), undefined, { timeout: 60000 });
    assert.equal(await page.getByRole("dialog").count(), 0);
    assert.equal(errors.length, 0, errors.join("\n"));
    console.log(`${width}px: centred, top-layer, editable, keyboard-contained; Escape/Cancel restore focus; actual ZIP submission succeeded`);
    await page.close();
  }
} finally { await browser.close(); }
