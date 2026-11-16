import { chromium } from 'playwright';
import axe from 'axe-core';
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const base = process.env.A11Y_BASE_URL ?? 'http://127.0.0.1:8786';
const output = process.env.A11Y_OUTPUT;
assert(output, 'Set A11Y_OUTPUT to a scratch report path');
const browser = await chromium.launch();
const report = { revision: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), timestamp: new Date().toISOString(), base, axe: axe.version, browser: browser.version(), tags: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'], scans: [] };
try {
  for (const width of [1440, 375, 320]) {
    for (const language of ['en', 'es']) {
      const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: 'reduce' });
      const page = await context.newPage();
      await page.addInitScript(lang => localStorage.setItem('soilsense.language', lang), language);
      await page.goto(`${base}/#/how-it-works`);
      await page.getByRole('heading', { level: 1, name: language === 'en' ? 'How it works' : 'Cómo funciona', exact: true }).waitFor();
      await page.evaluate(() => document.fonts.ready);
      await page.locator('main details summary').click();
      await page.addScriptTag({ content: axe.source });
      const result = await page.evaluate(tags => window.axe.run(document, { runOnly: { type: 'tag', values: tags } }), report.tags);
      const inventory = await page.evaluate(() => ({
        headings: [...document.querySelectorAll('main h1,main h2,main h3')].map(node => node.textContent),
        rowCounts: [...document.querySelectorAll('main tbody')].map(body => body.rows.length),
        svgCount: document.querySelectorAll('main svg[role="img"]').length,
        horizontalOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
        linksValid: [...document.querySelectorAll('main a')].every(a => new URL(a.href).protocol === 'https:'),
        externalImages: [...document.images].filter(img => /^https?:/.test(img.getAttribute('src') ?? '')).length,
        lang: document.documentElement.lang,
        clippedSvgLabels: [...document.querySelectorAll('main svg text')].filter(t => t.getBBox().width > 286).map(t => t.textContent),
      }));
      const svgContrast = await page.evaluate(() => {
        const luminance = color => {
          const rgb = color.match(/[\d.]+/g)?.slice(0, 3).map(Number);
          if (!rgb || rgb.length !== 3 || !color.startsWith('rgb(')) throw new Error(`Unexpected opaque SVG color: ${color}`);
          const linear = rgb.map(channel => { const s = channel / 255; return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
          return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
        };
        return [...document.querySelectorAll('main svg text')].map(text => {
          const foreground = getComputedStyle(text).fill;
          const background = getComputedStyle(text.parentElement.querySelector('rect')).fill;
          const a = luminance(foreground), b = luminance(background);
          return { label: text.textContent, foreground, background, ratio: (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05) };
        });
      });
      report.scans.push({ width, language, url: page.url(), inventory, svgContrast, ...result });
      if (process.env.A11Y_SCREENSHOTS) {
        await mkdir(process.env.A11Y_SCREENSHOTS, { recursive: true });
        await page.screenshot({ path: resolve(process.env.A11Y_SCREENSHOTS, `how-it-works-${width}-${language}.png`), fullPage: true });
      }
      // Exercise language switching and keyboard activation, not just localStorage startup.
      await page.getByRole('button', { name: language === 'en' ? 'Español' : 'English', exact: true }).focus();
      await page.keyboard.press('Enter');
      await page.getByRole('heading', { level: 1, name: language === 'en' ? 'Cómo funciona' : 'How it works', exact: true }).waitFor();
      // Every width uses the same always-present navigation rail (no phone drawer): its link marks this page as current.
      const railLink = page.locator('nav.explore-rail').getByRole('link', { name: language === 'en' ? 'Cómo funciona' : 'How it works', exact: true });
      assert.equal(await railLink.getAttribute('aria-current'), 'page', 'Rail marks How it works as the current page');
      console.log(`${width} ${language}: ${result.violations.length} violations, ${result.incomplete.length} incomplete; ${JSON.stringify(inventory)}`);
      await context.close();
    }
  }
} finally {
  await browser.close();
  await mkdir(resolve(output, '..'), { recursive: true });
  await writeFile(output, JSON.stringify(report, null, 2));
}
assert.equal(report.scans.length, 6);
assert(report.scans.every(scan => !scan.violations.length && !scan.inventory.horizontalOverflow && scan.inventory.linksValid && !scan.inventory.externalImages && !scan.inventory.clippedSvgLabels.length && scan.svgContrast.every(pair => pair.ratio >= 4.5)));
