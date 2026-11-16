import { describe, expect, it } from "vitest";
import { dataStatus } from "../src/engine/dataEvidence";
import { planAdvice } from "../src/engine/pestNotes";
import type { RotationPlan } from "../src/shared/types";

const rotation = (crops: string[]) => ({ years: crops.map((crop) => ({ crop, cover: "none" })), scores: { total: 0.7 } }) as RotationPlan;
it("associates qualified rootworm notes with actual phases without mutating scores", () => {
  const p = rotation(["corn", "soybean", "corn"]);
  const before = JSON.stringify(p);
  const advice = planAdvice(p, "limited");
  expect(advice.includes_non_corn_year).toBe(true);
  expect(advice.pestNotes[0]?.pest).toBe("corn rootworm");
  expect(advice.pestNotes[0]?.conditions.join(" ")).toContain("volunteer corn");
  expect(advice.checks.join(" ")).toContain("10 inches");
  expect(JSON.stringify(p)).toBe(before);
  expect(planAdvice(rotation(["corn", "corn", "corn"]), "rain").includes_non_corn_year).toBe(false);
  expect(planAdvice(rotation(["soybean", "oats", "soybean"]), "rain").pestNotes).toEqual([]);
});

describe("data-status rules", () => {
  it("does not call unknown metadata complete or use retrieval time as observation time", () => {
    expect(dataStatus({ available: true, complete: null, historical: true, cached: false, observedThrough: null }, "2026-11-15")).toBe("incomplete");
    expect(dataStatus({ available: false, complete: false, historical: true, cached: true, observedThrough: "2022-12-31" }, "2026-11-15")).toBe("unavailable");
  });
  it("keeps historical cache distinct from stale current observations", () => {
    expect(dataStatus({ available: true, complete: true, historical: true, cached: true, observedThrough: "2022-12-31" }, "2026-11-15")).toBe("historical-cached");
    expect(dataStatus({ available: true, complete: true, historical: false, cached: true, observedThrough: "2022-12-31", maxAgeDays: 30 }, "2026-11-15")).toBe("stale");
    expect(dataStatus({ available: true, complete: true, historical: false, cached: false, observedThrough: "2026-11-14", maxAgeDays: 30 }, "2026-11-15")).toBe("available");
  });
});
