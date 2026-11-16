import { expect,it } from "vitest";
import { createEt0Memo, et0HargreavesMm } from "../src/engine/climate";
import { ALL_CROPS,CROPS } from "../src/engine/crops";
import { finneyInputs } from "./helpers/finney";
it("per-plan daily ET0 memo preserves exact seasonal sums for every crop and year", () => {
 const lat=finneyInputs.climate.gridCell.lat;
 const memo=createEt0Memo(lat);
 for (const ys of finneyInputs.climate.years) for (const id of ALL_CROPS) {
  const window=CROPS[id].season;
  expect(memo(ys,window)).toBe(et0HargreavesMm(ys,window,lat));
 }
});
