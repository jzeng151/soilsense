import { afterEach, describe, expect, it, vi } from "vitest";
import { dapUrl, days, gridPoint, parsePoint, pointConstraint, PRODUCTS, retrieveSubset, type Fetcher, type Subset } from "../src/worker/imerg/client";
import { compare } from "../src/worker/imerg/comparison";
import { imerg } from "../src/worker/imerg/routes";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { mockAscii, mockDas, mockDds, mockGrid } from "./fixtures/imerg-mocks";
afterEach(() => { clearMemoryCache(); vi.restoreAllMocks(); });
const link = "https://opendap.earthdata.nasa.gov/collections/mock/granules/GPM_3IMERGDF.07%3Amock.nc4";
describe("IMERG candidate adapter: hand-made protocol mocks, NOT live verification", () => {
 it("uses containing cell centers and metadata dimension order, bounds date windows", () => {
  expect(gridPoint(38.1095, -100.706)).toMatchObject({ lat: 38.15, lon: -100.75 });
  expect(pointConstraint(mockDds, mockGrid)).toContain(`precipitation[0:1:0][${mockGrid.xi}:1:${mockGrid.xi}][${mockGrid.yi}:1:${mockGrid.yi}]`);
  expect(() => days("2022-02-30", "2022-03-01")).toThrow();
  expect(() => days("2022-01-01", "2022-02-01")).toThrow();
 });
 it("preserves zero and missing, requires 48 samples, validates UTC date, grid and units", () => {
  const parse = (ascii = mockAscii(), das = mockDas) => parsePoint(ascii, das, "2022-07-01", mockGrid, link, "mock");
  expect(parse(mockAscii("2022-07-01", 0)).mm).toBe(0);
  expect(parse(mockAscii("2022-07-01", -9999.9)).mm).toBeNull();
  expect(parse(mockAscii("2022-07-01", 5, 47)).mm).toBeNull();
  expect(() => parse(mockAscii("2022-07-02"))).toThrow(/date mismatch/);
  expect(() => parse(mockAscii().replace(String(mockGrid.lat), "35"))).toThrow(/grid mismatch/);
  expect(() => parse(mockAscii(), mockDas.replace("mm/day", "mm/hr"))).toThrow(/units/);
 });
 it("fails closed for missing credentials and untrusted service hosts", async () => {
  const f = vi.fn(); await expect(retrieveSubset({}, 38.1095, -100.706, "2022-07-01", "2022-07-01", "final", f)).rejects.toThrow(/EARTHDATA_TOKEN/); expect(f).not.toHaveBeenCalled();
  expect(() => dapUrl("https://example.com/collections/x/granules/y")).toThrow();
 });
 it("discovers granules, fetches only a constrained point, sends bearer only to DAP and caches", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const fetcher: Fetcher = async (url, init) => { calls.push({ url, init });
   if (url.includes("cmr.earthdata")) return Response.json({ feed: { entry: [{ time_start: "2022-07-01T00:00:00.000Z", links: [{ title: "OPeNDAP request URL", href: link }] }] } });
   return new Response(url.endsWith(".dds") ? mockDds : url.endsWith(".das") ? mockDas : mockAscii());
  };
  const value = await retrieveSubset({ EARTHDATA_TOKEN: "test-only-not-a-real-token" }, 38.1095, -100.706, "2022-07-01", "2022-07-01", "final", fetcher);
  expect(value.observations[0]?.mm).toBe(2); expect(calls).toHaveLength(4);
  expect(calls[0]?.init?.headers).toEqual({});
  expect(calls[1]?.init?.headers).toEqual({ Authorization: "Bearer test-only-not-a-real-token" });
  expect(calls.every((c) => c.init?.redirect === "error")).toBe(true);
  expect(decodeURI(calls[3]!.url)).toContain(".ascii?precipitation[");
  await retrieveSubset({}, 38.1095, -100.706, "2022-07-01", "2022-07-01", "final", fetcher); expect(calls).toHaveLength(4);
 });
 it("compares multi-day totals without claiming aligned observation intervals", () => {
  const subset = { observations: Array.from({ length: 14 }, () => ({ mm: 2 })), product: PRODUCTS.final } as Subset;
  const power = { values: Array(14).fill(1) } as Parameters<typeof compare>[1];
  expect(compare(subset, power)).toMatchObject({ imergMm: 28, powerMm: 14, differenceMm: 14, equivalentIntervals: false });
  subset.observations[0]!.mm = null;
  expect(compare(subset, power).differenceMm).toBeNull();
 });
 it("keeps public reads network-free, optional failure visible, warming admin-only", async () => {
  const network = vi.spyOn(globalThis, "fetch");
  const r = await imerg.request("/comparison/finney-ks?end=2022-07-14", {}, {}); expect(await r.json()).toMatchObject({ state: "unavailable" }); expect(network).not.toHaveBeenCalled();
  expect((await imerg.request("/warm/finney-ks", { method: "POST" }, {})).status).toBe(401);
 });
});
