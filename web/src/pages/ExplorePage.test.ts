// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from '../i18n';
import { ExplorePage } from './ExplorePage';
vi.mock('../App',()=>({App:()=>createElement('div',{'data-testid':'planner-inputs'},'Planner inputs')}));
vi.mock('../components/explore/ExploreMap',()=>({ExploreMap:()=>createElement('div',{'data-testid':'map'})}));
vi.mock('../components/assistant/FieldAssistantPanel',()=>({FieldAssistantPanel:({context}:{context:{label:string}})=>createElement('div',{'data-testid':'assistant'},context.label)}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();window.location.hash='';});
it.each(['en','es'] as const)('renders the ZIP entry and labeled map controls in %s',async language=>{
  localStorage.setItem(LANGUAGE_STORAGE_KEY,language);
  const fetcher=vi.fn();vi.stubGlobal('fetch',fetcher);
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
  try{
    await act(async()=>root.render(createElement(LanguageProvider,null,createElement(ExplorePage))));
    expect(el.querySelector('h2')?.textContent).toBe(language==='es'?'¿Cuál es tu código postal?':"What's your ZIP code?");
    expect(el.querySelector('input')?.getAttribute('inputmode')).toBe('numeric');
    expect(el.querySelector('.explore-sky-credit a')?.textContent).toBe('ESO/S. Brunier');
    expect(el.querySelector('.explore-sky-credit a')?.getAttribute('href')).toBe('https://www.eso.org/public/images/eso0932a/');
    expect(el.querySelector('.explore-sky-credit a[href="https://creativecommons.org/licenses/by/4.0/"]')).not.toBeNull();
    expect(el.querySelector('button[aria-label="'+(language==='es'?'Acercar':'Zoom in')+'"]')).not.toBeNull();
    await act(async()=>el.querySelector('form')!.dispatchEvent(new Event('submit',{bubbles:true,cancelable:true})));
    expect(fetcher).not.toHaveBeenCalled();
    expect(el.querySelector('[role="status"]')?.textContent).toContain(language==='es'?'cinco dígitos':'five-digit');
  }finally{await act(async()=>root.unmount());el.remove();}
});
it('opens a demo field and gives the assistant its real location',async()=>{
  window.location.hash='#/explore?lat=42.0563&lon=-93.495&label=Story';
  vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({fields:[]})}));
  const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
  try{
    await act(async()=>root.render(createElement(LanguageProvider,null,createElement(ExplorePage))));
    await act(async()=>{await new Promise(r=>setTimeout(r,20));});
    expect(el.querySelector('.explore-location-chip')?.textContent).toContain('Story');
    expect(el.querySelector('[data-testid="assistant"]')?.textContent).toBe('Story');
  }finally{await act(async()=>root.unmount());el.remove();}
});
