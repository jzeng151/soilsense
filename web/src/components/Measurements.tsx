import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { FarmerYield, PlanRequest, SoilProfile, SoilTest } from "../../../src/shared/types";
import { TEXTURE_AWC, validateMeasurements } from "../../../src/shared/measurements";
import { cropName, useI18n, type TranslationKey } from "../i18n";
import "./measurements.css";

type Measurements = Pick<PlanRequest, "soilTest" | "yieldRecords">;
type Row = { crop: FarmerYield["crop"]; year: string; value: string };
type Draft = { ph: string; organicMatterPct: string; awc: string; texture: string; rows: Row[] };
const empty = (): Draft => ({ ph: "", organicMatterPct: "", awc: "", texture: "", rows: [] });
const crops: FarmerYield["crop"][] = ["corn", "soybean", "winter_wheat", "oats", "alfalfa", "sorghum"];
const textures: Record<NonNullable<SoilTest["texture"]>, TranslationKey> = { sand: "Sand", sandy_loam: "Sandy loam", loam: "Loam", silt_loam: "Silt loam", clay_loam: "Clay loam", clay: "Clay" };
const fields = [
  { key: "ph", label: "pH (0–14)", min: 0, max: 14, step: "0.1" },
  { key: "organicMatterPct", label: "Organic matter % (0–100)", min: 0, max: 100, step: "0.1" },
  { key: "awc", label: "Available water capacity (0.01–0.6 cm/cm)", min: 0.01, max: 0.6, step: "0.01" },
] as const;
export const measurementStorageKey = (fieldKey: string) => `soilsense:measurements:v1:${fieldKey}`;
function load(fieldKey: string): Draft {
  try {
    const d: unknown = JSON.parse(localStorage.getItem(measurementStorageKey(fieldKey)) ?? "null");
    if (!d || typeof d !== "object") return empty();
    const v = d as Draft;
    if (![v.ph, v.organicMatterPct, v.awc, v.texture].every((s) => typeof s === "string" && s.length <= 40) || !Array.isArray(v.rows) || v.rows.length > 30) return empty();
    if (!v.rows.every((r) => r && crops.includes(r.crop) && typeof r.year === "string" && r.year.length <= 10 && typeof r.value === "string" && r.value.length <= 40)) return empty();
    return v;
  } catch { return empty(); }
}
function parse(d: Draft): Measurements | string {
  if (d.rows.some((r) => !r.year.trim() || !r.value.trim())) return "incomplete";
  return validateMeasurements({
    soilTest: { ...Object.fromEntries(fields.filter((f) => d[f.key].trim()).map((f) => [f.key, Number(d[f.key])])), ...(d.texture ? { texture: d.texture } : {}) },
    yieldRecords: d.rows.map((r) => ({ crop: r.crop, year: Number(r.year), value: Number(r.value), unit: r.crop === "alfalfa" ? "tons/acre" : "bu/acre" })),
  });
}

