import { useId, useState } from "react";
import type { PlanResponse } from "../../../src/shared/types";
import { assumptionAudit, referenceMargin, REFERENCE } from "../../../src/engine/economics";

const money = (v: number | null) => v === null ? "unknown" : `$${v.toFixed(2)}`;
export function EconomicsCard({ plan }: { plan: PlanResponse }) {
  const id = useId();
  const [price, setPrice] = useState(100), [cost, setCost] = useState(100), [yieldPct, setYield] = useState(100);
  const audit = assumptionAudit(plan.location.county?.stateCode);
  const scenario = referenceMargin(["corn", "soybean"], { priceFactor: price / 100, costFactor: cost / 100, yieldFactor: yieldPct / 100 });
  return <section className="jr-card" style={{ minWidth: 0, overflowWrap: "anywhere" }} aria-label="Economic assumptions and sourced reference budget">
    <h2 className="jr-h2">What the margin numbers assume</h2>
    <p>Ranked-plan margins still use approximate model costs and yield assumptions, with NASS overrides only when reported in the plan. They are margin scenarios, not forecasts, complete profit or planting recommendations.</p>
    <details><summary>Audit the engine's fallback values</summary>
      <p>{audit.regionNote}. {audit.note}</p>
      <p>{audit.adjustments}</p>
      {audit.crops.map(c => <details key={c.crop}><summary>{c.name} · approximate default</summary>
        <ul>{([ ["Price", c.price], ["Base direct cost", c.cost], ["Crop base yield", c.baseYield], ["Regional potential", c.potential] ] as const).map(([label, v]) => <li key={label}>{label}: {v.value} {v.units}; {v.region}; {v.treatment}. Year unknown; source not documented.</li>)}</ul>
      </details>)}
    </details>
    <details><summary>Sourced reference: K-State 2025 dryland corn–soybean</summary>
      <p><strong>Separate reference, not used to rank this field.</strong> {REFERENCE.geography}. {REFERENCE.resolution}.</p>
      <p>{REFERENCE.limits}</p><p>{REFERENCE.costs}</p>
      {([ ["Price", price, setPrice], ["Direct costs", cost, setCost], ["Yield", yieldPct, setYield] ] as const).map(([label, value, setter], i) => <p key={label}>
        <label htmlFor={`${id}-${i}`}>{label} sensitivity: {value}% of source assumptions (demonstration scenario)</label><br />
        <input id={`${id}-${i}`} aria-label={`${label} percent of source budget`} type="range" min="90" max="110" step="1" value={value} onChange={e => setter(Number(e.target.value))} style={{ maxWidth: "100%", minHeight: 44 }} />
      </p>)}
      <ul>{scenario.phases.map(p => <li key={p.crop}>{p.crop}: revenue {money(p.revenue)}, direct expenses {money(p.directCost)}, margin {money(p.margin)} /acre for that phase.</li>)}</ul>
      <p aria-live="polite"><strong>Two-phase mean: {money(scenario.mean)} /acre/year</strong> (all phases included, no weather adjustment).</p>
      {Object.entries(REFERENCE.budgets).map(([crop, b]) => <div key={crop}>
        <p><a href={b.yield.sourceUrl!}>{crop} source PDF</a>: {b.yield.value} {b.yield.units}, {b.price.value} {b.price.units}, {b.directCost.value} {b.directCost.units} total direct expenses. {b.yield.treatment}. {b.yield.locator}. Planning year {b.yield.year}, published {b.yield.published}, retrieved {b.yield.retrievedAt}. {b.yield.attribution}.</p>
      </div>)}
      <p>No AMS price feed is implemented here. This fixed budget does not silently mix NASS market prices or field-model yields into its source treatment.</p>
    </details>
  </section>;
}
