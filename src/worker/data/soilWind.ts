// SSURGO wind-erodibility attributes for the field's map unit via USDA NRCS Soil Data Access (issue #40).
// Every component is kept with its own name, share and categorical WEG; nothing is averaged across components.
// Docs: https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx

import type { WindSoil, WindSoilComponent } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { fetchJson } from "../lib/http";

const SDA_URL = "https://SDMDataAccess.sc.egov.usda.gov/Tabular/post.rest";
const SOURCE = "USDA NRCS SSURGO via Soil Data Access (component.weg, component.wei, surface-horizon texture, sacatalog.saverest)";
const DOCS = "https://sdmdataaccess.nrcs.usda.gov/WebServiceHelp.aspx";

export function windSoilQuery(lat: number, lon: number): string {
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) throw new Error("invalid coordinates");
  const point = `point(${lon.toFixed(6)} ${lat.toFixed(6)})`;
  return [
    "SELECT mu.mukey, mu.muname, l.areasymbol, sc.saverest, c.cokey, c.compname, c.comppct_r, c.majcompflag, c.weg, c.wei,",
    "(SELECT TOP 1 tg.texdesc FROM chorizon ch INNER JOIN chtexturegrp tg ON tg.chkey = ch.chkey AND tg.rvindicator = 'Yes' WHERE ch.cokey = c.cokey ORDER BY ch.hzdept_r) AS surftex",
    "FROM mapunit mu",
    "INNER JOIN legend l ON l.lkey = mu.lkey",
    "LEFT JOIN sacatalog sc ON sc.areasymbol = l.areasymbol",
    "INNER JOIN component c ON c.mukey = mu.mukey",
    `WHERE mu.mukey IN (SELECT * FROM SDA_Get_Mukey_from_intersection_with_WktWgs84('${point}'))`,
    "ORDER BY c.comppct_r DESC, c.cokey",
  ].join(" ");
}

const str = (v: string | undefined | null) => (v === undefined || v === null || v.trim() === "" ? null : v.trim());
const num = (v: string | undefined | null) => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
};

export function parseWindSoil(resp: { Table?: string[][] }, retrievedAt: string): WindSoil {
  const empty: WindSoil = { available: false, mapUnitKey: null, mapUnitName: null, surveyArea: null, surveyVersion: null, components: [], source: SOURCE, sourceUrl: DOCS, retrievedAt };
  const t = resp.Table;
  if (!t || t.length < 2) return empty;
  const [h, ...rows] = t as [string[], ...string[][]];
  const col = (n: string) => h.indexOf(n);
  const first = rows[0]!;
  const components: WindSoilComponent[] = rows.map((r) => ({
    componentKey: r[col("cokey")] ?? "",
    name: r[col("compname")] ?? "",
    pct: num(r[col("comppct_r")]),
    major: str(r[col("majcompflag")]) === "Yes",
    weg: str(r[col("weg")]),
    wei: num(r[col("wei")]),
    surfaceTexture: str(r[col("surftex")]),
  }));
  return {
    available: true,
    mapUnitKey: str(first[col("mukey")]),
    mapUnitName: str(first[col("muname")]),
    surveyArea: str(first[col("areasymbol")]),
    surveyVersion: str(first[col("saverest")]),
    components,
    source: SOURCE,
    sourceUrl: DOCS,
    retrievedAt,
  };
}

export async function getWindSoil(db: D1Database | undefined, lat: number, lon: number): Promise<WindSoil> {
  const key = `soilwind:v1:${lat.toFixed(4)}:${lon.toFixed(4)}`;
  try {
    const { value } = await cached(db, key, 90 * DAY_SECONDS, async () => {
      const resp = await fetchJson<{ Table?: string[][] }>(SDA_URL, {
        service: "USDA Soil Data Access",
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ format: "JSON+COLUMNNAME", query: windSoilQuery(lat, lon) }),
        timeoutMs: 12000,
        retries: 1,
      });
      return parseWindSoil(resp, new Date().toISOString());
    });
    return value;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "wind soil lookup failed", err: String(err) }));
    return { available: false, mapUnitKey: null, mapUnitName: null, surveyArea: null, surveyVersion: null, components: [], source: `${SOURCE} (unavailable)`, sourceUrl: DOCS, retrievedAt: null };
  }
}
