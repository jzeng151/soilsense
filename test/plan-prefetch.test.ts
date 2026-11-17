import { execFileSync } from "node:child_process";
import { expect, it } from "vitest";
it("lists all 504 fixed demo requests across water, priority, language and history profiles", () => {
  const rows = JSON.parse(execFileSync(process.execPath, ["scripts/prefetch-demo.mjs", "--list"], { encoding: "utf8" })) as { name: string; request: { water: string; priority: string; language: string; irrigated: boolean; recentCrops?: string[] } }[];
  expect(rows).toHaveLength(504);
  expect(new Set(rows.map((r) => JSON.stringify(r.request))).size).toBe(504);
  const names = [...new Set(rows.map((r) => r.name))];
  expect(names).toHaveLength(5);
  for (const name of names) {
    const requests = rows.filter((r) => r.name === name).map((r) => r.request);
    expect(requests).toHaveLength(name.startsWith("Ames") ? 72 : 108);
    expect(new Set(requests.map((r) => `${r.water}/${r.priority}/${r.language}`)).size).toBe(36);
    for (const request of requests) expect(request.irrigated).toBe(request.water !== "rain");
    expect(requests.some((request) => JSON.stringify(request.recentCrops) === '["corn"]')).toBe(true);
  }
});
it("matches the dashboard's inferred history without duplicating existing profiles", () => {
  const code = `import {uiHistory,demoRequests} from './scripts/prefetch-demo.mjs';
    const now = new Date('2026-11-15T22:00:00Z');
    const values = [[],[{year:2025,crop:'corn'}],[{year:2026,crop:'corn'}],[{year:2025,crop:'winter_wheat'}]].map(years=>uiHistory({cropHistory:{years}},now));
    console.log(JSON.stringify({values,count:demoRequests({'Finney County, KS':[['winter_wheat','winter_wheat']]}).length}));`;
  const result = JSON.parse(execFileSync(process.execPath, ["--input-type=module", "-e", code], { encoding: "utf8" }));
  expect(result.values).toEqual([["corn"], ["corn", "soybean"], ["soybean"], ["winter_wheat", "winter_wheat"]]);
  expect(result.count).toBe(540);
});
