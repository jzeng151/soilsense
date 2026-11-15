import { cropText, translate, useI18n, type Language } from "../i18n";
// "Checked against real harvests": the model's replay of each past year next to what the county
// actually harvested (USDA NASS). Also the short "satellite vs. ground" explainer.

import type { CropId, CropValidation, WaterCheck } from "../../../src/shared/types";
import "../evidence.css";

const W = 640;
const H = 190;
const PAD = { l: 38, r: 10, t: 12, b: 24 };

function Chart({ v }: { v: CropValidation }) {
  const { t: tx, language } = useI18n();
  const xs = v.years;
  const all = [...v.actual, ...v.modeled];
  const lo = Math.max(0, Math.min(...all) * 0.9);
  const hi = Math.max(...all) * 1.05;
  const x0 = xs[0] ?? 0;
  const x1 = xs[xs.length - 1] ?? 1;
  const X = (x: number) => PAD.l + ((x - x0) / Math.max(1, x1 - x0)) * (W - PAD.l - PAD.r);
  const Y = (y: number) => H - PAD.b - ((y - lo) / Math.max(1e-9, hi - lo)) * (H - PAD.t - PAD.b);
  const path = (ys: number[]) => xs.map((x, i) => `${i === 0 ? "M" : "L"}${X(x).toFixed(1)},${Y(ys[i] ?? 0).toFixed(1)}`).join("");
  const fmt = (n: number) => (hi >= 20 ? Math.round(n).toString() : n.toFixed(1));
  const worst = new Set(v.worstYears.map((w) => w.year));
  const ticks = xs.filter((y) => y % 5 === 0);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="vd-chart" role="img" aria-label={tx("{crop}: real county yields and model estimates by year", { crop: cropText(v.crop, language) })}>
      {[lo, (lo + hi) / 2, hi].map((g) => (
        <g key={g}>
          <line x1={PAD.l} x2={W - PAD.r} y1={Y(g)} y2={Y(g)} className="vd-grid" />
          <text x={PAD.l - 6} y={Y(g) + 3} textAnchor="end" className="vd-axis">
            {fmt(g)}
          </text>
        </g>
      ))}
      {ticks.map((t) => (
        <text key={t} x={X(t)} y={H - 6} textAnchor="middle" className="vd-axis">
          {t}
        </text>
      ))}
      <path d={path(v.modeled)} className="vd-line vd-model" />
      <path d={path(v.actual)} className="vd-line vd-real" />
      {xs.map((x, i) =>
        worst.has(x) ? (
          <circle key={x} cx={X(x)} cy={Y(v.actual[i] ?? 0)} r={4} className="vd-worst">
            <title>{tx("{year}: one of the 5 worst real years", { year: x })}</title>
          </circle>
        ) : null,
      )}
    </svg>
  );
}

function sentence(v: CropValidation, language: Language): string {
  const n = v.years.length;
  if (v.correlation >= 0.5) return translate(language, "In {same} of {count} years, the model and the real harvest agreed on whether it was a better or worse year than usual.", { same: v.sameDirection, count: n });
  if (v.correlation >= 0.25) return translate(language, "The model follows the real harvests only loosely here: it agreed on better-or-worse in {same} of {count} years.", { same: v.sameDirection, count: n });
  return translate(language, "The model does not track the real harvests well for this crop here ({same} of {count} years agree). Treat its yield numbers with extra care.", { same: v.sameDirection, count: n });
}

export function HarvestCheck({
  validation,
  planCrops,
  place,
  waterCheck,
  irrigated = false,
}: {
  validation: CropValidation[];
  planCrops: CropId[];
  place: string | null;
  waterCheck?: WaterCheck | null;
  irrigated?: boolean;
}) {
  const { t: tx, text: localize, language } = useI18n();
  if (!validation.length && !waterCheck) return null;
  // Show the check for the crops we actually recommend (weak or strong). If none of them has county
  // records, show the two crops with the longest records instead.
  const inPlan = validation.filter((v) => planCrops.includes(v.crop));
  const ordered = (inPlan.length ? inPlan : validation.slice(0, 2)).slice(0, 3);
  return (
    <div className="vd">
      <p className="vd-lead">{tx("This tests our model itself, separately from your plan: we replayed every past year on your field and compared the result with what farmers in")}{" "}{place ?? tx("your county")}{" "}{tx("really harvested, as recorded by the USDA.")}</p>
      {ordered.map((v) => (
        <article key={v.crop} className="vd-crop">
          <h3>
            {cropText(v.crop, language)} <small>{tx("model test: grown after")}{" "}{cropText(v.afterCropName, language).toLowerCase()}{tx(", the usual rotation here")}</small>
          </h3>
          <p className="vd-verdict">{sentence(v, language)}</p>
          <ul className="vd-stats">
            <li>
              <b>
                {v.sameDirection}/{v.years.length}
              </b>
              <span>{tx("years the direction matched")}</span>
            </li>
            <li>
              <b>{v.worstYearsFlagged}/5</b>
              <span>{tx("of the worst real years caught")}</span>
            </li>
            <li>
              <b>{v.correlation.toFixed(2)}</b>
              <span>{tx("match score (1.00 = perfect)")}</span>
            </li>
          </ul>
          <Chart v={v} />
          {v.worstYears.some((w) => w.cause) && (
            <p className="vd-causes">
              <b>{tx("Worst real years and what crop insurance paid out for:")}</b>{" "}
              {v.worstYears.map((w, i) => (
                <span key={w.year}>
                  {i > 0 ? " · " : ""}
                  {w.year} ({localize(w.cause ?? tx("no claims recorded"))})
                </span>
              ))}
            </p>
          )}
          <p className="vd-legend">
            <span className="vd-key vd-key-real" />{" "}{tx("Real county harvest (")}{v.unit})
            <span className="vd-key vd-key-model" />{" "}{tx("Our model")}<span className="vd-key vd-key-worst" />{" "}{tx("5 worst real years")}</p>
          {v.missesExplained && v.missesExplained.otherCauses > 0 ? (
            <p className="vd-note">{tx("Where the model fell short:")}{" "}{v.missesExplained.causes.map(localize).join(", ")}{tx(". Crop insurance records show these losses came from causes a weather-and-soil-water model cannot see.")}</p>
          ) : (
            v.correlation < 0.5 && (
              <p className="vd-note">{tx("Why the match is weaker: harvests here also swing with floods, wind storms, disease and planting delays, which a weather-and-soil-water model only partly sees.")}</p>
            )
          )}
        </article>
      ))}
      <p className="vd-foot">{tx("How to read this: the steady rise in yields over the decades (better seed and machinery) is taken from the real records. The ups and downs of the green line come only from our model's replay of that year's NASA weather on this soil. Nothing was tuned to fit single years. Real harvests:")}{" "}{ordered[0]?.source ?? "USDA NASS"}{tx(". Causes of loss: USDA Risk Management Agency.")}</p>
      {waterCheck && <WaterUse w={waterCheck} irrigated={irrigated} />}
    </div>
  );
}

