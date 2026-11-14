// Accuracy check, fully offline and repeatable: the model's replay of 1991-2025 against real USDA harvests.
// Fixtures: NASA POWER and NASA Daymet daily weather for each field, USDA NASS county yields (downloaded
// 2026-11-14). The table is printed on every run; the assertions guard against accuracy getting worse.
//
// Honesty note: model settings were chosen while looking at these same series (in-sample), from published
// methods rather than by fitting single years. Treat this as a first check, not an independent validation.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { mergeDaymet, parsePower, type DailyClimate, type PowerResponse } from "../src/engine/climate";
import { makeReplay } from "../src/engine/rotation";
import { validateCrop } from "../src/engine/validate";
import type { CountyLosses, CropId, LossGroup, SoilProfile, YieldRecord } from "../src/shared/types";
import { parseDaymetCsv } from "../src/worker/data/daymet";

const fx = (p: string) => readFileSync(new URL(`./fixtures/${p}`, import.meta.url), "utf8");
const power = (f: string) => parsePower(JSON.parse(fx(f)) as PowerResponse);
const nass = (f: string) => (JSON.parse(fx(`nass/${f}`)) as { records: YieldRecord[] }).records;

const iaSoil: SoilProfile = { available: true, source: "SSURGO Clarion loam", awc: 0.19, profileDepthCm: 152, ph: 6.2, drainageClass: "Well drained" };
const ksSoil: SoilProfile = { available: true, source: "SSURGO Richfield silt loam", awc: 0.21, profileDepthCm: 200, ph: 7.3, drainageClass: "Well drained" };

const iaPower = power("power-story-county-ia.json");
const ksPower = power("power-finney-county-ks.json");
const iaEnsemble = mergeDaymet(iaPower, parseDaymetCsv(fx("daymet/daymet-story-county-ia.csv"))).climate;
const ksEnsemble = mergeDaymet(ksPower, parseDaymetCsv(fx("daymet/daymet-finney-county-ks.csv"))).climate;

interface Case {
  name: string;
  climate: DailyClimate;
  powerOnly: DailyClimate;
  soil: SoilProfile;
  crop: CropId;
  after: CropId;
  records: YieldRecord[];
  /** Regression guard for the shipped (ensemble) weather. */
  minCorrelation: number;
}

const CASES: Case[] = [
  { name: "Story Co. IA corn (all fields)", climate: iaEnsemble, powerOnly: iaPower, soil: iaSoil, crop: "corn", after: "soybean", records: nass("story-ia-corn-all.json"), minCorrelation: 0.4 },
  { name: "Story Co. IA soybean (all fields)", climate: iaEnsemble, powerOnly: iaPower, soil: iaSoil, crop: "soybean", after: "corn", records: nass("story-ia-soybean-all.json"), minCorrelation: 0.4 },
  { name: "Finney Co. KS wheat (rain-fed)", climate: ksEnsemble, powerOnly: ksPower, soil: ksSoil, crop: "winter_wheat", after: "fallow", records: nass("finney-ks-wheat-nonirrigated.json"), minCorrelation: 0.6 },
  { name: "Finney Co. KS sorghum (rain-fed)", climate: ksEnsemble, powerOnly: ksPower, soil: ksSoil, crop: "sorghum", after: "winter_wheat", records: nass("finney-ks-sorghum-nonirrigated.json"), minCorrelation: 0.55 },
  { name: "Finney Co. KS wheat (all fields)", climate: ksEnsemble, powerOnly: ksPower, soil: ksSoil, crop: "winter_wheat", after: "fallow", records: nass("finney-ks-wheat-all.json"), minCorrelation: 0.5 },
];

describe("model vs real USDA harvests (offline fixtures)", () => {
  const rows = CASES.map((c) => {
    const ens = validateCrop(c.crop, c.after, makeReplay(c.climate, c.soil, false)(c.crop, c.after), c.records)!;
    const pow = validateCrop(c.crop, c.after, makeReplay(c.powerOnly, c.soil, false)(c.crop, c.after), c.records)!;
    return { c, ens, pow };
  });

  it("prints the accuracy table", () => {
    const lines = rows.map(
      ({ c, ens, pow }) =>
        `${c.name.padEnd(36)} ${String(ens.years.length).padStart(3)} yrs | ensemble r=${ens.correlation.toFixed(2)} same ${ens.sameDirection}/${ens.years.length} worst ${ens.worstYearsFlagged}/5 | POWER only r=${pow.correlation.toFixed(2)}`,
    );
    const mean = (k: "ens" | "pow") => rows.reduce((a, r) => a + r[k].correlation, 0) / rows.length;
    console.log(["", "Accuracy: model replay vs USDA NASS county harvests", ...lines, `mean r: ensemble ${mean("ens").toFixed(2)} | POWER only ${mean("pow").toFixed(2)}`].join("\n"));
    expect(mean("ens")).toBeGreaterThanOrEqual(mean("pow"));
  });

  it("crop insurance records explain the Iowa years a weather-and-water model misses", () => {
    const file = JSON.parse(readFileSync(new URL("../web/public/data/rma/19.json", import.meta.url), "utf8")) as {
      groups: LossGroup[];
      years: number[];
      counties: Record<string, CountyLosses["crops"]>;
      source: string;
    };
    const losses: CountyLosses = { groups: file.groups, crops: file.counties["169"]!, firstYear: Math.min(...file.years), lastYear: Math.max(...file.years), source: file.source };
    const v = validateCrop("corn", "soybean", makeReplay(iaEnsemble, iaSoil, false)("corn", "soybean"), nass("story-ia-corn-all.json"), { practice: "all", area: "county" }, losses)!;
    const causeOf = (y: number) => v.worstYears.find((w) => w.year === y)?.cause;
    console.log(`IA corn worst years: ${v.worstYears.map((w) => `${w.year} ${w.actualPct}% (${w.cause ?? "?"}) model ${w.modeledPct}%`).join(" | ")}`);
    console.log(`IA corn misses: ${JSON.stringify(v.missesExplained)}`);
    expect(causeOf(1993)).toBe("too much rain or flooding");
    expect(causeOf(2020)).toBe("wind storms");
    expect(v.missesExplained?.causes).toContain("2020: wind storms");
  });

  for (const { c, ens } of rows) {
    it(`${c.name}: correlation stays above ${c.minCorrelation}`, () => {
      expect(ens.years.length).toBeGreaterThanOrEqual(12);
      expect(ens.correlation).toBeGreaterThan(c.minCorrelation);
      expect(ens.worstYearsFlagged).toBeGreaterThanOrEqual(3);
    });
  }
});
