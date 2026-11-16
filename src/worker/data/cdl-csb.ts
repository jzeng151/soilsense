// Offline fallback from the committed, source-hashed USDA CSB subsets. Never use a nearby field.
import type { FieldBoundary, LonLat } from "../../shared/fields";
import type { CropHistory } from "../../shared/types";
import { CDL_TO_CROP } from "../../engine/crops";
import story from "../../../data/fields/story.json";
import champaign from "../../../data/fields/champaign.json";
import finney from "../../../data/fields/finney.json";
import lancaster from "../../../data/fields/lancaster.json";

const fields = [story, champaign, finney, lancaster].flatMap((a) => a.fields) as FieldBoundary[];

function inRing(lat: number, lon: number, ring: LonLat[]): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i]!, [xj, yj] = ring[j]!;
    if ((yi > lat) !== (yj > lat) && lon < (xj - xi) * (lat - yi) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

export function csbCropHistory(lat: number, lon: number, lastYear: number, yearsBack: number): CropHistory | null {
  const field = fields.find((f) => f.polygon[0] && inRing(lat, lon, f.polygon[0]) && !f.polygon.slice(1).some((r) => inRing(lat, lon, r)));
  const years = field?.cropSequence?.filter((y) => y.year <= lastYear && y.year > lastYear - yearsBack)
    .map((y) => ({ year: y.year, cdlCode: y.cdlCode, cdlName: y.crop, crop: CDL_TO_CROP[y.cdlCode] ?? null }))
    .sort((a, b) => a.year - b.year);
  if (!field || !years?.length) return null;
  return {
    available: true,
    source: `${field.provenance.product} (${field.provenance.version}); committed fallback`,
    years,
    note: `Live CDL lookup unavailable. Using the containing CSB polygon ${field.id}'s satellite-derived sequence, not a fresh point lookup or farmer-reported history. Retrieved ${field.provenance.retrieved}; source: ${field.provenance.url}`,
  };
}
