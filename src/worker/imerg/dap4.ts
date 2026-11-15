// Strict bounded IMERG DAP4 singleton decoder, not a general DAP library.
// DAP4 chunk flags/byte order and per-variable CRC32 follow the DAP4 spec.
import type { gridPoint, Observation } from "./client";
type Grid = ReturnType<typeof gridPoint>;
const variables = (xml: string) => [...xml.matchAll(/<(Float32|Float64|Int8|Int16|Int32) name="(\w+)">([\s\S]*?)<\/\1>/g)];
function attr(block: string, name: string): string {
 const v = block.match(new RegExp(`<Attribute name="${name}"[^>]*>\\s*<Value>([^<]*)</Value>`))?.[1];
 if (v === undefined) throw new Error(`Missing DAP4 ${name}`);
 return v;
}
export function dap4Constraint(xml: string, grid: Grid): string {
 if (!xml.includes('dapVersion="4.0"') || /<(?:Error|Group)\b/.test(xml)) throw new Error("Invalid IMERG DMR");
 const dims = new Map([...xml.matchAll(/<Dimension name="(\w+)" size="(\d+)"\/>/g)].map(m => [m[1], Number(m[2])]));
 const vars = variables(xml);
 return ["precipitation", "precipitation_cnt", "lat", "lon", "time"].map(name => {
  const v = vars.find(v => v[2] === name); if (!v) throw new Error("Missing DAP4 variable");
  const names = [...v[3]!.matchAll(/<Dim name="\/(\w+)"\/>/g)].map(m => m[1]!);
  const expected = name.startsWith("precipitation") ? "time,lon,lat" : name;
  if (names.join(",") !== expected) throw new Error("Unexpected DAP4 dimensions");
  if (name === "precipitation" && attr(v[3]!, "units") !== "mm/day") throw new Error("Unexpected IMERG units");
  return "/" + name + names.map(d => {
   const i = d === "time" && dims.get(d) === 1 ? 0 : d === "lon" && dims.get(d) === 3600 ? grid.xi : d === "lat" && dims.get(d) === 1800 ? grid.yi : -1;
   if (i < 0) throw new Error("Unexpected IMERG grid");
   return `[${i}:1:${i}]`;
  }).join("");
 }).join(";");
}
function crc32(bytes: Uint8Array): number {
 let c = 0xffffffff;
 for (const b of bytes) { c ^= b; for (let i = 0; i < 8; i++) c = (c >>> 1) ^ ((c & 1) ? 0xedb88320 : 0); }
 return (c ^ 0xffffffff) >>> 0;
}
export function parseDap4(bytes: Uint8Array, date: string, grid: Grid, sourceUrl: string, revision: string): Observation {
 if (bytes.length > 256000) throw new Error("DAP4 subset too large");
 let at = 0, xml = "", little = false, ended = false;
 const chunks: Uint8Array[] = [];
 while (at < bytes.length) {
  if (ended || at + 4 > bytes.length) throw new Error("Invalid DAP4 framing");
  const flags = bytes[at]!, n = bytes[at + 1]! * 65536 + bytes[at + 2]! * 256 + bytes[at + 3]!;
  if ((flags & ~7) || (flags & 2) || at + 4 + n > bytes.length) throw new Error("DAP4 error or truncated chunk");
  const data = bytes.subarray(at + 4, at + 4 + n);
  if (!xml) { xml = new TextDecoder().decode(data); little = !!(flags & 4); }
  else { if (!!(flags & 4) !== little) throw new Error("DAP4 endian mismatch"); chunks.push(data); }
  ended = !!(flags & 1); at += 4 + n;
 }
 if (!ended || !xml.includes('dapVersion="4.0"') || /<(?:Error|Group)\b/.test(xml)) throw new Error("Invalid DAP4 metadata");
 const payload = new Uint8Array(chunks.reduce((n, c) => n + c.length, 0));
 at = 0; for (const c of chunks) { payload.set(c, at); at += c.length; }
 const view = new DataView(payload.buffer); at = 0;
 const values = new Map<string, number>(), metadata = new Map<string, string>();
 const vars = variables(xml);
 if (vars.length !== 5 || new Set(vars.map(v => v[2])).size !== 5) throw new Error("Unexpected DAP4 variables");
 for (const v of vars) {
  const [type, name, body] = [v[1]!, v[2]!, v[3]!];
  if (!["time", "lon", "lat", "precipitation", "precipitation_cnt"].includes(name)) throw new Error("Unexpected DAP4 variable");
  const dims = [...body.matchAll(/<Dim size="(\d+)"\/>/g)];
  if (dims.length !== (name.startsWith("precipitation") ? 3 : 1) || dims.some(d => d[1] !== "1")) throw new Error("DAP4 response is not a point");
  const n = type === "Float64" ? 8 : type === "Float32" || type === "Int32" ? 4 : type === "Int16" ? 2 : 1;
  if (at + n + 4 > payload.length) throw new Error("Truncated DAP4 variable");
  const value = type === "Float64" ? view.getFloat64(at, little) : type === "Float32" ? view.getFloat32(at, little) : type === "Int32" ? view.getInt32(at, little) : type === "Int16" ? view.getInt16(at, little) : view.getInt8(at);
  if (crc32(payload.subarray(at, at + n)) !== view.getUint32(at + n, little)) throw new Error("DAP4 checksum mismatch");
  at += n + 4; values.set(name, value); metadata.set(name, body);
 }
 if (at !== payload.length) throw new Error("Unexpected DAP4 trailing data");
 const p = metadata.get("precipitation")!, t = metadata.get("time")!;
 if (attr(p, "units") !== "mm/day") throw new Error("Unexpected IMERG precipitation units");
 const epochText = attr(t, "units").match(/^days since (.+)$/)?.[1];
 const epoch = epochText ? Date.parse(epochText) : NaN;
 if (!Number.isFinite(epoch) || new Date(epoch + values.get("time")! * 86400000).toISOString().slice(0, 10) !== date) throw new Error("IMERG observation date mismatch");
  if (![values.get("lat"), values.get("lon")].every(Number.isFinite) || Math.abs(values.get("lat")! - grid.lat) > 0.001 || Math.abs(values.get("lon")! - grid.lon) > 0.001) throw new Error("IMERG grid mismatch");
 const value = values.get("precipitation")!, count = values.get("precipitation_cnt")!, fill = Number(attr(p, "_FillValue"));
 if (!Number.isFinite(fill) || !Number.isInteger(count) || count < 0 || count > 48) throw new Error("Invalid IMERG sample count/fill");
 // Metadata is decimal text; compare in Float32 space, not exact decimal equality.
 const mm = Math.fround(value) === Math.fround(fill) || count !== 48 ? null : value;
 if (mm !== null && (!Number.isFinite(mm) || mm < 0 || mm > 2000)) throw new Error("Invalid precipitation range");
 return { date, mm, count, sourceUrl, revision };
}
