import { execFile } from "node:child_process";
import { createServer, type Server } from "node:http";
import { promisify } from "node:util";
import { afterEach, describe, expect, it } from "vitest";

const execute = promisify(execFile);
let server: Server | undefined;
afterEach(async () => { if (server) await new Promise<void>((resolve, reject) => server!.close(e => e ? reject(e) : resolve())); server = undefined; });

async function runVerification(mode: "empty" | "live" | "http-error" | "missing") {
  let ingestCalls = 0;
  const crops: string[] = [];
  server = createServer(async (req, res) => {
    let text = "";
    for await (const part of req) text += part;
    res.setHeader("Content-Type", "application/json");
    if (req.url === "/api/research/ingest") { ingestCalls++; res.end(JSON.stringify({ dimensions: 768 })); return; }
    if (req.url?.startsWith("/api/research/status")) {
      res.end(JSON.stringify({ corpusVersion: "fixture", embedding: { model: "fixture", dimensions: 768, pooling: "cls" }, ingestion: { status: mode === "missing" ? "missing" : "ready", expectedVectors: 40, indexedVectors: mode === "missing" ? 0 : 40 } })); return;
    }
    const body = JSON.parse(text) as { crops: string[] };
    const crop = body.crops[0]!;
    crops.push(crop);
    if (mode === "http-error") { res.statusCode = 503; res.end(JSON.stringify({ error: "offline" })); return; }
    const live = mode === "live" && crop !== "rice";
    res.end(JSON.stringify({ status: live ? "live" : "empty", passages: live ? [{ chunkId: "fixture", text: "fixture passage", score: 0.8 }] : [], reason: live ? undefined : "no applicable passage matched" }));
  });
  await new Promise<void>(resolve => server!.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("No test server port");
  let code = 0;
  let output = "";
  try {
    const result = await execute(process.execPath, ["scripts/ingest-research.mjs", `http://127.0.0.1:${address.port}`, "--verify-only", "--attempts=1", "--interval-ms=0"], { env: { ...process.env, ADMIN_TOKEN: "test-only" }, timeout: 10_000 });
    output = result.stdout + result.stderr;
  } catch (error) {
    const result = error as { code: number; stdout: string; stderr: string };
    code = result.code; output = result.stdout + result.stderr;
  }
  return { code, output, ingestCalls, crops };
}

describe("research ingestion operator verification", () => {
  it("fails instead of reporting success when every supported crop returns empty", async () => {
    const result = await runVerification("empty");
    expect(result.code).toBe(1);
    expect(result.output).toContain("verification failed");
  });
  it("can verify every crop without calling the mutating ingest endpoint", async () => {
    const result = await runVerification("live");
    expect(result.code).toBe(0);
    expect(result.ingestCalls).toBe(0);
    expect(result.crops).toEqual(["corn", "soybean", "winter_wheat", "oats", "alfalfa", "sorghum", "fallow", "cover", "rice"]);
  });
  it("fails on a query HTTP error", async () => {
    expect((await runVerification("http-error")).code).toBe(1);
  });
  it("fails when vectors are missing even if the bundled corpus is present", async () => {
    const result = await runVerification("missing");
    expect(result.code).toBe(1);
    expect(result.ingestCalls).toBe(0);
  });
});
