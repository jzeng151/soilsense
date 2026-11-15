import { translate, watchText, useI18n } from "../i18n";
// Field Watch card: the latest background check for each demo farm. The checks run on Cloudflare
// every hour (Cron Trigger) whether or not anyone has this page open; results come from D1.

import { useCallback, useEffect, useState } from "react";
import "./fieldwatch.css";
import { Sprout } from "./Sprout";
import type { DistrictOutlook as Outlook } from "../../../src/shared/districtOutlook";
import { DistrictOutlook } from "./DistrictOutlook";
import { ScheduledCheck } from "./ScheduledCheck";

type Status = "ok" | "watch" | "dry" | "insufficient" | "error";
interface Reason {
  id: string;
  text: string;
  source: string;
}
interface Run {
  runId: string;
  fieldId: string;
  fieldName: string;
  dataThrough: string | null;
  status: Status;
  headline: string;
  reasons: Reason[];
  metrics?: { districtOutlook?: Outlook };
  sources: { name: string; url: string; detail: string }[];
  trigger: "cron" | "manual";
  checkedAt: number;
  checkCount: number;
}
interface Latest {
  runs: Run[];
  lastCronAt: number | null;
  lastCheckAt: number | null;
  rule: string;
  schedule: { cron: string; description: string };
  cooldown?: boolean;
  message?: string;
  error?: string;
}

const LABEL: Record<Status, string> = { ok: "OK", watch: "Watch", dry: "Dry spell", insufficient: "No data", error: "Error" };

function ago(t: number | null, now: number, language: "en" | "es"): string {
  if (!t) return translate(language, "never");
  const m = Math.round((now - t) / 60000);
  if (m < 1) return translate(language, "just now");
  if (m < 60) return translate(language, "{number} min ago", { number: m });
  const h = Math.round(m / 60);
  return h < 24 ? translate(language, "{number} h ago", { number: h }) : translate(language, "{number} d ago", { number: Math.round(h / 24) });
}
function shortDay(iso: string | null, language: "en" | "es"): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString(language === "es" ? "es-US" : "en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function FieldWatchCard() {
  const { t: tx, text: localize, language } = useI18n();
  const [data, setData] = useState<Latest | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/fieldwatch/latest");
      const body = (await res.json().catch(() => ({}))) as Latest;
      if (!res.ok) throw new Error(body.error ?? `Field Watch is unavailable (${res.status}).`);
      setData(body);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Field Watch is unavailable.");
    }
  }, []);

  useEffect(() => {
    void load();
    const poll = window.setInterval(() => void load(), 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load]);

  const runNow = async () => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch("/api/fieldwatch/run", { method: "POST" });
      const body = (await res.json().catch(() => ({}))) as Latest;
      if (!res.ok) throw new Error(body.error ?? `Check failed (${res.status}).`);
      setData(body);
      setError(null);
      setNow(Date.now());
      setNote(body.cooldown ? (body.message ?? "Checked less than a minute ago.") : "Checked all farms just now.");
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Check failed. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="fw" aria-labelledby="fw-title">
      <header className="fw-head">
        {data && data.runs.some((r) => r.status === "dry" || r.status === "watch") && <Sprout mood="weather-alert" width={52} className="fw-sprout" />}
        <div className="fw-title-row">
          <h2 id="fw-title">Field Watch</h2>
          <span className="fw-pill" title={localize(data?.schedule.description) || tx("Runs every hour on Cloudflare")}>
            <span className="fw-pulse" aria-hidden="true" />{tx("Runs hourly on Cloudflare")}</span>
        </div>
        <p className="fw-sub">{tx("Soil Sense checks the demo farms in the background every hour, even when nobody has this page open.")}{data && <>{" "}{tx("Last automatic check:")}{" "}<b>{ago(data.lastCronAt, now, language)}</b>.</>}
        </p>
      </header>

      {error && <p className="fw-empty">{localize(error)}</p>}
      {!error && !data && <p className="fw-empty">{tx("Loading the latest checks…")}</p>}
      {data && data.runs.length === 0 && <p className="fw-empty">{tx("No checks yet. The first automatic check runs at 17 minutes past the hour, or run one now.")}</p>}

      {data && data.runs.length > 0 && (
        <ul className="fw-list">
          {data.runs.map((r) => (
            <li key={r.fieldId} className="fw-row">
              <details>
                <summary>
                  <span className={`fw-status fw-${r.status}`}>{localize(LABEL[r.status])}</span>
                  <span className="fw-main">
                    <span className="fw-name">{r.fieldName}</span>
                    <span className="fw-headline">{watchText(r.headline, language)}</span>
                  </span>
                  <span className="fw-when">
                    {ago(r.checkedAt, now, language)}
                    {r.dataThrough && <small>{tx("NASA data to")}{" "}{shortDay(r.dataThrough, language)}</small>}
                  </span>
                </summary>
                <div className="fw-detail">
                  <ul className="fw-reasons">
                    {r.reasons.filter((x) => x.id !== "kansas").map((x) => (
                      <li key={x.id}>
                        {watchText(x.text, language)}
                        <small>{x.source}</small>
                      </li>
                    ))}
                  </ul>
                  <p className="fw-meta">{tx("Run")}{" "}<code>{r.runId}</code> · {r.trigger === "cron" ? tx("automatic (Cron Trigger)") : tx("run by hand")}{" "}{tx("· checked")}{" "}{r.checkCount}{tx("× on this data")}</p>
                </div>
              </details>
              <DistrictOutlook outlook={r.metrics?.districtOutlook} />
            </li>
          ))}
        </ul>
      )}

      <footer className="fw-foot">
        <button type="button" className="fw-run" onClick={runNow} disabled={busy}>
          {busy ? tx("Checking…") : tx("Run check now")}
        </button>
        {note && (
          <span className="fw-note" role="status">
            {localize(note)}
          </span>
        )}
      </footer>
      {data && <p className="fw-rule">{watchText(data.rule, language)}</p>}
      <ScheduledCheck />
    </section>
  );
}
