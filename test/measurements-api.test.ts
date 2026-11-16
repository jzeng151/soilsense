import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { validatePlanRequest } from "../src/worker/routes/api";

beforeEach(() => { vi.useFakeTimers(); vi.setSystemTime(new Date("2026-11-15T15:00:00Z")); });
afterEach(() => vi.useRealTimers());
const base = { lat: 38.1095, lon: -100.706, priority: "balanced" };
const record = { crop: "corn", year: 2025, value: 120, unit: "bu/acre" };
describe("measurement request validation", () => {
  it("preserves valid optional measurements", () => {
    expect(validatePlanRequest({ ...base, soilTest: { ph: 5.8, organicMatterPct: 0, awc: 0.12, texture: "sand" }, yieldRecords: [record] })).toMatchObject({ soilTest: { ph: 5.8, organicMatterPct: 0, awc: 0.12, texture: "sand" }, yieldRecords: [record] });
  });
  it.each([null, [], { ph: "5.8" }, { ph: NaN }, { ph: 15 }, { ph: -1 }, { organicMatterPct: 101 }, { organicMatterPct: -1 }, { awc: 0 }, { awc: 0.7 }, { texture: "mystery" }])("rejects invalid soil tests %j", (soilTest) => {
    expect(typeof validatePlanRequest({ ...base, soilTest })).toBe("string");
  });
  it.each([null, {}, [{ ...record, value: -1 }], [{ ...record, value: Infinity }], [{ ...record, value: 1001 }], [{ ...record, unit: "tons/acre" }], [{ ...record, crop: "alfalfa" }], [{ ...record, year: 2026 }], [{ ...record, year: 2023.5 }], [record, record], Array.from({ length: 6 }, (_, i) => ({ ...record, year: 2025-i }))])("rejects invalid records %j", (yieldRecords) => {
    expect(typeof validatePlanRequest({ ...base, yieldRecords })).toBe("string");
  });
  it("accepts zero harvest, five distinct years and short tons of hay", () => {
    expect(typeof validatePlanRequest({ ...base, yieldRecords: [...Array.from({ length: 5 }, (_, i) => ({ ...record, year: 2025-i, value: 0 })), { crop: "alfalfa", year: 2025, value: 4, unit: "tons/acre" }] })).toBe("object");
  });
});
