import { useCallback, useEffect, useState } from "react";
import type { FieldBoundary, FieldsStatus } from "../../../src/shared/fields";
import type { CropId } from "../../../src/shared/types";
interface AgentRun { status: "pending" | "ok" | "watch" | "dry" | "insufficient" | "inactive" | "error"; headline: string | null; completedAt: number | null }
import { cropName, useI18n, watchText } from "../i18n";
import "./myfields.css";

export interface SavedField { agentFieldId: string; name: string; fieldId: string; acres: number }
export const MY_FIELDS_KEY = "soilsense.myfields.v1";
export function readMyFields(): SavedField[] {
  try {
    const data: unknown = JSON.parse(localStorage.getItem(MY_FIELDS_KEY) ?? "[]");
    return Array.isArray(data) ? data.filter((f): f is SavedField => !!f && typeof f === "object" && /^u_[A-Za-z0-9_-]{32}$/.test(f.agentFieldId) && typeof f.name === "string" && typeof f.fieldId === "string" && Number.isFinite(f.acres)).slice(0, 10) : [];
  } catch { return []; }
}
async function api<T>(url: string, method = "GET", body?: unknown): Promise<T> {
  const r = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15_000) });
  if (!r.ok) throw new Error("Field request failed. Try again.");
  return r.json() as Promise<T>;
}
const crops: CropId[] = ["corn", "soybean", "winter_wheat", "oats", "alfalfa", "sorghum"];

