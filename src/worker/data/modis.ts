// ORNL TESViS REST v1. Product-specific rules: MOD13 Collection 6.1 user guide, Tables 1, 4, 5.
import type { ModisObservation, ModisVegetation } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson } from "../lib/http";

const BASE = "https://modis.ornl.gov/rst/api/v1/MOD13Q1";
const DOCS = "https://lpdaac.usgs.gov/documents/621/MOD13_User_Guide_V61.pdf";
interface BandRow { band: string; data: number[]; modis_date: string; version: string; proc_date?: string; title?: string }
interface Subset { nrows: number; ncols: number; cellsize: string; subset: BandRow[] }
const day = 86400000;
const iso = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const startMs = (d: string) => Date.UTC(Number(d.slice(1, 5)), 0, Number(d.slice(5)));
export function compositeDates(year: number): string[] {
  const days = (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / day;
  return Array.from({ length: Math.ceil(days / 16) }, (_, i) => `A${year}${String(1 + i * 16).padStart(3, "0")}`);
}
export function parseModisSubset(s: Subset, dates: string[]): ModisObservation[] {
  return dates.map(d => {
    const rows = Array.isArray(s.subset) ? s.subset.filter(r => r.modis_date === d) : [];
    // km=0 must return exactly one pixel; never average an unexpected footprint.
    const pick = (band: string) => rows.find(r => r.band === `250m_16_days_${band}` && r.version === "061" && r.data?.length === 1);
    const nd = pick("NDVI"), rel = pick("pixel_reliability"), qa = pick("VI_Quality"), doy = pick("composite_day_of_the_year");
    const raw = nd?.data[0], reliability = rel?.data[0] ?? null, quality = qa?.data[0] ?? null;
    const start = startMs(d), end = Math.min(start + 15 * day, Date.UTC(Number(d.slice(1, 5)) + 1, 0, 1) - day);
    const acquisition = doy?.data[0];
    const observed = Number.isInteger(acquisition) ? Date.UTC(Number(d.slice(1, 5)), 0, acquisition!) : NaN;
    const valid = s.nrows === 1 && s.ncols === 1 && typeof raw === "number" && Number.isInteger(raw) && raw >= -2000 && raw <= 10000 && reliability === 0 &&
      quality !== null && Number.isInteger(quality) && quality >= 0 && quality < 65535 && (quality & 3) === 0 &&
      // Land only (bits 11–13=001), no adjacent/mixed cloud, snow/ice or shadow.
      ((quality >> 11) & 7) === 1 && (quality & ((1 << 8) | (1 << 10) | (1 << 14) | (1 << 15))) === 0 && observed >= start && observed <= end;
    return { compositeStart: iso(start), compositeEnd: iso(end), modisDate: d, observationDate: Number.isFinite(observed) && observed >= start && observed <= end ? iso(observed) : null,
      ndvi: valid ? raw! * 0.0001 : null, reliability, quality, version: nd?.version ?? null, processingDate: nd?.proc_date ?? null, tile: nd?.title ?? null,
      reason: valid ? "Good land pixel" : "Missing or rejected: reliability, detailed QA, range, collection, date or footprint" };
  });
}
export async function getModisNdvi(db: D1Database | undefined, lat: number, lon: number, year: number): Promise<ModisVegetation> {
  const dates = compositeDates(year);
  const coords = `latitude=${lat}&longitude=${lon}`;
  const datesUrl = `${BASE}/dates?${coords}`;
  const base: ModisVegetation = { status: "unavailable", product: "MOD13Q1", version: "061", lat, lon, year, resolution: "250 m nominal; MODIS sinusoidal grid", interval: "16-day composite (last interval ends December 31)", units: "NDVI (dimensionless)", scale: 0.0001,
    expectedCount: dates.length, validCount: 0, observations: [], requestUrls: [datesUrl], retrievedAt: null, docsUrl: DOCS,
    attribution: "Didan, K. (2021), MOD13Q1.061, NASA LP DAAC, doi:10.5067/MODIS/MOD13Q1.061. Subsets: ORNL DAAC TESViS RESTful Web Service (2018), doi:10.3334/ORNLDAAC/1600.",
    note: "Coarse historical point pixel, not a field measurement or observations of alternative rotations. Low NDVI does not establish bare soil; residue and mixed pixels remain unresolved. No interpolation or cross-sensor merging. Field-area coverage is unknown. Landsat/HLS reflectance and SWIR are not implemented (Earthdata login required)." };
  try {
    return (await cached(db, `modis:MOD13Q1:061:qa-v1:${lat}:${lon}:${year}`, 30 * DAY_SECONDS, async () => {
      const opts = { service: "ORNL DAAC MODIS", timeoutMs: 10000, retries: 2 };
      const inventory = await fetchJson<{ dates: { modis_date: string }[] }>(datesUrl, opts);
      if (!Array.isArray(inventory.dates)) throw new Error("Invalid MODIS date inventory");
      const available = new Set(inventory.dates.map(d => d.modis_date));
      const selected = dates.filter(d => available.has(d));
      const byDate = new Map<string, ModisObservation>();
      const requestUrls = [datesUrl];
      // ORNL allows at most ten composite dates per synchronous request.
      for (let i = 0; i < selected.length; i += 10) {
        const batch = selected.slice(i, i + 10);
        const url = `${BASE}/subset?${coords}&startDate=${batch[0]}&endDate=${batch[batch.length - 1]}&kmAboveBelow=0&kmLeftRight=0`;
        requestUrls.push(url);
        const subset = await fetchJson<Subset>(url, opts);
        for (const p of parseModisSubset(subset, batch)) byDate.set(p.modisDate, p);
      }
      const missing = parseModisSubset({ nrows: 1, ncols: 1, cellsize: "", subset: [] }, dates);
      const observations = missing.map(p => byDate.get(p.modisDate) ?? p);
      const validCount = observations.filter(p => p.ndvi !== null).length;
      return { ...base, observations, requestUrls, retrievedAt: new Date().toISOString(), validCount, status: validCount === dates.length ? "complete" as const : validCount ? "partial" as const : "unavailable" as const };
    })).value;
  } catch {
    return { ...base, note: `ORNL DAAC unavailable after bounded retries; vegetation is unknown, not zero. ${base.note}` };
  }
}
