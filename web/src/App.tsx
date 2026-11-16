import "./i18n.css";
import { useI18n, translate, translateKnown, cropName } from "./i18n";
import type { Language, TranslationKey } from "./i18n";
import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CropId, FieldResponse, Goal, PlanRequest, PlanResponse, Priority, ReasonFact, RotationPlan, WaterLevel } from "../../src/shared/types";
import { MeasurementPanel, SoilComparison } from "./components/Measurements";
import type { FarmerConstraints } from '../../src/shared/constraints';
import { ConstraintsPanel, ConstraintSummary } from './components/ConstraintsPanel';
import { GoalPicker } from "./components/GoalPicker";
import { Glossary, Definition } from "./components/Glossary";
import { askQuestion, fetchField, fetchPlan } from "./api";
import { DataEvidence, DecisionNotice, evidenceText } from "./components/DataEvidence";
import { PlanAssumptions } from "./components/PlanAssumptions";
import { DEMO_FARMS, MapPicker } from "./components/MapPicker";
import { HarvestCheck, SatelliteNote } from "./components/HarvestCheck";
import { BadYears, DroughtReplay, WATER_LABELS, WaterOptions } from "./components/WhatIf";
import { IndicatorGuide, SoilBuild } from "./components/SoilBuild";
import { SecondOpinion } from "./components/SecondOpinion";
import { CROP_COLORS, PlanRow, TopPlan } from "./components/PlanCard";
import { LogoMark } from "./components/Logo";
import { Sprout } from "./components/Sprout";

import { VegetationCard } from "./components/VegetationCard";

import { CropTimingEvidence } from "./components/CropTimingEvidence";
import { SmapCard } from "./components/SmapCard";
import { GraceWellsCard } from "./components/GraceWellsCard";
import { EconomicsCard } from "./components/EconomicsCard";
import { HistoricalScenarios } from "./components/HistoricalScenarios";

import { FieldWatchCard } from "./components/FieldWatchCard";
import { UsdmContext } from "./components/UsdmContext";
import { WindScreenCard } from "./components/WindScreenCard";
import { TrendChart, trendText, trendTone } from "./components/TrendChart";

// A simple three-step journey: 1) find your field, 2) three quick questions, 3) your plan.
// One thing on screen at a time, with the answer first and the details folded away.

const CROP_OPTIONS: { id: CropId; label: TranslationKey }[] = [
  { id: "corn", label: "Corn" },
  { id: "soybean", label: "Soybean" },
  { id: "winter_wheat", label: "Winter wheat" },
  { id: "oats", label: "Oats" },
  { id: "alfalfa", label: "Alfalfa / hay" },
  { id: "sorghum", label: "Grain sorghum" },
  { id: "fallow", label: "Fallow (no crop)" },
];

