-- Editable settings (e.g. the phone voice agent's instructions, greeting and tools), stored as JSON.
CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

-- Timeline of each phone voice-agent call: what the caller said, which tools ran, what the agent said.
-- Caller phone numbers are stored masked.
CREATE TABLE IF NOT EXISTS voice_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  call_sid TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('session_start', 'caller', 'agent', 'tool', 'error', 'session_end')),
  name TEXT,
  detail TEXT,
  duration_ms INTEGER,
  ok INTEGER
);
CREATE INDEX IF NOT EXISTS idx_voice_events_call ON voice_events (call_sid, id);
CREATE INDEX IF NOT EXISTS idx_voice_events_time ON voice_events (created_at);
