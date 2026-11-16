// Opt-in: real Wrangler source + real HTTP API/cache target (SQLite), never a remote write.
// PLAN_LIVE_SOURCE=http://127.0.0.2:8791 npx vitest run test/plan-prefetch-live.test.ts
import { execFile } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { promisify } from "node:util";
import { expect, it } from "vitest";
import { api } from "../src/worker/routes/api";
const run = promisify(execFile);
it.skipIf(!process.env.PLAN_LIVE_SOURCE)("computes and imports the complete demo matrix, including inferred UI histories, then verifies the exact HTTP target", async () => {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => db.prepare(sql).get(...args as never[]) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...args as never[]) }),
    run: async () => { db.prepare(sql).run(...args as never[]); return { success: true }; },
  });
  const env = { ADMIN_TOKEN: "local-plan-engine-test", DB: { prepare: (sql: string) => stmt(sql) } as unknown as D1Database };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => pending.push(p), passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;
  const server = createServer(async (incoming, outgoing) => {
    try {
      const chunks: Buffer[] = [];
      for await (const chunk of incoming) chunks.push(Buffer.from(chunk));
      const headers = new Headers();
      for (const [key, value] of Object.entries(incoming.headers)) if (value) headers.set(key, Array.isArray(value) ? value.join(",") : value);
      const request = new Request(`http://127.0.0.3:8791${incoming.url?.replace(/^\/api/, "")}`, { method: incoming.method, headers,
        ...(["GET", "HEAD"].includes(incoming.method ?? "GET") ? {} : { body: Buffer.concat(chunks) }) });
      const response = await api.fetch(request, env, ctx);
      outgoing.writeHead(response.status, Object.fromEntries(response.headers));
      outgoing.end(Buffer.from(await response.arrayBuffer()));
    } catch (error) { outgoing.writeHead(500); outgoing.end(JSON.stringify({ error: String(error) })); }
  });
  await new Promise<void>((resolve) => server.listen(8791, "127.0.0.3", resolve));
  try {
    const { stdout } = await run(process.execPath, ["scripts/prefetch-demo.mjs", "http://127.0.0.3:8791"], { timeout: 480000, maxBuffer: 8_000_000,
      env: { ...process.env, ADMIN_TOKEN: env.ADMIN_TOKEN, LOCAL_ADMIN_TOKEN: env.ADMIN_TOKEN, PLAN_COMPUTE_ORIGIN: process.env.PLAN_LIVE_SOURCE } });
    if (process.env.PLAN_PREFETCH_LOG) writeFileSync(process.env.PLAN_PREFETCH_LOG, stdout);
    const summary = /Verified (\d+)\/(\d+) requests \((\d+) required/.exec(stdout)!;
    expect(summary).not.toBeNull();
    expect(Number(summary[1])).toBeGreaterThanOrEqual(336);
    expect(summary[1]).toBe(summary[2]);
    expect(summary[1]).toBe(summary[3]);
    expect(db.prepare("SELECT COUNT(*) AS n FROM cache WHERE key LIKE 'plan:%'").get()).toMatchObject({ n: Number(summary[1]) });
    await Promise.allSettled(pending);
  } finally {
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    db.close();
  }
}, 500000);
