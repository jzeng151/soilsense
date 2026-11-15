import { readFileSync } from "node:fs";
import { crc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { gridPoint } from "../src/worker/imerg/client";
import { dap4Constraint, parseDap4 } from "../src/worker/imerg/dap4";
const grid = gridPoint(38.1095, -100.706);
const recorded = () => new Uint8Array(readFileSync("test/fixtures/imerg-live/late-finney-20261113.dap"));
describe("recorded NASA GES DISC Late V07C DAP4 point", () => {
 it("reads real zero rainfall and 48 samples, matching independently requested constrained ASCII", () => {
  expect(parseDap4(recorded(), "2026-11-13", grid, "fixture", "V07C")).toMatchObject({ mm: 0, count: 48, date: "2026-11-13" });
  const dmr = readFileSync("test/fixtures/imerg-live/late-20261113.dmr.xml", "utf8");
  expect(dap4Constraint(dmr, grid)).toContain("/precipitation[0:1:0][792:1:792][1281:1:1281]");
 });
 it("replays all four real source-linked cells against separate ASCII observations", () => {
  const manifest = JSON.parse(readFileSync("test/fixtures/imerg-live/manifest.json", "utf8")) as { records: { field: string; lat: number; lon: number; file: string; url: string }[] };
  expect(manifest.records).toHaveLength(4);
  const expected: Record<string, number> = { "story-ia": 0, "champaign-il": 0.045, "finney-ks": 0, "lancaster-ne": 0 };
  for (const r of manifest.records) {
   const value = parseDap4(new Uint8Array(readFileSync(`test/fixtures/imerg-live/${r.file}`)), "2026-11-13", gridPoint(r.lat, r.lon), r.url, "V07C");
   expect(value.mm).toBeCloseTo(expected[r.field]!, 6); expect(value.count).toBe(48);
  }
 });
 it("keeps deliberately mutated fill and incomplete-sample protocol cases missing, not zero", () => {
  // Synthetic mutations of the recorded transport, NOT additional NASA observations.
  for (const change of ["fill", "count"] as const) {
   const b = recorded(), n = b[1]! * 65536 + b[2]! * 256 + b[3]!, start = 4 + n + 4;
   const view = new DataView(b.buffer);
   const at = start + (change === "fill" ? 32 : 40), size = change === "fill" ? 4 : 2;
   if (change === "fill") view.setFloat32(at, -9999.90039, true); else view.setInt16(at, 47, true);
   view.setUint32(at + size, crc32(b.subarray(at, at + size)), true);
   expect(parseDap4(b, "2026-11-13", grid, "synthetic-mutation", "mock").mm).toBeNull();
  }
 });
 it("supports an explicitly synthetic signed Int8 count transport without DAP2 conversion", () => {
  const b = recorded(), n = b[1]! * 65536 + b[2]! * 256 + b[3]!;
  const xml = new TextEncoder().encode(new TextDecoder().decode(b.subarray(4, 4+n)).replace(/Int16/g, "Int8"));
  const data = b.subarray(8+n, 8+n+46), payload = new Uint8Array(45);
  payload.set(data.subarray(0,41)); new DataView(payload.buffer).setUint32(41, crc32(payload.subarray(40,41)), true);
  const out = new Uint8Array(4 + xml.length + 4 + payload.length + 4);
  out.set([4, xml.length >>> 16, xml.length >>> 8 & 255, xml.length & 255]); out.set(xml,4);
  out.set([4,0,0,45],4+xml.length); out.set(payload,8+xml.length); out.set([5,0,0,0],8+xml.length+payload.length);
  expect(parseDap4(out,"2026-11-13",grid,"synthetic-mutation","mock").count).toBe(48);
 });
 it("rejects wrong day, wrong cell, corrupt bytes, truncation and embedded HTTP-200 errors", () => {
  expect(() => parseDap4(recorded(), "2026-11-12", grid, "fixture", "V07C")).toThrow(/date/);
  expect(() => parseDap4(recorded(), "2026-11-13", gridPoint(40,-100), "fixture", "V07C")).toThrow(/grid/);
  const bad = recorded(); bad[bad.length - 10] = bad[bad.length - 10]! ^ 1;
  expect(() => parseDap4(bad, "2026-11-13", grid, "fixture", "V07C")).toThrow(/checksum/);
  expect(() => parseDap4(recorded().slice(0,-2), "2026-11-13", grid, "fixture", "V07C")).toThrow();
  expect(() => parseDap4(new TextEncoder().encode('Error { message = "EULA Acceptance Failure"; }'), "2026-11-13", grid, "fixture", "V07C")).toThrow();
 });
});
