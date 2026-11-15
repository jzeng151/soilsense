import { watchText, useI18n } from "../i18n";
// Scheduled check by a field's own Cloudflare Agent (Durable Object): the visitor asks for a check, the agent
// runs it about 45 s later on Cloudflare whether or not this page is open, and the result is saved there.
// Reopening the page shows the saved result without running anything again.

import { useCallback, useEffect, useState } from "react";
import type { FieldResearchNote } from "../../../src/shared/fieldResearch";
import type { ImergContext } from "../../../src/shared/imergContext";
import { ImergRunContext } from "./ImergRunContext";
import type { DistrictOutlook as Outlook } from "../../../src/shared/districtOutlook";
import { DistrictOutlook } from "./DistrictOutlook";
import { ResearchNote } from "./ResearchNote";

type Status = "pending" | "ok" | "watch" | "dry" | "insufficient" | "inactive" | "error";
interface Reason {
  id: string;
  text: string;
  source: string;
}
interface AgentRun {
  runId: string;
  fieldId: string;
  fieldName: string;
  mode: "live" | "replay" | "weekly" | "window";
  replayId: string | null;
  status: Status;
  ruleVersion: number;
  scheduledAt: number;
  dueAt: number;
  completedAt: number | null;
  headline: string | null;
  reasons: Reason[];
  researchNote?: FieldResearchNote;
  imergContext?: ImergContext;
  districtOutlook?: Outlook;
  metrics: { rainPercentile: number | null; rootzonePercentile: number | null; rain14Mm: number | null; normalPeriod: string | null } | null;
  snapshot: { label: string; source: string; comparisonYears: string; windowStart: string | null; windowEnd: string | null; inputSha256: string | null } | null;
}
interface Options {
  delaySeconds: number;
  fields: { id: string; name: string }[];
  replays: { id: string; windowEnd: string; label: string }[];
  available: boolean;
  weekly?: { schedule: string; freshDays: number; crops: string[] };
}
interface WatchSettings {
  enabled: boolean;
  crop: string | null;
  nextWeeklyAt: number | null;
  nextWindow: { crop: string; from: string; to: string; at: number; source: string } | null;
}
const CROP_NAME: Record<string, string> = { corn: "Corn", soybean: "Soybean", winter_wheat: "Winter wheat", oats: "Oats", alfalfa: "Alfalfa", sorghum: "Grain sorghum" };
const MODE_LABEL: Record<AgentRun["mode"], string> = { live: "Current conditions", replay: "Historical replay", weekly: "Weekly check", window: "Crop window opened" };

const LABEL: Record<Status, string> = { pending: "Scheduled", ok: "OK", watch: "Watch", dry: "Dry spell", insufficient: "No data", inactive: "Off season", error: "Error" };
const fmtDay = (t: number, language: "en" | "es") => new Date(t).toLocaleString(language === "es" ? "es-US" : "en-US", { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZoneName: "short" });
const fmtTime = (t: number, language: "en" | "es") => new Date(t).toLocaleTimeString(language === "es" ? "es-US" : "en-US", { hour: "numeric", minute: "2-digit", second: "2-digit" });

