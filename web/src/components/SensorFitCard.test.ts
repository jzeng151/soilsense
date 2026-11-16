// @vitest-environment happy-dom
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { SensorFitCard } from './SensorFitCard';
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from '../i18n';
import type { FieldBoundary } from '../../../src/shared/fields';

(globalThis as typeof globalThis & {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();document.body.replaceChildren();});
async function mount(enabled:boolean,fields:FieldBoundary[]=[],language="en"){
  localStorage.setItem(LANGUAGE_STORAGE_KEY,language);
  vi.stubGlobal('fetch',vi.fn(async()=>new Response(JSON.stringify({enabled,areas:[]}),{status:200})));
  const container=document.createElement('div');document.body.append(container);
  const root=createRoot(container);
  await act(async()=>{root.render(createElement(LanguageProvider,null,createElement(SensorFitCard,{fields})));});
  return {container,root};
}
it('shows separate per-field tables and Spanish categories',async()=>{
 const field:FieldBoundary={id:'csb:test-a',name:'A',source:'usda-csb',polygon:[[[-100.71,38.1],[-100.70,38.1],[-100.70,38.11],[-100.71,38.11],[-100.71,38.1]]],areaAcres:1,centroid:{lat:38.105,lon:-100.705},provenance:{product:'Constructed test',version:'1',url:'',retrieved:''}};
 const {container,root}=await mount(true,[field,{...field,id:'csb:test-b',name:'B'}],'es');
 expect(container.querySelectorAll('caption')).toHaveLength(2);
 expect(container.querySelectorAll('tbody tr')).toHaveLength(18);
 expect(container.textContent).toContain('Píxeles completos estimados dentro de A');
 expect(container.textContent).toContain('Solo regional');
 expect(container.textContent).toContain('Escala de parcela (demostración)');
 expect(container.textContent).not.toContain('Regional only');
 await act(async()=>root.unmount());
});
it('renders no markup with fields disabled (preserves judged DOM)',async()=>{
 const {container,root}=await mount(false);expect(container.innerHTML).toBe('');await act(async()=>root.unmount());
});
it('shows a captioned native-size inventory when enabled without fields',async()=>{
 const {container,root}=await mount(true);
 expect(container.querySelector('caption')?.textContent).toContain('Native pixel sizes');
 expect(container.querySelectorAll('tbody tr')).toHaveLength(9);
 expect(container.textContent).toContain('Selecting a field outline shows');
 await act(async()=>root.unmount());
});
