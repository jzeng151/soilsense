-- Independent second product for #24. Never touches POWER or historical Final cache keys.
CREATE TABLE IF NOT EXISTS imerg_snapshots (
 snapshot_id TEXT PRIMARY KEY, content_hash TEXT NOT NULL UNIQUE, grid_key TEXT NOT NULL,
 period_start TEXT NOT NULL, data_through TEXT NOT NULL, retrieved_at INTEGER NOT NULL,
 accepted_at INTEGER NOT NULL, r2_key TEXT NOT NULL, r2_source_key TEXT NOT NULL, manifest TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_imerg_snapshots_grid ON imerg_snapshots(grid_key, data_through);
CREATE TABLE IF NOT EXISTS imerg_snapshot_current (
 farm_id TEXT PRIMARY KEY, snapshot_id TEXT NOT NULL, grid_key TEXT NOT NULL,
 data_through TEXT NOT NULL, accepted_at INTEGER NOT NULL, confirmed_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS imerg_refresh_attempts (
 farm_id TEXT PRIMARY KEY, attempted_at INTEGER NOT NULL,
 outcome TEXT NOT NULL CHECK (outcome IN ('published','unchanged','rejected','error')),
 detail TEXT NOT NULL, instance_id TEXT NOT NULL, trigger TEXT NOT NULL
);
-- Transactional accepted-snapshot event feed for future weekly/window consumers; no new alert rules.
CREATE TABLE IF NOT EXISTS imerg_snapshot_events (
 farm_id TEXT NOT NULL, snapshot_id TEXT NOT NULL, data_through TEXT NOT NULL,
 accepted_at INTEGER NOT NULL, stream TEXT NOT NULL CHECK(stream = 'current-late'),
 PRIMARY KEY(farm_id, snapshot_id)
);
