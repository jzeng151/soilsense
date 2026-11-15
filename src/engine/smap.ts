/** SMAP observed-state context only. Never imported into ranking or Field Watch rules. */
export interface SmapSample {
  time: string;
  surface: number | null;
  rootzone: number | null;
  quality: "accepted" | "excluded" | "unreviewed";
}
export const SMAP_SOURCE = {
  product: "SPL4SMGP", version: "008", doi: "10.5067/T5RUATAQREF8",
  url: "https://nsidc.org/data/spl4smgp/versions/8",
  attribution: "NASA / NSIDC DAAC, SMAP L4 science team",
  units: "m³/m³", spatial: "9 km EASE-Grid 2.0", temporal: "3-hour time averages",
  availableFrom: "2015-03-31", depths: "surface 0–5 cm; root zone 0–100 cm",
  meaning: "Assimilated/model-derived regional soil moisture, not an in-field sensor or a counterfactual rotation response.",
} as const;
const STEP = 3 * 3600_000;
const mean = (a: number[]) => a.reduce((x,y) => x+y,0)/a.length;
export interface SmapQuantity {
  mean: number | null; anomaly: number | null; percentile: number | null;
  count: number; expected: number; baseline: { year: number; mean: number; count: number }[]; note: string;
}
export function summarizeSmap(samples: SmapSample[], year: number, start: string, end: string, baselineYears: number[]) {
  // Same within-year UTC month/day window in each year; no leap-day remapping or crossing New Year.
  function bounds(y: number) {
    const a = `${y}-${start}`, b = `${y}-${end}`;
    const from = Date.parse(`${a}T00:00:00Z`), through = Date.parse(`${b}T00:00:00Z`);
    if (!/^\d{2}-\d{2}$/.test(start) || !/^\d{2}-\d{2}$/.test(end) || !Number.isInteger(y) || y < 1900 || y > 2200 || !Number.isFinite(from) || !Number.isFinite(through) || new Date(from).toISOString().slice(0,10) !== a || new Date(through).toISOString().slice(0,10) !== b || through < from) throw new Error("Use a valid within-year month/day window");
    return {from, until: through + 86400_000};
  }
  function window(y: number, quantity: "surface" | "rootzone") {
    const {from,until} = bounds(y), expected = (until-from)/STEP;
    const bins = new Map<number, number | null>();
    for (const s of samples) {
      const t = Date.parse(s.time);
      if (t < from || t >= until || !Number.isFinite(t)) continue;
      // Native L4 average timestamps are at 01:30,04:30,... UTC. Do not fill gaps/interpolate.
      if ((t-from-STEP/2)%STEP !== 0) continue;
      const v = s[quantity];
      const valid = y >= 2015 && s.time.slice(0,10) >= SMAP_SOURCE.availableFrom && s.quality === "accepted" && typeof v === "number" && Number.isFinite(v) && v >= 0 && v <= 1;
      bins.set(t, bins.has(t) ? null : valid ? v : null); // duplicate/conflicting granules invalidate the slot
    }
    const values = [...bins.values()].filter((v): v is number => v !== null);
    return {mean: values.length === expected ? mean(values) : null, count: values.length, expected};
  }
  const result = (quantity: "surface" | "rootzone"): SmapQuantity => {
    const current = window(year,quantity);
    const baseline = [...new Set(baselineYears)].sort((a,b)=>a-b).filter(y=>y!==year && y>=2015).flatMap(y=>{
      // Invalid calendar matches (e.g. Feb 29 in non-leap years) are absent, not shifted.
      try { const w=window(y,quantity); return w.mean === null ? [] : [{year:y,mean:w.mean,count:w.count}]; } catch { return []; }
    });
    const adequate = baseline.length >= 10; // demonstration coverage policy, not a climatological normal
    const anomaly = current.mean !== null && adequate ? current.mean - mean(baseline.map(x=>x.mean)) : null;
    const percentile = current.mean !== null && adequate ? 100 * baseline.reduce((n,b)=>n+(b.mean<current.mean! ? 1 : b.mean===current.mean ? .5 : 0),0)/baseline.length : null;
    return {...current,baseline,anomaly,percentile,note: "Requires every native 3-hour slot and at least 10 complete other seasonal years (demonstration coverage policy). Replay year excluded; missing, unreviewed QA and duplicates excluded. Short record is not a 30-year normal; no stress threshold applied."};
  };
  return {year,start,end,baselineYears:[...new Set(baselineYears)].sort((a,b)=>a-b),source: SMAP_SOURCE,surface:result("surface"),rootzone:result("rootzone")};
}
