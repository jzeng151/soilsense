// Opt-in real-provider benchmark; recorded replay is used for the after run.
import { readFileSync, writeFileSync } from "node:fs";
import { gunzipSync } from "node:zlib";
import { expect, it, vi } from "vitest";

it("measures four demo farms with a captured upstream tape", async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
  const dir = process.env.TTL_BENCH_DIR ?? "test/fixtures/freshness";
  const recorded = !process.env.TTL_BENCH_DIR;
  const label = process.env.TTL_BENCH_LABEL ?? (recorded || process.env.TTL_BENCH_REPLAY === "1" ? "after" : "before");
  const root = process.env.TTL_BENCH_SOURCE ?? process.cwd();
  const { makePlan } = await import(`${root}/src/worker/service.ts`);
  const { clearMemoryCache } = await import(`${root}/src/worker/lib/cache.ts`);
  clearMemoryCache();
  const replay = recorded || process.env.TTL_BENCH_REPLAY === "1";
  const tape: Record<string, { status: number; body: string; headers: [string, string][] }[]> = replay ? JSON.parse(recorded ? gunzipSync(readFileSync(`${dir}/tape.json.gz`)).toString() : readFileSync(`${dir}/tape.json`, "utf8")) : {};
  const fetchOriginal = globalThis.fetch;
  let counts: Record<string, number> = {};
  const positions: Record<string, number> = {};
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const host = new URL(url).hostname;
    counts[host] = (counts[host] ?? 0) + 1;
    const key = `${url}\n${init?.body ?? ""}`;
    if (replay) {
      if (!tape[key]) throw new Error(`No recorded response for ${url}`);
      const index = positions[key] ?? 0;
      positions[key] = index + 1;
      const row = tape[key]![Math.min(index, tape[key]!.length - 1)]!;
      return new Response(row.body, { status: row.status, headers: row.headers });
    }
    try {
      const res = await fetchOriginal(input, init);
      const body = await res.text();
      (tape[key] ??= []).push({ status: res.status, body, headers: [...res.headers] });
      writeFileSync(`${dir}/tape.json`, JSON.stringify(tape));
      return new Response(body, { status: res.status, headers: res.headers });
    } catch (err) {
      (tape[key] ??= []).push({ status: 503, body: String(err), headers: [] });
      writeFileSync(`${dir}/tape.json`, JSON.stringify(tape));
      throw err;
    }
  });
  const farms = [
    { name: "Finney KS", lat: 38.1095, lon: -100.706 },
    { name: "Story IA", lat: 42.03, lon: -93.62 },
    { name: "Champaign IL", lat: 40.11, lon: -88.24 },
    { name: "Lancaster NE", lat: 40.81, lon: -96.68 },
  ];
  const results = [];
  const responses = [];
  try {
    for (const farm of farms) {
      const request = { lat: farm.lat, lon: farm.lon, irrigated: false, priority: "balanced" as const, recentCrops: ["corn" as const] };
      const now = new Date("2026-11-15T12:00:00Z");
      counts = {};
      const first = await makePlan({} as never, request, { now });
      const cold = counts;
      counts = {};
      const second = await makePlan({} as never, request, { now });
      const warm = counts;
      responses.push({ first, second });
      counts = {};
      vi.setSystemTime(new Date("2026-12-16T12:00:00Z"));
      await makePlan({} as never, request, { now });
      const after31Days = counts;
      vi.setSystemTime(new Date("2026-11-15T12:00:00Z"));
      // Cache/provenance flags legitimately differ between cold and warm responses.
      results.push({ farm: farm.name, cold, warm, after31Days, complete: !!first.plans.length && !!second.plans.length });
    }
    if (!recorded) {
      writeFileSync(`${dir}/${label}.json`, JSON.stringify(results, null, 2));
      writeFileSync(`${dir}/${label}-responses.json`, JSON.stringify(responses));
    }
    if (label === "after") expect(responses).toEqual(JSON.parse(recorded ? gunzipSync(readFileSync(`${dir}/baseline-responses.json.gz`)).toString() : readFileSync(`${dir}/baseline-replay-responses.json`, "utf8")));
    if (recorded) expect(results).toEqual(JSON.parse(readFileSync(`${dir}/measurements.json`, "utf8")).after);
    expect(results.every(r => r.complete)).toBe(true);
  } finally { vi.unstubAllGlobals(); vi.useRealTimers(); }
}, 300_000);
