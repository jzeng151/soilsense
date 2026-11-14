// Unit helpers. The engine works in metric; farmers see US units.

export const mmToIn = (mm: number): number => mm / 25.4;
export const cToF = (c: number): number => (c * 9) / 5 + 32;
/** Growing degree days: a °C·day is 1.8 °F·days. */
export const gddCToF = (gddC: number): number => gddC * 1.8;

export function round(value: number, digits = 1): number {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
}

export function formatSigned(value: number, digits = 1): string {
  const r = round(value, digits);
  return `${r > 0 ? "+" : ""}${r}`;
}

export function clamp(value: number, lo = 0, hi = 1): number {
  return Math.min(hi, Math.max(lo, value));
}
