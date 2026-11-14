// OUT-OF-SAMPLE validation: counties never used while building or tuning the model.
// The model is frozen; this test only measures. Opt-in (network + NASS key):
//   LIVE_OOS=1 npx vitest run test/out-of-sample.test.ts
// Results are written to docs/validation/out-of-sample.json and printed as a table.
//
// Pre-registered before running (2026-11-14): counties below, crops corn/soybean/winter wheat/sorghum where USDA
// has >= 12 years, rain-fed series preferred, ensemble weather (NASA POWER + Daymet) as shipped, the same
// "usual previous crop" rule as the app. Baseline to beat: season rainfall alone.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeDaymet, rainMm, type DailyClimate } from "../src/engine/climate";
import { CROPS } from "../src/engine/crops";
import { usualPreviousCrop } from "../src/engine/plan";
import { FALLOW_MAX_ANNUAL_RAIN_MM } from "../src/engine/regions";
import { buildWaterContext, makeReplay, meanAnnualRainMm } from "../src/engine/rotation";
import { usdaInputs } from "../src/engine/usda";
import { pearson, validateCrop } from "../src/engine/validate";
import type { CropId, YieldRecord } from "../src/shared/types";
import { getDaymet } from "../src/worker/data/daymet";
import { getCounty } from "../src/worker/data/geo";
import { getNassData } from "../src/worker/data/nass";
import { getDailyClimate } from "../src/worker/data/power";
import { getSoil } from "../src/worker/data/soil";

const key = process.env.NASS_API_KEY ?? (existsSync(".dev.vars") ? /^NASS_API_KEY=(.+)$/m.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim() : undefined);
const live = process.env.LIVE_OOS === "1" && !!key;

// Rural cropland points. None of these counties was used to build or tune the model.
const SITES = [
  { region: "High Plains (dry)", label: "Perkins Co., NE", lat: 40.86, lon: -101.62 },
  { region: "High Plains (dry)", label: "Kit Carson Co., CO", lat: 39.27, lon: -102.48 },
  { region: "High Plains (dry)", label: "Thomas Co., KS", lat: 39.45, lon: -101.15 },
  { region: "Northern Plains", label: "Sully Co., SD", lat: 44.72, lon: -100.05 },
  { region: "Southern Plains", label: "Garfield Co., OK", lat: 36.43, lon: -97.95 },
  { region: "Central Plains", label: "Saline Co., KS", lat: 38.86, lon: -97.75 },
  { region: "Central Plains", label: "Sumner Co., KS", lat: 37.25, lon: -97.45 },
  { region: "Corn Belt", label: "Sioux Co., IA", lat: 43.05, lon: -96.1 },
  { region: "Corn Belt", label: "McLean Co., IL", lat: 40.52, lon: -88.75 },
  { region: "Corn Belt", label: "Tippecanoe Co., IN", lat: 40.33, lon: -86.98 },
  { region: "Corn Belt", label: "Blue Earth Co., MN", lat: 44.05, lon: -94.1 },
  { region: "Eastern Corn Belt", label: "Wood Co., OH", lat: 41.36, lon: -83.62 },
  { region: "Lower Midwest", label: "Saline Co., MO", lat: 39.15, lon: -93.2 },
];
const CROPS_TESTED: CropId[] = ["corn", "soybean", "winter_wheat", "sorghum"];

interface Row {
  region: string;
  county: string;
  crop: string;
  series: string;
  years: number;
  r: number;
  rainOnlyR: number;
  sameDirection: string;
  worstFlagged: number;
}

function rainOnly(climate: DailyClimate, crop: CropId, records: YieldRecord[]): number | null {
  const byYear = new Map(records.map((r) => [r.year, r.value]));
  const ys = climate.years.filter((y) => byYear.has(y.year));
  if (ys.length < 12) return null;
  const x = ys.map((y) => y.year);
  const actual = x.map((y) => byYear.get(y) as number);
  // Same detrending as the model check: departures from the yield trend line.
  const n = x.length;
  const mx = x.reduce((a, b) => a + b, 0) / n;
  const my = actual.reduce((a, b) => a + b, 0) / n;
  const b = x.reduce((a, xi, i) => a + (xi - mx) * ((actual[i] as number) - my), 0) / x.reduce((a, xi) => a + (xi - mx) ** 2, 0);
  const dev = actual.map((v, i) => v / (my + b * ((x[i] as number) - mx)) - 1);
  const rain = ys.map((y) => rainMm(y, CROPS[crop].season));
  return pearson(dev, rain);
}

