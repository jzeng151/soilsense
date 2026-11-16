import { EXTRA_CROP_IDS } from '../../../src/shared/extraCrops';
import { useId, useState } from 'react';
import type { CropId, RotationPlan } from '../../../src/shared/types';
import { EQUIPMENT_GROUPS, MARKET_OUTLETS, type ConstraintCode, type ConstraintIssue, type ConstraintReport, type EquipmentGroup, type FarmerConstraints, type MarketOutlet } from '../../../src/shared/constraints';
import { validateConstraints } from '../../../src/shared/validateConstraints';
import { constraintWater, WELL_CONVERSION_SOURCE } from '../../../src/shared/constraintWater';
import { cropName, useI18n, type TranslationKey } from '../i18n';
import './constraints.css';

const CROPS: CropId[] = ['corn', 'soybean', 'winter_wheat', 'oats', 'alfalfa', 'sorghum', 'fallow', ...EXTRA_CROP_IDS];
const EQUIPMENT: Record<EquipmentGroup, TranslationKey> = { row_crop_planter: 'Row-crop planter', grain_drill: 'Grain drill', hay_equipment: 'Hay equipment', cotton_stripper: 'Cotton stripper', forage_harvester: 'Forage harvester', grain_combine: 'Grain combine' };
const MARKETS: Record<MarketOutlet, TranslationKey> = { grain_elevator: 'Grain elevator', feedlot_dairy: 'Feedlot / dairy / hay buyer', cotton_gin: 'Cotton gin', oilseed_buyer: 'Oilseed buyer' };
const REASONS: Record<ConstraintCode, TranslationKey> = {
 excludeCrops: 'Excluded by your crop choice', mustInclude: 'Required crop is missing', maxCornYears: 'Exceeds your maximum corn years', noSameCropBackToBack: 'Repeats a crop in consecutive years', unavailableEquipment: 'Needs unavailable equipment', marketOutlets: 'No selected market outlet',
};
function toggle<T>(list: T[] | undefined, item: T): T[] { return list?.includes(item) ? list.filter(v => v !== item) : [...(list ?? []), item]; }

export function ConstraintsPanel({ value, onChange }: { value?: FarmerConstraints; onChange: (value: FarmerConstraints | undefined, valid: boolean) => void }) {
 const { t, language } = useI18n();
 const id = useId();
 const [wellEnabled, setWellEnabled] = useState(!!value?.well);
 const c = value ?? {};
 const error = validateConstraints(value, CROPS);
 const update = (next: FarmerConstraints) => {
  const checked = validateConstraints(next, CROPS);
  onChange(typeof checked === 'string' ? next : checked, typeof checked !== 'string');
 };
 const water = typeof error !== 'string' ? constraintWater(c) : undefined;
 const wellFields: { key: keyof NonNullable<FarmerConstraints['well']>; label: TranslationKey; min: number; max: number }[] = [
  { key: 'gpm', label: 'Well capacity (gallons per minute)', min: 0, max: 100000 },
  { key: 'acres', label: 'Irrigated area (acres)', min: 0.01, max: 1000000 },
  { key: 'pumpingDays', label: 'Pumping days per season', min: 1, max: 366 },
  { key: 'hoursPerDay', label: 'Pumping hours per day', min: 0.01, max: 24 },
 ];
 return <details className="farm-constraints jr-more">
  <summary>{t('Your farm constraints')} <small>{t('(optional)')}</small></summary>
  <p>{t('Optional. We search for rotations that meet every limit; we never silently relax them.')}</p>
  {(['excludeCrops', 'mustInclude'] as const).map(key => <fieldset key={key}>
   <legend>{t(key === 'excludeCrops' ? 'Do not plant these crops' : 'Must plant at least once in the next 3 years')}</legend>
   {key === 'mustInclude' && <p>{t('Choose up to 3 required crops. Uncheck one to choose another.')}</p>}
   <div className="constraint-checks">{CROPS.map(crop => <label key={crop}>
    <input type="checkbox" data-exclude={key === 'excludeCrops' ? crop : undefined} checked={c[key]?.includes(crop) ?? false} disabled={key === 'mustInclude' && (c.mustInclude?.length ?? 0) >= 3 && !c.mustInclude?.includes(crop)} onChange={() => update({ ...c, [key]: toggle(c[key], crop) })} />{cropName(crop, language)}
   </label>)}</div>
  </fieldset>)}
  <label className="constraint-number">{t('Maximum corn years (0–3)')}
   <input type="number" min="0" max="3" step="1" aria-invalid={c.maxCornYears !== undefined && (!Number.isInteger(c.maxCornYears) || c.maxCornYears < 0 || c.maxCornYears > 3)} value={c.maxCornYears ?? ''} onChange={e => update({ ...c, maxCornYears: e.target.value === '' ? undefined : Number(e.target.value) })} />
  </label>
  <label><input type="checkbox" checked={c.noSameCropBackToBack ?? false} onChange={e => update({ ...c, noSameCropBackToBack: e.target.checked })} />{t('No same crop two years in a row (including your last crop)')}</label>
  <fieldset><legend>{t('Equipment I cannot use')}</legend><div className="constraint-checks">{EQUIPMENT_GROUPS.map(equipment => <label key={equipment}><input type="checkbox" checked={c.unavailableEquipment?.includes(equipment) ?? false} onChange={() => update({ ...c, unavailableEquipment: toggle(c.unavailableEquipment, equipment) })} />{t(EQUIPMENT[equipment])}</label>)}</div></fieldset>
  <label><input type="checkbox" checked={c.marketOutlets !== undefined} onChange={e => update({ ...c, marketOutlets: e.target.checked ? [] : undefined })} />{t('Limit crops to buyers I can reach')}</label>
  <p>{t('Leave unchecked to make no market restriction. With this enabled, select every outlet you can reach; none means no crop buyers.')}</p>
  {c.marketOutlets !== undefined && <div className="constraint-checks">{MARKET_OUTLETS.map(market => <label key={market}><input type="checkbox" checked={c.marketOutlets!.includes(market)} onChange={() => update({ ...c, marketOutlets: toggle(c.marketOutlets, market) })} />{t(MARKETS[market])}</label>)}</div>}
  <label className="constraint-number">{t('Seasonal irrigation allocation (inches, 0–30)')}
   <input type="number" min="0" max="30" step="any" aria-invalid={c.irrigationInches !== undefined && (c.irrigationInches < 0 || c.irrigationInches > 30)} aria-describedby={`${id}-water`} value={c.irrigationInches ?? ''} onChange={e => update({ ...c, irrigationInches: e.target.value === '' ? undefined : Number(e.target.value) })} />
  </label>
  <p id={`${id}-water`}>{t('Blank keeps your water setting. Zero means no pumping. An entered cap overrides that setting in every planned year.')}</p>
  <label><input type="checkbox" checked={wellEnabled} onChange={e => {
   setWellEnabled(e.target.checked);
   update({ ...c, well: e.target.checked ? { gpm: NaN, acres: NaN, pumpingDays: NaN, hoursPerDay: NaN } : undefined });
  }} />{t('Use well capacity to cap irrigation')}</label>
  {wellEnabled && <fieldset><legend>{t('Enter all four well values; no pumping schedule is assumed.')}</legend>
   {wellFields.map(f => { const n = c.well?.[f.key]; return <label className="constraint-number" key={f.key}>{t(f.label)}<input type="number" min={f.min} max={f.max} step="any" required aria-invalid={!Number.isFinite(n) || n! < f.min || n! > f.max} value={Number.isFinite(n) ? n : ''} onChange={e => update({ ...c, well: { gpm: NaN, acres: NaN, pumpingDays: NaN, hoursPerDay: NaN, ...c.well, [f.key]: e.target.value === '' ? NaN : Number(e.target.value) } })} /></label>; })}
  </fieldset>}
  <p>{t('Gross seasonal inches = gpm × 60 × hours/day × days ÷ (27,154 × acres). The smaller of allocation and well capacity applies. Losses and peak-day delivery are not modeled.')} <a href={WELL_CONVERSION_SOURCE} target="_blank" rel="noreferrer">{t('K-State water conversion')}</a></p>
  {water?.formula && <p><code>{water.formula}</code></p>}
  {water && <p role="status">{t('Seasonal irrigation cap: {inches} inches per planned year.', { inches: water.seasonalCapInches.toFixed(2) })}</p>}
  {typeof error === 'string' && <p role="alert">{t('Review the highlighted numbers before planning.')}</p>}
  <p>{t('Equipment and outlet requirements describe our modeled products, not all possible farming methods.')}</p>
  <button type="button" onClick={() => { setWellEnabled(false); onChange(undefined, true); }}>{t('Clear constraints')}</button>
 </details>;
}

