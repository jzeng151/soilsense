// Ingest the curated research corpus into Vectorize through the deployed Worker.
// The Worker embeds every chunk with Workers AI using the shared config (bge-base-en-v1.5, 768 dims,
// pooling "cls", same preprocessing as queries) and upserts one vector per (chunk, crop tag).
//
// Usage: ADMIN_TOKEN=<admin token> node scripts/ingest-research.mjs https://soilsense.<you>.workers.dev
// Prerequisite: the index and its metadata indexes exist (scripts/setup-research-index.sh).
const base = (process.argv[2] ?? "http://127.0.0.1:8787").replace(/\/$/, "");
// --verify-only never calls the mutating ingestion endpoint and needs no secret.
const flags = process.argv.slice(3);
const verifyOnly = flags.includes("--verify-only");
const integerOption = (name, fallback, min, max) => {
  const flag = flags.find(value => value.startsWith(`--${name}=`));
  const value = flag ? Number(flag.slice(name.length + 3)) : fallback;
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`Invalid --${name}; expected ${min}..${max}`);
  return value;
};
const attempts = integerOption("attempts", 12, 1, 60);
const interval = integerOption("interval-ms", 5000, 0, 30_000);
if (flags.some(flag => flag !== "--verify-only" && !/^--(attempts|interval-ms)=/.test(flag))) throw new Error("Unknown option");
async function jsonRequest(path, options = {}) {
  const response = await fetch(`${base}${path}`, { ...options, signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`${path}: HTTP ${response.status}`);
  return response.json();
}
if (!verifyOnly) {
  const token = process.env.ADMIN_TOKEN;
  if (!token) {
    console.error("Set ADMIN_TOKEN (the Worker's ADMIN_TOKEN secret), or use --verify-only.");
    process.exit(1);
  }
  const body = await jsonRequest("/api/research/ingest", { method: "POST", headers: { Authorization: `Bearer ${token}` } });
  console.log(JSON.stringify(body, null, 2));
  if (body.dimensions !== 768) {
    console.error(`Expected 768-dimension vectors, got ${body.dimensions}`);
    process.exit(1);
  }
}

// Vectorize applies upserts asynchronously. Require inventory + retrieval, not an accepted mutation.
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
async function verify() {
  for (let attempt = 1; attempt <= attempts; attempt++) {
    const status = await jsonRequest("/api/research/status?verify=true");
    console.log(`attempt ${attempt}/${attempts}: corpus ${status.corpusVersion}, embedding ${status.embedding?.model}; ingestion ${JSON.stringify(status.ingestion)}`);
    // Old deployments report bundled chunks only, not index readiness.
    const failures = [];
    if (status.ingestion?.status !== "ready") failures.push("curated vector inventory is not ready (deploy the readiness check, then ingest the corpus)");
    else {
      for (const [crop, query] of checks) {
        const result = await jsonRequest("/api/research/query", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ crops: [crop], query }) });
        const expected = crop === "rice" ? "empty" : "live";
        const passages = Array.isArray(result.passages) ? result.passages : [];
        const valid = result.status === expected && (expected === "live" ? passages.length > 0 && passages.length <= 2 && passages.every(p => p.chunkId && p.text && Number.isFinite(p.score) && p.score >= 0.45) : passages.length === 0);
        console.log(`${crop.padEnd(13)} ${String(result.status).padEnd(11)} ${passages.map(p => `${p.chunkId} (${p.score})`).join(", ")}${result.reason ? ` [${result.reason}]` : ""}`);
        if (!valid) failures.push(`${crop}: expected ${expected} with ${expected === "live" ? "verified passages" : "no passages"}`);
      }
    }
    if (!failures.length) { console.log("Research verification passed: curated inventory and all crop checks."); return; }
    console.error(`Research verification failed: ${failures.join("; ")}`);
    if (attempt < attempts) await new Promise(resolve => setTimeout(resolve, interval));
  }
  throw new Error("Research verification failed after polling; an accepted upsert, bundled chunks, or field-memory vector count does not establish readiness.");
}
verify().catch(error => { console.error(error.message); process.exitCode = 1; });
