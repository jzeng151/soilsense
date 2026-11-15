// Check that every corpus chunk is a verbatim excerpt of its live source (whitespace-normalized).
// Usage: node scripts/verify-research-corpus.mjs     (PDF sources need `pdftotext` from poppler on PATH)
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const corpus = JSON.parse(readFileSync(new URL("../src/worker/research/corpus.json", import.meta.url), "utf8"));
const norm = (s) => s.replace(/\uFFFD/g, "").replace(/\s+/g, " ").trim();
const ENT = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", rsquo: "’", lsquo: "‘", rdquo: "”", ldquo: "“", mdash: "—", ndash: "–", hellip: "…" };
const unescape = (s) =>
  s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e) =>
    e[0] === "#" ? String.fromCodePoint(e[1].toLowerCase() === "x" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (ENT[e.toLowerCase()] ?? m),
  );

async function sourceText(src) {
  const res = await fetch(src.url, { headers: { "User-Agent": "Mozilla/5.0 (SoilSense corpus check)" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const type = res.headers.get("content-type") ?? "";
  if (type.includes("pdf")) {
    const dir = mkdtempSync(join(tmpdir(), "corpus-"));
    writeFileSync(join(dir, "s.pdf"), Buffer.from(await res.arrayBuffer()));
    execFileSync("pdftotext", [join(dir, "s.pdf"), join(dir, "s.txt")]);
    return norm(readFileSync(join(dir, "s.txt"), "utf8"));
  }
  const html = (await res.text()).replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, "").replace(/<[^>]+>/g, "");
  return norm(unescape(html));
}

let failed = 0;
for (const src of corpus.sources) {
  let text;
  try {
    text = await sourceText(src);
  } catch (err) {
    console.log(`? ${src.id}: could not fetch/parse (${err.message})`);
    failed++;
    continue;
  }
  for (const c of corpus.chunks.filter((c) => c.sourceId === src.id)) {
    const ok = text.includes(c.text);
    if (!ok) failed++;
    console.log(`${ok ? "✓" : "✗"} ${c.id} (${src.id})`);
  }
}
console.log(failed ? `${failed} problem(s)` : `All ${corpus.chunks.length} chunks match their sources verbatim (corpus ${corpus.corpusVersion}).`);
process.exit(failed ? 1 : 0);
