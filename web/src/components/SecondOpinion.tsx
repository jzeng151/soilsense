import { cropText, useI18n } from "../i18n";
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
  const { t: tx, text: localize, language } = useI18n();
  return (
    <li className={`so-rot${ours ? " so-ours" : ""}`}>
      <span className="so-rank">#{r.rank}</span>
      <span className="so-chips">
        {r.crops.length > 0
          ? r.crops.map((c, i) => (
              <span key={i} className="so-chip">
                <span className="wi-swatch" style={{ background: CROP_COLORS[c] }} aria-hidden="true" />
                {cropText(SHORT[c], language)}
                {i < r.crops.length - 1 && <span className="so-arrow" aria-hidden="true">→</span>}
              </span>
            ))
          : r.name}
      </span>
      <span className="so-weight" title={tx("Their model splits 100% across its top 3 by how well each did in this county's past weather")}>
        {r.weightPct}%
      </span>
      {ours && <span className="so-tag">{tx("same crops as our plan")}</span>}
      {r.note && <small className="so-note">{localize(r.note)}</small>}
    </li>
  );
}

type CardProps = { plan: RotationPlan; history: CropHistory; recentCrops?: CropId[]; irrigated: boolean };

export function SecondOpinion({ countyFips, ...props }: CardProps & { countyFips: string | null }) {
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
  return op ? <SecondOpinionCard op={op} {...props} /> : null;
}

/** Loaded card kept separate so rendering and provenance are testable without network or DOM mocks. */
export function SecondOpinionCard({ op, plan, history, recentCrops, irrigated }: CardProps & { op: Opinion }) {
  const { t: tx, text: localize, language } = useI18n();
  const planCrops = plan.years.map((y) => y.crop);
  const farmerCrop = recentCrops?.at(-1);
  const current = farmerCrop ? (THEIR_CROP[farmerCrop] ?? null) : lastCropOf(history);
  const forCurrent = current ? op.byCurrentCrop[current] : undefined;
  const countyRank = matchRank(planCrops, op.rotations);
  const currentRank = forCurrent ? matchRank(planCrops, forCurrent.rotations) : null;
  const agree = !irrigated && countyRank === 1;
  const onList = !irrigated && !agree && (countyRank !== null || currentRank !== null);
  const oursOn = (r: KStateRotation) => r.crops.length > 0 && sameCrops(planCrops, r.crops);
  const dryYearRanking = op.basis ? op.basis.startsWith("dry-year") : op.dryYearRanking;
  const top = op.rotations[0];
  const partial = !irrigated && countyRank === null && currentRank === null && top ? partialOverlap(planCrops, top) : null;
  const words = (cs: CropId[]) => cs.map((c) => cropText(SHORT[c], language).toLowerCase()).join(tx(" and "));

  return (
    <div className="jr-card">
      <h2 className="jr-h2">{tx("Second opinion")}</h2>
      <p className="wi-lead">{tx("K-State's recommended rain-fed rotations for")}{" "}{op.county}{tx(", ranked for this county's weather by a")}{" "}<b>{tx("separate model built by our team")}</b>.
      </p>

      {agree && <p className="so-badge so-agree">{tx("✅ Two independent models agree: their top rotation uses the same crops as our plan.")}</p>}
      {onList && (
        <p className="so-badge">{tx("Our plan's crops are also on their list")}{countyRank !== null ? tx(" (#{rank} for the county)", { rank: countyRank }) : currentRank !== null && current ? tx(" (#{rank} if you are growing {crop} now)", { rank: currentRank, crop: cropText(current, language).toLowerCase() }) : ""}{tx(", but not their top pick.")}</p>
      )}
      {partial && (
        <p className="so-badge">{tx("Partly agree: both build the rotation around")}{" "}{words(partial.shared)}
          {partial.theirsOnly.length > 0 ? tx("; their top pick also includes {crops}", { crops: words(partial.theirsOnly) }) : ""}.
        </p>
      )}
      {!irrigated && countyRank === null && currentRank === null && !partial && (
        <p className="so-badge">{tx("The two models differ. That can happen: theirs looks at weather only, while ours also weighs your soil, crop prices, costs and what you grew before.")}</p>
      )}
      {irrigated && (
        <p className="so-badge">{tx("Your plan assumes irrigation; K-State's list is for dryland fields, so the two aren't directly comparable.")}</p>
      )}

      <ul className="so-list">
        {op.rotations.map((r) => (
          <Rotation key={r.code} r={r} ours={!irrigated && oursOn(r)} />
        ))}
      </ul>

      {current && forCurrent && (
        <div className="so-current">
          <p>
            <b>{tx("If you're growing")}{" "}{cropText(current, language).toLowerCase()}{" "}{tx("now")}</b>
            {forCurrent.rotations[0]
              ? tx(", their first choice is {crops} ({weight}%).", { crops: forCurrent.rotations[0].crops.map((c) => cropText(SHORT[c], language)).join(" → ") || forCurrent.rotations[0].name, weight: forCurrent.rotations[0].weightPct })
              : "."}
          </p>
          <p className="wi-note">{farmerCrop ? tx("Based on your current-crop answer.") : tx("Based on satellite crop history.")}</p>
          {forCurrent.message && <p className="so-msg">{localize(forCurrent.message)}</p>}
        </div>
      )}

      {dryYearRanking && <p className="wi-note">{tx("Ranked for a drier-than-normal season.")}</p>}
      <p className="wi-note">{tx("Based on NASA data through")}{" "}{op.dataThrough}. {op.savedCopy && tx("Using saved copy, data through {date}. ", { date: op.dataThrough })}{localize(op.disclaimer)}
      </p>
      <details className="wi-note">
        <summary>{tx("Data credits")}</summary>
        {/* Exact credit lines from kansas-crop-rotation/reports/REFERENCES.md. */}
        <p>The data was obtained from National Aeronautics and Space Administration (NASA) Langley Research Center's Prediction Of Worldwide Energy Resources (POWER) project funded through the NASA Earth Science Division.</p>
        <p>The data was obtained from the POWER Project's Daily API v2.10.3 on 2026/11/14.</p>
        <p>The U.S. Drought Monitor is jointly produced by the National Drought Mitigation Center at the University of Nebraska-Lincoln, the United States Department of Agriculture, the National Oceanic and Atmospheric Administration and the National Aeronautics and Space Administration. Map courtesy of NDMC.</p>
      </details>
    </div>
  );
}
