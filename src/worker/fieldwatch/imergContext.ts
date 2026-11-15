import type { ImergContext } from "../../shared/imergContext";
import type { Env } from "../env";
import type { DayMap } from "./rule";
import type { WatchedField } from "./run";
import { acceptedImergFor } from "../refresh/imerg-store";
import { planImergCells, validateImerg, type ImergContent } from "../refresh/imerg-snapshot";

/** Network-free read of the accepted pointer and immutable R2 bundle. Optional failure cannot affect POWER. */
export async function imergContextFor(env: Env, field: WatchedField, now: Date, recent: DayMap): Promise<ImergContext> {
  try {
    if (!env.DB) return { state: "unavailable" };
    const accepted = await acceptedImergFor(env.DB, field.id, now);
    if (!accepted.usable || !accepted.snapshot) return { state: accepted.snapshot ? "stale" : "unavailable" };
    if (!env.EVIDENCE) return { state: "unavailable" };
    const id = accepted.snapshot.id;
    const row = await env.DB.prepare("SELECT r2_key FROM imerg_snapshots WHERE snapshot_id=?1").bind(id).first<{ r2_key: string }>();
    const object = row && await env.EVIDENCE.get(row.r2_key);
    if (!object) return { state: "unavailable" };
    const { snapshot: content } = await object.json<{ snapshot: ImergContent }>();
    if (content.schema !== "soilsense.imerg-late-snapshot/v1" || content.stream !== "current-late" || content.dataThrough !== accepted.snapshot.dataThrough) return { state: "unavailable" };
    // Recheck completeness, containing cell and immutable content identity; malformed storage is not evidence.
    const checked = await validateImerg({ ...content, schema: "soilsense.imerg-point/v1", stream: "late", end: content.dataThrough, retrievedAt: now.toISOString(), source: "", attribution: "" }, planImergCells([field])[0]!, now);
    if (!checked.ok || checked.snapshotId !== id) return { state: "unavailable" };
    let powerTotalMm: number | null = 0;
    for (const day of content.observations) {
      const rain = recent.get(day.date)?.prcp;
      if (rain == null || !Number.isFinite(rain) || rain < 0) { powerTotalMm = null; break; }
      powerTotalMm += rain;
    }
    return { state: "available", snapshotId: id, start: content.start, end: content.dataThrough, totalMm: content.observations.reduce((sum, day) => sum + day.mm, 0), powerTotalMm, bundleUrl: `/api/refresh/imerg/snapshots/${id}/bundle` };
  } catch {
    // Also covers an installation without optional migration 0006, R2 outages or malformed bundles.
    return { state: "unavailable" };
  }
}
