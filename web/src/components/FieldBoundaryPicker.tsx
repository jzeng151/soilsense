import { useEffect, useState } from 'react';
import type { FieldBoundary, FieldsStatus } from '../../../src/shared/fields';
import { shareEdge } from '../../../src/engine/fieldGeometry';
import { useI18n } from '../i18n';
import { csbCropSpanish } from '../i18n-fields';
import { numberFields, validateFieldName } from '../../../src/shared/fields';
import { fieldLabel, fieldName, FIELD_NAME_PREFIX } from './fieldLabels';

/** The server, not a build-time flag or browser storage, authorizes this UI. */
export function useBoundaryCatalog(point: { lat:number;lon:number } | null) {
  const [status,setStatus]=useState<FieldsStatus>({enabled:false,areas:[]});
  const [area,setArea]=useState('');
  const [fields,setFields]=useState<FieldBoundary[]>([]);
  const [loading,setLoading]=useState(false), [error,setError]=useState(false);
  useEffect(()=>{
    const ctrl=new AbortController();
    void fetch('/api/fields/status',{signal:AbortSignal.any([ctrl.signal,AbortSignal.timeout(10000)])})
      .then(async r=>r.ok?await r.json() as FieldsStatus:null)
      .then(data=>{if(!ctrl.signal.aborted && data?.enabled===true && Array.isArray(data.areas)) setStatus(data);})
      .catch(()=>{});
    return ()=>ctrl.abort();
  },[]);
  useEffect(()=>{
    if(!status.enabled) return;
    const match=point?status.areas.find(a=>point.lon>=a.bbox[0] && point.lon<=a.bbox[2] && point.lat>=a.bbox[1] && point.lat<=a.bbox[3]):status.areas[0];
    // Whole CSB polygons can cross the demo query box; their centroids may lie just outside it.
    // Keep the farmer's chosen area rather than erasing its catalog when such a field is selected.
    setArea(current=>match?.id ?? current);
  },[status,point]);
  useEffect(()=>{
    if(!status.enabled || !area){setFields([]);return;}
    const ctrl=new AbortController();
    setLoading(true);setError(false);setFields([]);
    void fetch('/api/fields?area='+encodeURIComponent(area),{signal:AbortSignal.any([ctrl.signal,AbortSignal.timeout(15000)])})
      .then(async r=>{if(!r.ok)throw new Error('unavailable');return await r.json() as {fields:FieldBoundary[]};})
      .then(data=>{if(!ctrl.signal.aborted)setFields(numberFields(data.fields).map(f=>{try{const saved=localStorage.getItem(FIELD_NAME_PREFIX+f.id);const name=saved && validateFieldName(saved);return name?{...f,name}:f;}catch{return f;}}));})
      .catch(()=>{if(!ctrl.signal.aborted)setError(true);})
      .finally(()=>{if(!ctrl.signal.aborted)setLoading(false);});
    return ()=>ctrl.abort();
  },[status.enabled,area]);
  return {enabled:status.enabled,areas:status.areas,area,setArea,fields,setFields,loading,error};
}
interface Props {
  fields:FieldBoundary[];selected:FieldBoundary[];onChange:(fields:FieldBoundary[])=>void;
  areas:FieldsStatus['areas'];area:string;setArea:(area:string)=>void;
  onRename?:(field:FieldBoundary,name:string)=>void;
  onShowArea:()=>void;onUseCentroid?:(field:FieldBoundary)=>void;loading:boolean;error:boolean;
}
function FieldRename({field,onRename}:{field:FieldBoundary;onRename:(field:FieldBoundary,name:string)=>void}) {
  const {t,language}=useI18n();
  const [value,setValue]=useState(fieldName(field,language));
  const [invalid,setInvalid]=useState(false);
  return <div style={{marginBlock:8}}><label>{t('Rename field (local only)')}<input style={{maxWidth:'100%',boxSizing:'border-box'}} value={value} maxLength={60} onChange={e=>{setValue(e.target.value);setInvalid(false);}} aria-invalid={invalid} /></label>{' '}
    <button type="button" onClick={()=>{const name=validateFieldName(value);if(name===null){setInvalid(true);return;}onRename(field,name);}}>{t('Save field name')}</button>
    {invalid && <p role="alert">{t('Field name must be 1–60 characters without control characters. Leave blank to reset.')}</p>}
  </div>;
}
export function FieldBoundaryPicker({fields,selected,onChange,areas,area,setArea,onShowArea,onUseCentroid,onRename,loading,error}:Props){
  const {t,language}=useI18n();
  const acres=(value:number)=>value.toLocaleString(language==='es'?'es-US':'en-US',{maximumFractionDigits:1});
  const selectedIds=new Set(selected.map(f=>f.id));
  const toggle=(field:FieldBoundary)=>onChange(selectedIds.has(field.id)?selected.filter(f=>f.id!==field.id):[...selected,field]);
  const addNeighbours=()=>{
    const neighbours=fields.filter(f=>!selectedIds.has(f.id) && selected.some(s=>shareEdge(s.polygon,f.polygon)));
    onChange([...selected,...neighbours]);
  };
  return <section aria-labelledby="field-boundary-title" style={{minWidth:0,overflowWrap:'anywhere',marginBlock:'1rem'}}>
    <h3 id="field-boundary-title">{t('Choose public field outlines')}</h3>
    <p className="jr-note">{t('CSB outlines are synthetic crop boundaries, not ownership or tax parcels. Coverage tonight: about 3 × 3 km around each demo farm only.')}</p>
    <label htmlFor="csb-boundary-area">{t('Boundary area')}</label>{' '}<select id="csb-boundary-area" value={area} onChange={e=>setArea(e.target.value)}>
      <option value="">—</option>{areas.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select>{' '}
    <button type="button" disabled={!area} onClick={onShowArea}>{t('Show boundaries on map')}</button>
    <p className="jr-note">{t('Click an outline to select it. Shift/Ctrl-click to add or remove; or use the checkboxes below.')}</p>
    {loading && <p role="status">{t('Loading field outlines…')}</p>}
    {error && <p role="alert">{t('Field outlines unavailable. Choose an area to retry.')}</p>}
    <details><summary>{t('Fields in this area')} ({fields.length})</summary>
      <div style={{maxHeight:240,overflowY:'auto',padding:'0.5rem'}}>{fields.map(f=><label key={f.id} style={{display:'flex',gap:8,paddingBlock:8,alignItems:'start'}}>
        <input type="checkbox" checked={selectedIds.has(f.id)} onChange={()=>toggle(f)} />
        <span>{fieldLabel(f,language)}<small style={{display:'block'}}>{f.id}</small></span>
      </label>)}</div>
    </details>
    <h4>{t('Selected fields')}</h4>
    <p role="status">{t('{count} fields · {acres} acres total',{count:selected.length,acres:acres(selected.reduce((sum,f)=>sum+f.areaAcres,0))})}</p>
    <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      <button type="button" disabled={!selected.length || loading} onClick={addNeighbours}>{t('Add shared-edge neighbours')}</button>
      <button type="button" disabled={!selected.length} onClick={()=>onChange([])}>{t('Clear field selection')}</button>
    </div>
    {!selected.length && <p>{t('No fields selected.')}</p>}
    <ul style={{paddingInlineStart:'1.25rem'}}>{selected.map(f=><li key={f.id} style={{marginBlock:12}}>
      <strong>{fieldLabel(f,language)}</strong><small style={{display:'block'}}>{f.id}</small>{' '}
      <button type="button" aria-label={`${t('Remove selected field')} ${f.id}`} onClick={()=>toggle(f)}>{t('Remove selected field')}</button>
      <details><summary>{t('CSB crop sequence (2018–2025)')}</summary>
        <ol>{f.cropSequence?.map(c=><li key={c.year}>{c.year}: {language==='es'?(csbCropSpanish[c.cdlCode] ?? c.crop):c.crop} ({c.cdlCode})</li>)}</ol>
      </details>
      {onRename && <FieldRename key={f.id+f.name} field={f} onRename={onRename} />}
      {onUseCentroid && <button type="button" onClick={()=>onUseCentroid(f)}>{t('Plan this field')}</button>}
    </li>)}</ul>
    <p className="jr-note">{t('One selected field is the default plan. With multiple fields, choose Plan this field; fields are never averaged.')}</p>
    <p className="jr-note">{t('Nearby fields share coarse NASA POWER weather (~50 km); outlines do not make weather field-scale.')}</p>
    <a href="https://www.nass.usda.gov/Research_and_Science/Crop-Sequence-Boundaries/" target="_blank" rel="noreferrer">USDA NASS · {t('Source and limitations')}</a>
  </section>;
}
