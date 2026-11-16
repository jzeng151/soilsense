import { useState } from "react";
import { useI18n } from "../i18n";
import { pageTranslate } from "../i18n-pages";
import { LANGUAGE_LOCALES } from "../../../src/shared/language";

type Usage = { available: boolean; windowHours: number; limit: number; features: { feature: string; calls: number; failures: number; fallbacks: number; p50LatencyMs: number }[] };

/** Token is held in component memory only, never browser storage or a URL. */
export function AIUsagePanel() {
  const { language } = useI18n();
  const t = (key: string, values?: Record<string, string | number>) => pageTranslate(language, key, values);
  const number = (value: number) => new Intl.NumberFormat(LANGUAGE_LOCALES[language]).format(value);
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
    <h2 id="ai-usage-title">{t("AI Gateway usage")}</h2>
    <p>{t("Operator-only counters for completed model attempts. No prompts, contacts or field coordinates are stored here.")}</p>
    <form onSubmit={(event) => { event.preventDefault(); void refresh(); }}>
      <label>{t("Admin token")} <input type="password" autoComplete="off" value={token} onChange={(event) => { setToken(event.target.value); setUsage(null); setError(""); }} /></label>
      <button type="submit" disabled={busy || !token}>{busy ? t("Loading…") : t("Refresh AI usage")}</button>
    </form>
    {error && <p role="alert">{t(error)}</p>}
    {usage && <div aria-live="polite">
      <p>{t("Last {hours} hours, up to {limit} most recent attempts. Latency includes stream completion. Fallbacks count attempts, not successful recoveries.", { hours: number(usage.windowHours), limit: number(usage.limit) })}</p>
      {!usage.available ? <p>{t("D1 is not configured; persistent usage is unavailable.")}</p> : !usage.features.length ? <p>{t("No recent recorded calls.")}</p> :
        <table><caption>{t("Model attempts by feature")}</caption><thead><tr><th scope="col">{t("Feature")}</th><th scope="col">{t("Calls")}</th><th scope="col">{t("Failures")}</th><th scope="col">{t("Fallbacks")}</th><th scope="col">{t("p50 latency (ms)")}</th></tr></thead>
          <tbody>{usage.features.map((row) => <tr key={row.feature}><th scope="row">{row.feature}</th><td>{number(row.calls)}</td><td>{number(row.failures)}</td><td>{number(row.fallbacks)}</td><td>{number(row.p50LatencyMs)}</td></tr>)}</tbody></table>}
    </div>}
  </section>;
}
