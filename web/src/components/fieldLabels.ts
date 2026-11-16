import type { FieldBoundary } from '../../../src/shared/fields';
import { fieldPlanHistory } from '../../../src/shared/fields';
import { csbCropSpanish } from '../i18n-fields';

export const FIELD_NAME_PREFIX='soilsense:field-name:v1:';
export function fieldName(field: FieldBoundary, language: string): string {
  const name=field.name ?? 'Field';
  return language==='es'?name.replace(/^Field(?= \d+$|$)/,'Parcela'):name;
}
export function fieldLabel(field: FieldBoundary, language: string): string {
  const years=fieldPlanHistory(field).years;
  const sequence=years.map(y=>language==='es'?(csbCropSpanish[y.cdlCode] ?? y.crop):y.crop).join(' → ');
  return `${fieldName(field,language)} · ${field.areaAcres.toLocaleString(language==='es'?'es-US':'en-US',{minimumFractionDigits:1,maximumFractionDigits:1})} ac${years.length?` · ${sequence} (${years[0]!.year}–${years.at(-1)!.year})`:''}`;
}