/** Self-gated by the shared status endpoint; boundary selections come from the map. */
export function MyFieldsPanel({ fields }: { fields: FieldBoundary[] }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => { let active = true; void api<FieldsStatus>("/api/fields/status").then(s => { if (active) setEnabled(s.enabled === true); }).catch(() => {}); return () => { active = false; }; }, []);
  return enabled ? <MyFieldsContent fields={fields} /> : null;
}
export function MyFieldsContent({ fields }: { fields: FieldBoundary[] }) {
  const { t, language } = useI18n();
  const [saved, setSaved] = useState(readMyFields);
  const [crop, setCrop] = useState<CropId>("corn");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [storageError, setStorageError] = useState(false);
  const persist = (next: SavedField[]) => {
    setSaved(next);
    try { localStorage.setItem(MY_FIELDS_KEY, JSON.stringify(next)); setStorageError(false); }
    catch { setStorageError(true); }
  };
  const add = async (field: FieldBoundary) => {
    if (busy || saved.length >= 10 || saved.some(f => f.fieldId === field.id)) return;
    setBusy(true); setError(false);
    try {
      // Check that durable browser storage is available before creating a capability.
      localStorage.setItem(MY_FIELDS_KEY, JSON.stringify(saved));
      const r = await api<{ agentFieldId: string }>("/api/fields/register", "POST", { field, watchedCrop: crop });
      persist([...saved, { agentFieldId: r.agentFieldId, name: field.name || field.id, fieldId: field.id, acres: field.areaAcres }]);
    } catch { setError(true); } finally { setBusy(false); }
  };
  return <section className="my-fields" aria-labelledby="my-fields-title">
    <h2 id="my-fields-title">{t("My fields")}</h2>
    <p>{t("Saved in this browser only. Anyone with a field capability can read or change its watch. No accounts; do not use private data.")}</p>
    <p>{t("CSB outlines are synthetic crop boundaries, not ownership parcels. Neighbouring fields can share the same ~50 km POWER weather cell.")}</p>
    <p>{t("Up to 10 fields per browser (advisory). Weekly watch starts off.")}</p>
    {fields.length > 0 && <label>{t("Watched crop for new fields")} <select value={crop} onChange={e => setCrop(e.target.value as CropId)}>{crops.map(c => <option key={c} value={c}>{cropName(c, language)}</option>)}</select></label>}
    <ul className="my-fields-selected">{fields.map(f => <li key={f.id}><span>{f.name || f.id}</span><button type="button" disabled={busy || saved.length >= 10 || saved.some(s => s.fieldId === f.id)} onClick={() => void add(f)}>{t("Add selected field")}</button></li>)}</ul>
    {fields.length === 0 && <p>{t("Select CSB fields on the map to add them here.")}</p>}
    {error && <p role="alert">{t("Field request failed. Try again.")}</p>}
    {storageError && <p role="alert">{t("Browser storage failed. Keep this page open; your field capability may not survive reload.")}</p>}
    <ul className="my-fields-list">{saved.map(f => <MyFieldRow key={f.agentFieldId} field={f} onRemove={() => persist(saved.filter(s => s.agentFieldId !== f.agentFieldId))} />)}</ul>
  </section>;
}
function MyFieldRow({ field, onRemove }: { field: SavedField; onRemove: () => void }) {
  const { t, language } = useI18n();
  const [runs, setRuns] = useState<AgentRun[]>([]);
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [missing, setMissing] = useState(false);
  const base = `/api/fieldwatch/agent/${field.agentFieldId}`;
  const load = useCallback(async () => {
    const [r, w] = await Promise.all([api<{ runs: AgentRun[] }>(`${base}/runs`), api<{ settings: { enabled: boolean } }>(`${base}/watch`)]);
    setRuns(r.runs); setEnabled(w.settings.enabled); setError(false);
  }, [base]);
  useEffect(() => { let active = true; const refresh = () => { if (active) void load().catch(() => { if (active) setError(true); }); }; refresh(); const timer = window.setInterval(refresh, 15_000); return () => { active = false; window.clearInterval(timer); }; }, [load]);
  const act = async (kind: "check" | "watch" | "delete") => {
    setBusy(true); setError(false);
    try {
      if (kind === "delete") {
        const r = await fetch(`/api/fields/${field.agentFieldId}`, { method: "DELETE", signal: AbortSignal.timeout(15_000) });
        if (!r.ok && r.status !== 404) throw new Error();
        // Do not forget on flag-disabled 404: server watch would otherwise keep running.
        if (r.status === 404) {
          const body = await r.json() as { error?: string };
          if (body.error !== "Unknown field.") throw new Error();
        }
        onRemove(); return;
      }
      await api(`${base}/${kind}`, kind === "watch" ? "PUT" : "POST", kind === "watch" ? { enabled: !enabled } : { mode: "live" });
      await load();
    } catch { setError(true); } finally { setBusy(false); }
  };
  const latest = runs[0];
  return <li className="my-fields-row"><h3>{field.name}</h3><p>{field.acres.toLocaleString(language, { maximumFractionDigits: 1 })} {t("acres")}</p>
    <p role="status">{latest ? t(({ pending: "Scheduled", ok: "OK", watch: "Watch", dry: "Dry spell", insufficient: "No data", inactive: "Off season", error: "Error" } as const)[latest.status]) : t("No checks yet.")}</p>
    {latest?.headline && <p>{watchText(latest.headline, language)}</p>}
    {latest?.completedAt && <p>{new Date(latest.completedAt).toLocaleString(language)}</p>}
    <div className="my-fields-actions"><button type="button" disabled={busy || enabled === null} onClick={() => void act("check")}>{t("Schedule field check")}</button><button type="button" aria-pressed={enabled === true} disabled={busy || enabled === null} onClick={() => void act("watch")}>{enabled ? t("Disable weekly watch") : t("Enable weekly watch")}</button><button type="button" disabled={busy} onClick={() => setMissing(true)}>{t("Remove field")}</button></div>
    {missing && <div role="group" aria-label={t("Remove field")}><p>{t("Remove this field and cancel all its checks?")}</p><button type="button" disabled={busy} onClick={() => void act("delete")}>{t("Delete and forget")}</button><button type="button" onClick={() => setMissing(false)}>{t("Keep field")}</button></div>}
    {error && <p role="alert">{t("Field request failed. Try again.")}</p>}
  </li>;
}
