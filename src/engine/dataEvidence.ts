import type { PlanResponse } from "../shared/types";

export interface StatusInput {
  available: boolean;
  complete: boolean | null;
  historical: boolean;
  cached: boolean;
  observedThrough: string | null;
  maxAgeDays?: number;
}

/** Precedence: unavailable > incomplete/unknown coverage > stale current > historical cache > available.
 * Only current products with a stated maximum age can be stale. Retrieval time never determines freshness.
 */
export function dataStatus(input: StatusInput, asOf: string): "unavailable" | "incomplete" | "stale" | "historical-cached" | "available" {
  if (!input.available) return "unavailable";
  if (input.complete !== true) return "incomplete";
  if (!input.historical && input.maxAgeDays !== undefined) {
    const age = (Date.parse(asOf) - Date.parse(input.observedThrough ?? "")) / 86_400_000;
    if (!Number.isFinite(age)) return "incomplete";
    if (age > input.maxAgeDays) return "stale";
  }
  return input.historical && input.cached ? "historical-cached" : "available";
}

export interface DataEvidence {
  name: string;
  url: string;
  product: string;
  version: string | null;
  period: string | null;
  resolution: string;
  retrievedAt: string | null;
  status: ReturnType<typeof dataStatus>;
  coverage: string;
  method: string;
  timeConvention: string;
  units: string;
  attribution: string;
  license: string | null;
}

/** Fallback is intentionally conservative: a source in a bibliography is NOT proof it returned data. */
export function evidenceForPlan(plan: PlanResponse): DataEvidence[] {
  const power = plan.powerEvidence;
  return plan.dataSources.map((source) => {
    const row: DataEvidence = {
      name: source.name, url: source.url, product: source.name, version: null, period: null,
      resolution: "unknown", retrievedAt: null, status: "incomplete", coverage: "unknown — not tracked by this client",
      method: source.usedFor, timeConvention: "unknown", units: "unknown", attribution: source.name, license: null,
    };
    if (source.name.startsWith("NASA POWER")) {
      row.period = power?.period ?? `${plan.climate.firstYear}–${plan.climate.lastYear} (retained climate years)`;
      row.resolution = "0.5° latitude × 0.625° longitude; regional grid, not a field station";
      row.method = "Point snapped to POWER grid; daily values; seasonal sums/means and annual trend tests. Daymet averaging is separately labeled in climate source.";
      row.timeConvention = "Local Solar Time (LST)";
      row.units = "Original: precipitation mm/day; temperature °C; root-zone wetness fraction. Display: inches, °F, %.";
      if (power) {
        row.url = power.url;
        row.version = power.version;
        row.retrievedAt = power.retrievedAt;
        row.status = dataStatus({ available: true, complete: power.validValues === power.expectedValues, historical: true, cached: power.cached, observedThrough: power.observedThrough }, plan.generatedAt);
        row.coverage = `${power.validValues} / ${power.expectedValues} required daily rain/max/min values; incomplete years excluded from replay`;
      }
    } else if (source.name.includes("Daymet")) {
      row.period = `${plan.climate.firstYear}–${plan.climate.lastYear} requested; actual coverage unknown`;
      row.resolution = "1 km regional interpolated grid, not a field station";
      row.coverage = plan.climate.source.includes("Daymet") ? "Used in weather ensemble; exact source coverage unknown" : "Not used in weather ensemble; availability unknown";
    } else if (source.name.includes("Cropland")) {
      row.period = plan.cropHistory.years.length ? plan.cropHistory.years.map((y) => y.year).join(", ") : null;
      row.resolution = "30 m pixel crop classification, not confirmed field history";
      row.status = plan.cropHistory.available ? "incomplete" : "unavailable";
      row.coverage = plan.cropHistory.available ? `${plan.cropHistory.years.length} annual classifications; expected coverage unknown` : "No crop map available; farmer confirmation required";
    } else if (source.name.includes("SSURGO")) {
      row.resolution = "Soil survey map unit; not a sample from this field";
      row.status = plan.soil.available ? "incomplete" : "unavailable";
      row.coverage = plan.soil.available ? "Survey returned; individual properties may be unknown" : "Unavailable; engine uses typical water-storage assumptions";
    } else if (source.name.includes("GIBS")) {
      row.period = "2025-07-29 (map layer request; not a live observation)";
      row.coverage = "Map imagery only; tile retrieval/coverage unknown";
    } else if (source.name.includes("Quick Stats")) {
      row.resolution = "County/district harvest aggregates and state/national prices, not field measurements";
    } else if (source.name.includes("RMA")) {
      row.resolution = "County insurance losses, not field-specific losses";
    } else if (source.name.includes("OpenET")) {
      row.status = plan.waterCheck ? "incomplete" : "unavailable";
      row.period = plan.waterCheck?.years.join(", ") ?? null;
      row.coverage = plan.waterCheck ? "Water check returned; monthly completeness unknown" : "No water check available";
    }
    return row;
  });
}

export function evidenceQuality(plan: PlanResponse): string[] {
  const gaps = evidenceForPlan(plan).filter((row) => row.status === "incomplete" || row.status === "unavailable");
  return [
    ...gaps.map((row) => `${row.name}: ${row.status}. ${row.coverage}.`),
    "Unknown retrieval dates and product versions are not evidence of fresh or complete observations.",
  ];
}
