import { useEffect, useState } from "react";
interface Comparison {
  state: "available";
  start: string; end: string;
  imergMm: number | null; powerMm: number | null; differenceMm: number | null;
  note: string;
  imerg: { source: string; retrievedAt: string; attribution: string; product: { shortName: string; version: string; stream: string; latency: string } };
}
export function ImergNote({ field, end }: { field: string; end: string | null }) {
  const [data, setData] = useState<Comparison | { state: "unavailable"; note: string } | null>(null);
  useEffect(() => {
    const abort = new AbortController(); setData(null);
    if (end) void fetch(`/api/imerg/comparison/${encodeURIComponent(field)}?stream=late&end=${encodeURIComponent(end)}`, { signal: abort.signal })
      .then((r) => { if (!r.ok) throw new Error("unavailable"); return r.json(); }).then(setData)
      .catch(() => { if (!abort.signal.aborted) setData({ state: "unavailable", note: "Optional IMERG evidence unavailable; POWER and Field Watch are unchanged." }); });
    return () => abort.abort();
  }, [field, end]);
  if (!end) return <p className="fw-meta">IMERG comparison unavailable until Field Watch has a data-through day.</p>;
  if (!data || data.state === "unavailable") return <p className="fw-meta">{data?.note ?? "Loading optional IMERG comparison…"}</p>;
  const mm = (v: number | null) => v === null ? "missing (incomplete coverage)" : `${v.toFixed(1)} mm`;
  return <aside className="fw-meta" aria-label="Independent satellite rainfall context">
    <p>{data.start}–{data.end} (14 date labels): POWER {mm(data.powerMm)}; IMERG {mm(data.imergMm)}; IMERG minus POWER {mm(data.differenceMm)}.</p>
    <p><a href={data.imerg.source} target="_blank" rel="noreferrer">{data.imerg.product.shortName} V{data.imerg.product.version}, {data.imerg.product.stream}</a> · 0.1° grid · daily native units mm/day · UTC · retrieved {data.imerg.retrievedAt}. Expected latency: {data.imerg.product.latency}.</p>
    <p>{data.note}</p><small>{data.imerg.attribution}</small>
  </aside>;
}
