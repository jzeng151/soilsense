export type LonLat = [number, number];
export interface FieldBoundary {
  id: string;
  source: "usda-csb";
  name?: string;
  polygon: LonLat[][];
  areaAcres: number;
  centroid: { lat: number; lon: number };
  cropSequence?: { year: number; cdlCode: number; crop: string }[];
  provenance: { product: string; version: string; url: string; retrieved: string; sha256?: string };
}
export interface FieldsStatus { enabled: boolean; areas: { id: string; name: string; bbox: [number, number, number, number] }[] }