/** Our crop water use next to OpenET's satellite measurement for the same field and season. */
function WaterUse({ w, irrigated }: { w: WaterCheck; irrigated: boolean }) {
  const { t: tx, language } = useI18n();
  const max = Math.max(...w.measured, ...w.modeled) || 1;
  const gap = Math.round((w.ratio - 1) * 100);
  const verdict =
    Math.abs(gap) <= 10
      ? tx("On average our estimate is within {number}% of what satellites measured on this field", { number: Math.max(1, Math.abs(gap)) })
      : tx("On average satellites measured {number}% {direction} water use than we estimate", { number: Math.abs(gap), direction: tx(gap > 0 ? "more" : "less") });
  return (
    <article className="vd-crop vd-water">
      <h3>{tx("Water use, measured from space")}{" "}<small>{tx("OpenET on your field,")}{" "}{w.years[0]}–{w.years[w.years.length - 1]}</small>
      </h3>
      <p className="vd-verdict">
        {verdict}
        {w.correlation >= 0.6 ? tx(", and it follows the wet and dry years closely.") : tx(", though it follows the year-to-year ups and downs only loosely.")}
      </p>
      {!irrigated && w.ratio >= 1.5 && (
        <p className="vd-note">{tx("Satellites see about")}{" "}{w.ratio.toFixed(1)}{tx("× the water a rain-fed crop could use here. That usually means the field is irrigated. If it is, choose \"Irrigated\" in the questions for a more accurate plan.")}</p>
      )}
      <ul className="vd-bars" aria-label={tx("Crop water use per season, measured vs. our model")}>
        {w.years.map((y, i) => (
          <li key={y}>
            <span className="vd-bar-label">
              {y} <small>{cropText(w.crops[i] ?? "", language)}</small>
            </span>
            <span className="vd-bar-pair">
              <span className="vd-bar vd-bar-real" style={{ width: `${((w.measured[i] ?? 0) / max) * 100}%` }} title={tx("Measured: {number} mm", { number: w.measured[i] ?? 0 })} />
              <span className="vd-bar vd-bar-model" style={{ width: `${((w.modeled[i] ?? 0) / max) * 100}%` }} title={tx("Our model: {number} mm", { number: w.modeled[i] ?? 0 })} />
            </span>
            <span className="vd-bar-num">
              {Math.round((w.measured[i] ?? 0) / 25.4)} / {Math.round((w.modeled[i] ?? 0) / 25.4)}{" "}{tx("in")}</span>
          </li>
        ))}
      </ul>
      <p className="vd-legend">
        <span className="vd-key vd-key-barreal" />{" "}{tx("Measured (OpenET, NASA/USGS Landsat)")}<span className="vd-key vd-key-barmodel" />{" "}{tx("Our model · inches of water over each crop's season")}</p>
    </article>
  );
}

export function SatelliteNote() {
  const { t: tx } = useI18n();
  return (
    <div className="vd-sat">
      <p>
        <b>{tx("Satellite and model data")}</b>{" "}{tx("(NASA POWER, MODIS, SMAP) cover every field on Earth, every day, for decades, and cost nothing. But one value stands for a large square: about 30 miles for our weather, 6 miles for SMAP soil moisture, 800 feet for MODIS plant greenness.")}</p>
      <p>
        <b>{tx("Ground measurements")}</b>{" "}{tx("(a rain gauge, a soil probe, a soil test) are exact for one spot, but most fields have none, and few go back 35 years.")}</p>
      <p>
        <b>{tx("What that means for you:")}</b>{" "}{tx("use this plan for the big picture, such as which crops fit your climate and how it is shifting. If you have a rain gauge or a soil test, trust it over our numbers for your field. We use the USDA soil survey because it was mapped on the ground.")}</p>
    </div>
  );
}
