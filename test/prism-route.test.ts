import { describe, expect, it, vi } from "vitest";
import { prismCrosscheck } from "../src/worker/routes/prismCrosscheck";
vi.mock("../src/worker/data/prism", () => ({ getPrism: vi.fn().mockRejectedValue(new Error("provider down")) }));
vi.mock("../src/worker/data/crosscheckWeather", () => ({ getCrosscheckPower: vi.fn().mockRejectedValue(new Error("provider down")), getCrosscheckDaymet: vi.fn().mockRejectedValue(new Error("provider down")), crosscheckMerge: vi.fn() }));
vi.mock("../src/worker/data/crosscheckHourly", () => ({ getCrosscheckHourly: vi.fn().mockRejectedValue(new Error("provider down")), aggregatePowerHours: vi.fn() }));
vi.mock("../src/worker/imerg/client", async importOriginal => {
  const original = await importOriginal<typeof import("../src/worker/imerg/client")>();
  return { ...original, retrieveSubset: vi.fn().mockRejectedValue(new Error("private provider error")) };
});
describe("PRISM endpoint guards and independent failure", () => {
  it("rejects missing coordinates, impossible dates, current years and long windows", async () => {
    for (const q of ["start=2023-05-01", "lat=&lon=-100", "lat=38&lon=-100&start=2023-02-30", "lat=38&lon=-100&start=2023-01-01&end=2023-02-01", `lat=38&lon=-100&start=${new Date().getUTCFullYear()}-01-01`]) expect((await prismCrosscheck.request(`/?${q}`, {}, {})).status).toBe(400);
  });
  it("returns explicit null providers when no DB and providers fail; does not fabricate evidence", async () => {
    const response = await prismCrosscheck.request("/?lat=38&lon=-100", {}, {});
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ prism: null, power: null, daymet: null, hourly: null, imerg: null, diagnostics: [], imergDiagnostics: null });
  });
  it("requires explicit admin auth before validating or warming Earthdata", async () => {
    expect((await prismCrosscheck.request("/imerg-warm", { method: "POST" }, {})).status).toBe(401);
    expect((await prismCrosscheck.request("/imerg-warm", { method: "POST", headers: { Authorization: "Bearer wrong" } }, { ADMIN_TOKEN: "local-test" })).status).toBe(401);
    expect((await prismCrosscheck.request("/imerg-warm", { method: "POST", headers: { Authorization: "Bearer local-test" } }, { ADMIN_TOKEN: "local-test" })).status).toBe(503);
  });
  it("sanitizes upstream failure and enforces 16-day native adapter limit", async () => {
    const env = { ADMIN_TOKEN: "local-test", DB: {} as D1Database };
    const init = { method: "POST", headers: { Authorization: "Bearer local-test" } };
    expect((await prismCrosscheck.request("/imerg-warm?lat=38&lon=-100&start=2023-05-01&end=2023-05-17", init, env)).status).toBe(400);
    const r = await prismCrosscheck.request("/imerg-warm?lat=38&lon=-100&start=2023-05-01&end=2023-05-03", init, env);
    expect(r.status).toBe(503); expect(await r.text()).not.toContain("private provider error");
  });
});
