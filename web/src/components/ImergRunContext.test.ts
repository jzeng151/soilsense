import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { ImergRunContext } from "./ImergRunContext";
import { translate } from "../i18n";

describe("persisted IMERG context display", () => {
  it("keeps old runs quiet and qualifies independent totals, including true zero", () => {
    expect(renderToStaticMarkup(createElement(ImergRunContext, {}))).toBe("");
    const html = renderToStaticMarkup(createElement(ImergRunContext, { context: { state: "available", start: "2026-11-01", end: "2026-11-14", totalMm: 0, powerTotalMm: null, snapshotId: "iml-recorded", bundleUrl: "/api/refresh/imerg/snapshots/iml-recorded/bundle" } }));
    expect(html).toContain("IMERG UTC 0.00 mm · POWER LST unavailable mm");
    expect(html).toContain("different UTC/LST day boundaries");
    expect(html).toContain("rule v2 still uses POWER");
    expect(html).toContain('/api/refresh/imerg/snapshots/iml-recorded/bundle');
  });
  it.each(["stale", "unavailable"] as const)("labels %s without claiming a total", state => {
    const html = renderToStaticMarkup(createElement(ImergRunContext, { context: { state } }));
    expect(html).toContain("POWER-only check");
    expect(html).not.toContain("14-day totals");
  });
  it("provides Spanish context labels and boundary warning", () => {
    expect(translate("es", "IMERG rainfall context")).toBe("Contexto de lluvia IMERG");
    expect(translate("es", "14-day totals ({start} to {end}): IMERG UTC {imerg} mm · POWER LST {power} mm", { start: "2026-11-01", end: "2026-11-14", imerg: "0.00", power: "1.00" })).toContain("Totales de 14 días (2026-11-01 a 2026-11-14)");
  });
});
