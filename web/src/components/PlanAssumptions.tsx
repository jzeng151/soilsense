import type { RotationPlan, WaterLevel } from "../../../src/shared/types";
import { planAdvice } from "../../../src/engine/pestNotes";
import "./mvp-evidence.css";

export function PlanAssumptions({ plan, water }: { plan: RotationPlan; water: WaterLevel }) {
  const advice = planAdvice(plan, water);
  return <details className="plan-assumptions">
    <summary>Pest notes and agronomist checks — {plan.label}</summary>
    <p>Includes a non-corn year: <strong>{advice.includes_non_corn_year ? "Yes" : "No"}</strong>. Qualitative notes do not change scores, yields or rankings.</p>
    {advice.undocumentedBenefit && <p>{advice.undocumentedBenefit}</p>}
    {advice.pestNotes.map((note) => <section key={note.pest}>
      <h3>Corn rootworm — potential benefit, not a guarantee</h3>
      <p>{note.sequence}.</p>
      <blockquote>{note.potentialEffect}</blockquote>
      <ul>{note.conditions.map((condition) => <li key={condition}>{condition}</li>)}</ul>
      <a href={note.sourceUrl} target="_blank" rel="noreferrer">K-State Corn Rootworms ({note.sourceIds.join(", ")})</a>
    </section>)}
    <h3>Ask your agronomist about…</h3>
    <ul>{advice.checks.map((check) => <li key={check}>{check}</li>)}</ul>
    <small>Checklist version: {advice.version}</small>
  </details>;
}