describe.skipIf(!live)("out-of-sample validation (new counties)", () => {
  it("measures the frozen model on counties it was never tuned on", async () => {
    const rows: Row[] = [];
    const failures: string[] = [];
    for (const s of SITES) {
      try {
        const [power, daymet, soil, county] = await Promise.all([
          getDailyClimate(undefined, s.lat, s.lon, 1991, 2025),
          getDaymet(undefined, s.lat, s.lon, 1991, 2025),
          getSoil(undefined, s.lat, s.lon),
          getCounty(undefined, s.lat, s.lon),
        ]);
        const climate = daymet ? mergeDaymet(power, daymet).climate : power;
        const nass = await getNassData(undefined, key, county, 2026);
        if (!nass) throw new Error("no NASS data");
        const series = usdaInputs(nass, false, 2026).validation;
        const dry = meanAnnualRainMm(buildWaterContext(climate, soil, false)) < FALLOW_MAX_ANNUAL_RAIN_MM;
        const replay = makeReplay(climate, soil, false);
        for (const crop of CROPS_TESTED) {
          const sr = series[crop];
          if (!sr) continue;
          const prev = usualPreviousCrop(crop, dry);
          const v = validateCrop(crop, prev, replay(crop, prev), sr.records, { practice: sr.practice, area: sr.area });
          if (!v) continue;
          rows.push({
            region: s.region,
            county: `${county?.countyName ?? s.label}, ${county?.stateCode ?? ""}`,
            crop: CROPS[crop].name,
            series: `${sr.practice}${sr.area === "county" ? "" : ` (${sr.area} district)`}`,
            years: v.years.length,
            r: v.correlation,
            rainOnlyR: Math.round((rainOnly(climate, crop, sr.records) ?? NaN) * 100) / 100,
            sameDirection: `${v.sameDirection}/${v.years.length}`,
            worstFlagged: v.worstYearsFlagged,
          });
        }
      } catch (err) {
        failures.push(`${s.label}: ${String(err)}`);
      }
    }

    const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : NaN);
    const byRegion = new Map<string, Row[]>();
    for (const r of rows) byRegion.set(r.region, [...(byRegion.get(r.region) ?? []), r]);
    const lines = rows.map(
      (r) =>
        `${r.region.padEnd(18)} ${r.county.padEnd(24)} ${r.crop.padEnd(14)} ${r.series.padEnd(26)} ${String(r.years).padStart(3)}y  model r=${r.r.toFixed(2).padStart(5)}  rain-only r=${(Number.isFinite(r.rainOnlyR) ? r.rainOnlyR.toFixed(2) : "  -  ").padStart(5)}  same ${r.sameDirection.padStart(5)}  worst ${r.worstFlagged}/5`,
    );
    const summary = {
      cases: rows.length,
      meanR: Math.round(mean(rows.map((r) => r.r)) * 100) / 100,
      meanRainOnlyR: Math.round(mean(rows.filter((r) => Number.isFinite(r.rainOnlyR)).map((r) => r.rainOnlyR)) * 100) / 100,
      modelBeatsRainOnly: rows.filter((r) => Number.isFinite(r.rainOnlyR) && r.r > r.rainOnlyR).length,
      positiveR: rows.filter((r) => r.r > 0).length,
      worstFlaggedAvg: Math.round(mean(rows.map((r) => r.worstFlagged)) * 10) / 10,
      byRegion: Object.fromEntries([...byRegion].map(([k, v]) => [k, { cases: v.length, meanR: Math.round(mean(v.map((r) => r.r)) * 100) / 100 }])),
      byCrop: Object.fromEntries(
        [...new Set(rows.map((r) => r.crop))].map((c) => [c, { cases: rows.filter((r) => r.crop === c).length, meanR: Math.round(mean(rows.filter((r) => r.crop === c).map((r) => r.r)) * 100) / 100 }]),
      ),
      failures,
    };
    console.log(["", "OUT-OF-SAMPLE: model replay vs USDA harvests (counties never used for tuning)", ...lines, JSON.stringify(summary, null, 1)].join("\n"));
    mkdirSync("docs/validation", { recursive: true });
    writeFileSync("docs/validation/out-of-sample.json", JSON.stringify({ ranAt: new Date().toISOString(), sites: SITES, rows, summary }, null, 1));
    expect(rows.length).toBeGreaterThan(10);
  }, 900000);
});
