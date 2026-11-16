// Bounded, explicit search policy for the experimental crop expansion. NOT an
// agronomic prohibition or dominated-candidate proof: arbitrary mixed specialty-crop
// sequences have not been budgeted and would multiply Worker CPU combinatorially.
// Keep exhaustive legacy search unchanged; add a small annual-crop template portfolio.
import type { CropId } from "../shared/types";
import { isExtraCrop } from "../shared/extraCrops";
export function expandedSequences(crops: CropId[]): CropId[][] {
 const available = new Set(crops);
 const out: CropId[][] = [];
 for (const extra of crops.filter(isExtraCrop)) {
  // A single specialty crop anchored by familiar grain phases. Planning templates,
  // not extension endorsements. All still pass normal harvest/rotation feasibility.
  for (const [a,b] of [["winter_wheat","sorghum"],["corn","soybean"],["winter_wheat","fallow"]] as const) {
   for (const seq of [[a,extra,b],[extra,a,b],[a,b,extra]]) {
    if (seq.every(c => available.has(c))) out.push(seq);
   }
  }
 }
 return out;
}
export const EXPANSION_SEARCH_NOTE = "Experimental crop search is bounded: exhaustive original-crop rotations plus single-specialty-crop templates anchored by wheat/sorghum, corn/soybean or wheat/fallow. Specialty templates use no winter cover and are not an exhaustive optimum or an agronomic ban on other rotations. Silage is priced and yielded in fresh short tons; triticale and annual hay in dry short tons; cotton and sunflower in pounds. Exact new-crop climate response coefficients remain approximate assumptions; review docs/CROPS.md before using these experimental results.";
