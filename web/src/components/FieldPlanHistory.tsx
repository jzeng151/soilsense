import type { FieldBoundary } from '../../../src/shared/fields';
import { fieldPlanHistory, cdlToCropId } from '../../../src/shared/fields';
import type { CropId } from '../../../src/shared/types';
import { cropName, useI18n } from '../i18n';
import { csbCropSpanish } from '../i18n-fields';
import { fieldName } from './fieldLabels';

const CROPS: CropId[]=['corn','soybean','winter_wheat','oats','alfalfa','sorghum','fallow'];
export function FieldPlanHistory({field,values,onChange,used,onEdit}:{field:FieldBoundary;values:(CropId|'')[];onChange?:(values:(CropId|'')[])=>void;used?:CropId[];onEdit?:()=>void}) {
  const {t,language}=useI18n();
  const source=fieldPlanHistory(field);
  const years=source.years.length?source.years:[{year:2025,cdlCode:0,crop:''}];
  const corrected=values.some((v,i)=>v!==(cdlToCropId(source.years[i]?.cdlCode ?? 0) ?? ''));
  return <section className="jr-card" data-field-plan={field.id} style={{overflowWrap:'anywhere',minWidth:0}}>
    <h2>{t('Planning for: {field} ({acres} ac)',{field:fieldName(field,language),acres:field.areaAcres.toFixed(1)})}</h2>
    <small>{field.id}</small>
    <p>{t('USDA Crop Sequence Boundaries 2018–2025, satellite-derived, not farmer-reported; edit if wrong.')}</p>
    {source.dropped.length>0 && <p role="note">{t('Unknown or unmodeled crops omitted: {crops}',{crops:source.dropped.map(y=>`${y.year}: ${language==='es'?(csbCropSpanish[y.cdlCode] ?? y.crop):y.crop} (CDL ${y.cdlCode})`).join('; ')})}</p>}
    <h3>{t('Crop history used (oldest first)')}</h3>
    {used?<p data-history-used>{values.flatMap((c,i)=>c?[`${years[i]?.year ?? ''}: ${cropName(c,language)}`]:[]).join(' → ')}</p>:<ol>{years.map((y,i)=><li key={y.year}>
      <label>{y.year}{' '}{onChange?<select aria-label={`${t('Correct crop history')} ${y.year}`} value={values[i] ?? ''} onChange={e=>{const next=[...values];next[i]=e.target.value as CropId|'';onChange(next);}}>
        <option value="">{t('Not used / unknown')}</option>{CROPS.map(c=><option key={c} value={c}>{cropName(c,language)}</option>)}
      </select>:cropName(values[i] as CropId,language)}</label>
    </li>)}</ol>}
    {corrected && <p>{t('History corrected in this browser.')}</p>}
    {onEdit && <button type="button" onClick={onEdit}>{t('Correct crop history')}</button>}
    {!values.some(Boolean) && <p role="alert">{t('Choose at least one modeled crop to plan this field.')}</p>}
  </section>;
}
