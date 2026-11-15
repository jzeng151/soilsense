// POST /api/wind-screen: wind-erosion EXPOSURE screen for a field and up to 4 rotation calendars (issues #40, #17).
// Fetched by the dashboard after the plan is shown, so /api/plan never waits on it. Never changes a score.

import { Hono } from "hono";
import { ALL_CROPS, COVERS } from "../../engine/crops";
import { buildWindScreen, type RotationInput } from "../../engine/windErosion";
import type { CoverId, CropId } from "../../shared/types";
import { getDailyWind } from "../data/powerWind";
import { getWindSoil } from "../data/soilWind";
import { isInContiguousUS, yearsFor } from "../service";
import type { AppEnv } from "./auth";

export const windScreen = new Hono<AppEnv>();

export function parseWindBody(body: unknown): { lat: number; lon: number; rotations: RotationInput[]; lastCrop: CropId | null } | string {
  if (!body || typeof body !== "object") return "JSON body required";
  const b = body as Record<string, unknown>;
  const lat = Number(b.lat);
  const lon = Number(b.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !isInContiguousUS(lat, lon)) return "lat/lon must be in the contiguous US";
  if (!Array.isArray(b.rotations) || b.rotations.length === 0 || b.rotations.length > 4) return "rotations must list 1 to 4 rotations";
  const rotations: RotationInput[] = [];
  for (const r of b.rotations as Record<string, unknown>[]) {
    if (!r || !Array.isArray(r.years) || r.years.length === 0 || r.years.length > 6) return "each rotation needs 1 to 6 years";
    const years: RotationInput["years"] = [];
    for (const y of r.years as Record<string, unknown>[]) {
      if (!ALL_CROPS.includes(y?.crop as CropId)) return `unknown crop: ${String(y?.crop)}`;
      const cover = (y.cover ?? "none") as CoverId;
      if (!(cover in COVERS)) return `unknown cover: ${String(y.cover)}`;
      years.push({ year: Number(y.year) || 0, crop: y.crop as CropId, cover });
    }
    rotations.push({ label: String(r.label ?? "").slice(0, 120), years });
  }
  const lastCrop = ALL_CROPS.includes(b.lastCrop as CropId) ? (b.lastCrop as CropId) : null;
  return { lat, lon, rotations, lastCrop };
}

windScreen.post("/", async (c) => {
  let body: unknown;
  try {
    body = await c.req.json();
  } catch {
    return c.json({ error: "Invalid JSON" }, 400);
  }
  const req = parseWindBody(body);
  if (typeof req === "string") return c.json({ error: req }, 400);
  const years = yearsFor(c.env);
  const [wind, soil] = await Promise.all([
    getDailyWind(c.env.DB, req.lat, req.lon, years.historyStart, years.historyEnd).catch((err: unknown) => {
      console.warn(JSON.stringify({ msg: "wind fetch failed", err: String(err) }));
      return null;
    }),
    getWindSoil(c.env.DB, req.lat, req.lon),
  ]);
  return c.json(buildWindScreen({ series: wind?.series ?? null, meta: wind?.meta ?? null, soil, rotations: req.rotations, lastCrop: req.lastCrop }));
});
