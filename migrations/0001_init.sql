-- Cache for NASA / USDA responses.
CREATE TABLE IF NOT EXISTS cache (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_cache_expires ON cache (expires_at);

-- One row per phone call or dashboard plan. Phone numbers are stored masked.
CREATE TABLE IF NOT EXISTS plan_log (
  id TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL,
  channel TEXT NOT NULL CHECK (channel IN ('voice', 'web')),
  call_sid TEXT,
  caller_masked TEXT,
  place TEXT,
  lat REAL NOT NULL,
  lon REAL NOT NULL,
  irrigated INTEGER NOT NULL,
  priority TEXT NOT NULL,
  recent_crops TEXT,
  top_plan TEXT,
  total_score REAL,
  sms_sent INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_plan_log_created ON plan_log (created_at DESC);
