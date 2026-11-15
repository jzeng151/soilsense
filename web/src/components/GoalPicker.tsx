import { useI18n } from "../i18n";
import type { TranslationKey } from "../i18n";
import { useId } from "react";
import type { Goal, RotationPlan, WaterLevel } from "../../../src/shared/types";
import "./goals.css";

const OPTIONS: { id: Goal; label: TranslationKey; hint: TranslationKey }[] = [
  { id: "water_conservation", label: "Water conservation", hint: "Prefer lower modeled pumping; most useful with irrigation" },
  { id: "nitrogen_fixation", label: "Nitrogen fixation", hint: "Prefer legumes and less fertilizer after nitrogen credits" },
  { id: "erosion_control", label: "Erosion control", hint: "Prefer cover, small grains and perennials; avoid bare fallow" },
  { id: "organic_matter", label: "Organic matter", hint: "Prefer perennials, cover crops and crop diversity" },
  { id: "forage_market", label: "I have a forage/hay market", hint: "Favor alfalfa/hay when you have a buyer and equipment" },
];

export function GoalPicker({ value, onChange, water }: { value: Goal[]; onChange: (value: Goal[]) => void; water: WaterLevel }) {
  const { t: tx } = useI18n();
  const id = useId();
  const full = value.length >= 2;
  return (
    <fieldset className="jr-q farmer-goals" aria-describedby={`${id}-hint ${id}-count`}>
      <legend>{tx("Any other goals?")}{" "}<small>{tx("(optional)")}</small></legend>
      <p className="jr-note" id={`${id}-hint`}>{tx("Choose up to two. These add a small bonus (up to +0.1 total) without replacing your main priority.")}</p>
      <div className="goal-options">
        {OPTIONS.map((option) => {
          const checked = value.includes(option.id);
          return (
            <label key={option.id} className={`goal-option${checked ? " on" : ""}`}>
              <input type="checkbox" checked={checked} disabled={full && !checked} onChange={() => {
                if (checked) onChange(value.filter((g) => g !== option.id));
                else if (value.length < 2) onChange([...value, option.id]);
              }} />
              <span><b>{tx(option.label)}</b><small>{tx(option.hint)}</small></span>
            </label>
          );
        })}
      </div>
      <p className="jr-note" id={`${id}-count`} role="status">{value.length}{" "}{tx("of 2 selected.")}{full ? tx(" Uncheck a goal to choose another.") : ""}</p>
      {water === "rain" && value.includes("water_conservation") && <p className="jr-note">{tx("Rain only: there is no pumping to save. We compare modeled crop water use instead; lower use can also reflect water stress or fallow, not just conservation.")}</p>}
    </fieldset>
  );
}

/** Show the goal adjustment separately from the base priority score, with engine-grounded reasons. */
export function GoalScore({ plan }: { plan: RotationPlan }) {
  const { t: tx } = useI18n();
  const goals = plan.scores.goals;
  if (!goals?.length) return null;
  const bonus = plan.scores.goalsBonus ?? 0;
  return (
    <details className="goal-score">
      <summary>{tx("Goal bonus +")}{bonus.toFixed(4)}{" "}{tx("· total score")}{" "}{plan.scores.total.toFixed(3)}</summary>
      <p>{tx("Priority subtotal")}{" "}{plan.scores.priorityTotal?.toFixed(3)}{" "}{tx("+ goal bonus")}{" "}{bonus.toFixed(4)}{" "}{tx("= total")}{" "}{plan.scores.total.toFixed(3)}{" "}{tx("(rounded).")}</p>
      <p>{tx("The four priority weights are unchanged. Each chosen goal shares the +0.1 bonus budget; equal candidate metrics earn no bonus. Reliability and feasibility still come first.")}</p>
      <ul>{goals.map((g) => <li key={g.goal}>{g.reason} <b>+{g.bonus.toFixed(4)}</b> ({(g.normalized * 100).toFixed(0)}{tx("% of this goal’s bonus budget).")}</li>)}</ul>
    </details>
  );
}
