import { afterEach, describe, expect, it, vi } from "vitest";

const spies = vi.hoisted(() => ({ fieldWatch: vi.fn(async () => {}) }));
vi.mock("../src/worker/fieldwatch/run", async (importOriginal) => ({ ...(await importOriginal<typeof import("../src/worker/fieldwatch/run")>()), runFieldWatch: spies.fieldWatch }));

import { WATCHED_FIELDS } from "../src/worker/fieldwatch/run";
import { comparisonKey } from "../src/worker/imerg/comparison";
import { failureKey, FINAL_DEMO_END, IMERG_REFRESH_CRON, pickTarget, refreshImergEvidence, refreshTargets, REFRESH_MARGIN_MS, type RefreshCandidate, type RefreshTarget } from "../src/worker/imerg/refresh";
import { clearMemoryCache } from "../src/worker/lib/cache";
import type { Env } from "../src/worker/env";

afterEach(() => { clearMemoryCache(); vi.clearAllMocks(); });

const NOW = Date.UTC(2026, 10, 16, 12, 0, 0);
const [story, champaign, finney] = WATCHED_FIELDS as [typeof WATCHED_FIELDS[0], typeof WATCHED_FIELDS[0], typeof WATCHED_FIELDS[0]];
const late = (field = story, end = "2026-11-13"): RefreshTarget => ({ field, end, stream: "late" });
const final = (field = story): RefreshTarget => ({ field, end: FINAL_DEMO_END, stream: "final" });
const cand = (target: RefreshTarget, expiresAt: number | null, failedRecently = false): RefreshCandidate => ({ target, expiresAt, failedRecently });

describe("pickTarget", () => {
  it("refreshes a missing Late window before one that is merely expiring soon", () => {
    const soon = cand(late(story), NOW + 5 * 60_000), missing = cand(late(champaign), null);
    expect(pickTarget([soon, missing], NOW)).toEqual(missing.target);
  });
  it("picks the soonest-expiring due window and ignores ones outside the refresh margin", () => {
    const fresh = cand(late(story), NOW + REFRESH_MARGIN_MS + 60_000);
    const later = cand(late(champaign), NOW + 20 * 60_000), sooner = cand(late(finney), NOW + 2 * 60_000);
    expect(pickTarget([fresh, later, sooner], NOW)).toEqual(sooner.target);
    expect(pickTarget([fresh], NOW)).toBeNull();
  });
  it("skips recently failed windows so one outage cannot starve the others", () => {
    const failing = cand(late(story), null, true), other = cand(late(champaign), NOW + 10 * 60_000);
    expect(pickTarget([failing, other], NOW)).toEqual(other.target);
    expect(pickTarget([failing], NOW)).toBeNull();
  });
  it("fills Final windows only when no Late window is due", () => {
    const missingFinal = cand(final(story), null);
    expect(pickTarget([cand(late(story), null), missingFinal], NOW)?.stream).toBe("late");
    expect(pickTarget([cand(late(story), NOW + 59 * 60_000), missingFinal], NOW)).toEqual(missingFinal.target);
    expect(pickTarget([cand(final(story), NOW + 300 * 86_400_000)], NOW)).toBeNull();
  });
});

describe("refreshTargets", () => {
  it("uses each field's Field Watch data-through day for Late and skips missing or invalid days", () => {
    const targets = refreshTargets(new Map([[story.id, "2026-11-13"], [champaign.id, null], [finney.id, "not-a-day"]]));
    expect(targets.filter((t) => t.stream === "late").map((t) => [t.field.id, t.end])).toEqual([[story.id, "2026-11-13"]]);
    expect(targets.filter((t) => t.stream === "final").map((t) => t.end)).toEqual(WATCHED_FIELDS.map(() => FINAL_DEMO_END));
  });
});

