import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import app from "../src/worker/index";
import { buildQuery, freshness, planCells, validateCandidate, type Farm } from "../src/worker/refresh/snapshot";
import { runPowerRefresh, type StepRunner } from "../src/worker/refresh/workflow";

// Real NASA POWER daily response for the Finney County, KS grid cell, 2026-09-01..2026-11-15 (76 days).
const RAW_TEXT = readFileSync(new URL("./fixtures/power-recent-finney-ks.json", import.meta.url), "utf8");
const raw = () => JSON.parse(RAW_TEXT) as { properties: { parameter: Record<string, Record<string, number>> }; parameters: Record<string, { units: string }> };
const RUN_DAY = new Date("2026-11-15T06:00:00Z");
const finney: Farm = { id: "finney-ks", name: "Finney County, KS", lat: 38.1095, lon: -100.706 };
const [cell] = planCells([finney]);
const query = buildQuery(cell!, RUN_DAY);
const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    sql,
    args,
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => {
      db.prepare(sql).run(...(args as never[]));
      return { success: true };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    // D1 batches are one transaction.
    batch: async (list: { sql: string; args: unknown[] }[]) => {
      db.exec("BEGIN");
      try {
        for (const s of list) db.prepare(s.sql).run(...(s.args as never[]));
        db.exec("COMMIT");
      } catch (e) {
        db.exec("ROLLBACK");
        throw e;
      }
      return [];
    },
  } as unknown as D1Database;
}

function fakeR2() {
  const objects = new Map<string, string>();
  const bucket = {
    head: async (k: string) => (objects.has(k) ? { key: k } : null),
    put: async (k: string, v: string) => {
      objects.set(k, v);
      return { key: k };
    },
    get: async (k: string) => (objects.has(k) ? { body: objects.get(k)!, httpEtag: '"x"' } : null),
  };
  return { bucket: bucket as unknown as R2Bucket, objects };
}

const step: StepRunner = { do: async (_name, _cfg, cb) => cb() };

describe("POWER snapshot validation (real NASA POWER response)", () => {
  it("accepts the real response, records the observed data-through date and keeps 60 days", async () => {
    const v = await validateCandidate(raw(), query, cell!);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.content.dates).toHaveLength(60);
    expect(v.content.dataThrough <= "2026-11-15").toBe(true);
    expect(v.content.period.end).toBe(v.content.dataThrough);
    expect(v.snapshotId).toMatch(/^pwr-[0-9a-f]{24}$/);
    expect(freshness(v.content.dataThrough, RUN_DAY).state).toBe("fresh");
  });

  it("stores fill values as null, never zero", async () => {
    const r = raw();
    const v0 = await validateCandidate(r, query, cell!);
    if (!v0.ok) throw new Error("fixture should validate");
    const day = v0.content.dates[30]!.replace(/-/g, "");
    r.properties.parameter.PRECTOTCORR![day] = -999;
    const v = await validateCandidate(r, query, cell!);
    expect(v.ok).toBe(true);
    if (!v.ok) return;
    expect(v.content.values.PRECTOTCORR[30]).toBeNull();
  });

  it("rejects a missing variable, wrong units, and stale observations", async () => {
    const noRoot = raw();
    delete noRoot.properties.parameter.GWETROOT;
    expect(await validateCandidate(noRoot, query, cell!)).toMatchObject({ ok: false, errors: [expect.stringMatching(/GWETROOT/)] });

    const inches = raw();
    inches.parameters.PRECTOTCORR!.units = "in/day";
    const u = await validateCandidate(inches, query, cell!);
    expect(u.ok).toBe(false);

    const stale = raw();
    const keys = Object.keys(stale.properties.parameter.PRECTOTCORR!).sort().slice(-20);
    for (const k of keys) for (const v of Object.keys(stale.properties.parameter)) stale.properties.parameter[v]![k] = -999;
    const s = await validateCandidate(stale, query, cell!);
    expect(s.ok).toBe(false);
    if (!s.ok) expect(s.errors.some((e) => /stale/.test(e))).toBe(true);
  });
});

