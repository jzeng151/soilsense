// Opt-in integration test: calls the real USDA NASS Quick Stats API, then builds plans with that data.
// Skipped by default (needs network and a key). Run with:  LIVE_NASS=1 npx vitest run test/live-nass.test.ts
// The key is read from NASS_API_KEY or from .dev.vars.
import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { buildPlan } from "../src/engine/plan";
import { getNassData } from "../src/worker/data/nass";
import type { CountyInfo, CropId, SoilProfile } from "../src/shared/types";

const key = process.env.NASS_API_KEY ?? (existsSync(".dev.vars") ? /^NASS_API_KEY=(.+)$/m.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim() : undefined);
const live = process.env.LIVE_NASS === "1" && !!key;
const load = (f: string) => parsePower(JSON.parse(readFileSync(new URL(`./fixtures/${f}`, import.meta.url), "utf8")) as PowerResponse);
const now = new Date("2026-11-14T17:00:00Z");
const story: CountyInfo = { countyFips: "19169", countyName: "Story County", stateCode: "IA", stateName: "Iowa" };
const finney: CountyInfo = { countyFips: "20055", countyName: "Finney County", stateCode: "KS", stateName: "Kansas" };
const iaSoil: SoilProfile = { available: true, source: "", drainageClass: "Well drained", awc: 0.19, profileDepthCm: 152, ph: 6.2 };
const ksSoil: SoilProfile = { available: true, source: "", drainageClass: "Well drained", awc: 0.21, profileDepthCm: 200, ph: 7.3 };

describe.skipIf(!live)("live USDA NASS", () => {
  it("returns county yields by practice, the district, and current prices", async () => {
    const n = (await getNassData(undefined, key, finney, 2026))!;
    console.log(`## errors=${JSON.stringify(n.errors)} district=${n.districtName}`);
    for (const [c, s] of Object.entries(n.county)) console.log(`## county ${c}: all ${s!.all.length} irr ${s!.irrigated.length} dry ${s!.nonIrrigated.length}`);
    for (const [c, p] of Object.entries(n.prices)) console.log(`## price ${c}: ${p!.price} ${p!.unit} ${p!.level} ${p!.months}m to ${p!.through}`);
    expect(n.errors).toEqual([]);
    expect(n.county.winter_wheat?.nonIrrigated.length).toBeGreaterThanOrEqual(12);
    expect(n.prices.winter_wheat?.price).toBeGreaterThan(2);
    expect(n.prices.sorghum?.price).toBeLessThan(10); // converted from $/cwt to $/bu
  }, 120000);

  for (const c of [
    { name: "Story", county: story, file: "power-story-county-ia.json", soil: iaSoil, recent: ["soybean", "corn"] as CropId[], crop: "corn" as CropId, minCorrelation: 0.1 },
    { name: "Finney", county: finney, file: "power-finney-county-ks.json", soil: ksSoil, recent: ["winter_wheat", "winter_wheat"] as CropId[], crop: "winter_wheat" as CropId, minCorrelation: 0.5 },
  ]) {
    it(`${c.name}: model replay vs real harvests, with USDA prices`, async () => {
      const nass = await getNassData(undefined, key, c.county, 2026);
      const p = buildPlan({ request: { lat: 40, lon: -95, irrigated: false, priority: "balanced", recentCrops: c.recent }, climate: load(c.file), soil: c.soil, cropHistory: { available: false, source: "", years: [] }, county: c.county, nass, planStartYear: 2027, now });
      console.log(`## ${c.name} top: ${p.plans[0]!.years.map((y) => `${y.cropName} ${y.expectedYield}`).join(", ")} net=$${p.plans[0]!.avgNetReturnPerAcre}`);
      if (p.currentPractice) console.log(`## ${c.name} now: ${p.currentPractice.years.map((y) => `${y.cropName} ${y.expectedYield}`).join(", ")} net=$${p.currentPractice.avgNetReturnPerAcre}`);
      for (const a of p.assumptions.filter((x) => /yield basis|Prices/.test(x))) console.log(`## ${c.name} ${a}`);
      for (const v of p.validation ?? []) console.log(`## ${c.name} CHECK ${v.cropName} (${v.practice}, ${v.area}): ${v.years.length} yrs r=${v.correlation} same ${v.sameDirection}/${v.years.length} worst ${v.worstYearsFlagged}/5`);
      const v = p.validation?.find((x) => x.crop === c.crop);
      expect(v).toBeDefined();
      expect(v!.correlation).toBeGreaterThan(c.minCorrelation);
    }, 120000);
  }

  // A pivot-irrigated Kansas field (corn then soybean on the satellite map) planned as rain-fed.
  it("never recommends a plan that is both less profitable and less dependable than the current one", async () => {
    const nass = await getNassData(undefined, key, finney, 2026);
    const p = buildPlan({ request: { lat: 38.11, lon: -100.71, irrigated: false, priority: "balanced", recentCrops: ["corn", "soybean"] }, climate: load("power-finney-county-ks.json"), soil: ksSoil, cropHistory: { available: false, source: "", years: [] }, county: finney, nass, planStartYear: 2027, now });
    const best = p.plans[0]!;
    const cur = p.currentPractice!;
    for (const r of [best, cur]) console.log(`## ${r.label}: net=$${r.avgNetReturnPerAcre} reliability=${r.scores.reliability}`);
    if (best.avgNetReturnPerAcre < cur.avgNetReturnPerAcre) expect(best.scores.reliability).toBeGreaterThan(cur.scores.reliability);
  }, 120000);

  it("an irrigated field is calibrated to irrigated yields", async () => {
    const nass = await getNassData(undefined, key, finney, 2026);
    const p = buildPlan({ request: { lat: 38.11, lon: -100.71, irrigated: true, priority: "balanced", recentCrops: ["corn", "corn"] }, climate: load("power-finney-county-ks.json"), soil: ksSoil, cropHistory: { available: false, source: "", years: [] }, county: finney, nass, planStartYear: 2027, now });
    const corn = [...p.plans, p.currentPractice!].flatMap((r) => r.years).filter((y) => y.crop === "corn").map((y) => y.expectedYield);
    console.log(`## irrigated corn yields: ${corn.join(", ")}; ${p.assumptions.find((a) => a.startsWith("Corn yield basis"))}`);
    expect(Math.max(...corn)).toBeGreaterThan(175);
  }, 120000);
});

