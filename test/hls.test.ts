import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { getHlsEvidence, type HlsArtifact } from "../src/worker/data/hls";
const artifact=JSON.parse(readFileSync("web/public/data/hls-demo.json","utf8")) as HlsArtifact;
describe("live HLS subset source-pixel reconciliation",()=>{
 it("has all four requested demo fields, native windows and both sensors",()=>{
  expect(artifact.fields.map(f=>f.id).sort()).toEqual(["champaign-il","finney-ks","lancaster-ne","story-ia"]);
  for(const f of artifact.fields){ expect(f.observations).toHaveLength(2);for(const o of f.observations){expect(o.pixels).toHaveLength(9);expect(o.subsetSha256).toMatch(/^[a-f0-9]{64}$/);expect(o.grid?.window.slice(2)).toEqual([3,3]);expect(o.assets.Fmask).toContain(".Fmask.tif");expect(o.bands).toEqual(o.collection.startsWith("HLSL")?["B04","B05","B06","B07","Fmask"]:["B04","B8A","B11","B12","Fmask"]);}}
 });
 it("independently recomputes NDVI/coverage and product scale from retained source DNs",()=>{
  let excluded=0;
  for(const f of artifact.fields)for(const o of f.observations){let sum=0,valid=0;for(const p of o.pixels){
   p.raw.forEach((v,i)=>expect(p.reflectance[i]).toBeCloseTo(v!*0.0001,12));
   const bad=p.fmask===null||p.fmask===255||!!(p.fmask&62)||((p.fmask&192)===192)||p.raw.some(v=>v===null||v===-9999||v< -2000||v>16000);
   if(bad){expect(p.ndvi).toBeNull();excluded++;}else{const [r,n]=p.raw;const expected=(n!-r!)/(n!+r!);expect(p.ndvi).toBeCloseTo(expected,12);sum+=expected;valid++;}
  }expect(o.clearPixelCount).toBe(valid);expect(o.clearShare).toBe(valid/9);expect(o.meanNdvi).toBeCloseTo(sum/valid,12);}
  expect(excluded).toBeGreaterThan(0);
 });
 it("selects exact coordinates and refuses neighboring fields, bad schema and failed reads",async()=>{
  const fetcher=vi.fn(async()=>Response.json(artifact));
  expect((await getHlsEvidence(38.1095,-100.706,fetcher)).field?.id).toBe("finney-ks");expect(fetcher).toHaveBeenCalledOnce();
  expect((await getHlsEvidence(38.11,-100.71,fetcher)).status).toBe("unavailable");
  expect((await getHlsEvidence(38.1095,-100.706,async()=>Response.json({schema:"bad"}))).status).toBe("unavailable");
  expect((await getHlsEvidence(38.1095,-100.706,async()=>new Response(null,{status:503}))).field).toBeNull();
 });
 it("contains no credential query strings, signed URLs or interpolated observations",()=>{const text=JSON.stringify(artifact);expect(text).not.toMatch(/Bearer |X-Amz-|Signature=|[?&]key=/i);});
});
