import { useState } from "react";

type Usage = { available: boolean; windowHours: number; limit: number; features: { feature: string; calls: number; failures: number; fallbacks: number; p50LatencyMs: number }[] };

/** Token is held in component memory only, never browser storage or a URL. */
export function AIUsagePanel() {
  const [token, setToken] = useState("");
  const [usage, setUsage] = useState<Usage | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function refresh() {
    setBusy(true);
    setError("");
    setUsage(null);
    try {
      const response = await fetch("/api/admin/ai-usage", { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
      if (!response.ok) throw new Error(response.status === 401 ? "An ADMIN_TOKEN is required; a team sign-in is not enough." : "Usage is temporarily unavailable.");
      setUsage(await response.json() as Usage);
    } catch (err) { setError(err instanceof Error ? err.message : "Usage unavailable."); }
    finally { setBusy(false); }
  }
  return <section className="st-block" aria-labelledby="ai-usage-title">
    <h2 id="ai-usage-title">AI Gateway usage</h2>
    <p>Operator-only counters for completed model attempts. No prompts, contacts or field coordinates are stored here.</p>
    <form onSubmit={(event) => { event.preventDefault(); void refresh(); }}>
      <label>Admin token <input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setUsage(null); setError(""); }} /></label>
      <button type="submit" disabled={busy || !token}>{busy ? "Loading…" : "Refresh AI usage"}</button>
    </form>
    {error && <p role="alert">{error}</p>}
    {usage && <div aria-live="polite">
      <p>Last {usage.windowHours} hours, up to {usage.limit.toLocaleString()} most recent attempts. Latency includes stream completion. Fallbacks count attempts, not successful recoveries.</p>
      {!usage.available ? <p>D1 is not configured; persistent usage is unavailable.</p> : !usage.features.length ? <p>No recent recorded calls.</p> :
        <table><caption>Model attempts by feature</caption><thead><tr><th scope="col">Feature</th><th scope="col">Calls</th><th scope="col">Failures</th><th scope="col">Fallbacks</th><th scope="col">p50 latency (ms)</th></tr></thead>
          <tbody>{usage.features.map((row) => <tr key={row.feature}><th scope="row">{row.feature}</th><td>{row.calls}</td><td>{row.failures}</td><td>{row.fallbacks}</td><td>{row.p50LatencyMs}</td></tr>)}</tbody></table>}
    </div>}
  </section>;
}
