-- NASA POWER current-observation snapshots (issues #12, #24, #25), written by the PowerRefreshWorkflow.
-- Separate from the historical record: /api/plan's 1991-to-last-year archive stays in the `cache` table
-- under "power:v1:*" keys and is never touched by the refresh.

-- One row per accepted, immutable snapshot (one POWER grid cell, 60 observed days). snapshot_id is derived
-- from the SHA-256 of the snapshot content, so re-publishing identical data never adds a row.
-- The full evidence bundle (manifest + series) and the raw POWER response live in R2 at r2_key / r2_source_key.
CREATE TABLE IF NOT EXISTS power_snapshots (
  snapshot_id TEXT PRIMARY KEY,
  content_hash TEXT NOT NULL UNIQUE,
  grid_key TEXT NOT NULL,
  grid_lat REAL NOT NULL,
  grid_lon REAL NOT NULL,
  period_start TEXT NOT NULL,
  data_through TEXT NOT NULL,   -- last day every required variable was observed (freshness), not fetch time
  retrieved_at INTEGER NOT NULL,
  accepted_at INTEGER NOT NULL,
  source_url TEXT NOT NULL,
  completeness REAL NOT NULL,   -- lowest per-variable share of observed days in the window
  r2_key TEXT,                  -- NULL when the EVIDENCE bucket isn't bound
  r2_source_key TEXT,
  manifest TEXT NOT NULL        -- JSON manifest (also stored in the R2 bundle)
);
CREATE INDEX IF NOT EXISTS idx_power_snapshots_grid ON power_snapshots (grid_key, accepted_at DESC);

-- Index: farm -> latest accepted snapshot. Only moves forward (never to an older data-through date);
-- a failed or rejected refresh leaves it untouched.
CREATE TABLE IF NOT EXISTS power_snapshot_current (
  farm_id TEXT PRIMARY KEY,
  snapshot_id TEXT NOT NULL,
  grid_key TEXT NOT NULL,
  data_through TEXT NOT NULL,
  accepted_at INTEGER NOT NULL,
  confirmed_at INTEGER NOT NULL  -- last refresh that re-validated this same content
);

-- Operational status: the last refresh attempt per farm (published / unchanged / rejected / error).
CREATE TABLE IF NOT EXISTS power_refresh_attempts (
  farm_id TEXT PRIMARY KEY,
  attempted_at INTEGER NOT NULL,
  outcome TEXT NOT NULL CHECK (outcome IN ('published', 'unchanged', 'rejected', 'error')),
  detail TEXT NOT NULL,          -- JSON: { errors?: string[], dataThrough?: string }
  candidate_id TEXT,
  instance_id TEXT,
  trigger TEXT NOT NULL
);
