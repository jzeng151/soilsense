-- Field Watch: background checks of each watched field, run by a Cloudflare Cron Trigger (and "Run check now").
-- One row per field per NASA data day: run_id = "<field_id>:<data_through>". Re-checking the same data
-- updates checked_at / check_count instead of adding rows, so hourly cron runs don't pile up duplicates.
CREATE TABLE IF NOT EXISTS field_watch_runs (
  run_id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL,
  field_name TEXT NOT NULL,
  data_through TEXT,
  status TEXT NOT NULL CHECK (status IN ('ok', 'watch', 'dry', 'insufficient', 'error')),
  headline TEXT NOT NULL,
  reasons TEXT NOT NULL,   -- JSON: [{ id, text, source }]
  metrics TEXT NOT NULL,   -- JSON: raw values with units
  sources TEXT NOT NULL,   -- JSON: [{ name, url, detail }]
  trigger TEXT NOT NULL CHECK (trigger IN ('cron', 'manual')),
  first_checked_at INTEGER NOT NULL,
  checked_at INTEGER NOT NULL,
  check_count INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX IF NOT EXISTS idx_field_watch_field_time ON field_watch_runs (field_id, checked_at DESC);
CREATE INDEX IF NOT EXISTS idx_field_watch_time ON field_watch_runs (checked_at DESC);
