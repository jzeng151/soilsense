// Backtest: run both Field Watch rules over 9 Kansas district points for every USDM week 2015-2025.
// Mine: C:/Users/steve/Projects/soilsense working tree (uncommitted rainfallRule.ts).
// Tunk's: snapshot of origin/main src/worker/fieldwatch/rule.ts, called exactly as run.ts does live
// (history = 1991..year-1, today = USDM map date, no Kansas signal).
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { parsePower as parseMine } from "C:/Users/steve/Projects/soilsense/src/engine/climate";
import { evaluateRainfallRule } from "C:/Users/steve/Projects/soilsense/src/engine/rainfallRule";
import { parsePower as parseMain } from "./mainsnap/src/engine/climate";
import { evaluateField, type DayMap } from "./mainsnap/src/worker/fieldwatch/rule";

const B = "C:/Users/steve/AppData/Local/hermes/profiles/renshuu/cache/scratch/backtest";
const POINTS: Record<string, [number, number]> = {
  ks_central: [38.6, -98.3], ks_east_central: [38.6, -95.6], ks_north_central: [39.5, -98.3],
  ks_northeast: [39.5, -95.6], ks_northwest: [39.5, -100.9], ks_south_central: [37.6, -98.3],
  ks_southeast: [37.5, -95.4], ks_southwest: [37.6, -100.9], ks_west_central: [38.6, -100.9],
};

it("backtest", { timeout: 600_000 }, () => {
  const weeks = readFileSync(`${B}/usdm_district_weekly.csv`, "utf8").trim().split(/\r?\n/).slice(1)
    .map((l) => l.split(","))
    .filter(([, w]) => w! >= "2015-01-01" && w! <= "2025-12-31");
  const rows: unknown[] = [];
  for (const district of Object.keys(POINTS)) {
    const json = JSON.parse(readFileSync(`${B}/power/${district}.json`, "utf8"));
    const mine = parseMine(json);
    const main = parseMain(json);
    const map: DayMap = new Map();
    for (const ys of main.years) for (const d of ys.days)
      map.set(`${ys.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, { prcp: d.prcp, tmax: d.tmax, tmin: d.tmin, gwetroot: d.gwetroot });
    const [lat] = POINTS[district]!;
    for (const [d, week, , d1] of weeks) {
      if (d !== district) continue;
      const year = Number(week!.slice(0, 4));
      const end = new Date(Date.parse(`${week}T00:00:00Z`) - 86_400_000).toISOString().slice(0, 10);
      const a = evaluateRainfallRule(mine, end);
      const t = evaluateField({ fieldName: district, lat, today: week!, recent: map, history: map, historyYears: { first: 1991, last: year - 1 }, kansas: null });
      rows.push({
        district, week, end, d1: Number(d1),
        mine_status: a.status,
        mine_pct: a.status === "insufficient_data" ? null : a.percentOfBaseline,
        mine_rankfrac: a.status === "insufficient_data" ? null : a.baselineYearsAsDryOrDrier / a.baselineYears.length,
        tunk_status: t.status, tunk_end: t.metrics.dataThrough,
        tunk_rainpct: t.metrics.rainPercentile, tunk_rootpct: t.metrics.rootzonePercentile, tunk_balance: t.metrics.balance14Mm,
      });
    }
  }
  writeFileSync(`${B}/rows.json`, JSON.stringify(rows));
  console.log("rows", rows.length);
});
