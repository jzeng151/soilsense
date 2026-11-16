# Fertilizer products and timing (display only)

This layer never changes ranking, yield, nitrogen cost inputs, prices, scores or economics. Rates come exclusively from the separately maintained MF2586 nutrient guide. Product alternatives are unranked arithmetic examples, not procurement, mixing, application or seed-placement prescriptions. Confirm the actual purchased product label and application plan with an agronomist. No price claims are made.

## Live-verified sources (retrieved 2026-11-16 UTC / November 15 US Eastern)

| Material / fact | Analysis by mass | Authoritative source and locator |
|---|---|---|
| Anhydrous ammonia | 82-0-0 | [Mississippi State Extension P3968](https://extension.msstate.edu/publications/useful-nutrient-management-planning-data), Table 2 |
| Urea | 46-0-0 | P3968, Table 2 |
| UAN | 28-0-0 or 32-0-0 | P3968, Table 2, 28–32% N |
| Ammonium sulfate | 21-0-0-24S | P3968, Table 2 |
| MAP | 11-52-0 | [University of Minnesota, Understanding phosphorus fertilizers](https://extension.umn.edu/agriculture/crop-production/nutrient-management-for-minnesota-crops/understanding-phosphorus-fertilizers), “How commercial phosphate fertilizer is manufactured” → “Adding ammonia” text. The live page's collapsed text explicitly names 11-52-0. **Do not substitute Table 1's different MAP grade or P3968's 11-48-0.** |
| DAP | 18-46-0 | P3968, Table 2; UMN “Adding ammonia” also names this grade |
| Potash / potassium chloride | 0-0-60 | P3968, Table 2 |
| Agricultural lime | Use supplier ECC %, no default | [K-State MF1065, Liming Acid Soils](https://bookstore.ksre.ksu.edu/download/liming-acid-soils_MF1065), PDF p. 3, “Lime Quality.” Worked example: 3,000 lb ECC / 0.60 = 5,000 lb aglime. ECC includes fineness and purity, not just CCE. |

P3968 was retrieved directly and its actual HTML table read (the text extractor omitted the table). UMN was verified in a named real browser: collapsed panel text states “monoammonium phosphate (11-52-0) or diammonium phosphate (18-46-0).” MF1065 PDF was downloaded and read using pdftotext. [K-State August 13, 2026 eUpdate, Choosing the Right Lime Source](https://agronomy.k-state.edu/eupdates/2026/issue-1116-august-13/liming-soils-wheat-production.html) also confirms the ECC purity/fineness definition and incorporation/time requirement; no timing interval is inferred from it.

### MF2586 provenance and timing transcription

[Soil Test Interpretations and Fertilizer Recommendations in Kansas, MF2586](https://bookstore.ksre.ksu.edu/pubs/soil-test-interpretations-and-fertilizer-recommendations_MF2586.pdf) downloaded 2026-11-16T01:38:03Z; signature `%PDF-1.6`; SHA256:

`21a21aece4f93acecff9e8d2eb30d835411aec2dc3961ad8e2a3cc912ef838a6`

Read from the actual PDF using pdftotext, not search snippets. Locators below are **printed pages** (PDF page = printed page + 2).

- Printed pp. 5–6: corn, grain sorghum, wheat `fe` = 0.65 “Injected or split applied”; default 0.55 “Broadcast, fall-applied pre-plant.” A product selection does **not** silently change the `fe` used upstream.
- Printed pp. 9, 10, 11, 13, 14, 15: crop phosphorus text describes total broadcast + banded nutrients and warns not to exceed N + K2O seed-contact guidelines. UI explicitly says product totals are **not in-furrow rates** and no seed-safety approval is given. Numerical in-furrow limits and wheat topdress dates are deliberately omitted because no crop/equipment-specific source was transcribed for them.
- Printed p. 9 (corn): above 20 ppm Mehlich-3 P, only starter is suggested, maximum 20 lb P2O5/acre at planting. This is not automatically added by the products layer. Missing lab values are never replaced with a starter threshold assumption.

## Arithmetic and limits

- `product lb/acre = nutrient lb/acre / (analysis % / 100)`; liquid UAN is pounds, **not gallons**.
- First size MAP/DAP to a valid P2O5 application target and ammonium sulfate to a valid S target. Sum their N contributions; subtract from guideline N before sizing the N-only carrier. Clamp remaining N to zero and explicitly report any excess N. Do not recommend extra N to make a negative balance disappear.
- Options illustrate MAP + anhydrous, DAP + urea, and MAP + UAN32; potash and sulfate appear only for valid positive application targets. Other common grades remain in the sourced catalog/conversion disclosure.
- `soil-test-needed` and `removal` are not application targets. Crop removal remains evidence only and is never converted into product applications. Lime needs a valid upstream lb ECC rate **and** a supplied ECC percentage; no 100% or 60% default is assumed.
- The UI shows upstream inputs, notes/formulas and page locators without recalculating nutrient recommendations. Expected yield is the existing plan's expected yield for that crop-year.
- Product alternatives cannot establish material compatibility, equipment suitability, safe handling or placement. Anhydrous ammonia requires specialist equipment and trained handling; no procedural handling advice is provided.

## Integration

`FertilizerProducts` accepts the shared `CropYearFertilizer` contract and nests under the nutrient guide. EN/ES UI controls and timing text are local to the component, avoiding changes to another session's Korean dictionaries.

Export for Explore's suggestion list (do not restyle its chat panel):

```ts
import { FERTILIZER_SUGGESTION } from "../../../src/engine/fertilizerProducts";
// Add FERTILIZER_SUGGESTION to the existing suggestions array.
```

The exact string is `Fertilizer guide for this rotation (K-State)`.

## Worked product checks

- 150 lb N/acre / 0.82 = 182.926829 lb anhydrous/acre, approximately **183** whole lb product/acre (182.9 at UI precision).
- 46 lb P2O5/acre / 0.46 = **100 lb DAP/acre**, supplying **18 lb N/acre**. For 150 lb guideline N, remaining N = **132 lb/acre**; urea = 132 / 0.46 = **286.956522 lb product/acre**. 60 lb K2O / 0.60 = **100 lb potash/acre**.
- MF1065's own example: 3,000 lb ECC/acre / 0.60 = **5,000 lb aglime/acre**.

Tests exercise these literal independently worked expectations, missing-lab/removal exclusion, excess-N warnings and bilingual disclosures. Finney end-to-end checks and chat integration are recorded with final verification results rather than assumed from these unit examples.
