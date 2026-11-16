// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it } from "vitest";
import { Markdown } from "./Markdown";

it("renders rotation arrows without LaTex but preserves code and dollar amounts", () => {
  const html = renderToStaticMarkup(createElement(Markdown, { text: 'Sorghum $\\rightarrow$ Fallow $\\rightarrow$ Sorghum; $25/acre.\n\n`$\\rightarrow$`' }));
  expect(html).toContain('Sorghum → Fallow → Sorghum; $25/acre.');
  expect(html).toContain('<code>$\\rightarrow$</code>');
});
it("resolves known citations, explicitly labels unknown fact IDs, and preserves links", () => {
  const html = renderToStaticMarkup(createElement(Markdown, { text: 'Warmth **[trend-gdd]**. Unknown [soil]. Research [R1]. [Source](https://example.org) [optional]', references: { 'trend-gdd': { label: 'NASA POWER', href: 'https://power.larc.nasa.gov/' }, R1: { label: 'Reviewed trial', href: 'https://example.org/trial' } } }));
  expect(html).toContain('href="https://power.larc.nasa.gov/"');
  expect(html).toContain('Source unavailable (soil)');
  expect(html).not.toContain('[trend-gdd]');
  expect(html).toContain('Reviewed trial');
  expect(html).toContain('>Source</a>');
  expect(html).toContain('[optional]');
});
it("separates adjacent headings and mixed list types without blank lines", () => {
  const html = renderToStaticMarkup(createElement(Markdown, { text: 'Summary\n## Why\n- Water\n1. Check inputs\n## Limits\nModel, not forecast.' }));
  expect(html).toContain('<p>Summary</p><h4>Why</h4><ul>');
  expect(html).toContain('</ul><ol>');
  expect(html).toContain('</ol><h4>Limits</h4>');
});