export function ScheduledCheck() {
  const { t: tx, text: localize, language } = useI18n();
  const [opts, setOpts] = useState<Options | null>(null);
  const [fieldId, setFieldId] = useState<string>(() => localStorage.getItem("fw-agent-field") ?? "finney-ks");
  const [runs, setRuns] = useState<AgentRun[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [watch, setWatch] = useState<WatchSettings | null>(null);

  useEffect(() => {
    fetch("/api/fieldwatch/agent/options")
      .then((r) => r.json() as Promise<Options>)
      .then(setOpts)
      .catch(() => setError("Scheduled checks are unavailable."));
  }, []);

  const load = useCallback(async () => {
    try {
      const res = await fetch(`/api/fieldwatch/agent/${encodeURIComponent(fieldId)}/runs?limit=5`);
      const body = (await res.json().catch(() => ({}))) as { runs?: AgentRun[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Unavailable (${res.status}).`);
      setRuns(body.runs ?? []);
      setError(null);
      const w = await fetch(`/api/fieldwatch/agent/${encodeURIComponent(fieldId)}/watch`);
      if (w.ok) setWatch(((await w.json()) as { settings: WatchSettings }).settings);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Scheduled checks are unavailable.");
    }
  }, [fieldId]);

  const pending = runs?.find((r) => r.status === "pending") ?? null;

  useEffect(() => {
    if (!opts?.available) return;
    void load();
    // Poll quickly only while a check is waiting; the result appears without reloading.
    const poll = window.setInterval(() => void load(), pending ? 5_000 : 60_000);
    const tick = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => {
      window.clearInterval(poll);
      window.clearInterval(tick);
    };
  }, [load, opts?.available, pending]);

  const schedule = async (mode: "live" | "replay", replayId?: string) => {
    setBusy(true);
    setNote(null);
    try {
      const res = await fetch(`/api/fieldwatch/agent/${encodeURIComponent(fieldId)}/check`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ mode, replayId }),
      });
      const body = (await res.json().catch(() => ({}))) as { message?: string; error?: string };
      if (!res.ok) throw new Error(body.error ?? `Couldn't schedule (${res.status}).`);
      setNote(body.message ?? null);
      await load();
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't schedule the check.");
    } finally {
      setBusy(false);
    }
  };

  const saveWatch = async (change: { enabled?: boolean; crop?: string | null }) => {
    setBusy(true);
    try {
      const res = await fetch(`/api/fieldwatch/agent/${encodeURIComponent(fieldId)}/watch`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(change),
      });
      const body = (await res.json().catch(() => ({}))) as { settings?: WatchSettings; error?: string };
      if (!res.ok || !body.settings) throw new Error(body.error ?? `Couldn't save (${res.status}).`);
      setWatch(body.settings);
    } catch (e) {
      setNote(e instanceof Error ? e.message : "Couldn't save the weekly watch.");
    } finally {
      setBusy(false);
    }
  };

  if (!opts) return null;
  const replay = opts.replays[0];

  return (
    <section className="fw-agent" aria-labelledby="fw-agent-title">
      <h4 id="fw-agent-title">{tx("Ask this field's agent to check it")}</h4>
      <p className="fw-sub">{tx("Each farm has its own agent on Cloudflare (a Durable Object). It runs your check about")}{" "}{opts.delaySeconds}{" "}{tx("seconds from now and saves the result, so you can close this page and come back to it.")}</p>
      {!opts.available ? (
        <p className="fw-empty">{tx("Scheduled checks aren't enabled on this deployment yet.")}</p>
      ) : (
        <>
          <div className="fw-agent-controls">
            <label>{tx("Farm")}{" "}
              <select
                value={fieldId}
                onChange={(e) => {
                  setFieldId(e.target.value);
                  localStorage.setItem("fw-agent-field", e.target.value);
                  setRuns(null);
                }}
              >
                {opts.fields.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.name}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" className="fw-run" disabled={busy || !!pending} onClick={() => schedule("live")}>{tx("Check current conditions")}</button>
            {replay && (
              <button type="button" className="fw-run" disabled={busy || !!pending} onClick={() => schedule("replay", replay.id)}>{tx("Replay")}{" "}{localize(replay.label.split(" (")[0])}
              </button>
            )}
          </div>
          {pending && (
            <p className="fw-note" role="status">{tx("Scheduled")}{" "}{pending.mode === "replay" ? tx("historical replay") : tx("check")}{" "}{tx("runs at")}{" "}{fmtTime(pending.dueAt, language)}
              {pending.dueAt > now ? tx(" (in {seconds} s)", { seconds: Math.ceil((pending.dueAt - now) / 1000) }) : tx(" (finishing…)")}{tx(". You can close this page.")}</p>
          )}
          {note && !pending && (
            <p className="fw-note" role="status">
              {localize(note)}
            </p>
          )}
          {watch && opts.weekly && (
            <fieldset className="fw-watch-settings">
              <legend>{tx("Weekly watch for this farm")}</legend>
              <label className="fw-switch">
                <input type="checkbox" checked={watch.enabled} disabled={busy} onChange={(e) => saveWatch({ enabled: e.target.checked })} />{tx("Check every week (")}{localize(opts.weekly.schedule)}{tx(") using only NASA data from the last")}{" "}{opts.weekly.freshDays}{" "}{tx("days")}</label>
              <label>{tx("Crop in this field this season")}{" "}
                <select value={watch.crop ?? ""} disabled={busy} onChange={(e) => saveWatch({ crop: e.target.value || null })}>
                  <option value="">{tx("Not confirmed")}</option>
                  {opts.weekly.crops.map((c) => (
                    <option key={c} value={c}>
                      {localize(CROP_NAME[c] ?? c)}
                    </option>
                  ))}
                </select>
              </label>
              <p className="fw-meta">
                {watch.enabled
                  ? <>{tx("Next weekly check:")}{" "}<b>{watch.nextWeeklyAt ? fmtDay(watch.nextWeeklyAt, language) : tx("being scheduled")}</b>.</>
                  : tx("Weekly checks are off (the default).")}
                {watch.enabled && watch.nextWindow && (
                  <>
                    {" "}{tx("Extra check when")}{" "}{localize(CROP_NAME[watch.nextWindow.crop] ?? watch.nextWindow.crop)}{tx("'s heat-sensitive window opens:")}{" "}<b>{fmtDay(watch.nextWindow.at, language)}</b>{" "}{tx("(window")}{" "}{watch.nextWindow.from}{" "}{tx("to")}{" "}{watch.nextWindow.to}{tx("; an estimate from crop defaults, not an observed crop stage).")}</>
                )}
              </p>
            </fieldset>
          )}
          {error && <p className="fw-empty">{localize(error)}</p>}
          {runs && runs.length === 0 && <p className="fw-empty">{tx("No scheduled checks for this farm yet.")}</p>}
          {runs && runs.length > 0 && (
            <ul className="fw-list">
              {runs.map((r) => (
                <li key={r.runId} className="fw-row">
                  <details>
                    <summary>
                      <span className={`fw-status fw-${r.status === "pending" ? "insufficient" : r.status}`}>{localize(LABEL[r.status])}</span>
                      <span className="fw-main">
                        <span className="fw-name">
                          {localize(MODE_LABEL[r.mode])}
                          {r.mode === "replay" && <span className="fw-tag">{tx("not current conditions")}</span>}
                        </span>
                        <span className="fw-headline">{r.headline ? watchText(r.headline.replace(/^Historical replay: /, ""), language) : tx("Waiting for its scheduled time…")}</span>
                      </span>
                      <span className="fw-when">
                        {r.completedAt ? tx("done {time}", { time: fmtTime(r.completedAt, language) }) : tx("due {time}", { time: fmtTime(r.dueAt, language) })}
                        {r.snapshot?.windowEnd && <small>{tx("data")}{" "}{r.snapshot.windowStart}{" "}{tx("to")}{" "}{r.snapshot.windowEnd}</small>}
                      </span>
                    </summary>
                    <div className="fw-detail">
                      <ImergRunContext context={r.imergContext} />
                      <ResearchNote note={r.researchNote} />
                      {r.reasons.length > 0 && (
                        <ul className="fw-reasons">
                          {r.reasons.filter((x) => x.id !== "kansas").map((x) => (
                            <li key={x.id}>
                              {watchText(x.text, language)}
                              <small>{x.source}</small>
                            </li>
                          ))}
                        </ul>
                      )}
                      <p className="fw-meta">{tx("Run")}{" "}<code>{r.runId}</code>{" "}{tx("· rule v")}{r.ruleVersion}{" "}{tx("· scheduled")}{" "}{fmtTime(r.scheduledAt, language)}
                        {r.completedAt && <>{" "}{tx("· ran")}{" "}{fmtTime(r.completedAt, language)}{" "}{tx("on Cloudflare")}</>}
                        {r.snapshot && (
                          <>
                            {" "}{tx("· compared with")}{" "}{r.snapshot.comparisonYears} · {r.snapshot.source}
                            {r.snapshot.inputSha256 && <>{" "}{tx("· input hash")}{" "}<code>{r.snapshot.inputSha256.slice(0, 12)}</code></>}
                          </>
                        )}
                      </p>
                    </div>
                  </details>
                  <DistrictOutlook outlook={r.districtOutlook} />
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </section>
  );
}
