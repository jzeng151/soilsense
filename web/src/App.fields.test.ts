// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FieldBoundary } from '../../src/shared/fields';
import type { FieldResponse, PlanResponse } from '../../src/shared/types';
import { App } from './App';
import { LanguageProvider } from './i18n';
import { fetchField, fetchPlan } from './api';
vi.mock('./components/MapPicker',()=>({MapPicker:()=>null,DEMO_FARMS:[{name:'Finney County, Kansas',lat:38.1095,lon:-100.706,irrigated:true}]}));
vi.mock('./components/FieldWatchCard',()=>({FieldWatchCard:()=>null}));
vi.mock('./api',()=>({fetchField:vi.fn(),fetchPlan:vi.fn(),askQuestion:vi.fn(),subscribeLastPlan:()=>()=>{},getLastPlan:()=>null}));
const fields:FieldBoundary[]=[{id:'csb:a',source:'usda-csb',polygon:[],areaAcres:9.1,centroid:{lat:38.1095678,lon:-100.7061234},cropSequence:[{year:2025,cdlCode:4,crop:'Sorghum'},{year:2023,cdlCode:1,crop:'Corn'},{year:2024,cdlCode:24,crop:'Winter Wheat'}],provenance:{product:'CSB',version:'2018–2025',url:'https://www.nass.usda.gov',retrieved:'2026-11-15'}}, {id:'csb:b',source:'usda-csb',polygon:[],areaAcres:12,centroid:{lat:38.10,lon:-100.7},cropSequence:[{year:2025,cdlCode:5,crop:'Soybeans'}],provenance:{product:'CSB',version:'2018–2025',url:'https://www.nass.usda.gov',retrieved:'2026-11-15'}}];
let el:HTMLDivElement,root:ReturnType<typeof createRoot>;
let enabled=true;
async function click(text:string){const button=[...el.querySelectorAll('button')].find(b=>b.textContent?.trim()===text);if(!button)throw Error(text);await act(async()=>button.click());}
async function select(index:number){await act(async()=>el.querySelectorAll<HTMLInputElement>('input[type=checkbox]')[index]!.click());}
async function mount(){await act(async()=>root.render(createElement(LanguageProvider,null,createElement(App))));}
beforeEach(async()=>{
  vi.clearAllMocks();enabled=true;localStorage.clear();
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});HTMLElement.prototype.scrollIntoView=vi.fn();
  vi.stubGlobal('fetch',vi.fn(async(url:string)=>new Response(JSON.stringify(url.includes('/status')?(enabled?{enabled:true,areas:[{id:'finney',name:'Finney',bbox:[-101,38,-100,39]}]}:{error:'fields disabled'}):{fields}),{status:enabled?200:404})));
  vi.mocked(fetchField).mockResolvedValue({soil:{available:false},cropHistory:{years:[{year:2025,crop:'corn',cdlCode:1,cdlName:'Corn'}]}} as FieldResponse);
  vi.mocked(fetchPlan).mockImplementation(async request=>({request,plans:[],climate:{indicators:[]}} as unknown as PlanResponse));
  el=document.createElement('div');document.body.append(el);root=createRoot(el);await mount();
});
afterEach(async()=>{await act(async()=>root.unmount());el.remove();vi.unstubAllGlobals();});
it('defaults one selection to its exact centroid and chronological CSB history',async()=>{
  await select(0);await click('Yes, this is my field →');
  expect(el.textContent).toContain('Planning for: Field 1 (9.1 ac)');
  await click('Show my plan →');
  expect(fetchPlan).toHaveBeenLastCalledWith(expect.objectContaining({...fields[0]!.centroid,recentCrops:['corn','winter_wheat','sorghum']}),expect.any(AbortSignal));
  expect(el.querySelector('[data-history-used]')?.textContent).toBe('2023: Corn → 2024: Winter wheat → 2025: Grain sorghum');
  expect(el.textContent).toContain('satellite-derived, not farmer-reported');
});
it('plans multiple selected fields individually and permits history corrections',async()=>{
  await select(0);await select(1);
  await act(async()=>[...el.querySelectorAll('button')].filter(b=>b.textContent==='Plan this field')[1]!.click());
  expect(el.textContent).toContain('Planning for: Field 2 (12.0 ac)');
  const history=el.querySelector<HTMLSelectElement>('[data-field-plan] select')!;
  await act(async()=>{history.value='oats';history.dispatchEvent(new Event('change',{bubbles:true}));});
  await click('Show my plan →');
  expect(fetchPlan).toHaveBeenLastCalledWith(expect.objectContaining({...fields[1]!.centroid,recentCrops:['oats']}),expect.any(AbortSignal));
  expect(el.textContent).toContain('History corrected in this browser.');
});
it('persists renamed fields by CSB id and restores the friendly label on reload',async()=>{
  await select(0);
  const input=el.querySelector<HTMLInputElement>('input[maxlength="60"]')!;
  await act(async()=>{Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value')!.set!.call(input,'North pivot');input.dispatchEvent(new Event('input',{bubbles:true}));});
  await click('Save field name');
  expect(localStorage.getItem('soilsense:field-name:v1:csb:a')).toBe('North pivot');
  await act(async()=>root.unmount());root=createRoot(el);await mount();
  expect(el.textContent).toContain('North pivot · 9.1 ac');expect(el.textContent).toContain('csb:a');
});
it('requires a correction instead of silently falling back when every recent crop is unknown',async()=>{
  await act(async()=>root.unmount());root=createRoot(el);
  const original=fields[0]!.cropSequence;
  fields[0]!.cropSequence=[{year:2025,cdlCode:225,crop:'Double crop winter wheat/corn'}];
  try {
    await mount();await select(0);await click('Plan this field');
    expect(el.textContent).toContain('Unknown or unmodeled crops omitted: 2025: Double crop winter wheat/corn (CDL 225)');
    const generate=[...el.querySelectorAll('button')].find(b=>b.textContent==='Show my plan →')!;
    expect(generate.disabled).toBe(true);expect(fetchPlan).not.toHaveBeenCalled();
    const history=el.querySelector<HTMLSelectElement>('[data-field-plan] select')!;
    await act(async()=>{history.value='sorghum';history.dispatchEvent(new Event('change',{bubbles:true}));});
    await click('Show my plan →');
    expect(fetchPlan).toHaveBeenLastCalledWith(expect.objectContaining({recentCrops:['sorghum']}),expect.any(AbortSignal));
  } finally { fields[0]!.cropSequence=original; }
});
it('flag off ignores stored labels and preserves the original point-based request',async()=>{
  await act(async()=>root.unmount());root=createRoot(el);enabled=false;
  localStorage.setItem('soilsense:field-name:v1:csb:a','Stored field');await mount();
  expect(el.textContent).not.toContain('Choose public field outlines');
  expect(el.textContent).not.toContain('Stored field');
  await click('Kansas');await click('Yes, this is my field →');await click('Corn');await click('Show my plan →');
  expect(fetchPlan).toHaveBeenLastCalledWith({lat:38.1095,lon:-100.706,irrigated:true,water:'full',priority:'balanced',goals:[],recentCrops:['corn','corn'],language:'en'},expect.any(AbortSignal));
});
