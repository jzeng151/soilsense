// Optional farmer preferences. Never change the four base priority weightings.
import { GOALS, type Goal, type GoalScore, type RotationPlan, type WaterLevel } from "../shared/types";
import { clamp, round } from "../shared/units";
import { COVERS, CROPS } from "./crops";

export const MAX_GOALS_BONUS = 0.1;

function rotationMetrics(plan: RotationPlan) {
  const grown = plan.years.filter((y) => y.crop !== "fallow");
  return {
    covers: plan.years.filter((y) => y.cover !== "none").length,
    perennial: grown.filter((y) => CROPS[y.crop].perennial).length,
    smallGrain: grown.filter((y) => y.crop === "winter_wheat" || y.crop === "oats").length,
    diversity: new Set(grown.map((y) => y.crop)).size,
    fallow: plan.years.length - grown.length,
    hay: grown.filter((y) => y.crop === "alfalfa").length,
  };
}

// Transparent proxies using the same cover/perennial/diversity/fallow components as soilHealthScore.
// Not predicted tons of erosion prevented or a forecast of soil carbon/organic-matter gain.
const erosionProxy = (p: RotationPlan) => {
  const m = rotationMetrics(p);
  return 0.08 * m.covers + 0.1 * m.smallGrain + 0.15 * m.perennial - 0.12 * m.fallow;
};
const organicProxy = (p: RotationPlan) => {
  const m = rotationMetrics(p);
  return 0.15 * m.perennial + 0.08 * m.covers + 0.08 * Math.max(0, m.diversity - 1) - 0.12 * m.fallow;
};
export const GOAL_LABELS: Record<Goal, string> = {
  water_conservation: "Water conservation",
  nitrogen_fixation: "Nitrogen fixation",
  erosion_control: "Erosion control",
  organic_matter: "Organic matter",
  forage_market: "Forage/hay market",
};

/** Defend direct engine callers too; the HTTP boundary rejects invalid/duplicate/over-limit input. */
export function selectedGoals(goals: readonly Goal[] = []): Goal[] {
  return [...new Set(goals.filter((g) => GOALS.includes(g)))].slice(0, 2);
}

/**
 * Normalize each goal's metric over ALL feasible candidates (before cover selection and top-N).
 * Each selected goal receives 0.1 / goal count of bonus budget, never more than +0.1 total.
 * Equal metrics earn zero. The original total is left untouched when goals are absent/empty.
 * Dependability and feasibility gates remain outside this scorer and still take precedence.
 */
