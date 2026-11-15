// Validated IMERG Late current snapshots; independent of historical Final evidence and POWER rules.
import { gridPoint, days, PRODUCTS, shift, type Subset } from "../imerg/client";
import { canonicalJson, sha256Hex, type Farm } from "./snapshot";
export const IMERG_POLICY = { windowDays: 14, maxAgeDays: 3, requiredSamplesPerDay: 48, minCompleteness: 1 } as const;
export function planImergCells(farms: Farm[]) {
  const cells = new Map<string, ReturnType<typeof gridPoint> & { farmIds: string[] }>();
  for (const f of farms) { const grid = gridPoint(f.lat, f.lon); const cell = cells.get(grid.key) ?? { ...grid, farmIds: [] }; cell.farmIds.push(f.id); cells.set(grid.key, cell); }
  return [...cells.values()];
}
export type ImergCell = ReturnType<typeof planImergCells>[number];
export interface ImergContent {
  schema: "soilsense.imerg-late-snapshot/v1";
  stream: "current-late";
  product: typeof PRODUCTS.late;
  grid: ReturnType<typeof gridPoint>;
  units: "mm/day";
  timeStandard: "UTC";
  start: string;
  dataThrough: string;
  observations: { date: string; mm: number; count: number; sourceUrl: string; revision: string }[];
  replacementPolicy: string;
}
export type ImergVerdict = { ok: false; errors: string[] } | { ok: true; content: ImergContent; contentHash: string; snapshotId: string };
export async function validateImerg(subset: Subset, cell: ImergCell, now: Date): Promise<ImergVerdict> {
  const errors: string[] = [];
  if (subset.schema !== "soilsense.imerg-point/v1" || subset.stream !== "late" || subset.product.shortName !== PRODUCTS.late.shortName || subset.product.version !== "07" || subset.product.stream !== "Late") errors.push("Only GPM_3IMERGDL V07 Late may enter current snapshots");
  if (subset.units !== "mm/day" || subset.timeStandard !== "UTC") errors.push("IMERG units or time standard mismatch");
  if (subset.grid.key !== cell.key || Math.abs(subset.grid.lat - cell.lat) > 0.001 || Math.abs(subset.grid.lon - cell.lon) > 0.001) errors.push("IMERG spatial mapping mismatch");
  let dates: string[] = [];
  try { dates = days(shift(subset.end, -13), subset.end); } catch { errors.push("Invalid observation period"); }
  if (subset.start !== dates[0] || subset.observations.length !== 14 || dates.some((d, i) => subset.observations[i]?.date !== d)) errors.push("IMERG window must contain exactly 14 contiguous days");
  const age = (Date.parse(now.toISOString().slice(0, 10)) - Date.parse(subset.end)) / 86400000;
  if (!Number.isFinite(age) || age < 1 || age > IMERG_POLICY.maxAgeDays) errors.push("IMERG data-through is stale or not a completed UTC day");
  if (subset.observations.some((d) => d.mm === null || !Number.isFinite(d.mm) || d.mm < 0 || d.mm > 2000 || d.count !== 48)) errors.push("Incomplete precipitation: require 48 samples and valid mm/day for every day; missing is not zero");
  if (errors.length) return { ok: false, errors };
  const { farmIds: _farmIds, ...grid } = cell;
  const content: ImergContent = {
    schema: "soilsense.imerg-late-snapshot/v1", stream: "current-late", product: PRODUCTS.late, grid, units: "mm/day", timeStandard: "UTC", start: subset.start, dataThrough: subset.end,
    observations: subset.observations.map((d) => ({ ...d, mm: d.mm! })),
    replacementPolicy: "Late-only current stream: a later observed end date supersedes older data; a revised same-period Late subset gets a new immutable hash and replaces the current pointer. Historical Final bundles remain independent; Final never silently replaces Late. Older periods never move pointers backwards.",
  };
  const contentHash = await sha256Hex(canonicalJson(content));
  return { ok: true, content, contentHash, snapshotId: `iml-${contentHash.slice(0, 24)}` };
}
export function imergFreshness(through: string | null, now: Date) {
  if (!through) return { state: "none" as const, ageDays: null };
  const ageDays = Math.round((Date.parse(now.toISOString().slice(0, 10)) - Date.parse(through)) / 86400000);
  return { state: ageDays >= 1 && ageDays <= IMERG_POLICY.maxAgeDays ? "fresh" as const : "stale" as const, ageDays };
}
