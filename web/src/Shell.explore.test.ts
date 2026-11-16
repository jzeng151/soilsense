// @vitest-environment happy-dom
import { act, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';
import { Shell } from './Shell';
vi.mock('./auth',()=>({getMe:async()=>null,SIGNED_OUT_EVENT:'signed-out',signOut:async()=>{}}));
vi.mock('./pages/FieldWatchPage',()=>({FieldWatchPage:()=>createElement('div',{'data-testid':'existing-planner'},'Field Watch monitoring')}));
vi.mock('./pages/ExplorePage',()=>({ExplorePage:()=>createElement('div',{'data-testid':'explore'},'Explore')}));
Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
afterEach(()=>{vi.unstubAllGlobals();localStorage.clear();window.location.hash='';});
it.each([{flag:false,hash:'#/',planner:true},{flag:true,hash:'#/',planner:false},{flag:true,hash:'#/planner',planner:true}])('gates the real Shell root for $flag at $hash',async({flag,hash,planner})=>{
 window.location.hash=hash;
 vi.stubGlobal('fetch',vi.fn().mockResolvedValue({ok:true,json:async()=>({exploreLanding:flag})}));
 const el=document.createElement('div');document.body.append(el);const root=createRoot(el);
 try{
  await act(async()=>{root.render(createElement(Shell));await new Promise(r=>setTimeout(r,10));});
  await act(async()=>{window.dispatchEvent(new Event('hashchange'));await new Promise(r=>setTimeout(r,10));});
  expect(el.querySelector('[data-testid="existing-planner"]')!==null).toBe(planner);
  expect(el.querySelector('[data-testid="explore"]')!==null).toBe(!planner);
  expect(window.location.hash).toBe(flag&&hash==='#/'?'#/explore':hash);
 }finally{await act(async()=>root.unmount());el.remove();}
});