/** Minimal D1 double: SELECT ... WHERE key IN (...) and the cache upsert used by putCached. */
function fakeDb(rows: Record<string, number> = {}) {
  const writes: { key: string; expires: number }[] = [];
  const db = {
    prepare(sql: string) {
      return {
        bind(...args: unknown[]) {
          return {
            all: async () => ({ results: sql.startsWith("SELECT key, expires_at") ? args.filter((k) => (k as string) in rows).map((k) => ({ key: k as string, expires_at: rows[k as string]! })) : [] }),
            run: async () => { writes.push({ key: args[0] as string, expires: args[2] as number }); return {}; },
          };
        },
      };
    },
  } as unknown as D1Database;
  return { db, writes };
}
const runs = (dataThrough: string | null) => vi.fn(async () => ({ runs: WATCHED_FIELDS.map((f) => ({ fieldId: f.id, dataThrough })) as never, lastCronAt: null, lastCheckAt: null }));

describe("refreshImergEvidence", () => {
  it("does nothing without Earthdata credentials or D1", async () => {
    const warm = vi.fn();
    expect(await refreshImergEvidence({ DB: fakeDb().db } as Env, { warm, now: NOW })).toMatchObject({ status: "skipped" });
    expect(await refreshImergEvidence({ EARTHDATA_TOKEN: "t" } as Env, { warm, now: NOW })).toMatchObject({ status: "skipped" });
    expect(warm).not.toHaveBeenCalled();
  });
  it("force-refreshes exactly one due window per run", async () => {
    const fresh = Object.fromEntries(WATCHED_FIELDS.map((f) => [comparisonKey(f.id, "2026-11-13", "late"), NOW + 50 * 60_000]));
    fresh[comparisonKey(finney.id, "2026-11-13", "late")] = NOW + 3 * 60_000;
    const warm = vi.fn(async () => ({}) as never);
    const result = await refreshImergEvidence({ DB: fakeDb(fresh).db, EARTHDATA_TOKEN: "t" } as Env, { warm, latest: runs("2026-11-13"), now: NOW });
    expect(result).toMatchObject({ status: "refreshed", field: finney.id, stream: "late", end: "2026-11-13" });
    expect(warm).toHaveBeenCalledTimes(1);
    expect(warm).toHaveBeenCalledWith(expect.anything(), finney, "2026-11-13", "late", { force: true });
  });
  it("is idle when every window is fresh", async () => {
    const rows = Object.fromEntries(WATCHED_FIELDS.flatMap((f) => [[comparisonKey(f.id, "2026-11-13", "late"), NOW + 55 * 60_000], [comparisonKey(f.id, FINAL_DEMO_END, "final"), NOW + 200 * 86_400_000]]));
    const warm = vi.fn();
    expect(await refreshImergEvidence({ DB: fakeDb(rows).db, EARTHDATA_TOKEN: "t" } as Env, { warm, latest: runs("2026-11-13"), now: NOW })).toEqual({ status: "idle", checked: 8 });
    expect(warm).not.toHaveBeenCalled();
  });
  it("records a short back-off after a failure instead of throwing", async () => {
    const { db, writes } = fakeDb();
    const warm = vi.fn(async () => { throw new Error("GES DISC 503"); });
    const result = await refreshImergEvidence({ DB: db, EARTHDATA_TOKEN: "t" } as Env, { warm, latest: runs("2026-11-13"), now: NOW });
    expect(result).toMatchObject({ status: "failed", field: story.id, error: expect.stringContaining("GES DISC 503") });
    expect(writes.map((w) => w.key)).toContain(failureKey(late(story)));
  });
});

describe("scheduled() routing", () => {
  it("routes the IMERG cron to the refresh and never to Field Watch", async () => {
    const { default: worker } = await import("../src/worker/index");
    const pending: Promise<unknown>[] = [];
    const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException() {} } as unknown as ExecutionContext;
    vi.spyOn(console, "log").mockImplementation(() => {});
    await worker.scheduled({ cron: IMERG_REFRESH_CRON, scheduledTime: NOW } as ScheduledController, {} as Env, ctx);
    await Promise.all(pending);
    expect(spies.fieldWatch).not.toHaveBeenCalled();
    await worker.scheduled({ cron: "17 * * * *", scheduledTime: NOW } as ScheduledController, {} as Env, ctx);
    await Promise.all(pending);
    expect(spies.fieldWatch).toHaveBeenCalledTimes(1);
  });
});
