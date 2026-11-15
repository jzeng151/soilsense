import type { WeatherEstimate } from "./weatherCrosscheck";
/** Nonnegative daily rain bounds, not interpolation or a measurement-error interval.
 * PRISM [S-1 noon,E noon) contains full UTC days S..E-1 plus unknown parts
 * of S-1 and E. Thus exact interior <= UTC-noon rain <= interior+edge days.
 */
export function noonRainBounds(rows: WeatherEstimate[], start: string, end: string, referenceTotalMm: number | null = null) {
  const previous = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const byDate = new Map(rows.map(row => [row.date, row.rain]));
  const dates: string[] = [];
  for (let t = Date.parse(previous); t <= Date.parse(end); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  const values = dates.map(d => byDate.get(d));
  const complete = values.every(v => typeof v === "number" && Number.isFinite(v) && v >= 0);
  const lowerMm = complete ? (values.slice(1, -1) as number[]).reduce((a, b) => a + b, 0) : null;
  const edgeTotalMm = complete ? values[0]! + values.at(-1)! : null;
  const upperMm = lowerMm === null || edgeTotalMm === null ? null : lowerMm + edgeTotalMm;
  const referenceValid = referenceTotalMm !== null && Number.isFinite(referenceTotalMm) && referenceTotalMm >= 0;
  const distances = referenceValid && lowerMm !== null && upperMm !== null ? [Math.abs(referenceTotalMm - lowerMm), Math.abs(referenceTotalMm - upperMm)] : null;
  const containsReference = referenceValid && lowerMm !== null && upperMm !== null && referenceTotalMm >= lowerMm && referenceTotalMm <= upperMm;
  const absoluteDifferenceRangeMm = distances ? [containsReference ? 0 : Math.min(...distances), Math.max(...distances)] : null;
  // All possible denominators must clear the near-dry gate before reporting a range.
  const endpointPct = referenceValid && lowerMm !== null && upperMm !== null && (referenceTotalMm + lowerMm) / 2 >= 1 ? [lowerMm, upperMm].map(v => 200 * Math.abs(referenceTotalMm - v) / (referenceTotalMm + v)) : null;
  const symmetricDifferenceRangePct = endpointPct ? [containsReference ? 0 : Math.min(...endpointPct), Math.max(...endpointPct)] : null;
  return { startInclusive: `${previous}T12:00:00Z`, endExclusive: `${end}T12:00:00Z`, requiredUtcDates: dates, lowerMm, upperMm, absoluteDifferenceRangeMm, symmetricDifferenceRangePct, edgeTotalMm, state: complete ? "bounded_only" : "missing", note: "Nonnegative-rain interval bounds from whole UTC days; endpoint allocation unknown. Not a confidence interval, exact noon reconstruction, agreement classification, or field validation. Bounds can be wide, especially for short windows." };
}
