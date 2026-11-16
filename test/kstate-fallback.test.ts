import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const saved = JSON.parse(readFileSync("kansas-crop-rotation/data/app_rotation_advice.json", "utf8"));
const http = vi.hoisted(() => ({ fetchJson: vi.fn() }));
vi.mock("../src/worker/lib/http", () => http);

beforeEach(() => { vi.resetModules(); http.fetchJson.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

describe("Kansas rotation file fallback", () => {
  it("returns the dated saved copy on R2 failure, memos the outage for one minute, then retries live", async () => {
    vi.useFakeTimers();
    const start = new Date("2026-11-15T14:00:00Z");
    vi.setSystemTime(start);
    http.fetchJson.mockRejectedValue(new Error("R2 unavailable"));
    const { getSecondOpinion } = await import("../src/worker/data/kstate");
    const first = await getSecondOpinion(undefined, "20055");
    expect(first).toMatchObject({ county: "Finney County", savedCopy: true, dataThrough: "2026-11-09", disclaimer: saved.disclaimer });
    expect(first!.byCurrentCrop.wheat!.rotations[0]!.code).toBe("W-S-F");
    vi.setSystemTime(start.getTime() + 60_000 - 1);
    expect(await getSecondOpinion(undefined, "20055")).toEqual(first);
    await getSecondOpinion(undefined, "20001");
    expect(http.fetchJson).toHaveBeenCalledTimes(1);
    http.fetchJson.mockResolvedValue({ ...saved, data_through: "2026-11-14" });
    vi.setSystemTime(start.getTime() + 60_000 + 1);
    expect(await getSecondOpinion(undefined, "20055")).toMatchObject({ savedCopy: false, dataThrough: "2026-11-14" });
    expect(http.fetchJson).toHaveBeenCalledTimes(2);
  });

  it("uses the live file when healthy and never fetches for non-Kansas counties", async () => {
    http.fetchJson.mockResolvedValue({ ...saved, data_through: "2026-11-14" });
    const { getSecondOpinion } = await import("../src/worker/data/kstate");
    expect(await getSecondOpinion(undefined, "19169")).toBeNull();
    expect(http.fetchJson).not.toHaveBeenCalled();
    expect(await getSecondOpinion(undefined, "20055")).toMatchObject({ savedCopy: false, dataThrough: "2026-11-14" });
  });

  it("does not persist an outage fallback in D1 across isolate restarts", async () => {
    const sqlite = new DatabaseSync(":memory:");
    sqlite.exec("CREATE TABLE cache (key TEXT PRIMARY KEY, value TEXT, expires_at INTEGER, created_at INTEGER)");
    const statement = (sql: string, args: unknown[] = []) => ({
      bind: (...bound: unknown[]) => statement(sql, bound),
      first: async () => sqlite.prepare(sql).get(...(args as never[])) ?? null,
      run: async () => { sqlite.prepare(sql).run(...(args as never[])); return { success: true }; },
    });
    const db = { prepare: (sql: string) => statement(sql) } as unknown as D1Database;
    try {
      http.fetchJson.mockRejectedValue(new Error("R2 unavailable"));
      const { getSecondOpinion } = await import("../src/worker/data/kstate");
      const first = await getSecondOpinion(db, "20055");
      expect(first).toMatchObject({ savedCopy: true, dataThrough: "2026-11-09" });
      vi.resetModules();
      http.fetchJson.mockClear();
      const restarted = await import("../src/worker/data/kstate");
      expect(await restarted.getSecondOpinion(db, "20055")).toEqual(first);
      expect(http.fetchJson).toHaveBeenCalledTimes(1);
    } finally {
      sqlite.close();
    }
  });

  it("falls back when R2 returns malformed JSON structure", async () => {
    http.fetchJson.mockResolvedValue({ error: "not a rotation file" });
    const { getSecondOpinion } = await import("../src/worker/data/kstate");
    expect(await getSecondOpinion(undefined, "20055")).toMatchObject({ savedCopy: true, dataThrough: "2026-11-09" });
  });
});
