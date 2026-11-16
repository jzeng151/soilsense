import type { CropId } from "../../shared/types";
import { WATCHABLE_CROPS } from "./watchCore";
import type { WatchedField } from "./run";

export const REGISTERED_ID = /^u_[A-Za-z0-9_-]{32}$/;
export const GLOBAL_REGISTRATION_CAP = 1000;
export const REGISTRATION_BYTES = 100_000;
export interface Registration {
  fieldId: string;
  centroid: { lat: number; lon: number };
  polygonHash: string;
  watchedCrop: CropId;
}
export function capabilityId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(24)); // 192 random bits
  return `u_${btoa(String.fromCharCode(...bytes)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "")}`;
}
const conus = (p: number[]) => p.length === 2 && p.every(Number.isFinite) && p[0]! >= -125 && p[0]! <= -66 && p[1]! >= 24 && p[1]! <= 50;
const inside = (p: number[], ring: number[][]) => {
  let yes = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const a = ring[i]!, b = ring[j]!;
    if ((a[1]! > p[1]!) !== (b[1]! > p[1]!) && p[0]! < (b[0]! - a[0]!) * (p[1]! - a[1]!) / (b[1]! - a[1]!) + a[0]!) yes = !yes;
  }
  return yes;
};
/** Bounding-box, vertex, closure, area and centroid guards. Not a CSB authenticity/ownership check. */
export async function validateRegistration(raw: unknown): Promise<Registration> {
  const b = raw as { field?: { id?: unknown; source?: unknown; polygon?: unknown; centroid?: { lat?: unknown; lon?: unknown } }; watchedCrop?: unknown; calendar?: unknown } | null;
  if (!b || b.calendar !== undefined) throw new Error("Custom calendar is not supported; omit calendar.");
  const f = b.field;
  if (!f || typeof f.id !== "string" || !/^csb:[A-Za-z0-9_-]{1,100}$/.test(f.id) || f.source !== "usda-csb") throw new Error("A USDA CSB field is required.");
  if (!WATCHABLE_CROPS.includes(b.watchedCrop as CropId)) throw new Error("Choose a supported watchedCrop.");
  const rings = f.polygon;
  if (!Array.isArray(rings) || rings.length < 1 || rings.length > 16) throw new Error("Invalid polygon rings.");
  let vertices = 0, area = 0;
  for (const [index, ring] of rings.entries()) {
    if (!Array.isArray(ring) || ring.length < 4 || ring.length > 2000) throw new Error("Invalid ring size.");
    vertices += ring.length;
    if (vertices > 2000 || !ring.every((p: unknown) => Array.isArray(p) && conus(p))) throw new Error("Polygon exceeds vertex or CONUS bounds.");
    if (JSON.stringify(ring[0]) !== JSON.stringify(ring[ring.length - 1])) throw new Error("Polygon rings must be closed.");
    const xs = ring.map((p: number[]) => p[0]!), ys = ring.map((p: number[]) => p[1]!);
    if (Math.max(...xs) - Math.min(...xs) > 1 || Math.max(...ys) - Math.min(...ys) > 1) throw new Error("Polygon extent too large.");
    let sum = 0;
    for (let i = 1; i < ring.length; i++) {
      const a = ring[i - 1]!, c = ring[i]!;
      sum += (c[0] - a[0]) * Math.PI / 180 * (2 + Math.sin(a[1] * Math.PI / 180) + Math.sin(c[1] * Math.PI / 180));
    }
    const m2 = Math.abs(sum * 6371008.8 ** 2 / 2);
    area += index === 0 ? m2 : -m2;
  }
  if (area < 40 || area > 40_468_564) throw new Error("Polygon area must be between 0.01 and 10,000 acres.");
  const { lat, lon } = f.centroid ?? {};
  if (typeof lat !== "number" || typeof lon !== "number" || !conus([lon, lat]) || !inside([lon, lat], rings[0]) || rings.slice(1).some(r => inside([lon, lat], r))) throw new Error("Centroid must be inside the field in CONUS.");
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(JSON.stringify(rings)));
  return { fieldId: f.id, centroid: { lat, lon }, watchedCrop: b.watchedCrop as CropId, polygonHash: [...new Uint8Array(hash)].map(n => n.toString(16).padStart(2, "0")).join("") };
}
export function registeredField(id: string, config: Registration): WatchedField {
  // Farmer labels stay in this browser; don't leak capabilities to public live-room events.
  return { id, name: config.fieldId, lat: config.centroid.lat, lon: config.centroid.lon, state: "", fips: "" };
}
