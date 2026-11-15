import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalPicker, GoalScore } from "./GoalPicker";
import type { RotationPlan } from "../../../src/shared/types";

const count = (text: string, pattern: RegExp) => [...text.matchAll(pattern)].length;

describe("GoalPicker", () => {
  it("renders five native labeled checkboxes with an optional fieldset and limit instructions", () => {
    const html = renderToStaticMarkup(createElement(GoalPicker, { value: [], onChange: () => {}, water: "full" }));
    expect(count(html, /type="checkbox"/g)).toBe(5);
    expect(count(html, /<label/g)).toBe(5);
    expect(count(html, /disabled=""/g)).toBe(0);
    expect(html).toContain("<legend>Any other goals?");
    expect(html).toContain("Choose up to two");
    expect(html).toContain("aria-describedby=");
    expect(html).toContain("0 of 2 selected");
  });

  it("disables only the three unselected choices when two are selected", () => {
    const html = renderToStaticMarkup(createElement(GoalPicker, { value: ["water_conservation", "nitrogen_fixation"], onChange: () => {}, water: "rain" }));
    expect(count(html, /checked=""/g)).toBe(2);
    expect(count(html, /disabled=""/g)).toBe(3);
    expect(html).toContain("Uncheck a goal to choose another");
    expect(html).toContain('role="status"');
    expect(html).toContain("there is no pumping to save");
  });

  it("does not add score UI to no-goal plans", () => {
    expect(renderToStaticMarkup(createElement(GoalScore, { plan: { scores: { total: 0.7 } } as RotationPlan }))).toBe("");
  });

  it("shows the separate bonus/subtotal and the exact engine reason", () => {
    const html = renderToStaticMarkup(createElement(GoalScore, { plan: {
      scores: { total: 0.75, priorityTotal: 0.7, goalsBonus: 0.05, goals: [{ goal: "water_conservation", normalized: 0.5, bonus: 0.05, metrics: [], reason: "Model pumps 6.0 in/yr." }] },
    } as unknown as RotationPlan }));
    expect(html).toContain("Priority subtotal 0.700");
    expect(html).toContain("Goal bonus +0.0500");
    expect(html).toContain("total score 0.750");
    expect(html).toContain("Model pumps 6.0 in/yr.");
  });
});
