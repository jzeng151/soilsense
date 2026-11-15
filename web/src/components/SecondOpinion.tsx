// "Second opinion" (Kansas only): K-State's recommended rain-fed rotations for the county, ranked by our team's
// separate Kansas model (kansas-crop-rotation/, weather only, published weekly to Cloudflare R2).
// Rules: say clearly it's a separate model; show the "agree" badge only when the two really match; note when the
// field is irrigated (their list is dryland); never call anything "most profitable"; hide the whole card on failure.

import { useEffect, useState } from "react";
import type { CropHistory, CropId, KStateRotation, RotationPlan, SecondOpinion as Opinion } from "../../../src/shared/types";
import { matchRank, partialOverlap, sameCrops } from "../../../src/shared/secondOpinion";
import { fetchSecondOpinion } from "../api";
import { CROP_COLORS } from "./PlanCard";
import "../evidence.css";

const SHORT: Record<CropId, string> = {
  corn: "Corn",
  soybean: "Soybean",
  winter_wheat: "Wheat",
  sorghum: "Sorghum",
  oats: "Oats",
  alfalfa: "Alfalfa",
  fallow: "Fallow",
};

type Their = "corn" | "sorghum" | "soybean" | "wheat";
const THEIR_CROP: Partial<Record<CropId, Their>> = { corn: "corn", sorghum: "sorghum", soybean: "soybean", winter_wheat: "wheat" };


function lastCropOf(history: CropHistory): Their | null {
  const last = [...history.years].reverse().find((y) => y.crop);
  return last?.crop ? (THEIR_CROP[last.crop] ?? null) : null;
}

function Rotation({ r, ours }: { r: KStateRotation; ours: boolean }) {
  return (
    <li className={`so-rot${ours ? " so-ours" : ""}`}>
      <span className="so-rank">#{r.rank}</span>
      <span className="so-chips">
        {r.crops.length > 0
          ? r.crops.map((c, i) => (
              <span key={i} className="so-chip">
                <span className="wi-swatch" style={{ background: CROP_COLORS[c] }} aria-hidden="true" />
                {SHORT[c]}
                {i < r.crops.length - 1 && <span className="so-arrow" aria-hidden="true">→</span>}
              </span>
            ))
          : r.name}
      </span>
      <span className="so-weight" title="Their model splits 100% across its top 3 by how well each did in this county's past weather">
        {r.weightPct}%
      </span>
      {ours && <span className="so-tag">same crops as our plan</span>}
      {r.note && <small className="so-note">{r.note}</small>}
    </li>
  );
}

export function SecondOpinion({ countyFips, plan, history, irrigated }: { countyFips: string | null; plan: RotationPlan; history: CropHistory; irrigated: boolean }) {
  const [op, setOp] = useState<Opinion | null>(null);
  useEffect(() => {
    setOp(null);
    if (!countyFips || !countyFips.startsWith("20")) return;
    const ctrl = new AbortController();
    fetchSecondOpinion(countyFips, ctrl.signal)
      .then(setOp)
      .catch(() => setOp(null)); // hidden when the file can't be reached
    return () => ctrl.abort();
  }, [countyFips]);
  if (!op) return null;

  const planCrops = plan.years.map((y) => y.crop);
  const current = lastCropOf(history);
  const forCurrent = current ? op.byCurrentCrop[current] : undefined;
  const countyRank = matchRank(planCrops, op.rotations);
  const currentRank = forCurrent ? matchRank(planCrops, forCurrent.rotations) : null;
  const agree = !irrigated && countyRank === 1;
  const onList = !irrigated && !agree && (countyRank !== null || currentRank !== null);
  const oursOn = (r: KStateRotation) => r.crops.length > 0 && sameCrops(planCrops, r.crops);
  const pct = (x: number) => `${Math.round(x * 100)}%`;
  const top = op.rotations[0];
  const partial = !irrigated && countyRank === null && currentRank === null && top ? partialOverlap(planCrops, top) : null;
  const words = (cs: CropId[]) => cs.map((c) => SHORT[c].toLowerCase()).join(" and ");

  return (
    <div className="jr-card">
      <h2 className="jr-h2">Second opinion</h2>
      <p className="wi-lead">
        K-State's recommended rain-fed rotations for {op.county}, ranked for this county's weather by a <b>separate model built by our team</b>.
      </p>

      {agree && <p className="so-badge so-agree">✅ Two independent models agree: their top rotation uses the same crops as our plan.</p>}
      {onList && (
        <p className="so-badge">
          Our plan's crops are also on their list
          {countyRank !== null ? ` (#${countyRank} for the county)` : currentRank !== null && current ? ` (#${currentRank} if you're growing ${current} now)` : ""}, but not their top pick.
        </p>
      )}
      {partial && (
        <p className="so-badge">
          Partly agree: both build the rotation around {words(partial.shared)}
          {partial.theirsOnly.length > 0 ? `; their top pick also includes ${words(partial.theirsOnly)}` : ""}.
        </p>
      )}
      {!irrigated && countyRank === null && currentRank === null && !partial && (
        <p className="so-badge">
          The two models differ. That can happen: theirs looks at weather only, while ours also weighs your soil, crop prices, costs and what you grew before.
        </p>
      )}
      {irrigated && (
        <p className="so-badge">
          Your plan assumes irrigation; K-State's list is for dryland fields, so the two aren't directly comparable.
        </p>
      )}

      <ul className="so-list">
        {op.rotations.map((r) => (
          <Rotation key={r.code} r={r} ours={!irrigated && oursOn(r)} />
        ))}
      </ul>

      {current && forCurrent && (
        <div className="so-current">
          <p>
            <b>If you're growing {current} now</b>
            {forCurrent.rotations[0]
              ? `, their first choice is ${forCurrent.rotations[0].crops.map((c) => SHORT[c]).join(" → ") || forCurrent.rotations[0].name} (${forCurrent.rotations[0].weightPct}%).`
              : "."}
          </p>
          {forCurrent.message && <p className="so-msg">{forCurrent.message}</p>}
        </div>
      )}

      <p className="wi-note">
        {op.alert === "normal"
          ? `No drought alert in this district right now (${op.droughtChanceNow !== null ? `${pct(op.droughtChanceNow)} chance` : "low chance"} of drought in the next 4 weeks).`
          : `Drought ${op.alert} in this district: ${op.droughtChanceNow !== null ? pct(op.droughtChanceNow) : "a raised"} chance of drought in the next 4 weeks, so these are ranked for a dry year.`}
        {op.rootzonePctNow !== null && ` Root-zone soil is wetter than ${Math.round(op.rootzonePctNow)}% of past years at this time.`} Data through {op.dataThrough}. {op.disclaimer}
      </p>
    </div>
  );
}
