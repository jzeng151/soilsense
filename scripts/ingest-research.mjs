// Ingest the curated research corpus into Vectorize through the deployed Worker.
// The Worker embeds every chunk with Workers AI using the shared config (bge-base-en-v1.5, 768 dims,
// pooling "cls", same preprocessing as queries) and upserts one vector per (chunk, crop tag).
//
// Usage: ADMIN_TOKEN=<admin token> node scripts/ingest-research.mjs https://soilsense.<you>.workers.dev
// Prerequisite: the index and its metadata indexes exist (scripts/setup-research-index.sh).
const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
const token = process.env.ADMIN_TOKEN;
if (!token) {
  console.error("Set ADMIN_TOKEN (the Worker's ADMIN_TOKEN secret).");
  process.exit(1);
}
const res = await fetch(`${base}/api/research/ingest`, { method: "POST", headers: { Authorization: `Bearer ${token}` } });
const body = await res.json().catch(() => ({}));
console.log(res.status, JSON.stringify(body, null, 2));
if (!res.ok) process.exit(1);
if (body.dimensions !== 768) {
  console.error(`Expected 768-dimension vectors, got ${body.dimensions}`);
  process.exit(1);
}

// Vectorize applies upserts asynchronously. Poll one known query per crop / rotation feature, plus an unsupported one.
const status = await (await fetch(`${base}/api/research/status`)).json();
console.log(`corpus ${status.corpusVersion}, embedding ${status.embedding.model} (${status.embedding.dimensions} dims, ${status.embedding.pooling})`);
const checks = [
  ["corn", "corn rootworm in continuous corn"],
  ["soybean", "soybean nitrogen for the following crop"],
  ["winter_wheat", "corn after winter wheat under limited irrigation"],
  ["oats", "adding oats to a corn-soybean rotation"],
  ["alfalfa", "corn following alfalfa nitrogen"],
  ["sorghum", "grain sorghum yields under limited irrigation"],
  ["fallow", "fallow soil water accumulation before corn"],
  ["cover", "cover crops and living roots"],
  ["rice", "rice paddy flooding"],
];
await new Promise((r) => setTimeout(r, 5000));
for (const [crop, query] of checks) {
  const r = await fetch(`${base}/api/research/query`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crops: [crop], query }) });
  const j = await r.json();
  console.log(`${crop.padEnd(13)} ${j.status.padEnd(11)} ${(j.passages ?? []).map((p) => `${p.chunkId} (${p.score})`).join(", ")}${j.reason ? `  [${j.reason}]` : ""}`);
}
console.log("If live crops show 'empty', wait ~30 s for Vectorize to apply the upsert and re-run the checks (re-ingesting is safe: it upserts).");
