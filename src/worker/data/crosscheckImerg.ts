import { ATTRIBUTION, gridPoint, PRODUCTS, type Observation } from "../imerg/client";
/** Reuse next's validated daily DAP4 cache, without exposing public Earthdata warming. */
export async function getCrosscheckImerg(db: D1Database | undefined, lat: number, lon: number, dates: string[]) {
  if (!db) throw new Error("IMERG cache unavailable");
  const grid = gridPoint(lat, lon);
  const observations = await Promise.all(dates.map(async date => {
    const prefix = `imerg-day:V07:dap4-qa2:final:${grid.key}:${date}:`;
    const row = await db.prepare("SELECT value FROM cache WHERE key LIKE ?1 AND expires_at > ?2 ORDER BY expires_at DESC LIMIT 1").bind(`${prefix}%`, Date.now()).first<{ value: string }>();
    if (!row) return { date, mm: null, count: 0, sourceUrl: "", revision: "not cached" } satisfies Observation;
    const value = JSON.parse(row.value) as Observation;
    if (value.date !== date || !Number.isInteger(value.count) || value.count < 0 || value.count > 48 || typeof value.sourceUrl !== "string" || !value.sourceUrl.startsWith("https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/GPM_3IMERGDF.07/") || typeof value.revision !== "string" || (value.mm !== null && (!Number.isFinite(value.mm) || value.mm < 0 || value.mm > 2000 || value.count !== 48))) throw new Error("Invalid cached IMERG observation");
    return value;
  }));
  return { id: "IMERG Final V07 (cached)", dayBoundary: "UTC midnight", rows: observations.map(d => ({ date: d.date, rain: d.mm, tmin: null, tmax: null })), observations, retrievedAt: null, source: { product: PRODUCTS.final.shortName + " V07", attribution: ATTRIBUTION, grid, units: "mm/day", provenance: "Validated next IMERG DAP4 day-cache; original retrieval timestamp is not stored in day records. Missing cache is not zero.", doi: PRODUCTS.final.doi } };
}
