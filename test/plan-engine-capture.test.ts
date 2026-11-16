// Opt-in public-source capture for reproducible local planner profiling. Never writes credentials.
import { readFileSync, writeFileSync } from "node:fs";
import { it } from "vitest";
import { parsePower, mergeDaymet } from "../src/engine/climate";
import { getDailyClimate } from "../src/worker/data/power";
import { getDaymet } from "../src/worker/data/daymet";
import { getSoil } from "../src/worker/data/soil";
import { getCropHistory } from "../src/worker/data/cdl";
import { getNassData } from "../src/worker/data/nass";
import { parseDaymetCsv } from "../src/worker/data/daymet";
it.skipIf(!process.env.PLAN_CAPTURE_DIR)("captures the real demo farm inputs", async () => {
  const key = /^NASS_API_KEY=(.+)$/m.exec(readFileSync(".dev.vars", "utf8"))?.[1]?.trim().replace(/^['"]|['"]$/g, "");
  const farms = [
    { name: "finney", lat: 38.1095, lon: -100.706, countyFips: "20055", stateCode: "KS", countyName: "Finney County", stateName: "Kansas" },
    { name: "story", lat: 42.0563, lon: -93.495, countyFips: "19169", stateCode: "IA", countyName: "Story County", stateName: "Iowa" },
    { name: "champaign", lat: 40.048, lon: -88.33, countyFips: "17019", stateCode: "IL", countyName: "Champaign County", stateName: "Illinois" },
    { name: "lancaster", lat: 40.73, lon: -96.55, countyFips: "31109", stateCode: "NE", countyName: "Lancaster County", stateName: "Nebraska" },
  ];
  await Promise.all(farms.map(async (f) => {
    const file = f.name === "finney" ? "finney-county-ks" : f.name === "story" ? "story-county-ia" : null;
    const [power, daymet, soil, cropHistory, nass] = await Promise.all([
      file ? Promise.resolve(parsePower(JSON.parse(readFileSync(`test/fixtures/power-${file}.json`, "utf8")))) : getDailyClimate(undefined, f.lat, f.lon, 1991, 2025),
      file ? Promise.resolve(parseDaymetCsv(readFileSync(`test/fixtures/daymet/daymet-${file}.csv`, "utf8"))) : getDaymet(undefined, f.lat, f.lon, 1991, 2025),
      getSoil(undefined, f.lat, f.lon), getCropHistory(undefined, f.lat, f.lon, 2025), getNassData(undefined, key, f, 2026),
    ]);
    const climate = daymet ? mergeDaymet(power, daymet).climate : power;
    writeFileSync(`${process.env.PLAN_CAPTURE_DIR}/plan-input-${f.name}.json`, JSON.stringify({ climate, soil, cropHistory, nass, county: f, request: { lat: f.lat, lon: f.lon, irrigated: true, priority: "balanced" }, planStartYear: 2027, now: "2026-11-15T22:00:00Z" }));
  }));
}, 240000);
