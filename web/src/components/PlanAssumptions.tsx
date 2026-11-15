import { rotationText, useI18n } from "../i18n";
import type { RotationPlan, WaterLevel } from "../../../src/shared/types";
import { planAdvice } from "../../../src/engine/pestNotes";
import "./mvp-evidence.css";

export function PlanAssumptions({ plan, water }: { plan: RotationPlan; water: WaterLevel }) {
  const { t: tx, text: localize, language } = useI18n();
  const advice = planAdvice(plan, water);
  return <details className="plan-assumptions">
    <summary>{tx("Pest notes and agronomist checks —")}{" "}{rotationText(plan.label, language)}</summary>
    <p>{tx("Includes a non-corn year:")}{" "}<strong>{advice.includes_non_corn_year ? tx("Yes") : tx("No")}</strong>{tx(". Qualitative notes do not change scores, yields or rankings.")}</p>
    {advice.undocumentedBenefit && <p>{localize(advice.undocumentedBenefit)}</p>}
    {advice.pestNotes.map((note) => <section key={note.pest}>
      <h3>{tx("Corn rootworm — potential benefit, not a guarantee")}</h3>
      <p>{localize(note.sequence)}.</p>
      <blockquote>{note.potentialEffect}</blockquote>
      <ul>{note.conditions.map((condition) => <li key={condition}>{localize(condition)}</li>)}</ul>
      <a href={note.sourceUrl} target="_blank" rel="noreferrer">K-State Corn Rootworms ({note.sourceIds.join(", ")})</a>
    </section>)}
    <h3>{tx("Ask your agronomist about…")}</h3>
    <ul>{advice.checks.map((check) => <li key={check}>{localize(check)}</li>)}</ul>
    <small>{tx("Checklist version:")}{" "}{advice.version}</small>
  </details>;
}
