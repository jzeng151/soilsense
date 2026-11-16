import { useId } from "react";
import type { CropId } from "../../../src/shared/types";
import { MAX_FARMER_PRICE, PRICE_CROPS, type FarmerPrices } from "../../../src/shared/prices";
import { cropName, useI18n } from "../i18n";
import "./prices.css";

export interface PriceDraft { values: Partial<Record<CropId,string>>; prices: FarmerPrices; valid: boolean }

export function PricePanel({ value, onChange }: { value: PriceDraft; onChange: (draft: PriceDraft) => void }) {
  const { t, language } = useI18n();
  const id = useId();
  const {values,valid} = value;
  function change(next: Partial<Record<CropId,string>>) {
    const prices: FarmerPrices = {};
    let ok = true;
    for (const crop of PRICE_CROPS) {
      const raw = next[crop]?.trim();
      if (!raw) continue;
      const value = Number(raw);
      if (!/^\d+(\.\d*)?$/.test(raw) || !Number.isFinite(value) || value < 0 || value > MAX_FARMER_PRICE) ok = false;
      else prices[crop] = value;
    }
    onChange({values:next,prices,valid:ok});
  }
  return <details className="price-panel">
    <summary>{t("Your crop prices (optional)")}</summary>
    <p id={`${id}-help`}>{t("Leave blanks for USDA prices or approximate defaults. Prices change profit scoring and net returns, not weather or yields.")}</p>
    <div className="price-inputs">{PRICE_CROPS.map(crop => <label key={crop} htmlFor={`${id}-${crop}`}>
      <span>{cropName(crop,language)} · {t(crop==="alfalfa" ? "$/US short ton" : "$/bu")}</span>
      <input id={`${id}-${crop}`} type="text" inputMode="decimal" value={values[crop]??""} aria-describedby={`${id}-help ${id}-error`} aria-invalid={!valid || undefined} maxLength={16} onChange={e=>change({...values,[crop]:e.target.value})}/>
    </label>)}</div>
    <p id={`${id}-error`} role={!valid ? "alert" : undefined}>{!valid && t("Enter prices from 0 to 10000; no currency symbols.")}</p>
    <button type="button" onClick={()=>change({})}>{t("Reset prices")}</button>
  </details>;
}
