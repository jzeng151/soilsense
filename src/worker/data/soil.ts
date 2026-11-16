// USDA NRCS Soil Data Access (SSURGO) client.
// Docs: https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx

import type { SoilProfile } from "../../shared/types";
import { cached } from "../lib/cache";
import { freshnessKey, HISTORY, soilRelease, successful } from "../lib/freshness";
import { fetchJson } from "../lib/http";

const SDA_URL = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";
const SOURCE = "USDA NRCS SSURGO via Soil Data Access";

interface SdaResponse {
  Table?: string[][];
}

export function soilQuery(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("invalid coordinates");
  const point = `point(${lon.toFixed(6)} ${lat.toFixed(6)})`;
  return [
    "SELECT mu.mukey, mu.muname, c.cokey, c.compname, c.comppct_r, c.drainagecl,",
    "ch.hzdept_r, ch.hzdepb_r, ch.ph1to1h2o_r, ch.om_r, ch.claytotal_r, ch.sandtotal_r, ch.awc_r",
    "FROM mapunit mu",
    "INNER JOIN component c ON c.mukey = mu.mukey AND c.majcompflag = 'Yes'",
    "INNER JOIN chorizon ch ON ch.cokey = c.cokey",
    `WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}'))`,
    "ORDER BY c.comppct_r DESC, c.cokey, ch.hzdept_r ASC",
  ].join(" ");
}

const num = (v: string | undefined): number | undefined => {
  if (v === undefined || v === null || v === "") return undefined;
  const n = Number(v);
  return Number.isFinite(n) ? n : undefined;
};

/** Parse SDA rows (first row = column names) into a soil profile for the dominant component. */
export function parseSoil(resp: SdaResponse): SoilProfile {
  const table = resp.Table;
  if (!table || table.length < 2) return { available: false, source: SOURCE };
  const [header, ...rows] = table as [string[], ...string[][]];
  const col = (name: string) => header.indexOf(name);
  const cokey = rows[0]?.[col("cokey")];
  const horizons = rows.filter((r) => r[col("cokey")] === cokey);
  const first = horizons[0];
  if (!first) return { available: false, source: SOURCE };

  // Depth-weighted averages: topsoil (0–30 cm) for pH/OM/texture, whole profile (≤150 cm) for AWC.
  const weighted = (field: string, maxDepth: number): number | undefined => {
    let sum = 0;
    let w = 0;
    for (const h of horizons) {
      const top = num(h[col("hzdept_r")]) ?? 0;
      const bottom = Math.min(num(h[col("hzdepb_r")]) ?? top, maxDepth);
      const v = num(h[col(field)]);
      const thick = bottom - top;
      if (v === undefined || thick <= 0) continue;
      sum += v * thick;
      w += thick;
    }
    return w > 0 ? sum / w : undefined;
  };
  const depth = Math.max(...horizons.map((h) => num(h[col("hzdepb_r")]) ?? 0));

  return {
    available: true,
    source: SOURCE,
    mapUnitKey: first[col("mukey")],
    mapUnitName: first[col("muname")],
    componentName: first[col("compname")],
    drainageClass: first[col("drainagecl")] || undefined,
    ph: weighted("ph1to1h2o_r", 30),
    organicMatterPct: weighted("om_r", 30),
    clayPct: weighted("claytotal_r", 30),
    sandPct: weighted("sandtotal_r", 30),
    awc: weighted("awc_r", 150),
    profileDepthCm: depth > 0 ? Math.min(depth, 200) : undefined,
  };
}

export async function getSoil(db: D1Database | undefined, lat: number, lon: number): Promise<SoilProfile> {
  const key = freshnessKey(`soil:v1:${lat.toFixed(4)}:${lon.toFixed(4)}`, soilRelease());
  try {
    const { value } = await cached(db, key, successful(HISTORY), async () => {
      const resp = await fetchJson<SdaResponse>(SDA_URL, {
        service: "USDA Soil Data Access",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "JSON+COLUMNNAME", query: soilQuery(lat, lon) }),
        timeoutMs: 12000,
        retries: 1,
      });
      return parseSoil(resp);
    });
    return value;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "soil lookup failed", err: String(err) }));
    return { available: false, source: `${SOURCE} (unavailable: using typical loam defaults)` };
  }
}
