import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { SqlRunStore } from "../src/worker/fieldwatch/agent";
import { researchNoteFor, RESEARCH_TIMEOUT_MS } from "../src/worker/fieldwatch/researchNote";
import { describe, expect, it, vi } from "vitest";
import { parsePower, type PowerResponse } from "../src/engine/climate";
import { executeRun, MemoryRunStore, planRun } from "../src/worker/fieldwatch/agentCore";
import { historyToDayMap } from "../src/worker/fieldwatch/sources";
import { WATCHED_FIELDS, type FieldWatchDeps } from "../src/worker/fieldwatch/run";
import { runRecurringCheck, DEFAULT_SETTINGS } from "../src/worker/fieldwatch/watchCore";
import { CORPUS, EMBEDDING } from "../src/worker/research/config";
import type { Env } from "../src/worker/env";

const field = WATCHED_FIELDS.find((f) => f.id === "finney-ks")!;
const now = new Date("2026-11-15T03:00:00Z");
const history = historyToDayMap(parsePower(JSON.parse(readFileSync(new URL("./fixtures/power-finney-county-ks.json", import.meta.url), "utf8")) as PowerResponse));
const deps: FieldWatchDeps = { history: async () => history, recent: async () => new Map(), kansas: async () => null };
const chunk = CORPUS.chunks.find((c) => c.crops.includes("corn"))!;
function bindings() {
  const query = vi.fn(async () => ({ matches: [{ id: chunk.id, score: 0.8 }] }));
  const ai = { run: vi.fn(async () => ({ data: [Array(EMBEDDING.dimensions).fill(0.1)] })) };
  return { env: { AI: ai, RESEARCH_INDEX: { query } } as unknown as Env, query, ai };
}

