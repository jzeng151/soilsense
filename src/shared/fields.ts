import type { CropId, PlanRequest } from './types';
export type LonLat = [number, number];
export interface FieldBoundary {
  id: string;                    // CSB: "csb:<CSBID>"; user-registered agent fields: "u_<22+ url-safe random chars>"
  source: "usda-csb";
  name?: string;                 // farmer label, local only
  polygon: LonLat[][];           // GeoJSON Polygon rings, WGS84, outer ring first, closed
  areaAcres: number;             // geodesic area of polygon
  centroid: { lat: number; lon: number };
  cropSequence?: { year: number; cdlCode: number; crop: string }[]; // from CSB attributes when present
  provenance: { product: string; version: string; url: string; retrieved: string; sha256?: string };
}
export interface FieldsStatus { enabled: boolean; areas: { id: string; name: string; bbox: [number, number, number, number] }[] }

/** USDA CDL single-crop codes: https://www.nass.usda.gov/Research_and_Science/Cropland/
 * Double-crop classes (e.g. 26, 225–254), noncrop and unmodeled crops are unknown.
 */
export function cdlToCropId(code: number): CropId | undefined {
  const crops: Record<number, CropId> = { 1:'corn', 4:'sorghum', 5:'soybean', 24:'winter_wheat', 28:'oats', 36:'alfalfa', 61:'fallow' };
  return crops[code];
}

/** Latest three calendar observations, chronological, matching effectiveHistory's oldest-first contract.
 * Drop unknowns AFTER choosing the window: never silently backfill an old crop across a recent gap.
 */
export function fieldPlanHistory(field: FieldBoundary) {
  const years = [...(field.cropSequence ?? [])].sort((a,b)=>a.year-b.year).slice(-3);
  return {
    years,
    recentCrops: years.flatMap(y=>{const crop=cdlToCropId(y.cdlCode);return crop?[crop]:[];}),
    dropped: years.filter(y=>!cdlToCropId(y.cdlCode)),
  };
}

/** Stable within a committed area vintage: north to south, west to east, CSB id breaks ties. */
export function numberFields(fields: FieldBoundary[]): FieldBoundary[] {
  const ordered=[...fields].sort((a,b)=>b.centroid.lat-a.centroid.lat || a.centroid.lon-b.centroid.lon || a.id.localeCompare(b.id));
  const numbers=new Map(ordered.map((f,i)=>[f.id,i+1]));
  return fields.map(f=>({...f,name:`Field ${numbers.get(f.id)}`}));
}

/** Empty means reset to generated label; null means invalid. Labels are plain text, never HTML. */
export function validateFieldName(value: string): string | null {
  if (/[\u0000-\u001f\u007f]/.test(value) || [...value.trim()].length>60) return null;
  return value.trim();
}

/** Disabled mode returns the very same request, regardless of stale browser selection. */
export function fieldPlanRequest(request: PlanRequest, enabled: boolean, field?: FieldBoundary | null, history?: CropId[]): PlanRequest {
  if (!enabled || !field) return request;
  return {...request,...field.centroid,recentCrops:history ?? fieldPlanHistory(field).recentCrops};
}
