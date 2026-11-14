// Trend statistics: Mann-Kendall test with tie correction, Sen's slope,
// and a lag-1 autocorrelation (effective sample size) variance correction.

import type { TrendResult } from "../shared/types";

/** Standard normal CDF (Abramowitz & Stegun 7.1.26 erf approximation, |error| < 1.5e-7). */
export function normalCdf(z: number): number {
  const x = Math.abs(z) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * x);
  const poly =
    t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - poly * Math.exp(-x * x);
  return z >= 0 ? 0.5 * (1 + erf) : 0.5 * (1 - erf);
}

export function median(values: number[]): number {
  if (values.length === 0) return NaN;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? (s[mid] as number) : ((s[mid - 1] as number) + (s[mid] as number)) / 2;
}

export function mean(values: number[]): number {
  if (values.length === 0) return NaN;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

/** Sen's slope (median of pairwise slopes) and the matching intercept. */
export function sensSlope(x: number[], y: number[]): { slope: number; intercept: number } {
  const slopes: number[] = [];
  for (let i = 0; i < x.length; i++) {
    for (let j = i + 1; j < x.length; j++) {
      const dx = (x[j] as number) - (x[i] as number);
      if (dx !== 0) slopes.push(((y[j] as number) - (y[i] as number)) / dx);
    }
  }
  const slope = slopes.length ? median(slopes) : 0;
  const intercept = median(y.map((yi, i) => yi - slope * (x[i] as number)));
  return { slope, intercept };
}

function lag1Autocorrelation(values: number[]): number {
  const n = values.length;
  if (n < 3) return 0;
  const m = mean(values);
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const d = (values[i] as number) - m;
    den += d * d;
    if (i < n - 1) num += d * ((values[i + 1] as number) - m);
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Mann-Kendall trend test.
 * - Tie-corrected variance.
 * - If the detrended series has significant positive lag-1 autocorrelation,
 *   the variance is inflated by (1 + r1) / (1 - r1) (effective sample size),
 *   so a trend is not called significant just because consecutive years are similar.
 */
export function mannKendall(x: number[], y: number[], alpha = 0.05): TrendResult {
  const n = y.length;
  const { slope, intercept } = sensSlope(x, y);
  if (n < 8) {
    return {
      s: 0,
      z: 0,
      pValue: 1,
      slopePerYear: slope,
      intercept,
      n,
      lag1Autocorrelation: 0,
      autocorrelationCorrected: false,
      verdict: "insufficient_data",
    };
  }

  let s = 0;
  for (let i = 0; i < n - 1; i++) {
    for (let j = i + 1; j < n; j++) {
      s += Math.sign((y[j] as number) - (y[i] as number));
    }
  }

  // Tie correction.
  const counts = new Map<number, number>();
  for (const v of y) counts.set(v, (counts.get(v) ?? 0) + 1);
  let tieTerm = 0;
  for (const t of counts.values()) if (t > 1) tieTerm += t * (t - 1) * (2 * t + 5);
  let variance = (n * (n - 1) * (2 * n + 5) - tieTerm) / 18;

  // Autocorrelation correction on the detrended series.
  const detrended = y.map((yi, i) => yi - slope * (x[i] as number));
  const r1 = lag1Autocorrelation(detrended);
  const r1Critical = 1.96 / Math.sqrt(n);
  let corrected = false;
  if (r1 > r1Critical && r1 < 0.95) {
    variance *= (1 + r1) / (1 - r1);
    corrected = true;
  }

  let z = 0;
  if (variance > 0) {
    if (s > 0) z = (s - 1) / Math.sqrt(variance);
    else if (s < 0) z = (s + 1) / Math.sqrt(variance);
  }
  const pValue = Math.min(1, 2 * (1 - normalCdf(Math.abs(z))));

  let verdict: TrendResult["verdict"] = "no_clear_change";
  if (pValue < alpha) verdict = z > 0 ? "significant_increase" : "significant_decrease";

  return {
    s,
    z,
    pValue,
    slopePerYear: slope,
    intercept,
    n,
    lag1Autocorrelation: r1,
    autocorrelationCorrected: corrected,
    verdict,
  };
}

export const isSignificant = (t: TrendResult): boolean =>
  t.verdict === "significant_increase" || t.verdict === "significant_decrease";