/** Mount with key=fieldKey so switching fields never carries another field's edits across. */
export function MeasurementPanel({ fieldKey, soil, onChange }: { fieldKey: string; soil: SoilProfile; onChange: (measurements: Measurements, valid: boolean) => void }) {
  const { t, language } = useI18n();
  const id = useId();
  const [draft, setDraft] = useState(() => load(fieldKey));
  const [storageFailed, setStorageFailed] = useState(false);
  const pendingFocus = useRef<string | null>(null);
  const focus = (key: string, node: HTMLElement | null) => {
    if (node && pendingFocus.current === key) { node.focus(); pendingFocus.current = null; }
  };
  const parsed = useMemo(() => parse(draft), [draft]);
  const invalid = typeof parsed === "string";
  useEffect(() => { onChange(typeof parsed === "string" ? {} : parsed, typeof parsed !== "string"); }, [parsed, onChange]);
  useEffect(() => {
    try { localStorage.setItem(measurementStorageKey(fieldKey), JSON.stringify(draft)); setStorageFailed(false); }
    catch { setStorageFailed(true); }
  }, [draft, fieldKey]);
  const set = (key: keyof Omit<Draft, "rows">, value: string) => setDraft((d) => ({ ...d, [key]: value }));
  const updateRow = (index: number, key: "year" | "value", value: string) => setDraft((d) => ({ ...d, rows: d.rows.map((r, i) => i === index ? { ...r, [key]: value } : r) }));
  return <details className="jr-more measurements">
    <summary>{t("Add your own measurements")}</summary>
    <p>{t("Optional. Saved only in this browser for this field; sent to compute your plan, not saved to an account.")}</p>
    <p className="hint">{t("Leave blanks to use regional estimates. Confirm the field and water supply match your records.")}</p>
    <fieldset aria-describedby={`${id}-soil-help`}>
      <legend>{t("Your soil test")}</legend>
      <div className="measurement-inputs">{fields.map((f) => <label key={f.key}>
        {t(f.label)}
        <input type="number" name={f.key} min={f.min} max={f.max} step={f.step} inputMode="decimal" value={draft[f.key]} onChange={(e) => set(f.key, e.target.value)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} />
      </label>)}</div>
      <label>{t("Soil texture (optional)")}<select value={draft.texture} onChange={(e) => set("texture", e.target.value)}>
        <option value="">{t("Use the soil map")}</option>{Object.entries(textures).map(([value, label]) => <option key={value} value={value}>{t(label)}</option>)}
      </select></label>
      <p id={`${id}-soil-help`} className="hint">{t("Water capacity uses cm/cm (same number as in/in), not total inches. A measured value wins over texture. Texture gives an approximate model value, not a lab result.")}</p>
      <p className="hint">{t("Organic matter is shown as soil evidence; the model does not infer yield or water changes from it.")}</p>
      <SoilComparison soil={soil} test={invalid ? undefined : parsed.soilTest} />
    </fieldset>
    <fieldset aria-describedby={`${id}-yield-help`}>
      <legend>{t("Past yields")}</legend>
      <p id={`${id}-yield-help`} className="hint">{t("Up to 5 past calendar years per crop. Grain: bu/acre (0–1000). Alfalfa: US short tons/acre (0–30). Zero means a failed harvest.")}</p>
      <p className="hint">{t("The model adds 50% of the local-minus-regional potential difference, bounded to 60–115% of the state value. This is calibration, not independent validation.")}</p>
      {crops.map((crop) => <fieldset key={crop} className="measurement-crop"><legend>{cropName(crop, language)}</legend>
        {draft.rows.map((r, i) => r.crop !== crop ? null : <div className="measurement-row" key={i}>
          <label>{t("Harvest year")}<input ref={(node) => focus(`year-${i}`, node)} type="number" inputMode="numeric" min={1900} max={new Date().getUTCFullYear() - 1} step="1" value={r.year} onChange={(e) => updateRow(i, "year", e.target.value)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} /></label>
          <label>{t("Yield")} ({t(crop === "alfalfa" ? "US short tons/acre" : "bu/acre")})<input type="number" inputMode="decimal" min={0} max={crop === "alfalfa" ? 30 : 1000} step="any" value={r.value} onChange={(e) => updateRow(i, "value", e.target.value)} aria-invalid={invalid || undefined} aria-describedby={invalid ? `${id}-error` : undefined} /></label>
          <button type="button" className="ghost" onClick={() => { pendingFocus.current = `add-${crop}`; setDraft((d) => ({ ...d, rows: d.rows.filter((_, j) => j !== i) })); }}>{t("Remove yield year")}</button>
        </div>)}
        <button ref={(node) => focus(`add-${crop}`, node)} type="button" className="ghost" disabled={draft.rows.filter((r) => r.crop === crop).length >= 5} onClick={() => { pendingFocus.current = `year-${draft.rows.length}`; setDraft((d) => ({ ...d, rows: [...d.rows, { crop, year: "", value: "" }] })); }}>{t("Add a yield year")} · {cropName(crop, language)}</button>
      </fieldset>)}
    </fieldset>
    {invalid && <p id={`${id}-error`} role="alert">{t("Check your measurements: use the ranges shown, complete each yield row, and enter distinct past years (at most 5 per crop).")}</p>}
    {storageFailed && <p role="status">{t("Browser storage is unavailable. Your measurements work for this visit but will not survive a reload.")}</p>}
    <button type="button" className="ghost" onClick={() => setDraft(empty())}>{t("Clear my measurements")}</button>
  </details>;
}

export function SoilComparison({ soil, test }: { soil: SoilProfile; test?: SoilTest }) {
  const { t } = useI18n();
  return <div className="soil-comparison">
    <table><caption>{t("Soil measurements used for this plan")}</caption>
      <thead><tr><th scope="col">{t("Soil:")}</th><th scope="col">{t("Your soil test")}</th><th scope="col">{t("USDA soil map")}</th></tr></thead>
      <tbody>{fields.map((f) => <tr key={f.key}><th scope="row">{t(f.label)}</th><td>{test?.[f.key] !== undefined ? String(test[f.key]) : f.key === "awc" && test?.texture ? <>{TEXTURE_AWC[test.texture]} · {t("Approximate from your texture")}</> : t("Map estimate used")}</td><td>{soil[f.key] === undefined ? t("Not available") : Number(soil[f.key]!.toFixed(f.key === "awc" ? 3 : 1))}</td></tr>)}</tbody>
    </table>
    <p className="hint">{t("Your entries override only the supplied properties; map drainage and profile depth are unchanged.")}</p>
  </div>;
}
