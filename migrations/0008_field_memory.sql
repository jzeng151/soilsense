-- Existing D1 binding only. Public demo summaries; never caller/user content.
CREATE TABLE IF NOT EXISTS field_memory (
  vector_id TEXT PRIMARY KEY,
  field_id TEXT NOT NULL,
  kind TEXT NOT NULL CHECK(kind IN ('watch', 'plan')),
  date TEXT NOT NULL,
  record_id TEXT NOT NULL,
  summary TEXT NOT NULL,
  recorded_at INTEGER NOT NULL,
  embedding_id TEXT NOT NULL,
  index_status TEXT NOT NULL DEFAULT 'pending',
  UNIQUE(field_id, kind, record_id)
);
CREATE INDEX IF NOT EXISTS field_memory_retention ON field_memory(field_id, recorded_at DESC, vector_id);
