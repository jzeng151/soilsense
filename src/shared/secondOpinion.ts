import type { CropId, KStateRotation } from "./types";

/** Same set of crops (order aside: a rotation repeats, so W-S-F and S-F-W are the same rotation). */
export function sameCrops(a: CropId[], b: CropId[]): boolean {
  const sa = new Set(a);
  const sb = new Set(b);
  return sa.size === sb.size && [...sa].every((c) => sb.has(c));
}

/** The rank on K-State's list whose crops match our plan's crops, or null. */
export function matchRank(planCrops: CropId[], list: KStateRotation[]): number | null {
  const hit = list.find((r) => r.crops.length > 0 && sameCrops(planCrops, r.crops));
  return hit ? hit.rank : null;
}

/** Crops of K-State's rotation that our plan also uses, when every non-fallow crop of our plan is in it (else null). */
export function partialOverlap(planCrops: CropId[], rotation: KStateRotation): { shared: CropId[]; theirsOnly: CropId[] } | null {
  if (rotation.crops.length === 0) return null;
  const theirs = new Set(rotation.crops);
  const ours = new Set(planCrops);
  if (![...ours].every((c) => c === "fallow" || theirs.has(c))) return null;
  const shared = [...ours].filter((c) => theirs.has(c));
  if (!shared.some((c) => c !== "fallow")) return null;
  return { shared, theirsOnly: [...theirs].filter((c) => !ours.has(c)) };
}
