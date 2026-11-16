// USDA NASS Cropland Data Layer (CropScape) point lookups: what grew on this pixel each year.
// Service docs: https://nassgeodata.gmu.edu/CropScape/devhelp/help.html

import { CDL_NAMES, CDL_TO_CROP } from "../../engine/crops";
import type { CropHistory, CropHistoryYear } from "../../shared/types";
import { cached, DAY_SECONDS } from "../lib/cache";
import { csbCropHistory } from "./cdl-csb";
import { toConusAlbers } from "./albers";

const SOURCE = "USDA NASS Cropland Data Layer (30 m)";
/** Remember recent failures briefly so one outage doesn't add a timeout to every request. */
const recentFailures = new Map<string, number>();
const FAILURE_TTL_MS = 10 * 60 * 1000;

/** Parse the CropScape GetCDLValue response, e.g. `{x: 1, y: 2, value: 1, category: "Corn", color: "#ffd300"}`. */
export function parseCdlValue(text: string): { code: number; name: string } | null {
  const v = /value\s*:\s*"?(\d+)"?/i.exec(text);
  if (!v?.[1]) return null;
  const code = Number(v[1]);
  const c = /category\s*:\s*"([^"]*)"/i.exec(text);
  return { code, name: c?.[1] || CDL_NAMES[code] || `Class ${code}` };
}

export async function getCropHistory(
  db: D1Database | undefined,
  lat: number,
  lon: number,
  lastYear: number,
  yearsBack = 10,
): Promise<CropHistory> {
  const { x, y } = toConusAlbers(lat, lon);
  const key = `cdl:v2:${lat.toFixed(5)}:${lon.toFixed(5)}:${lastYear}:${yearsBack}`;
  try {
    const { value } = await cached(db, key, 180 * DAY_SECONDS, async () => {
      // Healthy caches win over outage suppression; a failed point cannot poison other fields.
      const failedAt = recentFailures.get(key);
      if (failedAt !== undefined && Date.now() - failedAt < FAILURE_TTL_MS) throw new Error("CDL point retry cooldown");
      recentFailures.delete(key);
      const years = Array.from({ length: yearsBack }, (_, i) => lastYear - yearsBack + 1 + i);
      const results = await Promise.all(
        years.map(async (year): Promise<CropHistoryYear | null> => {
          try {
            const url = `https://nassgeodata.gmu.edu/axis2/services/CDLService/GetCDLValue?year=${year}&x=${x.toFixed(2)}&y=${y.toFixed(2)}`;
            const parsed = parseCdlValue(await cdlText(url));
            if (!parsed) return null;
            return { year, cdlCode: parsed.code, cdlName: parsed.name, crop: CDL_TO_CROP[parsed.code] ?? null };
          } catch {
            return null;
          }
        }),
      );
      const found = results.filter((r): r is CropHistoryYear => r !== null);
      if (found.length === 0) {
        if (recentFailures.size >= 200) recentFailures.delete(recentFailures.keys().next().value!);
        recentFailures.set(key, Date.now());
        throw new Error("no CDL years returned");
      }
      const history = { available: true, source: SOURCE, years: found } satisfies CropHistory;
      // Never persist missing years for 180 days. Partial live observations remain usable, but retry next time.
      if (found.length < years.length) throw new PartialHistory({ ...history, note: `Partial live CDL history: ${found.length} of ${years.length} requested years returned. Missing years are unknown; retry to retrieve them.` });
      return history;
    }).catch((err: unknown) => {
      if (err instanceof PartialHistory) return { value: err.history, cache: "miss" as const };
      throw err;
    });
    const cropland = value.years.filter((y) => y.crop !== null).length;
    if (cropland === 0)
      return { ...value, note: "This point is not mapped as row-crop land. Pick a point inside a field, or tell us your recent crops." };
    return value;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "CDL lookup failed", err: String(err) }));
    return csbCropHistory(lat, lon, lastYear, yearsBack) ?? unavailable();
  }
}

class PartialHistory extends Error {
  constructor(public readonly history: CropHistory) {
    super("partial CDL history");
  }
}

function unavailable(): CropHistory {
  return {
    available: false,
    source: SOURCE,
    years: [],
    note: "Satellite crop history is unavailable right now. Tell us your last two crops instead.",
  };
}

/** Bound the entire body, not only headers. One retry, at most 40 seconds for a cold year. */
async function cdlText(url: string): Promise<string> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 20_000);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) throw new Error(`CropScape HTTP ${response.status}`);
      return await response.text();
    } catch (error) {
      if (attempt === 1) throw error;
    } finally {
      clearTimeout(timer);
    }
  }
}
