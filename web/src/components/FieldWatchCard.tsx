// Field Watch card: the latest background check for each demo farm. The checks run on Cloudflare
// every hour (Cron Trigger) whether or not anyone has this page open; results come from D1.

import { useCallback, useEffect, useState } from "react";
import "./fieldwatch.css";
import { Sprout } from "./Sprout";
import type { DistrictOutlook as Outlook } from "../../../src/shared/districtOutlook";
import { DistrictOutlook } from "./DistrictOutlook";
import { ImergNote } from "./ImergNote";
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

function ago(t: number | null, now: number): string {
  if (!t) return "never";
  const m = Math.round((now - t) / 60000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}
function shortDay(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

export function FieldWatchCard() {
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
          <span className="fw-pill" title={data?.schedule.description ?? "Runs every hour on Cloudflare"}>
            <span className="fw-pulse" aria-hidden="true" />
            Runs hourly on Cloudflare
          </span>
        </div>
        <p className="fw-sub">
          Soil Sense checks the demo farms in the background every hour, even when nobody has this page open.
          {data && <> Last automatic check: <b>{ago(data.lastCronAt, now)}</b>.</>}
        </p>
      </header>

      {error && <p className="fw-empty">{error}</p>}
      {!error && !data && <p className="fw-empty">Loading the latest checks…</p>}
      {data && data.runs.length === 0 && <p className="fw-empty">No checks yet. The first automatic check runs at 17 minutes past the hour, or run one now.</p>}

      {data && data.runs.length > 0 && (
        <ul className="fw-list">
          {data.runs.map((r) => (
            <li key={r.fieldId} className="fw-row">
              <details>
                <summary>
                  <span className={`fw-status fw-${r.status}`}>{LABEL[r.status]}</span>
                  <span className="fw-main">
                    <span className="fw-name">{r.fieldName}</span>
                    <span className="fw-headline">{r.headline}</span>
                  </span>
                  <span className="fw-when">
                    {ago(r.checkedAt, now)}
                    {r.dataThrough && <small>NASA data to {shortDay(r.dataThrough)}</small>}
                  </span>
                </summary>
                <div className="fw-detail">
                  <ul className="fw-reasons">
                    {r.reasons.filter((x) => x.id !== "kansas").map((x) => (
                      <li key={x.id}>
                        {x.text}
                        <small>{x.source}</small>
                      </li>
                    ))}
                  </ul>
                  <ImergNote field={r.fieldId} end={r.dataThrough} />
                  <p className="fw-meta">
                    Run <code>{r.runId}</code> · {r.trigger === "cron" ? "automatic (Cron Trigger)" : "run by hand"} · checked {r.checkCount}× on this data
                  </p>
                </div>
              </details>
              <DistrictOutlook outlook={r.metrics?.districtOutlook} />
            </li>
          ))}
        </ul>
      )}

      <footer className="fw-foot">
        <button type="button" className="fw-run" onClick={runNow} disabled={busy}>
          {busy ? "Checking…" : "Run check now"}
        </button>
        {note && (
          <span className="fw-note" role="status">
            {note}
          </span>
        )}
      </footer>
      {data && <p className="fw-rule">{data.rule}</p>}
      <ScheduledCheck />
    </section>
  );
}
