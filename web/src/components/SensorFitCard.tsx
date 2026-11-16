import { useEffect, useMemo, useState } from 'react';
import type { FieldBoundary, FieldsStatus } from '../../../src/shared/fields';
import type { PlanResponse } from '../../../src/shared/types';
import { MIN_WHOLE_PIXELS, PIXEL_PRODUCTS, SQUARE_METRES_PER_ACRE, pixelAreaAt, pixelFit } from '../../../src/engine/pixelFit';
import type { FitCategory, PixelFit } from '../../../src/engine/pixelFit';
import { useI18n } from '../i18n';
import './SensorFitCard.css';

/** Evidence only: never adds plan inputs, fetches observations, or changes rankings. */
export function SensorFitCard({fields,plan}:{fields:FieldBoundary[];plan?:PlanResponse}) {
  const {t,language}=useI18n();
  const [enabled,setEnabled]=useState(false);
  useEffect(()=>{
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),5000);
    fetch('/api/fields/status',{signal:ctrl.signal}).then(async r=>{
      if(!r.ok)throw new Error('status');
      const status=await r.json() as FieldsStatus;
      if(!ctrl.signal.aborted)setEnabled(status.enabled===true);
    }).catch(()=>{/* Fail closed, including pre-feature Workers and malformed status. */}).finally(()=>clearTimeout(timeout));
    return ()=>{ctrl.abort();clearTimeout(timeout);};
  },[]);
  const fits=useMemo(()=>enabled?fields.map(field=>({field,rows:pixelFit(field)})):[],[fields,enabled]);
  const number=(n:number|null)=>n===null?t('Not applicable or unknown'):new Intl.NumberFormat(language,{maximumFractionDigits:n<0.01?5:2}).format(n);
  const category=(c:FitCategory)=>t(c==='field-scale'?'Field-scale (demo)':c==='mixed-edge'?'Mixed edge':c==='regional-only'?'Regional only':c==='not-raster'?'Not a raster':'Fit unknown');
  const method=(row:PixelFit)=>t(row.method==='latlon-grid'?'Native lat/lon grid':row.method==='local-equal-area-estimate'?'Approximate local grid':row.method==='support-area-only'?'Support-area proxy only':row.method==='not-raster'?'Soil map-unit polygons':'Fit unknown');
  const gridName=(grid:string)=>grid==="Sinusoidal"?t("Sinusoidal grid"):grid==="Mascons"?t("Mascons"):grid==="Lambert conformal conic"?t("Lambert conformal conic"):grid==="Map units"?t("Map units"):grid;
  if(!enabled)return null;
  const latitude=plan?.request.lat??40;
  return <section className="jr-card sensor-fit" aria-label={t('Satellite pixel fit')}>
    <h2 className="jr-h2">{t('Satellite pixel fit')}</h2>
    <p>{t('Geometry only, not cloud-free observations, accuracy, or a field measurement. Does not change rankings or Field Watch alerts.')}</p>
    <p>{t('Field-scale uses at least {count} whole pixels: a demonstration setting, not a validated agronomic threshold.',{count:MIN_WHOLE_PIXELS})}</p>
    <p>{t('Projected grids are approximations on a local equal-area square grid, not native UTM, sinusoidal, Albers, Lambert or EASE alignment. Edge and hole intersections are excluded.')}</p>
    <p>{t('SMAP, IMERG, POWER, Daymet and GRACE remain regional context even if a very large outline contains cells. Neighbouring fields can share the same weather.')}</p>
    {fits.length===0?<>
      <p>{t('Selecting a field outline shows the estimated fit. Latitude-dependent acreage uses {latitude}° here.',{latitude})}</p>
      <table><caption>{t('Native pixel sizes and approximate acres per pixel')}</caption>
        <thead><tr><th scope="col">{t('Product / grid')}</th><th scope="col">{t('Pixel size')}</th><th scope="col">{t('Acres per pixel')}</th></tr></thead>
        <tbody>{PIXEL_PRODUCTS.map(p=><tr key={p.id}><th scope="row"><a href={p.url}>{p.name}</a><small>{gridName(p.grid)}</small></th><td>{p.id==='ssurgo'?t('Soil map-unit polygons'):p.size}</td><td>{number(pixelAreaAt(p,latitude)===null?null:pixelAreaAt(p,latitude)!/SQUARE_METRES_PER_ACRE)}</td></tr>)}</tbody>
      </table>
    </>:fits.map(({field,rows})=><div key={field.id}>
      <h3>{field.name||field.id}</h3>
      <p>{t('Outline area: {acres} acres (spherical estimate). Synthetic CSB outlines are not ownership parcels.',{acres:number(rows[0]!.areaSquareMetres/SQUARE_METRES_PER_ACRE)})}</p>
      <table><caption>{t('Estimated whole pixels inside {field}',{field:field.name||field.id})}</caption>
        <thead><tr><th scope="col">{t('Product / grid')}</th><th scope="col">{t('Pixel size / acres')}</th><th scope="col">{t('Area ratio / whole pixels')}</th><th scope="col">{t('Scale category')}</th></tr></thead>
        <tbody>{rows.map(row=><tr key={row.product.id}>
          <th scope="row"><a href={row.product.url}>{row.product.name}</a><small>{gridName(row.product.grid)}</small></th>
          <td>{row.product.id==='ssurgo'?t('Soil map-unit polygons'):row.product.size}<small>{number(row.pixelAreaSquareMetres===null?null:row.pixelAreaSquareMetres/SQUARE_METRES_PER_ACRE)}</small></td>
          <td>{number(row.areaRatio)} / {number(row.wholePixels)}<small>{method(row)}</small></td>
          <td>{category(row.category)}</td>
        </tr>)}</tbody>
      </table>
    </div>)}
    <p>{t('MODIS is nominally 250 m; acreage/counts use the 231.656 m sinusoidal cell spacing. HLS is a separate optional evidence source; this table does not imply data availability. CDL refers to the app’s 30 m history, not newer 10 m releases.')}</p>
    <p>{t('GRACE uses an approximate 3° equivalent support area, never independent 0.5° display cells. Its whole-pixel count is unknown without native mascon geometry. SSURGO has no pixel count.')}</p>
    <p>{t('Area ratio means outline area divided by one pixel area; it is not the number of contained pixels. Unknown also covers unsupported geometry or the computation limit.')}</p>
  </section>;
}
