import { readFileSync } from "node:fs";
import { mergeDaymet, parsePower } from "../../src/engine/climate";
import { parseDaymetCsv } from "../../src/worker/data/daymet";
import type { PlanInputs } from "../../src/engine/plan";
const captured = JSON.parse(readFileSync(new URL("../fixtures/plan-finney-inputs.json", import.meta.url), "utf8"));
export const finneyInputs: PlanInputs = {
  ...captured,
  climate: mergeDaymet(
    parsePower(JSON.parse(readFileSync(new URL("../fixtures/power-finney-county-ks.json", import.meta.url), "utf8"))),
    parseDaymetCsv(readFileSync(new URL("../fixtures/daymet/daymet-finney-county-ks.csv", import.meta.url), "utf8")),
  ).climate,
  cropHistory: { available: true, source: "CDL history reproduced from live field report (not fresh sparse CDL response)", years: [
    { year: 2023, crop: "winter_wheat", cdlCode: 24, cdlName: "Winter wheat" },
    { year: 2024, crop: "corn", cdlCode: 1, cdlName: "Corn" },
    { year: 2025, crop: "winter_wheat", cdlCode: 24, cdlName: "Winter wheat" },
  ] },
  now: new Date(captured.now),
};
