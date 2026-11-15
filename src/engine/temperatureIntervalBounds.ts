import type { WeatherEstimate } from "./weatherCrosscheck";
/** Bounds on window extrema, NOT averages of daily Tmin/Tmax. At least one
 * complete interior UTC day is needed to constrain both sides of an extremum.
 */
export function noonTemperatureBounds(utc: WeatherEstimate[], prism: WeatherEstimate[] | null, start: string, end: string) {
  const previous = new Date(Date.parse(start) - 86400000).toISOString().slice(0, 10);
  const dates: string[] = [];
  for (let t = Date.parse(previous); t <= Date.parse(end); t += 86400000) dates.push(new Date(t).toISOString().slice(0, 10));
  const inside = dates.slice(1, -1), prismDates = dates.slice(1);
  return (["tmin", "tmax"] as const).map(variable => {
    const extrema = variable === "tmin" ? Math.min : Math.max;
    const valid = (v: unknown): v is number => typeof v === "number" && Number.isFinite(v);
    const values = dates.map(d => utc.find(r => r.date === d)?.[variable]);
    const referenceValues = prismDates.map(d => prism?.find(r => r.date === d)?.[variable]);
    const complete = values.every(valid) && inside.length > 0;
    const interior = values.slice(1, -1) as number[];
    const all = values as number[];
    const lowerC = complete ? variable === "tmin" ? extrema(...all) : extrema(...interior) : null;
    const upperC = complete ? variable === "tmin" ? extrema(...interior) : extrema(...all) : null;
    const prismC = referenceValues.every(valid) ? extrema(...referenceValues) : null;
    const distances = lowerC !== null && upperC !== null && prismC !== null ? [Math.abs(prismC - lowerC), Math.abs(prismC - upperC)] : null;
    const absoluteDifferenceRangeC = distances && prismC !== null && lowerC !== null && upperC !== null ? [prismC >= lowerC && prismC <= upperC ? 0 : Math.min(...distances), Math.max(...distances)] : null;
    return { variable, lowerC, upperC, prismC, absoluteDifferenceRangeC, state: complete ? "bounded_only" : "missing", note: "Extreme across the full noon-to-noon window, not mean daily extrema. Daily UTC temperature sampling differs from PRISM native extrema. No Celsius relative percentages, agreement classification or truth source." };
  });
}
