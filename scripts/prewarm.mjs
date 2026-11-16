// Post-deploy / CI entry point. Runs compute locally, never on the Free target.
// Node >=22.18; ADMIN_TOKEN is the target's existing admin secret.
import { spawn, spawnSync } from "node:child_process";
import { mkdtempSync, openSync, closeSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { main } from "./prefetch-demo.mjs";
const args = process.argv.slice(2);
let child, scratch, log;
const wrangler = resolve("node_modules/wrangler/bin/wrangler.js");
const run = argv => {
  const result = spawnSync(process.execPath, argv, { stdio: "inherit", env: { ...process.env, WRANGLER_SEND_METRICS: "false" } });
  if (result.status !== 0) throw new Error(`Local preparation failed (${result.status})`);
};
try {
  if (!args.includes("--list") && !process.env.PLAN_COMPUTE_ORIGIN) {
    if (!process.env.ADMIN_TOKEN) throw new Error("ADMIN_TOKEN is required");
    if (!args.includes("--target")) throw new Error("Usage: npm run prewarm -- --target <url>");
    const port = Number(process.env.PREWARM_PORT ?? 8815);
    if (!Number.isInteger(port) || port < 1024 || port > 65535) throw new Error("Invalid PREWARM_PORT");
    const origin = `http://127.0.0.1:${port}`;
    // Never accidentally use or kill a different session's process on the chosen port.
    try { await fetch(`${origin}/healthz`, { signal: AbortSignal.timeout(500) }); throw new Error(`Port ${port} is occupied; set PREWARM_PORT to an unused port`); }
    catch (error) { if (error.message.includes("occupied")) throw error; }
    scratch = mkdtempSync(join(tmpdir(), "soilsense-prewarm-"));
    const state = join(scratch, "state");
    run([wrangler, "d1", "migrations", "apply", "fieldshift", "--local", "--persist-to", state, "-c", "wrangler.offline.jsonc"]);
    // Asset bundle must match the checkout; no deploy or remote database operation.
    const npm = process.platform === "win32" ? "npm.cmd" : "npm";
    const built = spawnSync(npm, ["run", "build:web"], { stdio: "inherit", shell: process.platform === "win32" });
    if (built.status !== 0) throw new Error("Local asset build failed");
    const localToken = randomUUID();
    log = openSync(join(scratch, "wrangler.log"), "a");
    child = spawn(process.execPath, [wrangler, "dev", "-c", "wrangler.offline.jsonc", "--ip", "127.0.0.1", "--port", String(port),
      "--persist-to", state, "--var", "PLAN_COMPUTE_MODE:inline", "--var", `ADMIN_TOKEN:${localToken}`], {
      stdio: ["ignore", log, log], env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
    });
    let ready = false;
    for (let i = 0; i < 120; i++) {
      if (child.exitCode !== null) throw new Error(`Local Wrangler exited; inspect ${join(scratch, "wrangler.log")}`);
      try { const r = await fetch(`${origin}/api/plan/runtime`, { signal: AbortSignal.timeout(1000) }); if (r.ok) { ready = true; break; } } catch {}
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    if (!ready) throw new Error(`Local Wrangler not ready; inspect ${join(scratch, "wrangler.log")}`);
    process.env.PLAN_COMPUTE_ORIGIN = origin;
    process.env.LOCAL_ADMIN_TOKEN = localToken;
  }
  await main(args);
} catch (error) { console.error(error.message); process.exitCode = 1; }
finally {
  if (child?.pid) {
    if (process.platform === "win32") spawnSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    else { child.kill("SIGTERM"); await Promise.race([new Promise(resolve => child.once("exit", resolve)), new Promise(resolve => setTimeout(resolve, 5000))]); }
  }
  if (log !== undefined) closeSync(log);
  // Retain failure logs for diagnosis, remove only the ephemeral successful source.
  if (scratch && !process.exitCode) rmSync(scratch, { recursive: true, force: true, maxRetries: 3 });
}