const PRIORITIES: { id: Priority; label: TranslationKey; hint: TranslationKey }[] = [
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

const LOADING_STEPS: TranslationKey[] = ["Reading 35 years of NASA weather for your field", "Checking the soil under it", "Comparing about a thousand 3-year crop plans", "Picking the best fit for you"];

const waterText: Record<WaterLevel, { title: TranslationKey; hint: TranslationKey }> = {
  rain: { title: "Rain only", hint: "No watering system" },
  limited: { title: "Limited water", hint: "About 10 in a year: a declining well or an allocation" },
  full: { title: "Full irrigation", hint: "Water whenever the crop needs it" },
};

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
function tradeoff(best: RotationPlan, current: RotationPlan | null, language: Language): string | null {
  if (!current) return null;
  const less = Math.round(current.avgNetReturnPerAcre - best.avgNetReturnPerAcre);
  if (less < 5) return null;
  // Use the same bad-years numbers shown in the dots above, so the page never contradicts itself.
  const nowOk = 10 - current.badYearsIn10;
  const oursOk = 10 - best.badYearsIn10;
  return translate(language, oursOk <= nowOk ? "Lower return tradeoff" : "Risk return tradeoff", { less, now: nowOk, ours: oursOk });
}

function soilName(name: string | undefined): string | undefined {
  return name?.split(",")[0]?.trim();
}

/** "Grow soybean in 2027, corn in 2028, then soybean in 2029." */
function planSentence(p: RotationPlan, language: Language): string {
  if (language === "es") {
    const parts = p.years.map((y) => y.crop === "fallow" ? `dejar la parcela en barbecho en ${y.year}` : `cultivar ${cropName(y.crop, language).toLowerCase()} en ${y.year}`);
    return `Recomendamos ${parts.slice(0, -1).join(", ")}${parts.length > 1 ? " y después " : ""}${parts.at(-1)}.`;
  }
  const parts = p.years.map((y) => (y.crop === "fallow" ? `rest the field in ${y.year}` : `${y.cropName.toLowerCase()} in ${y.year}`));
  const body = parts.length > 1 ? `${parts.slice(0, -1).join(", ")}, then ${parts[parts.length - 1]}` : parts[0];
  return `Grow ${body}.`.replace(/^Grow rest/, "Rest");
}

function Progress({ step, canGo, go }: { step: Step; canGo: (s: Step) => boolean; go: (s: Step) => void }) {
  const { t } = useI18n();
  const items: { id: Step; label: TranslationKey }[] = [
    { id: "field", label: "Your field" },
    { id: "questions", label: "3 questions" },
    { id: "plan", label: "Your plan" },
  ];
  const at = items.findIndex((i) => i.id === step);
  return (
    <ol className="jr-progress" aria-label={t("Progress")}>
      {items.map((it, i) => (
        <li key={it.id} className={i < at ? "done" : i === at ? "now" : ""}>
          <button type="button" disabled={!canGo(it.id) || i === at} onClick={() => go(it.id)} aria-current={i === at ? "step" : undefined}>
            <span className="jr-dot">{i < at ? "✓" : i + 1}</span>
            {t(it.label)}
          </button>
        </li>
      ))}
    </ol>
  );
}

export function App() {
  return <MainFlow />;
}

function MainFlow() {
  const { language, setLanguage, t } = useI18n();
  const [step, setStep] = useState<Step>("field");
  const [point, setPoint] = useState<{ lat: number; lon: number } | null>(null);
  const [focus, setFocus] = useState<{ lat: number; lon: number; zoom: number; key: number } | null>(null);
  const [zip, setZip] = useState("");
  const [zipMsg, setZipMsg] = useState<{ key: TranslationKey; values?: Record<string, string | number> } | null>(null);
  const [field, setField] = useState<FieldResponse | null>(null);
  const [fieldLoading, setFieldLoading] = useState(false);
  const [thisYear, setThisYear] = useState<CropId | "">("");
  const [guessed, setGuessed] = useState(false);
  const [water, setWater] = useState<WaterLevel>("rain");
  const [priority, setPriority] = useState<Priority>("balanced");
  const [constraints, setConstraints] = useState<FarmerConstraints | undefined>();
  const [constraintsValid, setConstraintsValid] = useState(true);
  const changeConstraints = useCallback((value: FarmerConstraints | undefined, valid: boolean) => { setConstraints(value); setConstraintsValid(valid); }, []);
  const [goals, setGoals] = useState<Goal[]>([]);
  const [plan, setPlan] = useState<PlanResponse | null>(null);
  const [planLoading, setPlanLoading] = useState(false);
  const [loadingStep, setLoadingStep] = useState(0);
  const [error, setError] = useState<TranslationKey | null>(null);
  const [measurements, setMeasurements] = useState<Pick<PlanRequest, "soilTest" | "yieldRecords">>({});
  const [measurementsValid, setMeasurementsValid] = useState(true);
  const changeMeasurements = useCallback((value: Pick<PlanRequest, "soilTest" | "yieldRecords">, valid: boolean) => { setMeasurements(value); setMeasurementsValid(valid); }, []);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<{ q: string; a: string } | null>(null);
  const [asking, setAsking] = useState(false);
  const fieldAbort = useRef<AbortController | null>(null);
  const planAbort = useRef<AbortController | null>(null);
  const top = useRef<HTMLDivElement>(null);

  const go = useCallback((s: Step) => {
    setStep(s);
    requestAnimationFrame(() => {
      top.current?.focus({ preventScroll: true });
      top.current?.scrollIntoView({ behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "instant" : "smooth", block: "start" });
    });
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
        setError("We couldn't load your field. Try again or select another field.");
      }
    } finally {
      if (fieldAbort.current === ctrl) setFieldLoading(false);
    }
  }, []);

  const findZip = async (e: React.FormEvent) => {
    e.preventDefault();
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) {
      setZipMsg({ key: "Enter a 5-digit US ZIP code." });
      return;
    }
    setZipMsg({ key: "Looking it up…" });
    try {
      const res = await fetch(`https://api.zippopotam.us/us/${z}`);
      if (!res.ok) throw new Error();
      const j = (await res.json()) as { places?: { "place name": string; "state abbreviation": string; latitude: string; longitude: string }[] };
      const pl = j.places?.[0];
      if (!pl) throw new Error();
      setFocus({ lat: Number(pl.latitude), lon: Number(pl.longitude), zoom: 12, key: Date.now() });
      setZipMsg({ key: "Showing {place}. Now tap your field on the map.", values: { place: `${pl["place name"]}, ${pl["state abbreviation"]}` } });
    } catch {
      setZipMsg({ key: "We couldn't find that ZIP code. Try another, or tap the map." });
    }
  };

  const useMyLocation = () => {
    if (!("geolocation" in navigator)) {
      setZipMsg({ key: "Your browser can't share its location. Tap the map instead." });
      return;
    }
    setZipMsg({ key: "Finding you…" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setFocus({ lat: pos.coords.latitude, lon: pos.coords.longitude, zoom: 14, key: Date.now() });
        void pick(pos.coords.latitude, pos.coords.longitude);
      },
      () => setZipMsg({ key: "We couldn't get your location. Type a ZIP code or tap the map." }),
      { timeout: 10000 },
    );
  };

  const lastMapped = useMemo(() => [...(field?.cropHistory.years ?? [])].reverse().find((y) => y.crop) ?? null, [field]);

  const run = useCallback(async (waterOverride?: WaterLevel) => {
    if (!point || !thisYear || !measurementsValid || !constraintsValid) return;
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
      const res = await fetchPlan({ lat: point.lat, lon: point.lon, irrigated: w !== "rain", water: w, priority, goals, ...(constraints ? { constraints } : {}), recentCrops, language, ...measurements }, ctrl.signal);
      setPlan(res);
      setAnswer(null);
    } catch (e) {
      if ((e as Error).name !== "AbortError") setError("We couldn't build your plan. Please try again.");
    } finally {
      if (planAbort.current === ctrl) setPlanLoading(false);
    }
  }, [point, thisYear, water, priority, goals, lastMapped, go, language, measurements, measurementsValid, constraints, constraintsValid]);

  // Regenerate the server summary when switching languages on an existing result.
  useEffect(() => {
    if (step === "plan" && plan && !planLoading && (plan.request.language ?? "en") !== language) void run();
  }, [language, plan, planLoading, run, step]);

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
      setAnswer({ q: question, a: t("We couldn't answer your question. Please try again.") });
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
        <span className="topbar-tag">{t("Teaching satellites to speak Farmer")}</span>
        <div role="group" aria-label={t("Language")} className="language-switch">
          {/* WCAG 2.5.3: the accessible name starts with the visible "EN"/"ES", so voice users can say what they see. */}
          <button type="button" lang="en" aria-label="EN English" aria-pressed={language === "en"} onClick={() => setLanguage("en")}>EN</button>
          <span aria-hidden="true"> / </span>
          <button type="button" lang="es" aria-label="ES Español" aria-pressed={language === "es"} onClick={() => setLanguage("es")}>ES</button>
        </div>
      </header>

      <main className="jr-main" ref={top} tabIndex={-1} aria-label={t("Crop rotation planner")}>
        <Progress step={step} canGo={canGo} go={go} />
        <Glossary />

        {/* ---------- Step 1: find the field ---------- */}
        {step === "field" && (
          <section className="jr-card" aria-labelledby="s1">
            <div className="jr-hero">
              <Sprout mood="hello" width={96} />
              <div>
                <p className="eyebrow">{t("Hi, I'm Sprout")}</p>
                <h1 id="s1" className="jr-title">{t("Where is your field?")}</h1>
                <p className="jr-lead">{t("We'll look at 35 years of weather and the soil under that exact spot, then suggest what to grow for the next 3 years.")}</p>
              </div>
            </div>

            <div className="jr-find">
              <form className="jr-zip" onSubmit={findZip}>
                <input inputMode="numeric" maxLength={5} placeholder={t("ZIP code")} aria-label={t("ZIP code")} value={zip} onChange={(e) => setZip(e.target.value.replace(/\D/g, ""))} />
                <button type="submit" className="ghost">
                  {t("Go")}
                </button>
              </form>
              <span className="jr-or">{t("or")}</span>
              <button type="button" className="ghost" onClick={useMyLocation}>
                {t("📍 Use my location")}
              </button>
            </div>
            {/* WCAG 4.1.3: ZIP lookup results are announced to screen readers. */}
            <p className="jr-note" role="status">
              {zipMsg && t(zipMsg.key, zipMsg.values)}
            </p>

            <p className="jr-tap">{t("Then tap your field on the map.")}</p>
            <MapPicker point={point} onPick={pick} focus={focus} />

            <p className="jr-examples">
              {t("No field handy? Try an example:")}{" "}
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
                  <p className="loading">{t("Looking up your field…")}</p>
                ) : field ? (
                  <>
                    <div className="jr-found-text">
                      <p className="field-place">📍 {place ?? t("Your field")}</p>
                      <p className="jr-found-line">
                        <span>{t("Soil:")}</span> {soil?.available ? [soilName(soil.mapUnitName ?? soil.componentName), soil.drainageClass?.toLowerCase()].filter(Boolean).join(", ") : t("not mapped here, so we'll use typical values")}
                      </p>
                      {recentHistory.length > 0 && (
                        <div className="jr-found-line">
                          <span>{t("Seen from space:")}</span>
                          <span className="chips">
                            {recentHistory.map((y) => (
                              <span key={y.year} className="chip chip-sm" style={{ background: y.crop ? CROP_COLORS[y.crop] : "var(--crop-fallow)" }}>
                                {y.year} {y.crop ? cropName(y.crop, language) : y.cdlName}
                              </span>
                            ))}
                          </span>
                        </div>
                      )}
                      {looksDeveloped && (
                        <p className="jr-found-line jr-warn" role="note">
                          {t("⚠️ Satellite crop maps show town or buildings here, not farmland. Tap the middle of your field on the map for a better plan.")}
                        </p>
                      )}
                    </div>
                    <button type="button" className="primary" onClick={() => go("questions")}>
                      {t("Yes, this is my field →")}
                    </button>
                  </>
                ) : null}
              </div>
            )}
            {error && step === "field" && (
              <p className="error" role="alert">
                {t(error)}
              </p>
            )}
          </section>
        )}

        {/* ---------- Step 2: three quick questions ---------- */}
        {step === "questions" && field && (
          <section className="jr-card" aria-labelledby="s2">
            <h1 id="s2" className="jr-title">{t("Three quick questions")}</h1>
            <p className="jr-lead">{place ? t("About your field in {place}.", { place }) : t("About your field.")}</p>

            <fieldset className="jr-q">
              <legend>
                <span className="jr-qn">1</span> {t("What did you grow in {year}?", { year: THIS_SEASON })}
              </legend>
              {guessed && <p className="jr-note">{t("We guessed from satellite maps. Change it if it's wrong.")}</p>}
              <div className="jr-tiles jr-tiles-crops" role="group" aria-label={t("Crop grown this season")}>
                {CROP_OPTIONS.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    role="button"
                    aria-pressed={thisYear === c.id}
                    className={thisYear === c.id ? "on" : ""}
                    onClick={() => {
                      setThisYear(c.id);
                      setGuessed(false);
                    }}
                  >
                    <span className="jr-swatch" style={{ background: CROP_COLORS[c.id] }} />
                    {t(c.label)}
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="jr-q">
              <legend>
                <span className="jr-qn">2</span> {t("How is it watered?")}
              </legend>
              <p className="jr-note">{language === "es" ? t("Check your irrigation allocation; the model allowance is not measured pumping or a legal water right.") : <>Check your <Definition term="irrigation-allocation" />; the model allowance is not measured pumping or a legal water right.</>}</p>
              <div className="jr-tiles jr-tiles-3" role="group" aria-label={t("Water supply")}>
                {(["rain", "limited", "full"] as WaterLevel[]).map((v) => (
                  <button key={v} type="button" role="button" aria-pressed={water === v} className={water === v ? "on" : ""} onClick={() => setWater(v)}>
                    <b>
                      {v === "rain" ? "🌧️" : WATER_LABELS[v].icon} {t(waterText[v].title)}
                    </b>
                    <small>{t(waterText[v].hint)}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <fieldset className="jr-q">
              <legend>
                <span className="jr-qn">3</span> {t("What matters most to you?")}
              </legend>
              <div className="jr-tiles jr-tiles-2" role="group" aria-label={t("Your priority")}>
                {PRIORITIES.map((p) => (
                  <button key={p.id} type="button" aria-pressed={priority === p.id} className={priority === p.id ? "on" : ""} onClick={() => setPriority(p.id)}>
                    <b>{t(p.label)}</b>
                    <small>{t(p.hint)}</small>
                  </button>
                ))}
              </div>
            </fieldset>

            <GoalPicker value={goals} onChange={setGoals} water={water} />
            <ConstraintsPanel value={constraints} onChange={changeConstraints} />
            {point && <MeasurementPanel key={`${point.lat},${point.lon}`} fieldKey={`${point.lat},${point.lon}`} soil={field.soil} onChange={changeMeasurements} />}

            <div className="jr-actions">
              <button type="button" className="ghost" onClick={() => go("field")}>
                {t("← Back")}
              </button>
              <button type="button" className="primary" disabled={!thisYear || planLoading || !measurementsValid || !constraintsValid} onClick={() => void run()}>
                {thisYear ? t("Show my plan →") : t("Pick what you grew to continue")}
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
                    <h1 className="jr-title">{t("Building your plan…")}</h1>
                    <p className="jr-lead">{t("Sprout is checking the NASA data for your field.")}</p>
                  </div>
                </div>
                <ul className="jr-loading-steps">
                  {LOADING_STEPS.map((s, i) => (
                    <li key={s} className={i < loadingStep ? "done" : i === loadingStep ? "now" : ""}>
                      <span className="jr-dot">{i < loadingStep ? "✓" : ""}</span>
                      {t(s)}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {error && !planLoading && (
              <div className="jr-card">
                <p className="error" role="alert">
                  {t(error)}
                </p>
                <div className="jr-actions">
                  <button type="button" className="ghost" onClick={() => go("questions")}>
                    {t("← Back")}
                  </button>
                  <button type="button" className="primary" onClick={() => void run()}>
                    {t("Try again")}
                  </button>
                </div>
              </div>
            )}

            {plan && !planLoading && <ConstraintSummary report={plan.constraints} currentPractice={plan.currentPractice} />}
            {plan && !planLoading && !best && <div className="jr-card" role="status"><h1 className="jr-title">{t("No feasible rotation found")}</h1><DecisionNotice /><p>{t("Review your crop history, water assumptions and priorities. Missing evidence is not a zero score.")}</p><button type="button" className="ghost" onClick={() => go("questions")}>{t("Review inputs")}</button></div>}

            {plan && !planLoading && best && (
              <>
                <div className="jr-card jr-answer">
                  <div className="jr-hero">
                    <Sprout mood="crop-match" width={84} />
                    <div>
                      <p className="eyebrow">
                        {t("Our advice for")} {plan.location.county ? `${plan.location.county.countyName}, ${plan.location.county.stateCode}` : t("Your field")}
                      </p>
                      <h1 className="jr-title">{planSentence(best, language)}</h1>
                    </div>
                  </div>
                  <DecisionNotice />
                  <TopPlan plan={best} compareTo={plan.currentPractice} summary={plan.explanation.summary} />
                  <PlanAssumptions plan={best} water={plan.water ?? water} />
                  <BadYears plan={best} current={plan.currentPractice} />
                  {(plan.water ?? water) === "rain" && Math.max(...plan.plans.map((p) => p.avgNetReturnPerAcre)) < 15 && (
                    <p className="jr-tradeoff">
                      {t("Low return warning")}
                    </p>
                  )}
                  {tradeoff(best, plan.currentPractice, language) && <p className="jr-tradeoff">{tradeoff(best, plan.currentPractice, language)}</p>}
                  <p className="jr-context">
                    {t("Based on:")} {thisYear && cropName(thisYear, language).toLowerCase()} ({THIS_SEASON}) · {t(waterText[plan.water ?? water].title).toLowerCase()} ·{" "}
                    {t(PRIORITIES.find((p) => p.id === priority)!.label).toLowerCase()}{" "}
                    <button type="button" className="link-btn" onClick={() => go("questions")}>
                      {t("Change")}
                    </button>
                  </p>
                </div>

                {plan.waterOptions && plan.waterOptions.length > 1 && (
                  <div className="jr-card">
                    <h2 className="jr-h2">{t("What if your water changes?")}</h2>
                    <WaterOptions options={plan.waterOptions} current={plan.water ?? water} busy={planLoading} onChoose={(w) => void run(w)} />
                  </div>
                )}

                {plan.droughtReplays && plan.droughtReplays.length > 0 && (
                  <div className="jr-card">
                    <h2 className="jr-h2">{t("Replay a bad year on your field")}</h2>
                    <DroughtReplay key={`${plan.generatedAt}-${plan.water}`} replays={plan.droughtReplays} />
                  </div>
                )}

                {/* stretch: data evidence */}
                <UsdmContext plan={plan} />
                <WindScreenCard plan={plan} />
                <EconomicsCard plan={plan} />
                <VegetationCard plan={plan} />
                <SmapCard plan={plan} />
                <GraceWellsCard plan={plan} />
                {/* /stretch: data evidence */}

                <div className="jr-card">
                  <h2 className="jr-h2">{t("Why we suggest this")}</h2>
                  <ul className="reasons">
                    {topReasons(plan.facts).map((f) => (
                      <li key={f.id + f.text}>{plain(f.text)}</li>
                    ))}
                  </ul>
                </div>

                <div className="jr-card">
                  <h2 className="jr-h2">{t("How this plan builds your soil")}</h2>
                  <SoilBuild plan={best} />
                </div>

                <SecondOpinion
                  countyFips={plan.location.county?.countyFips ?? null}
                  plan={best}
                  history={plan.cropHistory}
                  recentCrops={plan.request.recentCrops}
                  irrigated={(plan.water ?? water) !== "rain"}
                />

                {((plan.validation && plan.validation.length > 0) || plan.waterCheck) && (
                  <div className="jr-card">
                    <h2 className="jr-h2">{t("Checked against real harvests")}</h2>
                    <HarvestCheck
                      validation={plan.validation ?? []}
                      waterCheck={plan.waterCheck}
                      irrigated={(plan.water ?? water) !== "rain"}
                      planCrops={best.years.map((y) => y.crop)}
                      place={plan.location.county ? `${plan.location.county.countyName}, ${plan.location.county.stateCode}` : null}
                    />
                  </div>
                )}




                {(plan.request.soilTest || plan.request.yieldRecords?.length) && <div className="jr-card">
                  <h2 className="jr-h2">{t("Your measurements in this plan")}</h2>
                  {plan.request.soilTest && <SoilComparison soil={plan.soil} test={plan.request.soilTest} />}
                  <ul className="reasons">{plan.facts.filter((f) => f.id.startsWith("farmer-")).map((f) => <li key={f.id}>{f.text}</li>)}</ul>
                </div>}
                <DataEvidence plan={plan} />

                <details className="jr-more">
                  <summary>{t("Compare with other options")}</summary>
                  <ul className="plan-list">
                    <PlanRow plan={best} title={t("Our pick")} compareTo={plan.currentPractice} />
                    {others.map((p, i) => (
                      <Fragment key={p.id}>
                        <PlanRow plan={p} title={t("Option {number}", { number: i + 2 })} compareTo={plan.currentPractice} />
                        <li><PlanAssumptions plan={p} water={plan.water ?? water} /></li>
                      </Fragment>
                    ))}
                    {plan.currentPractice && <>
                      <PlanRow plan={plan.currentPractice} title={t("Keep doing what you do")} muted />
                      <li><PlanAssumptions plan={plan.currentPractice} water={plan.water ?? water} /></li>
                    </>}
                  </ul>
                </details>

                <details className="jr-more">
                  <summary>{t("How the weather on your field has changed")}</summary>
                  <p className="hint">
                    {plan.climate.firstYear}–{plan.climate.lastYear}, {t("from NASA data:")} <Definition term="regional-grid" />, {t("not an individual field station.")}
                  </p>
                  {changes.length > 0 ? (
                    <ul className="changes">
                      {changes.map((c) => (
                        <li key={c.id}>
                          <span className={`arrow arrow-${trendTone(c)}`}>{trendTone(c) === "up" ? "▲" : "▼"}</span>
                          <b>{translateKnown(language, c.label)}</b>
                          <span>{trendText(c, language)}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p>{t("No big changes in the weather on this field.")}</p>
                  )}
                  <details className="charts">
                    <summary>{t("Show charts")}</summary>
                    <div className="trends">
                      {plan.climate.indicators.map((ind) => (
                        <TrendChart key={ind.id} ind={ind} />
                      ))}
                    </div>
                  </details>
                </details>

                <details className="jr-more">
                  <summary>{t("What the satellite measures mean")}</summary>
                  <IndicatorGuide />
                </details>

                <details className="jr-more">
                  <summary>{t("Satellite data vs. measurements on the ground")}</summary>
                  <SatelliteNote />
                </details>

                <details className="jr-more">
                  <summary>{t("All the reasons")} ({plan.facts.length})</summary>
                  <ul className="reasons">
                    {plan.facts.map((f) => (
                      <li key={f.id + f.text}>{plain(f.text)}</li>
                    ))}
                  </ul>
                </details>

                {/* stretch: data evidence */}
                <CropTimingEvidence key={`${plan.request.lat}:${plan.request.lon}`} lat={plan.request.lat} lon={plan.request.lon} />
                <HistoricalScenarios key={`${plan.request.lat}:${plan.request.lon}`} lat={plan.request.lat} lon={plan.request.lon} />
                {/* /stretch: data evidence */}

                <form className="jr-card ask" onSubmit={ask}>
                  <h2 className="jr-h2">
                    <label htmlFor="q">{t("Have a question about this plan?")}</label>
                  </h2>
                  <div className="ask-row">
                    <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder={t("e.g. Why not corn next year?")} maxLength={300} />
                    <button type="submit" className="primary small" disabled={asking || !question.trim()}>
                      {asking ? "…" : t("Ask")}
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
                  <summary>{t("Source bibliography and model assumptions")}</summary>
                  <ul>
                    {plan.dataSources.map((d) => (
                      <li key={d.name}>
                        <a href={d.url} target="_blank" rel="noreferrer">
                          {d.name}
                        </a>{" "}
                        — {translateKnown(language, d.usedFor)}
                      </li>
                    ))}
                  </ul>
                  <ul>
                    {plan.assumptions.map((a) => (
                      <li key={a}>{evidenceText(a, language)}</li>
                    ))}
                  </ul>
                </details>

                <p className="jr-restart">
                  <button type="button" className="link-btn" onClick={startOver}>
                    {t("↺ Start over with another field")}
                  </button>
                </p>
              </>
            )}
          </section>
        )}
      </main>
      <footer className="foot">{t("Soil Sense · A crop consultant in every farmer's pocket · Data from NASA and USDA")}</footer>
    </div>
  );
}
