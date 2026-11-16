// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { expect,it } from 'vitest';
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from '../i18n';
import { DemoFarmsPage } from './DemoFarmsPage';
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
it.each(['en','es'] as const)('lists all four original farms with valid Explore links in %s',async language=>{
 localStorage.setItem(LANGUAGE_STORAGE_KEY,language);
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 try{
  await act(async()=>root.render(createElement(LanguageProvider,null,createElement(DemoFarmsPage))));
  expect(el.querySelectorAll('.demo-card')).toHaveLength(4);
  expect(el.textContent).toContain('Story County, Iowa');
  for(const card of el.querySelectorAll<HTMLAnchorElement>('.demo-card')){
   expect(card.hash).toMatch(/^#\/explore\?lat=/);
   const params=new URLSearchParams(card.hash.split('?')[1]);expect(Number.isFinite(Number(params.get('lat')))).toBe(true);
  }
  expect(el.textContent).toContain(language==='es'?'secano':'rain-fed');
 }finally{await act(async()=>root.unmount());el.remove();localStorage.clear();}
});
