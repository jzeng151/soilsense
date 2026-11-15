import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import app from "../src/worker/index";
import type { Env } from "../src/worker/env";

// These binding fakes test dispatch only, not Cloudflare cron delivery or NASA availability.
async function dispatch(env: Env) {
  const pending: Promise<unknown>[] = [];
  await app.scheduled({ cron: "43 5 * * *" } as Parameters<typeof app.scheduled>[0], env,
    { waitUntil: (p: Promise<unknown>) => { pending.push(p); } } as unknown as Parameters<typeof app.scheduled>[2]);
  await Promise.all(pending);
}

describe("IMERG opt-in scheduled dispatch", () => {
  it("keeps the new Workflow out of default deployment", () => {
    const production = readFileSync("wrangler.jsonc", "utf8");
    expect(production).not.toMatch(/"binding"\s*:\s*"IMERG_REFRESH"/);
    const offline = readFileSync("wrangler.offline.jsonc", "utf8");
    expect(offline).toMatch(/"binding"\s*:\s*"IMERG_REFRESH"/);
    // Without this path, static SPA fallback silently returns HTML, not a scheduled event.
    expect(offline).toMatch(/"run_worker_first"\s*:\s*\[[^\]]*"\/__scheduled"/);
  });
  it("dispatches POWER alone when optional IMERG is not bound", async () => {
    const create = vi.fn().mockResolvedValue({ id: "power-fake" });
    await dispatch({ POWER_REFRESH: { create } as unknown as Env["POWER_REFRESH"] });
    expect(create).toHaveBeenCalledOnce();
    expect(create.mock.calls[0]?.[0]).toMatchObject({ params: { trigger: "cron" } });
  });
  it("starts POWER even when IMERG creation fails", async () => {
    const power = vi.fn().mockResolvedValue({ id: "power-fake" });
    const imerg = vi.fn().mockRejectedValue(new Error("constructed binding failure"));
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      await dispatch({ POWER_REFRESH: { create: power } as unknown as Env["POWER_REFRESH"],
        IMERG_REFRESH: { create: imerg } as unknown as Env["IMERG_REFRESH"] });
      expect(power).toHaveBeenCalledOnce();
      expect(imerg).toHaveBeenCalledOnce();
      expect(log).toHaveBeenCalledWith(JSON.stringify({ msg: "IMERG refresh start failed" }));
    } finally { log.mockRestore(); }
  });
});
