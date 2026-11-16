// @vitest-environment happy-dom
import { act, createElement as h, useState } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY } from "../i18n";
import { PricePanel, type PriceDraft } from "./PricePanel";
import { PriceRobustnessCard } from "./PriceRobustnessCard";
import { TopPlan, PlanRow } from "./PlanCard";
import defaults from "../../../test/fixtures/plan-prices-defaults.json";
import examples from "../../../test/fixtures/price-finney-examples.json";
import type { PlanResponse } from "../../../src/shared/types";
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(()=>{
 Object.assign(globalThis,{IS_REACT_ACT_ENVIRONMENT:true});
 container=document.createElement("div");document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();localStorage.clear();});
function Harness(){const [draft,setDraft]=useState<PriceDraft>({values:{},prices:{},valid:true});return h(PricePanel,{value:draft,onChange:setDraft});}
async function input(selector:string,value:string){await act(async()=>{const el=container.querySelector(selector) as HTMLInputElement;Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,"value")!.set!.call(el,value);el.dispatchEvent(new Event("input",{bubbles:true}));});}
describe("farmer price and yearly economics UI",()=>{
 it("keeps drafts controlled, reports invalid values, accepts zero, and resets to blank defaults",async()=>{
   await act(async()=>root.render(h(LanguageProvider,{children:h(Harness)})));
   await input('input[id$="-corn"]',"-2");
   expect(container.querySelector('[role="alert"]')!.textContent).toContain("Enter prices");
   await input('input[id$="-corn"]',"0");
   expect(container.querySelector('[role="alert"]')).toBeNull();
   expect((container.querySelector('input[id$="-corn"]') as HTMLInputElement).value).toBe("0");
   await act(async()=>{(container.querySelector('button') as HTMLButtonElement).click();});
   expect((container.querySelector('input[id$="-corn"]') as HTMLInputElement).value).toBe("");
 });
 it.each(["en","es"])("renders every year's yield and net and reproducible sensitivity in %s",async language=>{
   localStorage.setItem(LANGUAGE_STORAGE_KEY,language);
   const plan={...defaults[4],priceSensitivity:examples.default.sensitivity} as PlanResponse;
   await act(async()=>root.render(h(LanguageProvider,{children:h("div",null,h(TopPlan,{plan:plan.plans[0]!,compareTo:plan.currentPractice}),h("ul",null,h(PlanRow,{plan:plan.plans[1]!,title:"Option"})),h(PriceRobustnessCard,{plan}))})));
   expect(container.querySelectorAll(".year-economics")).toHaveLength(6);
   expect(container.querySelectorAll(".year-economics dd")).toHaveLength(12);
   expect(container.querySelectorAll(".price-robustness li")).toHaveLength(4);
   expect(container.textContent).toContain(language==="es" ? "Rendimiento esperado" : "Expected yield");
   expect(container.textContent).toContain(language==="es" ? "no es un pronóstico" : "not a forecast");
   expect(container.textContent).toContain(language==="es" ? "Mejor margen en 4 de 10 escenarios" : "Best net in 4 of 10 scenarios");
 });
});
