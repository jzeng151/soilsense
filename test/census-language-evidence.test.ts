import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("records the retrieved ACS language categories rather than a script-preference estimate", () => {
  const evidence = JSON.parse(readFileSync("docs/i18n/census-language-ranking.json", "utf8")) as {
    source: string; tableUrl: string; retrievedAt: string;
    ranking: { language: string; variable: string; estimate: number; marginOfError90: number }[];
  };
  expect(evidence.source).toContain("2025 ACS 1-Year Estimates, B16001");
  expect(evidence.tableUrl).toBe("https://data.census.gov/table/ACSDT1Y2025.B16001?g=010XX00US");
  expect(Number.isNaN(Date.parse(evidence.retrievedAt))).toBe(false);
  expect(evidence.ranking).toHaveLength(42);
  expect(new Set(evidence.ranking.map(row => row.variable)).size).toBe(42);
  expect(evidence.ranking.slice(0, 3)).toEqual([
    { language: "Spanish", variable: "B16001_003E", estimate: 44921985, marginOfError90: 177787 },
    { language: "Chinese (incl. Mandarin, Cantonese)", variable: "B16001_075E", estimate: 3775645, marginOfError90: 47062 },
    { language: "Tagalog (incl. Filipino)", variable: "B16001_099E", estimate: 1969835, marginOfError90: 39681 },
  ]);
  for (const [index, row] of evidence.ranking.entries()) {
    expect(row.estimate).toBeGreaterThan(0);
    expect(row.marginOfError90).toBeGreaterThanOrEqual(0);
    if (index) expect(evidence.ranking[index - 1]!.estimate).toBeGreaterThanOrEqual(row.estimate);
  }
});
