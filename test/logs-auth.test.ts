import { describe, expect, it } from "vitest";
import { api } from "../src/worker/routes/api";

// /api/logs lists plan and call rows (masked callers, coordinates). It must never be served without the admin token.
describe("GET /logs is admin-only and fails closed", () => {
  const get = (env: Record<string, unknown>, auth?: string) =>
    api.request("/logs", { headers: auth ? { Authorization: auth } : {} }, env);

  it("refuses when no ADMIN_TOKEN is configured", async () => {
    expect((await get({})).status).toBe(401);
    expect((await get({}, "Bearer anything")).status).toBe(401);
  });
  it("refuses a missing or wrong token", async () => {
    expect((await get({ ADMIN_TOKEN: "secret-token" })).status).toBe(401);
    expect((await get({ ADMIN_TOKEN: "secret-token" }, "Bearer wrong-token!")).status).toBe(401);
  });
  it("serves with the right token", async () => {
    const res = await get({ ADMIN_TOKEN: "secret-token" }, "Bearer secret-token");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ logs: [] });
  });
});