export function createGoalScorer(candidates: RotationPlan[], goals: readonly Goal[] = [], water: WaterLevel) {
  const selected = selectedGoals(goals);
  if (!selected.length) return (plan: RotationPlan): RotationPlan => plan;
  const norm = (metric: (p: RotationPlan) => number | undefined, lower = false) => {
    let lo = Infinity;
    let hi = -Infinity;
    for (const p of candidates) {
      const v = metric(p);
      if (v === undefined || !Number.isFinite(v)) continue;
      lo = Math.min(lo, v);
      hi = Math.max(hi, v);
    }
    return (p: RotationPlan) => {
      const v = metric(p);
      return v !== undefined && Number.isFinite(v) && hi > lo ? clamp((lower ? hi - v : v - lo) / (hi - lo)) : 0;
    };
  };
  const pumping = norm((p) => p.waterPumpedIn, true);
  const waterUse = norm((p) => p.waterUseIn, true);
  const nitrogen = norm((p) => p.totalNitrogenLbPerAcre, true);
  const legumeCount = (p: RotationPlan) => p.years.reduce((n, y) => n + Number(CROPS[y.crop].legume) + Number(COVERS[y.cover].legume), 0);
  const legumes = norm(legumeCount);
  const erosion = norm(erosionProxy);
  const organic = norm(organicProxy);
  const forage = norm((p) => rotationMetrics(p).hay);
  return (plan: RotationPlan): RotationPlan => {
    const details: GoalScore[] = selected.map((goal) => {
      if (goal === "nitrogen_fixation") {
        const normalized = 0.7 * nitrogen(plan) + 0.3 * legumes(plan);
        return {
          goal, normalized: round(normalized, 4), bonus: round(MAX_GOALS_BONUS / selected.length * normalized, 4),
          metrics: [
            { label: "Modeled fertilizer N, after rotation/cover credits", value: plan.totalNitrogenLbPerAcre, unit: "lb N/acre over plan" },
            { label: "Legume crop/cover seasons", value: legumeCount(plan), unit: "seasons" },
          ],
          reason: `Nitrogen fixation: ${legumeCount(plan)} legume crop/cover seasons; modeled fertilizer ${plan.totalNitrogenLbPerAcre} lb N/acre over the plan, after rotation/cover credits. Lower fertilizer N (70%) and legumes (30%) are proxies, not measured N fixation.`,
        };
      }
      if (goal === "erosion_control" || goal === "organic_matter") {
        const m = rotationMetrics(plan);
        const isErosion = goal === "erosion_control";
        const normalized = isErosion ? erosion(plan) : organic(plan);
        const proxy = isErosion ? erosionProxy(plan) : organicProxy(plan);
        return {
          goal, normalized: round(normalized, 4), bonus: round(MAX_GOALS_BONUS / selected.length * normalized, 4),
          metrics: [
            { label: "Cover seasons", value: m.covers, unit: "seasons" },
            { label: "Perennial seasons", value: m.perennial, unit: "seasons" },
            { label: "Small-grain seasons", value: m.smallGrain, unit: "seasons" },
            { label: "Crop diversity (excluding fallow)", value: m.diversity, unit: "crops" },
            { label: "Fallow seasons", value: m.fallow, unit: "seasons" },
            { label: `${GOAL_LABELS[goal]} proxy`, value: round(proxy, 3), unit: "proxy points" },
          ],
          reason: `${GOAL_LABELS[goal]}: ${m.covers} cover seasons, ${m.perennial} perennial seasons, ${m.smallGrain} small-grain seasons, ${m.diversity} distinct crops and ${m.fallow} fallow seasons; ${isErosion ? "residue/cover" : "organic-matter-building"} proxy ${proxy.toFixed(2)}. This is a rotation proxy, not measured ${isErosion ? "erosion reduction" : "organic-matter gain"}.`,
        };
      }
      if (goal === "forage_market") {
        const normalized = forage(plan);
        const hay = rotationMetrics(plan).hay;
        return {
          goal, normalized: round(normalized, 4), bonus: round(MAX_GOALS_BONUS / selected.length * normalized, 4),
          metrics: [{ label: "Alfalfa/hay seasons", value: hay, unit: "seasons" }],
          reason: `Forage/hay market: ${hay} alfalfa/hay seasons fit the market you selected. Hay prices, yields and costs are unchanged; confirm a buyer and equipment before planting.`,
        };
      }
      // On rain-only fields, crop water use is a demand/use proxy, NOT a pumping saving.
      const use = plan.waterUseIn;
      if (water === "rain" && (use === undefined || !Number.isFinite(use))) {
        return { goal, normalized: 0, bonus: 0, metrics: [], reason: "Water conservation: simulated crop water use is unavailable, so no bonus is assigned. Rain only: no pumping savings." };
      }
      const normalized = water === "rain" ? waterUse(plan) : pumping(plan);
      const useMetrics = use !== undefined && Number.isFinite(use)
        ? [{ label: "Modeled main-crop water use", value: use, unit: "in/yr" }]
        : [];
      const metrics = water === "rain" ? useMetrics : [{ label: "Modeled pumping", value: plan.waterPumpedIn, unit: "in/yr" }, ...useMetrics];
      const reason = water === "rain"
        ? `Water conservation: modeled main-crop water use ${use!.toFixed(1)} in/yr. Rain only: no pumping savings; lower use may also reflect water stress or fallow. This goal is most useful with irrigation.`
        : `Water conservation: model pumps ${plan.waterPumpedIn.toFixed(1)} in/yr${useMetrics.length ? `; modeled main-crop water use ${use!.toFixed(1)} in/yr` : ""}.`;
      return { goal, normalized: round(normalized, 4), bonus: round(MAX_GOALS_BONUS / selected.length * normalized, 4), metrics, reason };
    });
    const bonus = round(details.reduce((sum, g) => sum + g.bonus, 0), 4);
    return {
      ...plan,
      scores: { ...plan.scores, priorityTotal: plan.scores.total, total: round(plan.scores.total + bonus, 3), goalsBonus: bonus, goals: details },
      notes: [...plan.notes, ...details.map((g) => `${g.reason} Goal bonus +${g.bonus.toFixed(4)}.`)],
    };
  };
}
