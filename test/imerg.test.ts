import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dapUrl, days, gridPoint, parsePoint, pointConstraint, PRODUCTS, retrieveSubset, type Fetcher, type Subset } from "../src/worker/imerg/client";
import { compare } from "../src/worker/imerg/comparison";
import { imerg } from "../src/worker/imerg/routes";
import { clearMemoryCache } from "../src/worker/lib/cache";
import { mockAscii, mockDas, mockDds, mockGrid } from "./fixtures/imerg-mocks";
afterEach(() => { clearMemoryCache(); vi.restoreAllMocks(); });
const link = "https://opendap.earthdata.nasa.gov/collections/mock/granules/GPM_3IMERGDF.07%3Amock.nc4";
describe("IMERG candidate adapter: hand-made protocol mocks, NOT live verification", () => {
 it("uses exact retrieved Final metadata, but fails closed on unsupported V07C Int8 count types", () => {
  const dds = readFileSync("test/fixtures/imerg-final-finney-20220701.dds", "utf8");
  expect(pointConstraint(dds, mockGrid)).toContain("precipitation[0:1:0][792:1:792][1281:1:1281]");
  expect(() => pointConstraint(mockDds.replace("Int32 precipitation_cnt", "Int8 precipitation_cnt"), mockGrid)).toThrow(/Unsupported/);
 });
 it("rejects embedded DAP errors even with HTTP-200-like response content", () => {
  expect(() => pointConstraint('Error { code = 403; message = "mock EULA Acceptance Failure"; }', mockGrid)).toThrow();
  expect(() => parsePoint('Dataset: mock\nError { code = 403; }', mockDas, "2022-07-01", mockGrid, link, "mock")).toThrow();
 });
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
 it("discovers granules, fetches only a constrained DAP4 point, follows NASA-only auth redirects and caches", async () => {
  const calls: { url: string; init?: RequestInit }[] = [];
  const liveLink = link.replace("GPM_3IMERGDF.07%3Amock.nc4", "GPM_3IMERGDL.07%3A3B-DAY-L.MS.MRG.3IMERG.20261113-S000000-E235959.V07C.nc4");
  const fetcher: Fetcher = async (url, init) => { calls.push({ url, init });
   if (url.includes("cmr.earthdata")) return Response.json({ feed: { entry: [{ time_start: "2026-11-13T00:00:00.000Z", links: [{ title: "OPeNDAP request URL", href: liveLink }] }] } });
   if (url.endsWith(".dmr.xml")) return new Response(readFileSync("test/fixtures/imerg-live/late-20261113.dmr.xml", "utf8"));
   if (!url.includes("urs.earthdata")) return new Response(null, { status: 302, headers: { Location: "https://urs.earthdata.nasa.gov/mock-redirect" } });
   return new Response(new Uint8Array(readFileSync("test/fixtures/imerg-live/late-finney-20261113.dap")));
  };
  const value = await retrieveSubset({ EARTHDATA_TOKEN: "test-only-not-a-real-token" }, 38.1095, -100.706, "2026-11-13", "2026-11-13", "late", fetcher);
  expect(value.observations[0]?.mm).toBe(0); expect(calls).toHaveLength(4);
  expect(calls[0]?.init?.headers).toEqual({});
  expect(calls[3]?.init?.headers).toEqual({ Authorization: "Bearer test-only-not-a-real-token" });
  expect(calls.every((c) => c.init?.redirect === "manual")).toBe(true);
  expect(decodeURIComponent(calls[2]!.url)).toContain(".dap?dap4.ce=/precipitation[");
  await retrieveSubset({}, 38.1095, -100.706, "2026-11-13", "2026-11-13", "late", fetcher); expect(calls).toHaveLength(4);
 });
 it("rejects a redirect to a non-NASA host before forwarding credentials", async () => {
  const calls: string[] = [];
  const liveLink = link.replace("GPM_3IMERGDF.07%3Amock.nc4", "GPM_3IMERGDL.07%3A3B-DAY-L.MS.MRG.3IMERG.20261113-S000000-E235959.V07C.nc4");
  const f: Fetcher = async (url) => { calls.push(url); return url.includes("cmr.earthdata") ? Response.json({ feed: { entry: [{ time_start: "2026-11-13T00:00:00Z", links: [{ title: "OPeNDAP", href: liveLink }] }] } }) : new Response(null, { status: 302, headers: { Location: "https://example.com/token-sink" } }); };
  await expect(retrieveSubset({ EARTHDATA_TOKEN: "test-only" }, 42.0563, -93.495, "2026-11-13", "2026-11-13", "late", f)).rejects.toThrow(/Untrusted/);
  expect(calls).toHaveLength(2); expect(calls.some(url => url.includes("example.com"))).toBe(false);
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
