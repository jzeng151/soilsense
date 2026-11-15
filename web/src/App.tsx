import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CropId, FieldResponse, PlanResponse, Priority, ReasonFact, RotationPlan, WaterLevel } from "../../src/shared/types";
import { Glossary, Definition } from "./components/Glossary";
import { askQuestion, fetchField, fetchPlan } from "./api";
import { DataEvidence, DecisionNotice } from "./components/DataEvidence";
import { PlanAssumptions } from "./components/PlanAssumptions";
import { DEMO_FARMS, MapPicker } from "./components/MapPicker";
import { HarvestCheck, SatelliteNote } from "./components/HarvestCheck";
import { BadYears, DroughtReplay, WATER_LABELS, WaterOptions } from "./components/WhatIf";
import { IndicatorGuide, SoilBuild } from "./components/SoilBuild";
import { SecondOpinion } from "./components/SecondOpinion";
import { CROP_COLORS, PlanRow, TopPlan } from "./components/PlanCard";
import { LogoMark } from "./components/Logo";
import { Sprout } from "./components/Sprout";
import { SmapCard } from "./components/SmapCard";
import { EconomicsCard } from "./components/EconomicsCard";
import { HistoricalScenarios } from "./components/HistoricalScenarios";
import { FieldWatchCard } from "./components/FieldWatchCard";
import { UsdmContext } from "./components/UsdmContext";
import { WindScreenCard } from "./components/WindScreenCard";
import { TrendChart, trendText, trendTone } from "./components/TrendChart";

// A simple three-step journey: 1) find your field, 2) three quick questions, 3) your plan.
// One thing on screen at a time, with the answer first and the details folded away.

const CROP_OPTIONS: { id: CropId; label: string }[] = [
  { id: "corn", label: "Corn" },
  { id: "soybean", label: "Soybean" },
  { id: "winter_wheat", label: "Winter wheat" },
  { id: "oats", label: "Oats" },
  { id: "alfalfa", label: "Alfalfa / hay" },
  { id: "sorghum", label: "Grain sorghum" },
  { id: "fallow", label: "Fallow (no crop)" },
];

const PRIORITIES: { id: Priority; label: string; hint: string }[] = [
  { id: "balanced", label: "A bit of everything", hint: "Profit, soil and safety" },
  { id: "profit", label: "Most profit", hint: "Money per acre" },
  { id: "soil", label: "Healthier soil", hint: "Build it up over time" },
  { id: "risk", label: "Lowest risk", hint: "Safe in bad years" },
];

const DEMO_SHORT: Record<string, string> = {
  "Story County, Iowa": "Iowa",
  "Champaign County, Illinois": "Illinois",
  "Finney County, Kansas": "Kansas",
  "Lancaster County, Nebraska": "Nebraska",
};

// The most recent completed (or current) season: after September, this year's crop is in;
// earlier in the year, last year's is. Plans start the season after it (matches the API).
const NOW = new Date();
const THIS_SEASON = NOW.getMonth() >= 8 ? NOW.getFullYear() : NOW.getFullYear() - 1;

const LOADING_STEPS = ["Reading 35 years of NASA weather for your field", "Checking the soil under it", "Comparing about a thousand 3-year crop plans", "Picking the best fit for you"];

type Step = "field" | "questions" | "plan";

function guessThisYear(field: FieldResponse | null): CropId | "" {
  const last = [...(field?.cropHistory.years ?? [])].reverse().find((y) => y.crop)?.crop;
  if (last === "corn") return "soybean";
  if (last === "soybean") return "corn";
  return last ?? "";
}

/** Strip statistics jargon so reasons read as plain sentences. */
function plain(text: string): string {
  return text
    .replace(/\s*\([^)]*\bp\s*[=<]\s*[\d.]+[^)]*\)/g, "")
    .replace(/,?\s*and that change is statistically real/gi, "")
    .replace(/no statistically clear change/gi, "no clear change")
    .replace(/Growing degree days \(May–Sep\)/g, "Growing-season warmth (May–Sep)")
    .replace(/°F·days/g, "heat units")
    .replace(/\s+\./g, ".");
}

