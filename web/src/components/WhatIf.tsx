import { useI18n } from "../i18n";
// The three "what if" pieces of the results page:
//   - BadYears: how often the current crops vs. the plan would be badly stressed (out of 10 years)
//   - WaterOptions: best plan with rain only / limited irrigation / full irrigation ("what if the well runs low?")
//   - DroughtReplay: the field's own worst past years replayed for the current crops and the plan (history only)

import { useState } from "react";
import type { DroughtReplay as Replay, ReplayPlanOutcome, RotationPlan, WaterLevel, WaterOption } from "../../../src/shared/types";
import { Definition } from "./Glossary";
import { CROP_COLORS, money } from "./PlanCard";
import "../evidence.css";

export const WATER_LABELS: Record<WaterLevel, { title: string; hint: string; icon: string }> = {
  rain: { title: "Rain only", hint: "No irrigation, or the well has run dry", icon: "🌧️" },
  limited: { title: "Limited water", hint: "About 10 in a year: a declining well or an allocation", icon: "💧" },
  full: { title: "Full irrigation", hint: "Water whenever the crop needs it", icon: "💧💧" },
};

function Dots({ bad }: { bad: number }) {
  return (
    <span className="wi-dots" aria-hidden="true">
      {Array.from({ length: 10 }, (_, i) => (
        <span key={i} className={i < bad ? "bad" : "ok"} />
      ))}
    </span>
  );
}

/** "about 4 bad years in 10", or plain words at the extremes. */
export function badYearsWords(n: number): string {
  if (n >= 10) return "bad nearly every year";
  if (n <= 0) return "almost never a bad year";
  return `about ${n} bad year${n === 1 ? "" : "s"} in 10`;
}

/** Headline: bad years out of 10, current crops vs. the plan. */
export function BadYears({ plan, current }: { plan: RotationPlan; current: RotationPlan | null }) {
  const { t, language } = useI18n();
  const words = (n: number) => language === "en" ? badYearsWords(n) : n >= 10 ? t("bad nearly every year") : n <= 0 ? t("almost never a bad year") : t("about {number} bad years in 10", { number: n });
  return (
    <div className="wi-bad" aria-label={t("Bad years out of 10")}>
      {current && (
        <div className="wi-bad-row">
          <span className="wi-bad-label">{t("What you grow now")}</span>
          <Dots bad={current.badYearsIn10} />
          <b>{words(current.badYearsIn10)}</b>
        </div>
      )}
      <div className="wi-bad-row wi-bad-plan">
        <span className="wi-bad-label">{t("This plan")}</span>
        <Dots bad={plan.badYearsIn10} />
        <b>{words(plan.badYearsIn10)}</b>
      </div>
      <p className="wi-note">{t("A bad year means the crop was badly stressed by drought, heat, frost or a wet spring, in 35 years of NASA weather on this field.")}</p>
    </div>
  );
}

