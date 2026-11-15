export interface Env {
  EARTHDATA_TOKEN?: string;
  ASSETS?: Fetcher;
  DB?: D1Database;
  AI?: Ai;
  AI_MODEL?: string;
  /** Cloudflare AI Gateway id for Workers AI calls (default "default", auto-created on first request). */
  AI_GATEWAY_ID?: string;
  /** Scout's model: a Workers AI model ("@cf/...") or a Gemini model; the other provider is the fallback. */
  SCOUT_MODEL?: string;
  /** Per-visitor rate limit for the public Scout chat (Workers Rate Limiting binding). */
  SCOUT_LIMITER?: RateLimit;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  TWILIO_VALIDATE?: string;
  NASS_API_KEY?: string;
  /** OpenET API key (https://etdata.org): measured field water use, used to check the water model. Optional. */
  OPENET_API_KEY?: string;
  PUBLIC_BASE_URL?: string;
  PLAN_START_YEAR?: string;
  HISTORY_START_YEAR?: string;
  ADMIN_TOKEN?: string;
  /** Google Gemini API key for the Scout chat agent. */
  GEMINI_API_KEY?: string;
  /** Optional Gemini model override (default gemini-3.8-flash). */
  GEMINI_MODEL?: string;
  /** Optional Gemini model for the phone voice agent (default gemini-3.5-flash-lite, chosen for speed). */
  VOICE_MODEL?: string;
  /** "ivr" forces the keypad phone menu; otherwise calls go to the conversational voice agent. */
  VOICE_MODE?: string;
  /** Live room Durable Object: Field Watch publishes each run here when bound (optional). */
  LIVE_ROOM?: DurableObjectNamespace;
  /** Name of the live room instance (default "demo"). */
  LIVE_ROOM_NAME?: string;
  /** Field Watch agents (Agents SDK, class FieldAgent): one instance per watched field, named by field id. */
  FIELD_AGENT?: DurableObjectNamespace;
  /** Vectorize index for cited research passages (#7): soilsense-research-v1, 768 dims, cosine. Optional. */
  RESEARCH_INDEX?: Vectorize;
  /** NASA POWER refresh Workflow (PowerRefreshWorkflow): fetch -> validate -> publish current snapshots (optional). */
  POWER_REFRESH?: Workflow<{ trigger?: "cron" | "manual" }>;
  /** R2 bucket for immutable, content-addressed evidence bundles (optional; D1 still indexes snapshots without it). */
  EVIDENCE?: R2Bucket;
  /** Document pipeline (docs/INGEST.md): uploads bucket soilsense-docs (optional). */
  DOCS?: R2Bucket;
  /** Document pipeline queue (R2 event notifications land here); producer binding for retries (optional). */
  DOC_QUEUE?: Queue;
  /** Document pipeline Workflow (DocIngestWorkflow): extract -> chunk -> review -> embed -> upsert (optional). */
  DOC_INGEST?: Workflow<import("../shared/ingest").DocIngestParams>;
}
