-- Document → Vectorize pipeline (see docs/INGEST.md and src/shared/ingest.ts).
-- 0006 is reserved for the IMERG snapshot work.

CREATE TABLE IF NOT EXISTS ingest_docs (
  doc_id          TEXT PRIMARY KEY,           -- doc-<16 hex of sha256(r2 key)>
  r2_key          TEXT NOT NULL UNIQUE,
  latest_sha256   TEXT,                       -- sha256 of the newest uploaded bytes
  status          TEXT NOT NULL,              -- DocStatus
  workflow_id     TEXT,                       -- current DocIngestWorkflow instance
  title           TEXT,                       -- reviewer-supplied source metadata (null until approved)
  url             TEXT,
  publisher       TEXT,
  year            INTEGER,
  license         TEXT,
  attribution     TEXT,
  applicability   TEXT,
  crops_json      TEXT,                       -- JSON array of research tags
  reviewer        TEXT,
  reviewed_at     TEXT,
  review_note     TEXT,
  error           TEXT,
  updated_at      TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ingest_doc_versions (
  doc_id          TEXT NOT NULL,
  sha256          TEXT NOT NULL,
  size            INTEGER,
  content_type    TEXT,
  extraction      TEXT,                       -- e.g. "workers-ai-tomarkdown" | "plain-text" | "html-text"
  extracted_key   TEXT,                       -- R2 key of the extracted text
  extracted_chars INTEGER,
  ingest_version  TEXT NOT NULL,
  received_at     TEXT NOT NULL,
  PRIMARY KEY (doc_id, sha256)
);

CREATE TABLE IF NOT EXISTS ingest_chunks (
  chunk_id        TEXT PRIMARY KEY,           -- <doc_id>:<16 hex of chunk sha256>
  doc_id          TEXT NOT NULL,
  doc_sha256      TEXT NOT NULL,              -- version whose extracted text the offsets refer to
  chunk_sha256    TEXT NOT NULL,
  start_offset    INTEGER NOT NULL,
  end_offset      INTEGER NOT NULL,
  text            TEXT NOT NULL,              -- exact slice of the extracted text
  status          TEXT NOT NULL,              -- ChunkStatus
  vector_ids_json TEXT,                       -- JSON array of Vectorize ids once indexed
  created_at      TEXT NOT NULL,
  updated_at      TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_ingest_chunks_doc ON ingest_chunks (doc_id, status);
