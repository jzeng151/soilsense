/** Persisted optional context; never an input to Field Watch rule v2. */
export interface ImergContext {
  state: "available" | "stale" | "unavailable";
  snapshotId?: string;
  start?: string;
  end?: string;
  totalMm?: number;
  /** POWER LST total for the same date labels, NOT identical observation boundaries. */
  powerTotalMm?: number | null;
  bundleUrl?: string;
}