describe("agent research notes", () => {
  it.each(["dry", "ok"] as const)("handles a live %s run without changing rule v2", async (status) => {
    const july = new Date("2025-07-14T14:00:00Z");
    const recent = new Map(Array.from({ length: 60 }, (_, i) => [new Date(july.getTime() - (i + 1) * 86400000).toISOString().slice(0, 10), { prcp: status === "dry" ? 0 : 20, tmax: 30, tmin: 15, gwetroot: status === "dry" ? 0 : 1 }] as const));
    const store = new MemoryRunStore();
    const run = planRun(field, "live", undefined, july.getTime());
    store.insert(run);
    const { env, query } = bindings();
    const done = (await executeRun(store, run.runId, env, field, july, { ...deps, recent: async () => recent }, "corn"))!;
    expect(done.status).toBe(status);
    if (status === "dry") {
      expect(done.researchNote).toMatchObject({ status: "live", cropSource: "watch settings" });
    } else {
      expect(done.researchNote).toBeUndefined();
      expect(query).not.toHaveBeenCalled();
    }
  });
  it("keeps a dry run complete when retrieval throws", async () => {
    const store = new MemoryRunStore();
    const run = planRun(field, "replay", "jun-2022", now.getTime());
    store.insert(run);
    const { env, ai } = bindings();
    ai.run.mockRejectedValue(new Error("index offline"));
    const done = (await executeRun(store, run.runId, env, field, now, deps))!;
    expect(done.status).toBe("dry");
    expect(done.researchNote).toMatchObject({ status: "unavailable", passages: [] });
    expect(store.pending()).toBeNull();
  });

  it("bounds a hung retrieval and clears its timeout", async () => {
    vi.useFakeTimers();
    try {
      const { env, ai } = bindings();
      ai.run.mockImplementation(() => new Promise(() => {}));
      const pending = researchNoteFor("dry", env, field);
      await vi.advanceTimersByTimeAsync(RESEARCH_TIMEOUT_MS);
      expect(await pending).toMatchObject({ status: "unavailable", passages: [], reason: expect.stringContaining("timed out") });
      expect(vi.getTimerCount()).toBe(0);
    } finally { vi.useRealTimers(); }
  });

  it("never queries for OK, insufficient or inactive results", async () => {
    const { env, query, ai } = bindings();
    for (const status of ["ok", "insufficient", "inactive", "error", "pending"]) expect(await researchNoteFor(status, env, field)).toBeUndefined();
    expect(query).not.toHaveBeenCalled();
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("skips with an explicit reason when neither settings nor field has crop tags", async () => {
    const { env, ai } = bindings();
    expect(await researchNoteFor("watch", env, { ...field, crops: undefined })).toMatchObject({ status: "skipped", passages: [], reason: expect.stringContaining("No crop") });
    expect(ai.run).not.toHaveBeenCalled();
  });

  it("stores no matching research for low-scoring index results", async () => {
    const { env, query } = bindings();
    query.mockResolvedValue({ matches: [{ id: chunk.id, score: 0.1 }] });
    expect(await researchNoteFor("watch", env, field)).toMatchObject({ status: "empty", passages: [], reason: "no applicable passage matched" });
  });

  it("reloads the complete note from agent SQLite through the Agents stub", async () => {
    const db = new DatabaseSync(":memory:");
    try {
      const sql = <T,>(strings: TemplateStringsArray, ...values: (string | number | boolean | null)[]): T[] => {
        const text = strings.reduce((a, s, i) => a + s + (i < values.length ? "?" : ""), "");
        const stmt = db.prepare(text);
        return /^\s*select/i.test(text) ? stmt.all(...values as never[]) as T[] : (stmt.run(...values as never[]), []);
      };
      const store = new SqlRunStore(sql);
      const run = planRun(field, "replay", "jun-2022", now.getTime());
      store.insert(run);
      const done = await executeRun(store, run.runId, bindings().env, field, now, deps);
      const reopened = new SqlRunStore(sql);
      expect(reopened.get(run.runId)).toEqual(done);
      expect(reopened.list(5)[0]!.researchNote!.passages[0]!.text).toBe(chunk.text);
    } finally { db.close(); }
  });
  it.each(["weekly", "window"] as const)("attaches a note to a Watch %s check, using the confirmed crop", async (kind) => {
    const july = new Date("2025-07-14T14:00:00Z");
    // Real historical reference, synthetic dry rain / wet root-zone: rule v2 Watch, not Dry.
    const recent = new Map(Array.from({ length: 60 }, (_, i) => [new Date(july.getTime() - (i + 1) * 86400000).toISOString().slice(0, 10), { prcp: 0, tmax: 30, tmin: 15, gwetroot: 1 }] as const));
    const { env, query } = bindings();
    const result = await runRecurringCheck(kind, { version: 1, crop: "corn", seasonYear: 2025 }, { ...DEFAULT_SETTINGS, enabled: true, version: 1, crop: "corn" }, new MemoryRunStore(), env, { ...field, crops: ["soybean"] }, july, { ...deps, recent: async () => recent });
    expect(result!.status).toBe("watch");
    expect(result!.researchNote).toMatchObject({ status: "live", tags: ["corn"], cropSource: "watch settings", passages: [{ text: chunk.text }] });
    expect(query).toHaveBeenCalledOnce();
  });
  it("attaches verbatim indexed research to a dry replay and persists it with the result", async () => {
    const store = new MemoryRunStore();
    const run = planRun(field, "replay", "jun-2022", now.getTime());
    store.insert(run);
    const { env, query } = bindings();
    const done = (await executeRun(store, run.runId, env, field, now, deps))!;
    expect(done.status).toBe("dry");
    expect(done.researchNote).toMatchObject({ status: "live", tags: ["corn"], cropSource: "demo field configuration", passages: [{ chunkId: chunk.id, text: chunk.text, score: 0.8 }] });
    expect(done.researchNote!.passages[0]).toHaveProperty("applicability");
    expect(done.researchNote!.passages[0]).toHaveProperty("sourceUrl");
    expect(query).toHaveBeenCalledOnce();
    expect(store.get(run.runId)!.researchNote).toEqual(done.researchNote);
    expect(await executeRun(store, run.runId, env, field, now, deps)).toEqual(done);
    expect(query).toHaveBeenCalledOnce();
  });
});