describe("POWER refresh workflow logic", () => {
  it("publishes once, treats an identical republish as unchanged, and keeps the last snapshot when a later fetch fails", async () => {
    const DB = fakeD1();
    const r2 = fakeR2();
    const env = { DB, EVIDENCE: r2.bucket };
    const ok = async () => ({ status: 200, text: RAW_TEXT });
    const first = await runPowerRefresh(env, step, { now: RUN_DAY, trigger: "cron", instanceId: "daily-2026-11-15", farms: [finney], fetchPower: ok });
    expect(first.cells[0]).toMatchObject({ outcome: "published", errors: [] });
    const again = await runPowerRefresh(env, step, { now: RUN_DAY, trigger: "manual", instanceId: "manual-1", farms: [finney], fetchPower: ok });
    expect(again.cells[0]).toMatchObject({ outcome: "unchanged", snapshotId: first.cells[0]!.snapshotId });
    expect(r2.objects.size).toBe(2); // bundle + raw source, stored once
    expect((await DB.prepare("SELECT COUNT(*) AS n FROM power_snapshots").first<{ n: number }>())!.n).toBe(1);

    const down = async (): Promise<{ status: number; text: string }> => {
      throw new Error("NASA POWER: HTTP 503");
    };
    const failed = await runPowerRefresh(env, step, { now: RUN_DAY, trigger: "cron", instanceId: "daily-x", farms: [finney], fetchPower: down });
    expect(failed.cells[0]!.outcome).toBe("error");
    const cur = await DB.prepare("SELECT snapshot_id FROM power_snapshot_current WHERE farm_id = 'finney-ks'").first<{ snapshot_id: string }>();
    expect(cur!.snapshot_id).toBe(first.cells[0]!.snapshotId);

    const garbage = async () => ({ status: 200, text: "<html>maintenance</html>" });
    const rejected = await runPowerRefresh(env, step, { now: RUN_DAY, trigger: "cron", instanceId: "daily-y", farms: [finney], fetchPower: garbage });
    expect(rejected.cells[0]).toMatchObject({ outcome: "rejected", errors: ["malformed response: not JSON"] });

    // Status: the last attempt failed, but the accepted snapshot is still served with its manifest.
    const status = (await (await app.request("/api/refresh/status", {}, env, ctx)).json()) as { farms: { farmId: string; state: string; snapshot: { id: string; manifestUrl: string } | null }[] };
    const f = status.farms.find((x) => x.farmId === "finney-ks")!;
    expect(f.state).toBe("error");
    expect(f.snapshot!.id).toBe(first.cells[0]!.snapshotId);
    const m = (await (await app.request(f.snapshot!.manifestUrl, {}, env, ctx)).json()) as { manifest: { source: { url: string }; license: { attribution: string }; parameters: { PRECTOTCORR: { units: string } } } };
    expect(m.manifest.source.url).toContain("power.larc.nasa.gov");
    expect(m.manifest.parameters.PRECTOTCORR.units).toBe("mm/day");
    expect(m.manifest.license.attribution).toMatch(/NASA Langley Research Center/);
    const bundle = await app.request(`${f.snapshot!.manifestUrl}/bundle`, {}, env, ctx);
    expect(bundle.status).toBe(200);
  });
});

describe("manual refresh route", () => {
  it("is admin-only and accepts no field or URL input", async () => {
    const created: unknown[] = [];
    const POWER_REFRESH = { create: async (o: { id: string }) => (created.push(o), { id: o.id }) };
    expect((await app.request("/api/refresh/run", { method: "POST" }, { POWER_REFRESH }, ctx)).status).toBe(403);
    expect((await app.request("/api/refresh/run", { method: "POST", headers: { Authorization: "Bearer nope" } }, { POWER_REFRESH, ADMIN_TOKEN: "secret-token" }, ctx)).status).toBe(401);
    expect((await app.request("/api/refresh/run", { method: "POST", headers: { Authorization: "Bearer secret-token" } }, { ADMIN_TOKEN: "secret-token" }, ctx)).status).toBe(503);
    const ok = await app.request("/api/refresh/run", { method: "POST", headers: { Authorization: "Bearer secret-token" } }, { POWER_REFRESH, ADMIN_TOKEN: "secret-token" }, ctx);
    expect(ok.status).toBe(202);
    expect(created).toHaveLength(1);
    expect((created[0] as { params: unknown }).params).toEqual({ trigger: "manual" });
  });
});
