// @vitest-environment happy-dom
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect,it } from "vitest";
import type { RotationPlan } from "../../../src/shared/types";
import examples from "../../../test/fixtures/extra-crops-examples.json";
import { TopPlan } from "./PlanCard";
import { cropName } from "../i18n";
it("renders short tons and pounds from actual constrained Finney engine captures",()=>{
 for(const [name,unit] of [["forage-required-full","US short tons/acre"],["cotton-required-full","lb/acre"]]) {
  const plan=examples.cases.find(c=>c.name===name)!.plans[0]! as RotationPlan;
  const html=renderToStaticMarkup(createElement(TopPlan,{plan,compareTo:null}));
  expect(html).toContain(unit);
 }
 expect(cropName("cotton","es")).toBe("Algodón americano");
 expect(cropName("corn_silage","es")).toBe("Maíz para ensilaje");
});
