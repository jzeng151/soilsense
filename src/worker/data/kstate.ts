// "Second opinion" for Kansas: our teammate's separate Kansas model (kansas-crop-rotation/) ranks K-State's
// recommended dryland rotations per county from NASA POWER weather, refreshed weekly and published as one JSON file
// on Cloudflare R2. We read it server-side, cache it, and never let it affect or break the plan.

import savedFile from "../../../kansas-crop-rotation/data/app_rotation_advice.json";
import type { CropId, KStateRotation, SecondOpinion } from "../../shared/types";
import { cached } from "../lib/cache";
import { freshnessKey, kstateTtl, successful } from "../lib/freshness";
import { fetchJson } from "../lib/http";

export const KSTATE_URL = "https://pub-fe3948f31a9c462890b089ed5356c336.r2.dev/app_rotation_advice.json";
const SOURCE = "K-State recommended rain-fed rotations, ranked by our team's Kansas model (NASA POWER weather)";
const OUTAGE_SECONDS = 60;

interface RawRotation {
  rank: number;
  code: string;
  name: string;
  weight_pct: number;
  note?: string | null;
}

interface RawCounty {
  fips: string;
  county: string;
  k_state_region?: string | null;
  alert: string;
  drought_probability_now: number | null;
  rootzone_pct_now: number | null;
  basis?: string | null;
  rotations: RawRotation[];
  by_current_crop?: Record<string, { message: string | null; rotations: RawRotation[] }>;
}

interface RawFile {
  data_through: string;
  disclaimer: string;
  counties: RawCounty[];
}

const CODE_CROPS: Record<string, CropId> = { W: "winter_wheat", S: "sorghum", F: "fallow", C: "corn", Sb: "soybean", dSb: "soybean" };

/** "W-S-F" -> winter_wheat, sorghum, fallow. Unknown letters make the rotation unusable for matching (empty). */
export function rotationCrops(code: string): CropId[] {
  const out: CropId[] = [];
  for (const part of code.split("-")) {
    const c = CODE_CROPS[part];
    if (!c) return [];
    out.push(c);
  }
  return out;
}

function toRotation(r: RawRotation): KStateRotation {
  return { rank: r.rank, code: r.code, name: r.name, weightPct: r.weight_pct, crops: rotationCrops(r.code), note: r.note ?? null };
}

interface LoadedFile { file: RawFile; savedCopy: boolean }
let fileMemo: { expires: number; file: Promise<LoadedFile> } | null = null;

function loadFile(): Promise<LoadedFile> {
  if (fileMemo && Date.now() < fileMemo.expires) return fileMemo.file;
  const file = fetchJson<RawFile>(KSTATE_URL, { service: "K-State rotation file (R2)", timeoutMs: 8000, retries: 1 })
    .then((live): LoadedFile => {
      if (!Array.isArray(live?.counties) || typeof live.data_through !== "string" || typeof live.disclaimer !== "string")
        throw new Error("unexpected Kansas rotation file shape");
      return { file: live, savedCopy: false };
    })
    .catch((err): LoadedFile => {
      console.warn(JSON.stringify({ msg: "kstate using saved copy", dataThrough: savedFile.data_through, err: String(err) }));
      if (fileMemo) fileMemo.expires = Date.now() + OUTAGE_SECONDS * 1000;
      return { file: savedFile, savedCopy: true };
    });
  fileMemo = { expires: Date.now() + kstateTtl() * 1000, file };
  return file;
}

export function toSecondOpinion(file: RawFile, fips: string): SecondOpinion | null {
  const c = file.counties.find((x) => String(x.fips) === fips);
  if (!c || !Array.isArray(c.rotations) || c.rotations.length === 0) return null;
  const byCurrentCrop: SecondOpinion["byCurrentCrop"] = {};
  for (const [crop, v] of Object.entries(c.by_current_crop ?? {})) {
    if (crop === "corn" || crop === "sorghum" || crop === "soybean" || crop === "wheat")
      byCurrentCrop[crop] = { message: v.message ?? null, rotations: (v.rotations ?? []).map(toRotation) };
  }
  return {
    source: SOURCE,
    sourceUrl: KSTATE_URL,
    dataThrough: file.data_through,
    disclaimer: file.disclaimer,
    county: c.county,
    region: c.k_state_region ?? null,
    alert: c.alert,
    droughtChanceNow: typeof c.drought_probability_now === "number" ? c.drought_probability_now : null,
    rootzonePctNow: typeof c.rootzone_pct_now === "number" ? c.rootzone_pct_now : null,
    basis: c.basis ?? null,
    dryYearRanking: c.basis ? c.basis.startsWith("dry-year") : c.alert !== "normal",
    rotations: c.rotations.map(toRotation),
    byCurrentCrop,
  };
}

/** The county's second opinion (bundled saved copy if R2 is unreachable), or null outside the file. Never throws. */
export async function getSecondOpinion(db: D1Database | undefined, fips: string): Promise<SecondOpinion | null> {
  if (!/^20\d{3}$/.test(fips)) return null;
  try {
    const { value } = await cached(db, freshnessKey(`kstate:v2:${fips}`), successful({ softTtlSeconds: kstateTtl(), staleSeconds: 0, expiresAt: Date.now() + kstateTtl() * 1000 }), async () => {
      const loaded = await loadFile();
      const opinion = toSecondOpinion(loaded.file, fips);
      return opinion ? { ...opinion, savedCopy: loaded.savedCopy } : null;
    });
    return value;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "kstate second opinion unavailable", fips, err: String(err) }));
    return null;
  }
}
