// Bounded NASA GES DISC DAP4 point adapter; recorded live fixture under test/fixtures/imerg-live.
import { dap4Constraint, parseDap4 } from "./dap4";
import type { Env } from "../env";
import { cached } from "../lib/cache";

export type Stream = "final" | "late";
export const PRODUCTS = {
  final: { shortName: "GPM_3IMERGDF", version: "07", stream: "Final", latency: "Up to four months plus about 24 hours", doi: "10.5067/GPM/IMERGDF/DAY/07" },
  late: { shortName: "GPM_3IMERGDL", version: "07", stream: "Late", latency: "No earlier than 14 hours after closure of the UTC day; delivery can lag", doi: "10.5067/GPM/IMERGDL/DAY/07" },
} as const;
export const ATTRIBUTION = "NASA GES DISC; Huffman, G.J.; Stocker, E.F.; Bolvin, D.T.; Nelkin, E.J.; Tan, J. GPM IMERG daily V07. See product DOI for citation.";
export const TIME_NOTE = "IMERG daily estimates use UTC days; POWER uses local solar (LST) days. Identical date labels are not aligned day-for-day. Multi-day totals and their difference are descriptive context, not equivalent observation intervals or field-level validation. Neither estimate is truth; disagreement can reflect day boundaries, grid support and retrieval methods. This evidence never changes Field Watch rule v2.";
export const shift = (day: string, n: number) => new Date(Date.parse(`${day}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
export function days(start: string, end: string): string[] {
  for (const d of [start, end]) if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d) throw new Error("Invalid ISO day");
  const n = Math.round((Date.parse(end) - Date.parse(start)) / 86400000) + 1;
  if (n < 1 || n > 16) throw new Error("IMERG window must be 1..16 days");
  return Array.from({ length: n }, (_, i) => shift(start, i));
}
export function gridPoint(lat: number, lon: number) {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || lat < -90 || lat >= 90 || lon < -180 || lon >= 180) throw new Error("Invalid coordinates");
  const yi = Math.floor((lat + 90) * 10), xi = Math.floor((lon + 180) * 10);
  return { lat: Number((-89.95 + yi * 0.1).toFixed(2)), lon: Number((-179.95 + xi * 0.1).toFixed(2)), yi, xi, key: `${yi}_${xi}`, resolution: "0.1° × 0.1°", support: "Grid-cell point estimate, not a field-area measurement" };
}
export interface Observation { date: string; mm: number | null; count: number; sourceUrl: string; revision: string; }
export interface Subset {
  schema: "soilsense.imerg-point/v1";
  product: (typeof PRODUCTS)[Stream];
  stream: Stream;
  grid: ReturnType<typeof gridPoint>;
  units: "mm/day";
  timeStandard: "UTC";
  retrievedAt: string;
  start: string;
  end: string;
  observations: Observation[];
  attribution: string;
  source: string;
}
export type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;
const pending = new Map<string, Promise<Subset>>();
const metadataPending = new Map<string, Promise<string>>();
async function metadata(env: Pick<Env, "DB" | "EARTHDATA_TOKEN">, base: string, stream: Stream, fetcher: Fetcher) {
  const key = `imerg-dmr:V07:dap4-qa2:${base}`;
  if (metadataPending.has(key)) return metadataPending.get(key)!;
  const run = cached(env.DB, key, stream === "final" ? 30 * 86400 : 3600, () => text(`${base}.dmr.xml`, env.EARTHDATA_TOKEN, fetcher)).then(r => r.value);
  metadataPending.set(key, run);
  try { return await run; } finally { metadataPending.delete(key); }
}

export function dapUrl(link: string): string {
  const u = new URL(link);
  if (u.protocol !== "https:" || u.hostname !== "opendap.earthdata.nasa.gov" || !u.pathname.startsWith("/collections/") || !u.pathname.includes("/granules/") || u.search || u.hash || u.username || u.password) throw new Error("Untrusted OPeNDAP link");
  return u.href;
}
// Authenticate redirects only to exact verified NASA hosts, never arbitrary CMR hosts.
const AUTH_HOSTS = new Set(["gpm1.gesdisc.eosdis.nasa.gov", "urs.earthdata.nasa.gov"]);
export function legacyBase(link: string, product: string, date: string): string {
  const cloud = dapUrl(link), file = decodeURIComponent(new URL(cloud).pathname.split("/").pop()!);
  const m = file.match(new RegExp(`^${product}\\.07:(3B-DAY(-L)?\\.MS\\.MRG\\.3IMERG\\.${date.replaceAll("-", "")}-S000000-E235959\\.V07[A-Z]\\.nc4)$`));
  if (!m || (product === "GPM_3IMERGDL") !== !!m[2]) throw new Error("Unexpected IMERG granule filename");
  return `https://gpm1.gesdisc.eosdis.nasa.gov/opendap/GPM_L3/${product}.07/${date.slice(0,4)}/${date.slice(5,7)}/${m[1]}`;
}
async function bytes(url: string, token: string | undefined, fetcher: Fetcher): Promise<Uint8Array> {
  let r: Response | undefined;
  for (let hop = 0; hop <= 4; hop++) {
    const u = new URL(url);
    if (token && (u.protocol !== "https:" || !AUTH_HOSTS.has(u.hostname) || u.username || u.password)) throw new Error("Untrusted Earthdata redirect");
    for (let attempt = 0; attempt < 2; attempt++) {
      r = undefined;
      try { r = await fetcher(url, { redirect: "manual", signal: AbortSignal.timeout(90000), headers: token ? { Authorization: `Bearer ${token}` } : {} }); }
      catch { if (attempt === 1) throw new Error(`Earthdata fetch timeout/network failure: ${u.hostname}${u.pathname}`); }
      if (r && ![429, 500, 502, 503, 504].includes(r.status)) break;
      if (attempt === 0) { await r?.body?.cancel(); r = undefined; await new Promise(resolve => setTimeout(resolve, 1000)); }
    }
    if (!r) throw new Error("Earthdata network unavailable");
    if (![301, 302, 303, 307, 308].includes(r.status)) break;
    const location = r.headers.get("Location"); await r.body?.cancel();
    if (!token || !location || hop === 4) throw new Error("Unsupported Earthdata redirect");
    url = new URL(location, url).href;
  }
  if (!r?.ok) throw new Error(`Earthdata request failed (HTTP ${r?.status}); access or product unavailable`);
  const reader = r.body?.getReader();
  if (!reader) throw new Error("Empty Earthdata response");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > 256000) throw new Error("Subset exceeds 256 KB limit"); chunks.push(value); } }
  finally { await reader.cancel(); }
  const data = new Uint8Array(size); let at = 0; for (const c of chunks) { data.set(c, at); at += c.byteLength; }
  return data;
}
async function text(url: string, token: string | undefined, fetcher: Fetcher): Promise<string> {
  return new TextDecoder().decode(await bytes(url, token, fetcher));
}
function attributeBlock(das: string, name: string): string {
  const b = das.match(new RegExp(`(?:^|\\n)\\s*${name}\\s*\\{([^}]*)\\}`));
  if (!b) throw new Error(`Missing ${name} metadata`);
  return b[1]!;
}
function scalar(ascii: string, name: string): number {
  // DAP2 ASCII arrays: a variable header followed by indexed rows, or a scalar comma value.
  const body = ascii.split(/-{5,}\s*\r?\n/).slice(1).join("\n");
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const m = body.match(new RegExp(`(?:^|\\n)${escaped}(?:\\.${escaped})?(?:\\[[^\\n]*|,)?[^\\n]*\\n((?:\\[[^\\]]*\\])+[, ]+)?\\s*([-+\\d.eE]+)`))
    ?? body.match(new RegExp(`(?:^|\\n)${escaped}(?:\\.${escaped})?,\\s*([-+\\d.eE]+)`));
  const v = Number(m?.[2] ?? m?.[1]);
  if (!m || !Number.isFinite(v)) throw new Error(`Missing point value ${name}`);
  return v;
}
export function pointConstraint(dds: string, grid: ReturnType<typeof gridPoint>): string {
  const projections = ["precipitation", "precipitation_cnt"].map((name) => {
    const declaration = dds.match(new RegExp(`(?:Float32|Float64|Int16|Int32|UInt16|UInt32)\\s+${name}((?:\\[[^\\]]+\\])+);`));
    if (!declaration) throw new Error(`Unsupported DAP declaration for ${name}`);
    const dims = [...declaration[1]!.matchAll(/\[(\w+)\s*=\s*(\d+)\]/g)];
    if (dims.length !== 3 || new Set(dims.map((d) => d[1])).size !== 3) throw new Error("Unsupported IMERG dimensions");
    return name + dims.map((d) => {
      const i = d[1] === "time" && Number(d[2]) === 1 ? 0 : d[1] === "lat" && Number(d[2]) === 1800 ? grid.yi : d[1] === "lon" && Number(d[2]) === 3600 ? grid.xi : -1;
      if (i < 0) throw new Error("Unexpected IMERG grid dimensions");
      return `[${i}:1:${i}]`;
    }).join("");
  });
  return [...projections, `lat[${grid.yi}:1:${grid.yi}]`, `lon[${grid.xi}:1:${grid.xi}]`, "time[0:1:0]"].join(",");
}
export function parsePoint(ascii: string, das: string, date: string, grid: ReturnType<typeof gridPoint>, sourceUrl: string, revision: string): Observation {
  const p = attributeBlock(das, "precipitation");
  if (!/String\s+units\s+"mm\/day"/.test(p)) throw new Error("Unexpected IMERG precipitation units");
  const fill = Number(p.match(/(?:Float32|Float64)\s+_FillValue\s+([-+\d.eE]+)/)?.[1]);
  if (!Number.isFinite(fill)) throw new Error("Missing IMERG fill metadata");
  const time = attributeBlock(das, "time").match(/String\s+units\s+"days since ([^\"]+)"/)?.[1];
  if (!time) throw new Error("Unknown IMERG time convention");
  const epoch = Date.parse(time);
  if (!Number.isFinite(epoch) || new Date(epoch + scalar(ascii, "time") * 86400000).toISOString().slice(0, 10) !== date) throw new Error("IMERG observation date mismatch");
  if (Math.abs(scalar(ascii, "lat") - grid.lat) > 0.001 || Math.abs(scalar(ascii, "lon") - grid.lon) > 0.001) throw new Error("IMERG grid mismatch");
  const value = scalar(ascii, "precipitation"), count = scalar(ascii, "precipitation_cnt");
  if (!Number.isInteger(count) || count < 0 || count > 48) throw new Error("Invalid half-hourly sample count");
  const mm = value === fill || count !== 48 ? null : value;
  if (mm !== null && (mm < 0 || mm > 2000)) throw new Error("Invalid precipitation range");
  return { date, mm, count, sourceUrl, revision };
}
export async function retrieveSubset(env: Pick<Env, "EARTHDATA_TOKEN" | "DB">, lat: number, lon: number, start: string, end: string, stream: Stream, fetcher: Fetcher = fetch): Promise<Subset> {
  const dates = days(start, end), grid = gridPoint(lat, lon), product = PRODUCTS[stream];
    const key = `imerg:V07:dap4-qa2:${stream}:${grid.key}:${start}:${end}`;
  if (pending.has(key)) return pending.get(key)!;
  const run = cached(env.DB, key, stream === "final" ? 30 * 86400 : 3600, async () => {
    if (!env.EARTHDATA_TOKEN) throw new Error("Optional IMERG unavailable: EARTHDATA_TOKEN is not configured");
    const q = new URLSearchParams({ short_name: product.shortName, version: "07", temporal: `${start}T00:00:00Z,${end}T23:59:59Z`, page_size: "20", sort_key: "start_date" });
    const cmr = JSON.parse(await text(`https://cmr.earthdata.nasa.gov/search/granules.json?${q}`, undefined, fetcher)) as { feed?: { entry?: { time_start?: string; time_end?: string; producer_granule_id?: string; updated?: string; links?: { href?: string; title?: string; inherited?: boolean }[] }[] } };
    const entries = cmr.feed?.entry;
    if (!Array.isArray(entries) || entries.length > 16) throw new Error("Unexpected CMR granule count");
    const observations: Observation[] = [];
    for (const date of dates) {
      const matches = entries.filter((e) => e.time_start?.slice(0, 10) === date);
      if (matches.length !== 1) throw new Error(`IMERG missing or ambiguous granule for ${date}`);
      const e = matches[0]!;
      if (!e.time_start?.endsWith("T00:00:00.000Z") && !e.time_start?.endsWith("T00:00:00Z")) throw new Error("IMERG day is not UTC midnight");
      const link = e.links?.find((l) => !l.inherited && l.href?.startsWith("https://opendap.earthdata.nasa.gov/") && /opendap/i.test(l.title ?? ""))?.href;
      if (!link) throw new Error("No Worker-compatible OPeNDAP service link in CMR");
      const base = legacyBase(link, product.shortName, date);
      const revision = e.producer_granule_id ?? decodeURIComponent(base.split("/").pop()!);
      const dayKey = `imerg-day:V07:dap4-qa2:${stream}:${grid.key}:${date}:${revision}`;
      const { value: observation } = await cached(env.DB, dayKey, stream === "final" ? 30 * 86400 : 3600, async () => {
        const dmr = await metadata(env, base, stream, fetcher);
        const url = `${base}.dap?dap4.ce=${encodeURIComponent(dap4Constraint(dmr, grid))}`;
        const data = await bytes(url, env.EARTHDATA_TOKEN, fetcher);
        return parseDap4(data, date, grid, url, revision);
      });
      observations.push(observation);
    }
    return { schema: "soilsense.imerg-point/v1", product, stream, grid, units: "mm/day", timeStandard: "UTC", start, end, observations, retrievedAt: new Date().toISOString(), attribution: ATTRIBUTION, source: `https://disc.gsfc.nasa.gov/datasets/${product.shortName}_07/summary` } satisfies Subset;
  }).then(({ value }) => value);
  pending.set(key, run);
  try { return await run; } finally { pending.delete(key); }
}
