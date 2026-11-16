// @vitest-environment happy-dom
import { createElement, act } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, it, expect, vi, afterEach } from 'vitest';
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from '../i18n';
import { FieldBoundaryPicker, useBoundaryCatalog } from './FieldBoundaryPicker';
import finney from '../../../data/fields/finney.json';
import type { FieldBoundary } from '../../../src/shared/fields';
const sample=finney.fields.slice(0,2) as unknown as FieldBoundary[];
(globalThis as unknown as {IS_REACT_ACT_ENVIRONMENT:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
afterEach(()=>{ vi.restoreAllMocks(); document.body.innerHTML=''; localStorage.clear(); });
describe('field boundary picker',()=>{
  it('offers checkbox selection, acreage, eight source years and Spanish labels',async()=>{
    const el=document.createElement('div');document.body.append(el);const root=createRoot(el);const onChange=vi.fn();
    localStorage.setItem(LANGUAGE_STORAGE_KEY,'es');
    await act(async()=>root.render(createElement(LanguageProvider,null,createElement(FieldBoundaryPicker,{fields:sample,selected:sample,onChange,areas:[],area:'finney',setArea:()=>{},onShowArea:()=>{},loading:false,error:false}))));
    expect(el.querySelectorAll('input[type=checkbox]')).toHaveLength(2);
    expect(el.querySelector('input')?.checked).toBe(true);
    expect(el.textContent).toContain('Elegir contornos públicos de parcelas');
    expect(el.textContent).toContain('Maíz');
    expect(el.textContent).toContain('2018');expect(el.textContent).toContain('2025');
    expect(el.textContent).toMatch(/acres/);
    await act(async()=>el.querySelector<HTMLInputElement>('input')!.click());
    expect(onChange).toHaveBeenCalledWith([sample[1]]);
    await act(async()=>root.unmount());
  });
  it('renders nothing and does not request polygons when status is disabled',async()=>{
    const fetcher=vi.spyOn(globalThis,'fetch').mockResolvedValue(new Response('{"error":"fields disabled"}',{status:404}));
    function Probe(){const value=useBoundaryCatalog(null);return createElement('div',null,value.enabled?'enabled':'disabled');}
    const el=document.createElement('div'), root=createRoot(el);
    await act(async()=>root.render(createElement(Probe)));
    expect(el.textContent).toBe('disabled');
    expect(fetcher).toHaveBeenCalledTimes(1);
    expect(String(fetcher.mock.calls[0]?.[0])).toBe('/api/fields/status');
    await act(async()=>root.unmount());
  });
});
