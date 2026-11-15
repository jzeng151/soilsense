import { readFileSync, readdirSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import { gridPoint, PRODUCTS, shift, pointConstraint, retrieveSubset, type Subset } from "../src/worker/imerg/client";
import { planImergCells, validateImerg } from "../src/worker/refresh/imerg-snapshot";
import { acceptedImergFor } from "../src/worker/refresh/imerg-store";
import { runImergRefresh, startImergRefresh } from "../src/worker/refresh/imerg-workflow";
import type { StepRunner } from "../src/worker/refresh/workflow";
import type { Env } from "../src/worker/env";
const now = new Date("2026-11-15T06:00:00Z");
const farm = { id: "finney-ks", name: "Finney", lat: 38.1095, lon: -100.706 };
const cell = planImergCells([farm])[0]!;
// Entire subset is a HAND-MADE MINIMAL MOCK, NOT observed NASA precipitation.
function subset(): Subset { return { schema: "soilsense.imerg-point/v1", product: PRODUCTS.late, stream: "late", grid: gridPoint(farm.lat, farm.lon), units: "mm/day", timeStandard: "UTC", retrievedAt: now.toISOString(), start: "2026-11-01", end: "2026-11-14", source: "https://disc.gsfc.nasa.gov/datasets/GPM_3IMERGDL_07/summary", attribution: "mock source attribution", observations: Array.from({ length: 14 }, (_, i) => ({ date: shift("2026-11-01", i), mm: i, count: 48, revision: "hand-made V07 mock", sourceUrl: "https://opendap.earthdata.nasa.gov/collections/mock/granules/mock.ascii" })) }; }
function storage() {
 const sqlite = new DatabaseSync(":memory:"); for (const file of readdirSync("migrations").sort()) sqlite.exec(readFileSync(`migrations/${file}`, "utf8"));
 const prepare = (sql: string, args: unknown[] = []) => ({ sql, args, bind: (...a: unknown[]) => prepare(sql, a), first: async () => sqlite.prepare(sql).get(...args as never[]) ?? null, all: async () => ({ results: sqlite.prepare(sql).all(...args as never[]) }), run: async () => sqlite.prepare(sql).run(...args as never[]) });
 const db = { prepare, batch: async (stmts: { sql: string; args: never[] }[]) => { sqlite.exec("BEGIN"); try { for (const s of stmts) sqlite.prepare(s.sql).run(...s.args); sqlite.exec("COMMIT"); } catch(e) { sqlite.exec("ROLLBACK"); throw e; } return []; } } as unknown as D1Database;
 const objects = new Map<string, string>(); const bucket = { head: async (key: string) => objects.has(key) ? { key } : null, put: async (key: string, value: string) => { objects.set(key, value); return { key }; }, get: async (key: string) => objects.has(key) ? { body: objects.get(key), httpEtag: '"mock"' } : null } as unknown as R2Bucket;
 return { env: { DB: db, EVIDENCE: bucket, EARTHDATA_TOKEN: "mock-not-a-real-credential" } as Env, sqlite, objects };
}
const step: StepRunner = { do: async (_n, _c, fn) => fn() };
const options = (data = subset()) => ({ now, trigger: "manual" as const, instanceId: "mock-run", farms: [farm], latest: async () => data.end, retrieve: async () => data });
describe("IMERG validated second-product refresh (hand-made mock observations)", () => {
 it("builds a tiny constraint from the actual retrieved Final V07B DDS metadata", () => {
  const dds = readFileSync("test/fixtures/imerg-final-finney-20220701.dds", "utf8");
  expect(pointConstraint(dds, cell)).toContain("precipitation[0:1:0][792:1:792][1281:1:1281]");
 });
 it("mocked HTTP 403 from cloud DAP fails closed without publishing substitute values", async () => {
  const base = "https://opendap.earthdata.nasa.gov/collections/mock/granules/GPM_3IMERGDL.07%3Amock.nc4";
  const fetcher = vi.fn(async (url: string) => url.includes("cmr.earthdata") ? Response.json({ feed: { entry: [{ time_start: "2026-11-14T00:00:00.000Z", links: [{ title: "OPeNDAP", href: base }] }] } }) : new Response("mock backend DMR++ failure", { status: 403 }));
  await expect(retrieveSubset({ EARTHDATA_TOKEN: "mock-not-a-real-credential" }, farm.lat, farm.lon, "2026-11-14", "2026-11-14", "late", fetcher)).rejects.toThrow(/HTTP 403/);
  expect(fetcher).toHaveBeenCalledTimes(2);
 });
 it("groups containing cells and excludes private metadata from upstream planning", () => { expect(planImergCells([farm, { ...farm, id: "another" }])).toHaveLength(1); expect(cell.farmIds).toEqual(["finney-ks"]); });
 it("accepts complete V07 Late and hashes observations independent of retrieval time", async () => { const a = await validateImerg(subset(), cell, now), data = subset(); data.retrievedAt = "2026-11-16T00:00:00Z"; const b = await validateImerg(data, cell, now); expect(a.ok).toBe(true); expect(b).toEqual(a); });
 it.each(["stream", "units", "grid", "gap", "count", "stale"])("rejects invalid %s before publication", async (mode) => {
  const data = subset(); if (mode === "stream") { data.stream = "final"; data.product = PRODUCTS.final; } if (mode === "units") (data as unknown as { units: string }).units = "mm/hr"; if (mode === "grid") data.grid.lat += 1; if (mode === "gap") data.observations[3]!.mm = null; if (mode === "count") data.observations[3]!.count = 47; if (mode === "stale") data.end = "2026-10-10";
  expect((await validateImerg(data, cell, now)).ok).toBe(false);
 });
 it("publishes R2 then one D1 transaction; repeated content and events are idempotent", async () => {
  const { env, sqlite, objects } = storage(); expect((await runImergRefresh(env, step, options())).cells[0]?.outcome).toBe("published");
  expect((await runImergRefresh(env, step, options())).cells[0]?.outcome).toBe("unchanged");
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM imerg_snapshots").get()).toEqual({ n: 1 }); expect(sqlite.prepare("SELECT COUNT(*) AS n FROM imerg_snapshot_events").get()).toEqual({ n: 1 }); expect(objects.size).toBe(2);
  expect(await acceptedImergFor(env.DB!, farm.id, now)).toMatchObject({ usable: true, snapshot: { dataThrough: "2026-11-14" } });
  const response = await app.request("/api/refresh/imerg/status", {}, env); expect(response.status).toBe(200); expect(await response.json()).toMatchObject({ product: "GPM_3IMERGDL V07 Late" });
  expect(sqlite.prepare("SELECT COUNT(*) AS n FROM power_snapshots").get()).toEqual({ n: 0 });
 });
 it("same-period revisions get new immutable ids; stale consumers skip without deleting last good", async () => {
  const { env, sqlite } = storage(); const first = await runImergRefresh(env, step, options()); const revised = subset(); revised.observations[4]!.mm = 20; const second = await runImergRefresh(env, step, options(revised)); expect(first.cells[0]?.snapshotId).not.toEqual(second.cells[0]?.snapshotId); expect(sqlite.prepare("SELECT COUNT(*) AS n FROM imerg_snapshots").get()).toEqual({ n: 2 }); expect(await acceptedImergFor(env.DB!, farm.id, new Date("2026-11-20"))).toMatchObject({ usable: false });
 });
 it("upstream errors, partial data and failed R2 publication keep last good pointers", async () => {
  const { env, sqlite } = storage(); const good = await runImergRefresh(env, step, options()); const partial = subset(); partial.observations[4]!.mm = null;
  expect((await runImergRefresh(env, step, options(partial))).cells[0]?.outcome).toBe("rejected");
  expect((await runImergRefresh(env, step, { ...options(), retrieve: async () => { throw new Error("503 provider unavailable"); } })).cells[0]?.outcome).toBe("error");
  const revised = subset(); revised.observations[4]!.mm = 30; const put = vi.spyOn(env.EVIDENCE!, "put").mockRejectedValue(new Error("R2 unavailable")); expect((await runImergRefresh(env, step, options(revised))).cells[0]?.outcome).toBe("error"); put.mockRestore();
  expect(sqlite.prepare("SELECT snapshot_id FROM imerg_snapshot_current").get()).toEqual({ snapshot_id: good.cells[0]?.snapshotId });
 });
 it("failed publication transaction rolls back accepted row, pointer and event", async () => {
  const { env, sqlite } = storage(); sqlite.exec("CREATE TRIGGER fail_event BEFORE INSERT ON imerg_snapshot_events BEGIN SELECT RAISE(ABORT,'mock event write failed'); END;");
  expect((await runImergRefresh(env, step, options())).cells[0]?.outcome).toBe("error"); expect(sqlite.prepare("SELECT COUNT(*) AS n FROM imerg_snapshot_current").get()).toEqual({ n: 0 }); expect(sqlite.prepare("SELECT COUNT(*) AS n FROM imerg_snapshots").get()).toEqual({ n: 0 });
 });
 it("missing credentials become visible error, without retrieving or creating data", async () => {
  const { env, sqlite } = storage(); delete env.EARTHDATA_TOKEN; const retrieve = vi.fn(); expect((await runImergRefresh(env, step, { ...options(), retrieve })).cells[0]?.outcome).toBe("error"); expect(retrieve).not.toHaveBeenCalled(); expect(sqlite.prepare("SELECT outcome FROM imerg_refresh_attempts").get()).toEqual({ outcome: "error" });
 });
 it("daily starts deduplicate, manual route rejects unauthenticated callers", async () => {
  const create = vi.fn().mockResolvedValueOnce({ id: "imerg-daily-2026-11-15" }).mockRejectedValueOnce(new Error("already exists")); const env: Env = { IMERG_REFRESH: { create } as unknown as Env["IMERG_REFRESH"] }; expect(await startImergRefresh(env, "cron", now)).toMatchObject({ created: true }); expect(await startImergRefresh(env, "cron", now)).toMatchObject({ created: false }); expect((await app.request("/api/refresh/imerg/run", { method: "POST" }, env)).status).toBe(401);
 });
});
