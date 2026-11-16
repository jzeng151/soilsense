import { readFileSync } from "node:fs";
import { expect, it, vi } from "vitest";
import { recheckPowerRevisions, REFRESH_FARMS, type StepRunner } from "../src/worker/refresh/workflow";
import { planCells } from "../src/worker/refresh/snapshot";

it("rechecks 90 days weekly without writing the current snapshot/rule stream", async () => {
  const writes: { sql: string; args: unknown[] }[] = [];
  const db = { prepare: (sql: string) => ({ bind: (...args: unknown[]) => ({ run: async () => { writes.push({ sql, args }); } }) }) } as unknown as D1Database;
  const step: StepRunner = { do: async (_name, _config, run) => run() };
  const fetchPower = vi.fn(async (url: string) => {
    // Synthetic protocol extension of recorded POWER data: not a measured observation fixture.
    const raw = JSON.parse(readFileSync("test/fixtures/power-recent-finney-ks.json", "utf8"));
    const u = new URL(url);
    raw.geometry.coordinates[0] = Number(u.searchParams.get("longitude"));
    raw.geometry.coordinates[1] = Number(u.searchParams.get("latitude"));
    const start = u.searchParams.get("start")!;
    expect(start).toBe("20260818");
    for (const series of Object.values(raw.properties.parameter) as Record<string, number>[]) {
      const initial = series["20260901"]!;
      for (let day = 18; day <= 31; day++) series[`202608${day}`] = initial;
    }
    return { status: 200, text: JSON.stringify(raw) };
  });
  await recheckPowerRevisions({ DB: db }, step, new Date("2026-11-15T06:00:00Z"), fetchPower);
  expect(fetchPower).toHaveBeenCalledTimes(planCells(REFRESH_FARMS).length);
  expect(writes).toHaveLength(planCells(REFRESH_FARMS).length);
  expect(writes.every(w => w.sql.startsWith("INSERT INTO cache") && String(w.args[0]).startsWith("fresh-v1:power-revisions:v1:"))).toBe(true);
  writes.length = 0;
  fetchPower.mockClear();
  await recheckPowerRevisions({ DB: db }, step, new Date("2026-11-16T06:00:00Z"), fetchPower);
  expect(fetchPower).not.toHaveBeenCalled();
  await recheckPowerRevisions({ DB: db }, step, new Date("2026-11-15T06:00:00Z"), async () => ({ status: 503, text: "unavailable" }));
  expect(writes).toHaveLength(0);
});
