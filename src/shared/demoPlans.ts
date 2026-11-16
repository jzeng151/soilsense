// One matrix for the scheduled Worker and the off-Worker prefetch runner.
import type { CropId, FieldResponse, PlanRequest } from "./types";

export const farms: { name: string; lat: number; lon: number; recentCrops: CropId[] }[] = [
  { name: "Story County, IA", lat: 42.0563, lon: -93.495, recentCrops: ["corn", "corn"] },
  { name: "Champaign County, IL", lat: 40.048, lon: -88.33, recentCrops: ["soybean", "corn"] },
  { name: "Finney County, KS", lat: 38.1095, lon: -100.706, recentCrops: ["corn", "corn"] },
  { name: "Lancaster County, NE", lat: 40.73, lon: -96.55, recentCrops: ["corn", "soybean"] },
  // Retain the ZIP demo already covered by prefetch-demo.mjs.
  { name: "Ames, IA (50010)", lat: 42.0379, lon: -93.6003, recentCrops: ["corn"] },
];
export type DemoHistories = Record<string, CropId[][]>;
export function demoRequests(extraHistories: DemoHistories = {}): { name: string; request: PlanRequest }[] {
  const rows: { name: string; request: PlanRequest }[] = [];
  for (const farm of farms) {
    const profiles = [undefined, farm.recentCrops, ["corn"] as CropId[], ...(extraHistories[farm.name] ?? [])];
    const unique = [...new Map(profiles.map(history => [JSON.stringify(history ?? []), history])).values()];
    for (const history of unique) for (const water of ["rain", "limited", "full"] as const)
      for (const priority of ["balanced", "profit", "soil", "risk"] as const)
        for (const language of ["en", "es", "ko"] as const) rows.push({ name: farm.name, request: {
          lat: farm.lat, lon: farm.lon, water, irrigated: water !== "rain", priority, language,
          ...(history ? { recentCrops: history } : {}),
        } });
  }
  return rows;
}
// Intentionally follows the dashboard's local season boundary (not the plan key's UTC boundary).
export function uiHistory(field: Pick<FieldResponse, "cropHistory">, now = new Date()): CropId[] {
  const last = [...(field.cropHistory?.years ?? [])].reverse().find(year => year.crop);
  if (!last?.crop) return ["corn"];
  const crop = last.crop === "corn" ? "soybean" : last.crop === "soybean" ? "corn" : last.crop;
  const season = now.getMonth() >= 8 ? now.getFullYear() : now.getFullYear() - 1;
  return last.year < season ? [last.crop, crop] : [crop];
}