/**
 * The three reasons that best explain this plan: a real climate change first, then how the plan's crops
 * cope with the weather and water here, then the comparison with today. "No clear change" trends come last.
 */
function topReasons(facts: ReasonFact[]): ReasonFact[] {
  const rank = (f: ReasonFact): number => {
    if (f.id.startsWith("trend-")) return f.significant ? 0 : 9;
    if (f.id === "agro-fallow") return 1;
    if (f.id.startsWith("risk-")) return 2;
    if (f.id === "vs-current") return 3;
    if (f.id.startsWith("agro-")) return 4;
    if (f.id.startsWith("soilfit-")) return 5;
    return 6;
  };
  const sorted = facts.map((f, i) => ({ f, i })).sort((a, b) => rank(a.f) - rank(b.f) || a.i - b.i);
  // At most one climate trend and one per-crop replay, so the three reasons cover different ground.
  const out: ReasonFact[] = [];
  let trends = 0;
  let risks = 0;
  for (const { f } of sorted) {
    if (f.id.startsWith("trend-") && trends++ >= 1) continue;
    if (f.id.startsWith("risk-") && risks++ >= 1) continue;
    out.push(f);
    if (out.length === 3) break;
  }
  return out;
}

/** When our pick earns less than what the farmer does now, say plainly what they get in return. */
function tradeoff(best: RotationPlan, current: RotationPlan | null): string | null {
  if (!current) return null;
  const less = Math.round(current.avgNetReturnPerAcre - best.avgNetReturnPerAcre);
  if (less < 5) return null;
  // Use the same bad-years numbers shown in the dots above, so the page never contradicts itself.
  const nowOk = 10 - current.badYearsIn10;
  const oursOk = 10 - best.badYearsIn10;
  if (oursOk <= nowOk) return `On average this plan earns about $${less}/acre a year less than what you do now. We suggest it because it is better for your soil and fits your goal.`;
  return `On average your current crops earn about $${less}/acre a year more, because their good years pay very well. But those good years are rare here: your current crops come through in about ${nowOk} of 10 years, this plan in about ${oursOk}. A few bad years in a row cost far more than that average difference.`;
}

function soilName(name: string | undefined): string | undefined {
  return name?.split(",")[0]?.trim();
}

