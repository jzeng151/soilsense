export type LonLat = [number, number];
export interface FieldBoundary {
  id: string;                    // CSB: "csb:<CSBID>"; user-registered agent fields: "u_<22+ url-safe random chars>"
  source: "usda-csb";
  name?: string;                 // farmer label, local only
  polygon: LonLat[][];           // GeoJSON Polygon rings, WGS84, outer ring first, closed
  areaAcres: number;             // geodesic area of polygon
  centroid: { lat: number; lon: number };
  cropSequence?: { year: number; cdlCode: number; crop: string }[]; // from CSB attributes when present
  provenance: { product: string; version: string; url: string; retrieved: string; sha256?: string };
}
export interface FieldsStatus { enabled: boolean; areas: { id: string; name: string; bbox: [number, number, number, number] }[] }
