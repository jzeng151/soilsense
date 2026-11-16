import { readFileSync } from "node:fs";
import { it, expect } from "vitest";
import { finneyInputs } from "./helpers/finney";
import { buildPlan } from "../src/engine/plan";
import type { Priority } from "../src/shared/types";
const file = new URL("./fixtures/plan-prices-defaults.json", import.meta.url);
it("preserves full Finney responses from origin/next without optional prices", () => {
 const rows = [false,true].flatMap(irrigated => (["profit","soil","risk","balanced"] as Priority[]).map(priority => buildPlan({...finneyInputs, request:{...finneyInputs.request,irrigated,priority}})));
 expect(rows).toEqual(JSON.parse(readFileSync(file,"utf8")));
});
