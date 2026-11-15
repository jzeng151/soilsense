// Inputs for testing the proposed fixes: rain, root-zone and water-balance ranks against a FIXED
// 1991-2020 comparison period (checked year left out), using Tunk's own helpers from origin/main.
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { et0HargreavesMm, parsePower } from "./mainsnap/src/engine/climate";
import { percentileRank } from "./mainsnap/src/worker/fieldwatch/rule";

const B = "C:/Users/steve/AppData/Local/hermes/profiles/renshuu/cache/scratch/backtest";
const LAT: Record<string, number> = {
  ks_central: 38.6, ks_east_central: 38.6, ks_north_central: 39.5, ks_northeast: 39.5, ks_northwest: 39.5,
  ks_south_central: 37.6, ks_southeast: 37.5, ks_southwest: 37.6, ks_west_central: 38.6,
};
type Day = { prcp: number | null; tmax: number | null; tmin: number | null; gwetroot: number | null };
const iso = (t: number) => new Date(t).toISOString().slice(0, 10);
const DAY = 86_400_000;
const dates = (end: string, n: number) => Array.from({ length: n }, (_, i) => iso(Date.parse(`${end}T00:00:00Z`) - (n - 1 - i) * DAY));
const shift = (d: string, y: number) => {
  const md = d.slice(5);
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
  return md === "02-29" && !leap ? `${y}-02-28` : `${y}-${md}`;
};
const doy = (d: string) => Math.round((Date.parse(`${d}T00:00:00Z`) - Date.UTC(Number(d.slice(0, 4)), 0, 1)) / DAY) + 1;

it("fix inputs", { timeout: 600_000 }, () => {
  const rows = JSON.parse(readFileSync(`${B}/rows.json`, "utf8")) as { district: string; week: string; end: string }[];
  const out: unknown[] = [];
  const cache: Record<string, Map<string, Day>> = {};
  for (const r of rows) {
    if (!cache[r.district]) {
      const c = parsePower(JSON.parse(readFileSync(`${B}/power/${r.district}.json`, "utf8")));
      const m = new Map<string, Day>();
      for (const ys of c.years) for (const d of ys.days)
        m.set(`${ys.year}-${String(d.month).padStart(2, "0")}-${String(d.day).padStart(2, "0")}`, { prcp: d.prcp, tmax: d.tmax, tmin: d.tmin, gwetroot: d.gwetroot });
      cache[r.district] = m;
    }
    const m = cache[r.district]!;
    const lat = LAT[r.district]!;
    const y0 = Number(r.end.slice(0, 4));
    const w14 = dates(r.end, 14);
    const w7 = dates(r.end, 7);
    const vals = (ds: string[]) => {
      const days = ds.map((d) => m.get(d));
      if (days.some((d) => !d || d.prcp === null || d.tmax === null || d.tmin === null)) return null;
      const rain = days.reduce((a, d) => a + d!.prcp!, 0);
      const et0 = et0HargreavesMm({ year: 0, days: ds.map((d, i) => ({ doy: doy(d), month: Number(d.slice(5, 7)), day: Number(d.slice(8, 10)), prcp: days[i]!.prcp, tmax: days[i]!.tmax, tmin: days[i]!.tmin, t2m: null, gwetroot: null })) }, { from: [1, 1], to: [12, 31] }, lat);
      return { rain, bal: rain - et0 };
    };
    const root = (ds: string[]) => {
      const v = ds.map((d) => m.get(d)?.gwetroot);
      return v.every((x) => typeof x === "number") ? (v as number[]).reduce((a, b) => a + b, 0) / v.length : null;
    };
    const now = vals(w14);
    const rootNow = root(w7);
    const pastRain: number[] = [], pastBal: number[] = [], pastRoot: number[] = [];
    for (let y = 1991; y <= 2020; y++) {
      if (y === y0) continue;
      const p = vals(w14.map((d) => shift(d, y + (Number(d.slice(0, 4)) - y0))));
      if (p) { pastRain.push(p.rain); pastBal.push(p.bal); }
      const pr = root(w7.map((d) => shift(d, y + (Number(d.slice(0, 4)) - y0))));
      if (pr !== null) pastRoot.push(pr);
    }
    out.push({
      district: r.district, week: r.week,
      rainPct: now && pastRain.length >= 20 ? percentileRank(pastRain, now.rain) : null,
      balPct: now && pastBal.length >= 20 ? percentileRank(pastBal, now.bal) : null,
      balMm: now ? Math.round(now.bal * 10) / 10 : null,
      rootPct: rootNow !== null && pastRoot.length >= 20 ? percentileRank(pastRoot, rootNow) : null,
    });
  }
  writeFileSync(`${B}/fixrows.json`, JSON.stringify(out));
  console.log("rows", out.length);
});
