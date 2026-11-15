// Timing sensitivity only. This module cannot mutate a plan or confirmed monitoring calendar.
export const CORN_TIMING_MODEL = {
  id: "kstate-corn-110rm-20260618-v1", crop: "corn", baseF: 50, capF: 86,
  adjustment: "Tmax capped at 86 F; Tmin floored at 50 F; negative daily totals floored at zero",
  start: "planting day inclusive", maturity: "assumed 110-day relative-maturity hybrid, not confirmed",
  emergenceGddF: [90, 120], silkingGddF: 1500, maturityGddF: 2670,
  source: "https://agronomy.k-state.edu/eupdates/2026/issue-1108-june-18/late-planted-corn-2026.html",
  sourceDate: "2026-06-18",
} as const;
export interface TimingDay { date: string; tmin: number | null; tmax: number | null; rain: number | null }
export function cornGddF(tminC: number | null, tmaxC: number | null): number | null {
  if (tminC === null || tmaxC === null || !Number.isFinite(tminC) || !Number.isFinite(tmaxC) || tminC > tmaxC) return null;
  return Math.max(0, (Math.min(86, tmaxC * 1.8 + 32) + Math.max(50, tminC * 1.8 + 32)) / 2 - 50);
}
export function dateRange(start: string, end: string): string[] {
  const a = Date.parse(start), b = Date.parse(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || a > b || b - a > 366 * 86400000) throw new Error("Invalid bounded date range");
  const out: string[] = [];
  for (let t = a; t <= b; t += 86400000) out.push(new Date(t).toISOString().slice(0, 10));
  return out;
}
export function exposure(days: TimingDay[], start: string, end: string) {
  const byDate = new Map(days.map(d => [d.date, d]));
  const expected = dateRange(start, end);
  const rows = expected.map(d => byDate.get(d));
  const temperatureGaps = rows.filter(d => !d || d.tmax === null || !Number.isFinite(d.tmax)).length;
  const rainfallGaps = rows.filter(d => !d || d.rain === null || !Number.isFinite(d.rain)).length;
  return { start, end, expectedDays: expected.length, temperatureGaps, rainfallGaps,
    heatDegreeDaysAbove30C: temperatureGaps ? null : rows.reduce((s, d) => s + Math.max(0, d!.tmax! - 30), 0),
    rainMm: rainfallGaps ? null : rows.reduce((s, d) => s + d!.rain!, 0) };
}
export function estimateCornTiming(days: TimingDay[], planting: string, end: string) {
  const byDate = new Map(days.map(d => [d.date, d]));
  const expected = dateRange(planting, end);
  let accumulated = 0, blocked = false;
  const gaps: string[] = [];
  const targets = [90, 120, 1500, 2670];
  const reached: (string | null)[] = targets.map(() => null);
  for (const date of expected) {
    const d = byDate.get(date);
    const gdd = d ? cornGddF(d.tmin, d.tmax) : null;
    if (gdd === null) { gaps.push(date); blocked = true; }
    // A gap invalidates every subsequent crossing, not stages already reached before it.
    if (blocked || gdd === null) continue;
    accumulated += gdd;
    targets.forEach((v, i) => { if (reached[i] === null && accumulated >= v) reached[i] = date; });
  }
  const shift = (date: string, n: number) => new Date(Date.parse(date) + n * 86400000).toISOString().slice(0, 10);
  const silking = reached[2]!;
  const year = planting.slice(0, 4);
  return { model: CORN_TIMING_MODEL, planting, plantingStatus: "assumed unless farmer confirms", end,
    status: gaps.length ? "incomplete" : silking === null ? "threshold_not_reached" : "estimated",
    missingTemperatureDates: gaps, accumulatedGddF: blocked ? null : accumulated, accumulatedGddC: blocked ? null : accumulated / 1.8,
    emergenceRange: [reached[0], reached[1]], silking, physiologicalMaturity: reached[3],
    fixed: exposure(days, `${year}-07-01`, `${year}-08-31`),
    estimated: silking ? exposure(days, shift(silking, -7), shift(silking, 7)) : null,
    windowNote: "Estimated exposure is an illustrative +/-7-day silking window, not a sourced biological stress duration. Fixed reference is July-August; totals cover unequal durations; compare dates and per-day exposure, not raw totals as equivalent windows.",
    unsupported: { sorghum: "No separate sourced parameter set implemented", winterWheat: "Reference calendar retained; cultivar, vernalization and photoperiod inputs unavailable" },
    schedulerContract: { version: "estimated-stage-window-v1", crop: "corn", start: silking ? shift(silking, -7) : null, end: silking ? shift(silking, 7) : null, requiresConfirmation: true, schedulingSideEffects: false },
  };
}