export function ConstraintSummary({ report, currentPractice }: { report?: ConstraintReport; currentPractice: RotationPlan | null }) {
 const { t, language } = useI18n();
 if (!report) return null;
 const issue = (i: ConstraintIssue) => `${i.crop ? cropName(i.crop, language) + ': ' : ''}${t(REASONS[i.constraint])}${i.detail && i.constraint === 'unavailableEquipment' ? ` (${t(EQUIPMENT[i.detail as EquipmentGroup])})` : ''}`;
 return <section className="jr-card farm-constraints" aria-label={t('Your farm constraints')}>
  <h2>{t(report.status === 'infeasible' ? 'No rotation satisfies these constraints.' : 'Your farm constraints')}</h2>
  <p>{t(report.status === 'infeasible' ? 'No limits were relaxed. Review the limits below and try again.' : 'These limits were applied before scoring every rotation.')}</p>
  {report.status === 'infeasible' && <><p>{t('Constraints rejecting otherwise feasible rotations (not a minimal conflict set):')}</p><ul>{report.binding.map(code => <li key={code}>{t(REASONS[code])}</li>)}</ul></>}
  {!!report.excludedCrops.length && <><h3>{t('Why crops were excluded')}</h3><ul>{report.excludedCrops.map(x => <li key={x.crop}>{x.reasons.map(issue).join('; ')}</li>)}</ul></>}
  {report.water && <><p>{t('Seasonal irrigation cap: {inches} inches per planned year.', { inches: report.water.seasonalCapInches.toFixed(2) })}</p>{report.water.wellCapInches !== undefined && <p>{t('Gross seasonal inches = gpm × 60 × hours/day × days ÷ (27,154 × acres). The smaller of allocation and well capacity applies. Losses and peak-day delivery are not modeled.')} <a href={report.water.source}>{t('K-State water conversion')}</a></p>}</>}
  {report.water?.formula && <p><code>{report.water.formula}</code></p>}
  <h3>{t('Current practice remains a comparison, not a recommendation.')}</h3>
  {currentPractice ? <><p>{currentPractice.years.map(y => cropName(y.crop, language)).join(' → ')} · ${currentPractice.avgNetReturnPerAcre.toFixed(0)}/acre</p>
   <p>{t(report.currentPracticeViolations.length ? 'Your current practice violates:' : 'Your current practice meets these crop constraints.')}</p>
   {!!report.currentPracticeViolations.length && <ul>{report.currentPracticeViolations.map((i, n) => <li key={n}>{issue(i)}</li>)}</ul>}
  </> : <p>{t('No known current-practice sequence to compare.')}</p>}
 </section>;
}