/** "Grow soybean in 2027, corn in 2028, then soybean in 2029." */
function planSentence(p: RotationPlan): string {
  const parts = p.years.map((y) => (y.crop === "fallow" ? `rest the field in ${y.year}` : `${y.cropName.toLowerCase()} in ${y.year}`));
  const body = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, then ${parts[parts.length - 1]}` : parts[0];
  return `Grow ${body}.`.replace(/^Grow rest/, "Rest");
}

function Progress({ step, canGo, go }: { step: Step; canGo: (s: Step) => boolean; go: (s: Step) => void }) {
  const items: { id: Step; label: string }[] = [
    { id: "field", label: "Your field" },
    { id: "questions", label: "3 questions" },
    { id: "plan", label: "Your plan" },
  ];
  const at = items.findIndex((i) => i.id === step);
  return (
    <ol className="jr-progress" aria-label="Progress">
      {items.map((it, i) => (
        <li key={it.id} className={i < at ? "done" : i === at ? "now" : ""}>
          <button type="button" disabled={!canGo(it.id) || i === at} onClick={() => go(it.id)} aria-current={i === at ? "step" : undefined}>
            <span className="jr-dot">{i < at ? "✓" : i + 1}</span>
            {it.label}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function App() {
  const [step, setStep] = useState<Step>("field");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; key: number } | null>(null);
  const [zip, setZip] = useState("");
  const [zipMsg, setZipMsg] = useState<string | null>(null);
  const [field, setField] = useState<FieldResponse | null>(null);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [thisYear, setThisYear] = useState<CropId | "">("");
  const [guessed, setGuessed] = useState(false);
  const [water, setWater] = useState<WaterLevel>("rain");
  const [priority, setPriority] = useState<Priority>("balanced");
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const fieldAbort = useRef<AbortController | null>(null);
  const planAbort = useRef<AbortController | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const go = useCallback((s: Step) => {
    setStep(s);
    requestAnimationFrame(() => top.current?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, []);

  const pick = useCallback(async (lat: number, lon: number) => {
    const p = { lat: Math.round(lat * 1e5) / 1e5, lon: Math.round(lon * 1e5) / 1e5 };
    setPoint(p);
    setPlan(null);
    setAnswer(null);
    setError(null);
    setZipMsg(null);
    setFieldLoading(true);
    fieldAbort.current?.abort();
    const ctrl = new AbortController();
    fieldAbort.current = ctrl;
    try {
      const f = await fetchField(p.lat, p.lon, ctrl.signal);
      setField(f);
      const g = guessThisYear(f);
      setThisYear(g);
      setGuessed(Boolean(g));
    } catch (e) {
      if ((e as Error).name !== "AbortError") {
        setField(null);
        setError((e as Error).message);
      }
    } finally {
      if (fieldAbort.current === ctrl) setFieldLoading(false);
    }
  }, []);

  const findZip = async (e: React.FormEvent) => {
    e.preventDefault();
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) {
      setZipMsg("Enter a 5-digit US ZIP code.");
      return;
    }
    setZipMsg("Looking it up…");
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { places?: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[] };
      const pl = j.places?.[0];
      if (!pl) throw new Error();
      setFocus({ lat: Number(pl.latitude), lon: Number(pl.longitude), zoom: 12, key: Date.now() });
      setZipMsg(`Showing ${pl["place name"]}, ${pl["state abbreviation"]}. Now tap your field on the map.`);
    } catch {
      setZipMsg("We couldn't find that ZIP code. Try another, or tap the map.");
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setZipMsg("Your browser can't share its location. Tap the map instead.");
      return;
    }
    setZipMsg("Finding you…");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFocus({ lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 14, key: Date.now() });
        void pick(pos.coords.latitude, pos.coords.longitude);
      },
      () => setZipMsg("We couldn't get your location. Type a ZIP code or tap the map."),
      { timeout: 10000 },
    );
  };

  const lastMapped = useMemo(() => [...(field?.cropHistory.years ?? [])].reverse().find((y) => y.crop) ?? null, [field]);

  const run = useCallback(async (waterOverride?: WaterLevel) => {
    if (!point || !thisYear) return;
    const w = waterOverride ?? water;
    if (waterOverride) setWater(waterOverride);
    setPlanLoading(true);
    setPlan(null);
    setAnswer(null);
    setLoadingStep(0);
    setError(null);
    go("plan");
    planAbort.current?.abort();
    const ctrl = new AbortController();
    planAbort.current = ctrl;
    const recentCrops: CropId[] = [];
    if (lastMapped?.crop && lastMapped.year < THIS_SEASON) recentCrops.push(lastMapped.crop);
    recentCrops.push(thisYear);
    try {
      const res = await fetchPlan({ lat: point.lat, lon: point.lon, irrigated: w !== "rain", water: w, priority, recentCrops }, ctrl.signal);
      setPlan(res);
      setAnswer(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError((e as Error).message);
    } finally {
      if (planAbort.current === ctrl) setPlanLoading(false);
    }
  }, [point, thisYear, water, priority, lastMapped, go]);

  // Walk through the loading messages while the plan is being built.
  useEffect(() => {
    if (!planLoading) return;
    const t = setInterval(() => setLoadingStep((s) => Math.min(s + 1, LOADING_STEPS.length - 1)), 1400);
    return () => clearInterval(t);
  }, [planLoading]);

  const ask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!plan || !question.trim()) return;
    setAsking(true);
    try {
      const best = plan.plans[0];
      const r = await askQuestion({
        question,
        planLabel: best?.label ?? "",
        summary: plan.explanation.summary,
        facts: plan.facts
          .map((f) => f.text)
          .concat(
            best
              ? best.years.map((y) =>
                  y.yieldUnit
                    ? `${y.year}: ${y.cropName}, about ${y.expectedYield} ${y.yieldUnit}, ${y.nitrogenLbPerAcre} lb N/acre, ${y.coverName}.`
                    : `${y.year}: ${y.cropName}: the field rests to store soil water.`,
                )
              : [],
          ),
      });
      setAnswer({ q: question, a: r.answer });
      setQuestion("");
    } catch (err) {
      setAnswer({ q: question, a: (err as Error).message });
    } finally {
      setAsking(false);
    }
  };

  const startOver = () => {
    setPoint(null);
    setField(null);
    setPlan(null);
    setThisYear("");
    setZip("");
    setZipMsg(null);
    setError(null);
    go("field");
  };

  const soil = field?.soil;
  const place = field?.county ? `${field.county.countyName}, ${field.county.stateCode}` : null;
  const recentHistory = (field?.cropHistory.years ?? []).filter((y) => y.crop).slice(-4);
  // USDA's crop map calls this spot town, roads or buildings in its most recent years: probably not the field.
  const lastSeen = (field?.cropHistory.years ?? []).slice(-3);
  const looksDeveloped = lastSeen.length > 0 && !lastSeen.some((y) => y.crop) && lastSeen.every((y) => y.cdlCode >= 121 && y.cdlCode <= 124);
  const changes = plan?.climate.indicators.filter((i) => trendTone(i) !== "flat") ?? [];
  const best = plan?.plans[0];
  const others = plan?.plans.slice(1) ?? [];
  const canGo = (s: Step) => s === "field" || (s === "questions" && !!field) || (s === "plan" && !!plan);

  return (
    <div className="app jr">
      <header className="topbar">
        <div className="brand">
          <LogoMark size={32} />
          <strong>Soil Sense</strong>
        </div>
        <span className="topbar-tag">Teaching satellites to speak Farmer</span>
      </header>

      <main className="jr-main" ref={top}>
        <Progress step={step} canGo={canGo} go={go} />
        <Glossary />

        {/* ---------- Step 1: find the field ---------- */}
        {step === "field" && (
          <section className="jr-card" aria-labelledby="s1">
            <div className="jr-hero">
              <Sprout mood="hello" width={96} />
              <div>
                <p className="eyebrow">Hi, I'm Sprout</p>
                <h1 id="s1" className="jr-title">Where is your field?</h1>
                <p className="jr-lead">We'll look at 35 years of weather and the soil under that exact spot, then suggest what to grow for the next 3 years.</p>
              </div>
            </div>

            <div className="jr-find">
              <form className="jr-zip" onSubmit={findZip}>
                <input inputMode="numeric" maxLength={5} placeholder="ZIP code" aria-label="ZIP code" value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
                <button type="submit" className="ghost">
                  Go
                </button>
              </form>
              <span className="jr-or">or</span>
              <button type="button" className="ghost" onClick={useMyLocation}>
                📍 Use my location
              </button>
            </div>
            {zipMsg && <p className="jr-note">{zipMsg}</p>}

            <p className="jr-tap">Then tap your field on the map.</p>
            <MapPicker point={point} onPick={pick} focus={focus} />

            <p className="jr-examples">
              No field handy? Try an example:{" "}
              {DEMO_FARMS.map((d) => (
                <button
                  key={d.name}
                  type="button"
                  className="chip-btn"
                  onClick={() => {
                    setWater(d.irrigated ? "full" : "rain");
                    void pick(d.lat, d.lon);
                  }}
                >
                  {DEMO_SHORT[d.name] ?? d.name}
                </button>
              ))}
            </p>

            <FieldWatchCard />

            {point && (
              <div className="jr-found" aria-live="polite">
                {fieldLoading ? (
                  <p className="loading">Looking up your field…</p>
                ) : field ? (
                  <>
                    <div className="jr-found-text">
                      <p className="field-place">📍 {place ?? "Your field"}</p>
                      <p className="jr-found-line">
                        <span>Soil:</span> {soil?.available ? [soilName(soil.mapUnitName ?? soil.componentName), soil.drainageClass?.toLowerCase()].filter(Boolean).join(", ") : "not mapped here, so we'll use typical values"}
                      </p>
                      {recentHistory.length > 0 && (
                        <div className="jr-found-line">
                          <span>Seen from space:</span>
                          <span className="chips">
                            {recentHistory.map((y) => (
                              <span key={y.year} className="chip chip-sm" style={{ background: y.crop ? CROP_COLORS[y.crop] : "var(--crop-fallow)" }}>
                                {y.year} {y.cdlName}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      {looksDeveloped && (
                        <p className="jr-found-line jr-warn" role="note">
                          ⚠️ Satellite crop maps show town or buildings here, not farmland. Tap the middle of your field on the map for a better plan.
                        </p>
                      )}
                    </div>
                    <button type="button" className="primary" onClick={() => go("questions")}>
                      Yes, this is my field →
                    </button>
                  </>
                ) : null}
              </div>
            )}
            {error && step === "field" && (
              <p className="error" role="alert">
                {error}
              </p>
            )}
          </section>
        )}

        {/* ---------- Step 2: three quick questions ---------- */}
        {step === "questions" && field && (
          <section className="jr-card" aria-labelledby="s2">
            <h1 id="s2" className="jr-title">Three quick questions</h1>
            <p className="jr-lead">{place ? `About your field in ${place}.` : "About your field."}</p>

            <fieldset className="jr-q">
              <legend>
                <span className="jr-qn">1</span> What did you grow in {THIS_SEASON}?
              </legend>
              {guessed && <p className="jr-note">We guessed from satellite maps. Change it if it's wrong.</p>}
              <div className="jr-tiles jr-tiles-crops" role="radiogroup">
                {CROP_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="radio"
                    aria-checked={thisYear === c.id}
                    className={thisYear === c.id ? "on" : ""}
                    onClick={() => {
                      setThisYear(c.id);
                      setGuessed(false);
                    }}
                  >
                    <span className="jr-swatch" style={{ background: CROP_COLORS[c.id] }} />
                    {c.label}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="jr-q">
              <legend>
                <span className="jr-qn">2</span> How is it watered?
              </legend>
              <p className="jr-note">Check your <Definition term="irrigation-allocation" />; the model allowance is not measured pumping or a legal water right.</p>
              <div className="jr-tiles jr-tiles-3" role="radiogroup">
                {(["rain", "limited", "full"] as WaterLevel[]).map((v) => (
                  <button key={v} type="button" role="radio" aria-checked={water === v} className={water === v ? "on" : ""} onClick={() => setWater(v)}>
                    <b>
                      {v === "rain" ? "🌧️" : WATER_LABELS[v].icon} {WATER_LABELS[v].title}
                    </b>
                    <small>{v === "rain" ? "No watering system" : WATER_LABELS[v].hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="jr-q">
              <legend>
                <span className="jr-qn">3</span> What matters most to you?
              </legend>
              <div className="jr-tiles jr-tiles-2" role="radiogroup">
                {PRIORITIES.map((p) => (
                  <button key={p.id} type="button" role="radio" aria-checked={priority === p.id} className={priority === p.id ? "on" : ""} onClick={() => setPriority(p.id)}>
                    <b>{p.label}</b>
                    <small>{p.hint}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <div className="jr-actions">
              <button type="button" className="ghost" onClick={() => go("field")}>
                ← Back
              </button>
              <button type="button" className="primary" disabled={!thisYear || planLoading} onClick={() => void run()}>
                {thisYear ? "Show my plan →" : "Pick what you grew to continue"}
              </button>
            </div>
          </section>
        )}

        {/* ---------- Step 3: the plan ---------- */}
        {step === "plan" && (
          <section aria-live="polite">
            {planLoading && (
              <div className="jr-card jr-loading">
                <div className="jr-hero">
                  <Sprout mood="checking" width={84} />
                  <div>
                    <h1 className="jr-title">Building your plan…</h1>
                    <p className="jr-lead">Sprout is checking the NASA data for your field.</p>
                  </div>
                </div>
                <ul className="jr-loading-steps">
                  {LOADING_STEPS.map((s, i) => (
                    <li key={s} className={i < loadingStep ? "done" : i === loadingStep ? "now" : ""}>
                      <span className="jr-dot">{i < loadingStep ? "✓" : ""}</span>
                      {s}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && !planLoading && (
              <div className="jr-card">
                <p className="error" role="alert">
                  {error}
                </p>
                <div className="jr-actions">
                  <button type="button" className="ghost" onClick={() => go("questions")}>
                    ← Back
                  </button>
                  <button type="button" className="primary" onClick={() => void run()}>
                    Try again
                  </button>
                </div>
              </div>
            )}

            {plan && !planLoading && !best && <div className="jr-card" role="status"><h1 className="jr-title">No feasible rotation found</h1><DecisionNotice /><p>Review your crop history, water assumptions and priorities. Missing evidence is not a zero score.</p><button type="button" className="ghost" onClick={() => go("questions")}>Review inputs</button></div>}

            {plan && !planLoading && best && (
              <>
                <div className="jr-card jr-answer">
                  <div className="jr-hero">
                    <Sprout mood="crop-match" width={84} />
                    <div>
                      <p className="eyebrow">
                        Our advice for {plan.location.county ? `${plan.location.county.countyName}, ${plan.location.county.stateCode}` : "your field"}
                      </p>
                      <h1 className="jr-title">{planSentence(best)}</h1>
                    </div>
                  </div>
                  <DecisionNotice />
                  <TopPlan plan={best} compareTo={plan.currentPractice} />
                  <PlanAssumptions plan={best} water={plan.water ?? water} />
                  <BadYears plan={best} current={plan.currentPractice} />
                  {(plan.water ?? water) === "rain" && Math.max(...plan.plans.map((p) => p.avgNetReturnPerAcre)) < 15 && (
                    <p className="jr-tradeoff">
                      At today's prices, none of the rotations we compared reliably makes money on this field without irrigation. This plan is the best balance of cost, risk and soil: it
                      fails less often and protects the ground until prices or water improve.
                    </p>
                  )}
                  {tradeoff(best, plan.currentPractice) && <p className="jr-tradeoff">{tradeoff(best, plan.currentPractice)}</p>}
                  <p className="jr-context">
                    Based on: {CROP_OPTIONS.find((c) => c.id === thisYear)?.label.toLowerCase()} in {THIS_SEASON} · {WATER_LABELS[plan.water ?? water].title.toLowerCase()} ·{" "}
                    {PRIORITIES.find((p) => p.id === priority)?.label.toLowerCase()}{" "}
                    <button type="button" className="link-btn" onClick={() => go("questions")}>
                      Change
                    </button>
                  </p>
                </div>

                {plan.waterOptions && plan.waterOptions.length > 1 && (
                  <div className="jr-card">
                    <h2 className="jr-h2">What if your water changes?</h2>
                    <WaterOptions options={plan.waterOptions} current={plan.water ?? water} busy={planLoading} onChoose={(w) => void run(w)} />
                  </div>
                )}

                {plan.droughtReplays && plan.droughtReplays.length > 0 && (
                  <div className="jr-card">
                    <h2 className="jr-h2">Replay a bad year on your field</h2>
                    <DroughtReplay key={`${plan.generatedAt}-${plan.water}`} replays={plan.droughtReplays} />
                  </div>
                )}

                {/* stretch: data evidence */}
                <UsdmContext plan={plan} />
                <WindScreenCard plan={plan} />
                <EconomicsCard plan={plan} />
                <SmapCard plan={plan} />
                {/* /stretch: data evidence */}

                <div className="jr-card">
                  <h2 className="jr-h2">Why we suggest this</h2>
                  <ul className="reasons">
                    {topReasons(plan.facts).map((f) => (
                      <li key={f.id + f.text}>{plain(f.text)}</li>
                    ))}
                  </ul>
                </div>

                <div className="jr-card">
                  <h2 className="jr-h2">How this plan builds your soil</h2>
                  <SoilBuild plan={best} />
                </div>

                <SecondOpinion
                  countyFips={plan.location.county?.countyFips ?? null}
                  plan={best}
                  history={plan.cropHistory}
                  irrigated={(plan.water ?? water) !== "rain"}
                />

                {((plan.validation && plan.validation.length > 0) || plan.waterCheck) && (
                  <div className="jr-card">
                    <h2 className="jr-h2">Checked against real harvests</h2>
                    <HarvestCheck
                      validation={plan.validation ?? []}
                      waterCheck={plan.waterCheck}
                      irrigated={(plan.water ?? water) !== "rain"}
                      planCrops={best.years.map((y) => y.crop)}
                      place={plan.location.county ? `${plan.location.county.countyName}, ${plan.location.county.stateCode}` : null}
                    />
                  </div>
                )}

                <DataEvidence plan={plan} />

                <details className="jr-more">
                  <summary>Compare with other options</summary>
                  <ul className="plan-list">
                    <PlanRow plan={best} title="Our pick" compareTo={plan.currentPractice} />
                    {others.map((p, i) => (
                      <Fragment key={p.id}>
                        <PlanRow plan={p} title={`Option ${i + 2}`} compareTo={plan.currentPractice} />
                        <li><PlanAssumptions plan={p} water={plan.water ?? water} /></li>
                      </Fragment>
                    ))}
                    {plan.currentPractice && <>
                      <PlanRow plan={plan.currentPractice} title="Keep doing what you do" muted />
                      <li><PlanAssumptions plan={plan.currentPractice} water={plan.water ?? water} /></li>
                    </>}
                  </ul>
                </details>

                <details className="jr-more">
                  <summary>How the weather on your field has changed</summary>
                  <p className="hint">
                    {plan.climate.firstYear}–{plan.climate.lastYear}, from NASA data: a <Definition term="regional-grid" />, not an individual field station.
                  </p>
                  {changes.length > 0 ? (
                    <ul className="changes">
                      {changes.map((c) => (
                        <li key={c.id}>
                          <span className={`arrow arrow-${trendTone(c)}`}>{trendTone(c) === "up" ? "▲" : "▼"}</span>
                          <b>{c.label}</b>
                          <span>{trendText(c)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>No big changes in the weather on this field.</p>
                  )}
                  <details className="charts">
                    <summary>Show charts</summary>
                    <div className="trends">
                      {plan.climate.indicators.map((ind) => (
                        <TrendChart key={ind.id} ind={ind} />
                      ))}
                    </div>
                  </details>
                </details>

                <details className="jr-more">
                  <summary>What the satellite measures mean</summary>
                  <IndicatorGuide />
                </details>

                <details className="jr-more">
                  <summary>Satellite data vs. measurements on the ground</summary>
                  <SatelliteNote />
                </details>

                <details className="jr-more">
                  <summary>All the reasons ({plan.facts.length})</summary>
                  <ul className="reasons">
                    {plan.facts.map((f) => (
                      <li key={f.id + f.text}>{plain(f.text)}</li>
                    ))}
                  </ul>
                </details>

                {/* stretch: data evidence */}
                <HistoricalScenarios key={`${plan.request.lat}:${plan.request.lon}`} lat={plan.request.lat} lon={plan.request.lon} />
                {/* /stretch: data evidence */}

                <form className="jr-card ask" onSubmit={ask}>
                  <h2 className="jr-h2">
                    <label htmlFor="q">Have a question about this plan?</label>
                  </h2>
                  <div className="ask-row">
                    <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="e.g. Why not corn next year?" maxLength={300} />
                    <button type="submit" className="primary small" disabled={asking || !question.trim()}>
                      {asking ? "…" : "Ask"}
                    </button>
                  </div>
                  {answer && (
                    <p className="answer">
                      <b>{answer.q}</b>
                      <br />
                      {answer.a}
                    </p>
                  )}
                </form>

                <details className="fine">
                  <summary>Source bibliography and model assumptions</summary>
                  <ul>
                    {plan.dataSources.map((d) => (
                      <li key={d.name}>
                        <a href={d.url} target="_blank" rel="noreferrer">
                          {d.name}
                        </a>{" "}
                        — {d.usedFor}
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {plan.assumptions.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </details>

                <p className="jr-restart">
                  <button type="button" className="link-btn" onClick={startOver}>
                    ↺ Start over with another field
                  </button>
                </p>
              </>
            )}
          </section>
        )}
      </main>
      <footer className="foot">Soil Sense · A crop consultant in every farmer's pocket · Data from NASA and USDA</footer>
    </div>
  );
}
