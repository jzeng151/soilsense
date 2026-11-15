// Offline HLS subset contract. No tile download/COG decoding runs inside the Worker.
export interface HlsPixel { fmask: number | null; raw: (number | null)[]; reflectance: (number | null)[]; ndvi: number | null; excluded: string[] }
export interface HlsObservation { id: string; collection: string; datetime: string; bands: string[]; assets: Record<string,string>; status: string; pixels: HlsPixel[]; clearPixelCount: number; clearShare: number | null; meanNdvi: number | null; subsetSha256?: string; grid?: { crs: string; window: number[]; transform: number[]; bounds: number[] }; error?: string }
export interface HlsField { id: string; lat: number; lon: number; observations: HlsObservation[]; searches: { url: string; matched: number; candidateIds: string[] }[] }
export interface HlsArtifact { schema: string; retrievedAt: string; method: string; guide: string; scale: number; offset: number; fill: number; qaVersion: string; period: string[]; selection: string; fields: HlsField[] }
export type HlsEvidence = { status: "available" | "unavailable"; reason: string; field: HlsField | null; source: Omit<HlsArtifact,"fields"> | null };
export async function getHlsEvidence(lat: number, lon: number, fetchAsset: () => Promise<Response>): Promise<HlsEvidence> {
  const missing = (reason: string): HlsEvidence => ({ status:"unavailable",reason,field:null,source:null });
  try {
    const r = await fetchAsset(); if (!r.ok) return missing("Committed HLS subset unavailable");
    const artifact = await r.json() as HlsArtifact;
    if (artifact.schema !== "hls-demo-window-v1" || artifact.qaVersion !== "hls-v2-strict-v1" || artifact.scale !== 0.0001 || !Array.isArray(artifact.fields)) return missing("Unrecognized HLS snapshot");
    // Exact demo coordinates only: never present a neighbor's vegetation as this field.
    const field = artifact.fields.find(f => Math.abs(f.lat-lat)<0.000001 && Math.abs(f.lon-lon)<0.000001);
    if (!field) return missing("Offline HLS evidence exists only for the four exact demo points; no observation for this point");
    const { fields: _fields, ...source } = artifact;
    return { status:"available",reason:"Historical 3×3-pixel (90×90 m) sample around the demo point, not a field-boundary average. No gap fill; low NDVI does not establish bare soil. Not observations of hypothetical rotations.",field,source };
  } catch { return missing("HLS snapshot read failed; missing remains unknown"); }
}
