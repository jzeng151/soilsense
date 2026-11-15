import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

// Copy guard: the older soil panel must not contradict the sourced, qualified pest notes.
it("does not publish universal pest-protection copy in the soil panel", () => {
  const html = readFileSync(new URL("../web/src/components/SoilBuild.tsx", import.meta.url), "utf8");
  expect(html).not.toContain("Breaks pest cycles");
  expect(html).not.toContain("break corn and soybean pest");
  expect(html).toContain("not universal pest or disease protection");
  expect(html).toContain("field history");
});