/** Best plan for each water level; the chosen level is highlighted and others can be opened. */
export function WaterOptions({ options, current, onChoose, busy }: { options: WaterOption[]; current: WaterLevel; onChoose: (w: WaterLevel) => void; busy: boolean }) {
  if (options.length < 2) return null;
  return (
    <div className="wi-water">
      <p className="wi-lead">The best plan for this field changes with how much water you have. If your well is running low, compare:</p>
      <ul className="wi-water-grid">
        {options.map((o) => {
          const lbl = WATER_LABELS[o.water];
          const on = o.water === current;
          return (
            <li key={o.water} className={on ? "on" : ""}>
              <p className="wi-water-title">
                <span aria-hidden="true">{lbl.icon}</span> {lbl.title}
              </p>
              <p className="wi-water-hint">{lbl.hint}</p>
              <span className="chips">
                {o.crops.map((c, i) => (
                  <span key={i} className="chip chip-sm" style={{ background: CROP_COLORS[c] }}>
                    {o.bestLabel.split(" → ")[i]}
                  </span>
                ))}
              </span>
              <dl className="wi-water-stats">
                <div>
                  <dt>Bad years</dt>
                  <dd>
                    {o.badYearsIn10} <small>in 10</small>
                  </dd>
                </div>
                <div>
                  <dt>Profit /acre/yr</dt>
                  <dd>{Math.abs(o.avgNetReturnPerAcre) < 15 ? "≈ $0" : money(o.avgNetReturnPerAcre)}</dd>
                </div>
                <div>
                  <dt>Pumped</dt>
                  <dd>
                    {Math.round(o.waterPumpedIn)} <small>in/yr</small>
                  </dd>
                </div>
              </dl>
              {on ? (
                <span className="wi-current">Your plan above</span>
              ) : (
                <button type="button" className="ghost" disabled={busy} onClick={() => onChoose(o.water)}>
                  Show this plan
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Outcome({ title, o, muted }: { title: string; o: ReplayPlanOutcome; muted?: boolean }) {
  return (
    <div className={`wi-outcome ${muted ? "muted" : ""}`}>
      <p className="wi-outcome-title">{title}</p>
      <p className="wi-outcome-label">{o.label}</p>
      <ul>
        {o.crops.map((c) => (
          <li key={`${c.crop}-${c.afterCropName}`}>
            <span className="wi-swatch" style={{ background: CROP_COLORS[c.crop] }} />
            <span className="wi-crop">
              {c.cropName} <small>after {c.afterCropName.toLowerCase()}</small>
            </span>
            <span className="wi-yield">
              {c.pctVsTypical <= -90 ? (
                <>
                  Near-total crop failure
                  <small className="neg">almost nothing to harvest</small>
                </>
              ) : (
                <>
                  ≈ {c.yield} {c.unit.replace("/acre", "")}
                  <small className={c.pctVsTypical <= -25 ? "neg" : c.pctVsTypical < 0 ? "warn" : ""}>{c.pctVsTypical > 0 ? `+${c.pctVsTypical}` : c.pctVsTypical}% vs. usual</small>
                </>
              )}
            </span>
            <span className={`wi-money ${c.netPerAcre < 0 ? "neg" : ""}`}>{money(c.netPerAcre)}</span>
          </li>
        ))}
      </ul>
      {o.crops.length === 0 && <p className="wi-note">No replay available for these crops.</p>}
    </div>
  );
}

/** Pick one of the field's worst past years and see the current crops vs. the plan in that year's real weather. */
export function DroughtReplay({ replays }: { replays: Replay[] }) {
  const [i, setI] = useState(replays.length - 1);
  const r = replays[i];
  if (!r) return null;
  const w = r.weather;
  return (
    <div className="wi-replay">
      <p className="wi-lead"><Definition term="historical-replay" />: these are the lowest modeled-yield years for your current main crop (or the plan’s first crop when unknown), not a measured field ranking. Pick a year to replay its weather:</p>
      <div className="wi-years" role="group" aria-label="Historical year">
        {replays.map((x, k) => (
          <button key={x.year} type="button" aria-pressed={k === i} className={k === i ? "on" : ""} onClick={() => setI(k)}>
            {x.year}
          </button>
        ))}
      </div>
      <p className="wi-weather">
        <b>{r.year}:</b>{" "}
        {w.seasonRainIn !== null && w.typicalSeasonRainIn !== null ? `${w.seasonRainIn} in of rain May–Sep (usually ${w.typicalSeasonRainIn})` : "rainfall not available"}
        {w.hotDays !== null && w.typicalHotDays !== null ? ` · ${w.hotDays} days at or above 95°F (usually ${w.typicalHotDays})` : " · heat observations unavailable"}
      </p>
      <p className="wi-note">“Usually” is the mean of retained historical years for the same calendar window, including the selected year. Changing the year changes weather and replayed outcomes, not rotation rankings, crop reference yields, costs or water allowances.</p>
      <div className="wi-outcomes">
        {r.current && <Outcome title="What you grow now" o={r.current} muted />}
        <Outcome title="Our plan" o={r.plan} />
      </div>
      {(r.county.length > 0 || r.insurance.length > 0) && (
        <div className="wi-real">
          <b>What really happened in {r.year}:</b>
          {r.county.length > 0 && (
            <span>
              {" "}
              county harvests{" "}
              {r.county
                .map((c) => `${c.cropName.toLowerCase()} ${c.actualPct > 0 ? "+" : ""}${c.actualPct}% vs. normal${c.fields === "all" ? " (all fields: irrigated fields soften the drop, so rain-fed fields fared worse than this)" : " (rain-fed fields)"}`)
                .join(", ")}{" "}
              (USDA).
            </span>
          )}
          {r.insurance.length > 0 && <span> Crop insurance paid out mostly for {[...new Set(r.insurance.map((c) => c.cause))].join(" and ")} (USDA RMA).</span>}
        </div>
      )}
      <p className="wi-note">History replay, not a forecast: estimated yields for that year's real weather on this soil, at today's prices and typical costs. Real results on one field can differ.</p>
    </div>
  );
}
