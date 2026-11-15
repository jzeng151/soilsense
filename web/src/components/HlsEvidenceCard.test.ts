// @vitest-environment happy-dom
import { act, createElement as h } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LanguageProvider, LANGUAGE_STORAGE_KEY, messages } from '../i18n';
import { hlsMessages } from '../i18n-hls';
import { HlsEvidenceCard } from './HlsEvidenceCard';
import artifact from '../../public/data/hls-demo.json';
import { getHlsEvidence } from '../../../src/worker/data/hls';
let container:HTMLDivElement, root:ReturnType<typeof createRoot>;
beforeEach(()=>{
  Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
  localStorage.setItem(LANGUAGE_STORAGE_KEY,'es');
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();localStorage.clear();vi.unstubAllGlobals();});
async function render(lat=artifact.fields[0]!.lat,lon=artifact.fields[0]!.lon){await act(async()=>root.render(h(LanguageProvider,{children:h(HlsEvidenceCard,{lat,lon})})));}
async function load(){await act(async()=>container.querySelector('button')!.click());}
it('renders real source-derived pixels in Spanish and clears them when field changes',async()=>{
  const data=await getHlsEvidence(artifact.fields[2]!.lat,artifact.fields[2]!.lon,async()=>Response.json(artifact));
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(data)));
  await render(artifact.fields[2]!.lat,artifact.fields[2]!.lon);await load();
  expect(container.textContent).toContain('NDVI medio');
  expect(container.textContent).toContain('adyacencia de nubes o sombras');
  expect(container.textContent).not.toContain('adjacent_cloud_shadow');
  expect(container.querySelectorAll('tbody tr')).toHaveLength(20);
  expect(container.querySelector('[role=status]')!.textContent).toBe('Muestra HLS cargada.');
  await render(0,0);expect(container.querySelectorAll('table')).toHaveLength(0);
});
it('announces actual request failure without inferring vegetation',async()=>{
  vi.stubGlobal('fetch',vi.fn(async()=>{throw new Error('offline');}));await render();await load();
  expect(container.querySelector('[role=status]')!.textContent).toContain('no se infiere vegetación');
  expect(container.querySelectorAll('table')).toHaveLength(0);
});
it('translates non-demo unavailability and never borrows sample rows',async()=>{
  const data=await getHlsEvidence(0,0,async()=>Response.json(artifact));
  vi.stubGlobal('fetch',vi.fn(async()=>Response.json(data)));await render(0,0);await load();
  expect(container.textContent).toContain('cuatro puntos exactos');expect(container.querySelectorAll('table')).toHaveLength(0);
});
it('ignores a delayed response from a previous field',async()=>{
  const data=await getHlsEvidence(artifact.fields[0]!.lat,artifact.fields[0]!.lon,async()=>Response.json(artifact));
  let finish!:(r:Response)=>void;
  vi.stubGlobal('fetch',vi.fn(()=>new Promise<Response>(resolve=>{finish=resolve;})));
  await render();await load();await render(0,0);
  await act(async()=>finish(Response.json(data)));
  expect(container.querySelectorAll('table')).toHaveLength(0);
  expect(container.querySelector('button')!.disabled).toBe(false);
});
it('registers every HLS Spanish string and every recorded QA reason',()=>{
  for(const [key,value] of Object.entries(hlsMessages)){expect(value.trim()).not.toBe('');expect(messages[key as keyof typeof messages]).toBe(value);}
  for(const field of artifact.fields)for(const scene of field.observations){expect(hlsMessages).toHaveProperty(scene.status);for(const pixel of scene.pixels)for(const reason of pixel.excluded)expect(hlsMessages).toHaveProperty(reason);}
});