// Opt-in: NASA Daymet live (LIVE_NASS=1 also enables this; it needs no key).
import { getDaymet } from "../src/worker/data/daymet";
import { mergeDaymet } from "../src/engine/climate";
describe.skipIf(process.env.LIVE_NASS !== "1")("live NASA Daymet", () => {
  it("returns 1991-2025 daily weather and merges with NASA POWER", async () => {
    const days = await getDaymet(undefined, 38.1095, -100.706, 1991, 2025);
    expect(days).not.toBeNull();
    expect(days!.length).toBe(35 * 365);
    const power = load("power-finney-county-ks.json");
    const m = mergeDaymet(power, days!);
    console.log(`## daymet days=${days!.length} replaced=${m.replaced} source=${m.climate.weatherSource}`);
    expect(m.replaced).toBeGreaterThan(12000);
  }, 120000);
});

// Opt-in: OpenET water check, end to end (LIVE_NASS=1 and OPENET_API_KEY in env or .dev.vars).
import { getOpenEt } from "../src/worker/data/openet";
import { getCropHistory } from "../src/worker/data/cdl";
const openEtKey = process.env.OPENET_API_KEY ?? (existsSync(".dev.vars") ? /^OPENET_API_KEY=(.+)$/m.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim() : undefined);
describe.skipIf(process.env.LIVE_NASS !== "1" || !openEtKey)("live OpenET water check", () => {
  for (const f of [
    { name: "Finney KS", lat: 38.1095, lon: -100.706, file: "power-finney-county-ks.json", soil: ksSoil, county: finney, irrigated: true },
    { name: "Story IA", lat: 42.0563, lon: -93.495, file: "power-story-county-ia.json", soil: iaSoil, county: story, irrigated: false },
  ]) {
    it(`${f.name}: model water use vs OpenET`, async () => {
      const [history, et] = await Promise.all([getCropHistory(undefined, f.lat, f.lon, 2025), getOpenEt(undefined, openEtKey, f.lat, f.lon, 2025)]);
      console.log(`## ${f.name} CDL ${history.years.map((y) => `${y.year}:${y.crop ?? y.cdlName}`).join(" ")} | OpenET months ${et?.length}`);
      const p = buildPlan({ request: { lat: f.lat, lon: f.lon, irrigated: f.irrigated, priority: "balanced" }, climate: load(f.file), soil: f.soil, cropHistory: history, county: f.county, openEt: et, planStartYear: 2027, now });
      const w = p.waterCheck;
      console.log(`## ${f.name} waterCheck ${w ? `r=${w.correlation} ratio=${w.ratio} :: ${w.years.map((y, i) => `${y} ${w.crops[i]} OpenET ${w.measured[i]} model ${w.modeled[i]}`).join(" | ")}` : "none"}`);
      expect(et?.length).toBeGreaterThan(100);
    }, 180000);
  }
});

// Opt-in: the whole server path (makePlan) with every live source at once.
import { makePlan } from "../src/worker/service";
describe.skipIf(process.env.LIVE_NASS !== "1")("live makePlan with all sources", () => {
  it("Finney KS rain-fed: Daymet + POWER, NASS, RMA, OpenET together", async () => {
    // Serve the shipped static loss files the way the Worker's ASSETS binding does.
    const assets = { fetch: async (req: Request) => { const p = new URL(req.url).pathname; try { return new Response(readFileSync(new URL(`../web/public${p}`, import.meta.url))); } catch { return new Response("", { status: 404 }); } } } as unknown as Fetcher;
    const env = { NASS_API_KEY: key, OPENET_API_KEY: openEtKey, ASSETS: assets } as never;
    const t0 = Date.now();
    const p = await makePlan(env, { lat: 38.1095, lon: -100.706, irrigated: false, priority: "balanced" }, { now });
    console.log(`## makePlan ${Date.now() - t0} ms | weather: ${p.climate.source}`);
    console.log(`## top: ${p.plans[0]!.years.map((y) => `${y.cropName} ${y.expectedYield}`).join(", ")} net=$${p.plans[0]!.avgNetReturnPerAcre}`);
    console.log(`## validation: ${(p.validation ?? []).map((v) => `${v.cropName} r=${v.correlation} worst=${v.worstYears.map((w) => `${w.year}:${w.cause ?? "-"}`).join(",")}`).join(" | ")}`);
    console.log(`## water: ${p.waterCheck ? `r=${p.waterCheck.correlation} ratio=${p.waterCheck.ratio} n=${p.waterCheck.years.length}` : "none"}`);
    console.log(`## loss facts: ${p.facts.filter((f) => f.id.startsWith("losses-")).map((f) => f.text).join(" / ")}`);
    expect(p.climate.source).toContain("Daymet");
    expect(p.validation?.length).toBeGreaterThan(0);
    expect(p.facts.some((f) => f.id.startsWith("losses-"))).toBe(true);
  }, 240000);
});
