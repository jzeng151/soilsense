// @vitest-environment happy-dom
import { act, createElement as h, Fragment, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CropValidation, PlanResponse, RotationPlan, SecondOpinion, UsdmTimeline } from "../../../src/shared/types";
import { LanguageProvider, LANGUAGE_STORAGE_KEY, useI18n } from "../i18n";
import { GoalPicker } from "./GoalPicker";
import { EconomicsCard } from "./EconomicsCard";
import { CropTimingEvidence } from "./CropTimingEvidence";
import { HistoricalScenarios } from "./HistoricalScenarios";
import { PlanAssumptions } from "./PlanAssumptions";
import { DataEvidence } from "./DataEvidence";
import { SoilBuild, IndicatorGuide } from "./SoilBuild";
import { WaterOptions, DroughtReplay } from "./WhatIf";
import { HarvestCheck, SatelliteNote } from "./HarvestCheck";
import { Glossary } from "./Glossary";
import { SecondOpinionCard } from "./SecondOpinion";
import { SmapCard } from "./SmapCard";
import { GraceWellsCard } from "./GraceWellsCard";
import { VegetationCard } from "./VegetationCard";
import { WindScreenCard, windReason } from "./WindScreenCard";
import { evidenceText } from "./DataEvidence";
import { protectionFor, WIND_RULE, WIND_LIMITATIONS } from "../../../src/engine/windErosion";
import { compareGroundwater } from "../../../src/engine/groundwater";
import groundwater from "../../../data/grace-wells-finney.json";
import savedOpinion from "../../../kansas-crop-rotation/data/app_rotation_advice.json";
import { ASSUMPTIONS } from "../../../src/engine/plan";
import { translateKnown } from "../i18n";
import { AuthPage } from "../pages/AuthPage";
import { UsdmContext } from "./UsdmContext";
import { FieldWatchCard } from "./FieldWatchCard";
import { ResearchNote } from "./ResearchNote";
import { ScoutMessage } from "./ScoutMessage";
import { TrendChart } from "./TrendChart";
import { ScheduledCheck } from "./ScheduledCheck";
import { Sidebar } from "./Sidebar";
import { SettingsPage } from "../pages/SettingsPage";
import { summarizeSmap } from "../../../src/engine/smap";

const rotation: RotationPlan = {
  id: "plan-1", label: "Winter wheat → Grain sorghum → Fallow (no crop)", avgNetReturnPerAcre: 30, badYearsIn10: 2,
  coverYears: 1, totalNitrogenLbPerAcre: 50, waterPumpedIn: 0, notes: [],
  scores: { climate: 50, reliability: 50, soil: 50, profit: 50, total: 50 },
  years: ["winter_wheat", "sorghum", "fallow"].map((crop, i) => ({ year: 2027 + i, crop, cropName: crop, cover: i === 0 ? "cereal_rye" : "none", coverName: "Cereal rye", climateScore: 0.5, reliability: 0.8, mainStress: null, expectedYield: 40, yieldUnit: "bu/acre", nitrogenLbPerAcre: 40, netReturnPerAcre: 30 })) as RotationPlan["years"],
};
const indicator = { id: "gs_rain", label: "Growing-season rain (May–Sep)", unit: "in", years: [2020, 2021], values: [10, 11], changePerDecade: 1, trend: { verdict: "significant_increase", slopePerYear: 0.1, intercept: -192, pValue: 0.01 } } as PlanResponse["climate"]["indicators"][number];
const plan = {
  request: { lat: 38.1, lon: -100.7, recentCrops: ["corn"], water: "rain" }, generatedAt: "2026-11-15",
  location: { lat: 38.1, lon: -100.7, county: { countyFips: "20055", countyName: "Finney County", stateCode: "KS" } },
  climate: { firstYear: 1991, lastYear: 2025, source: "NASA POWER", indicators: [indicator] },
  soil: { available: false }, cropHistory: { available: true, years: [{ year: 2025, crop: "corn", cdlName: "Corn" }] },
  plans: [rotation], currentPractice: null, assumptions: [], dataSources: [{ name: "NASA POWER", url: "https://power.larc.nasa.gov", usedFor: "Weather" }],
  droughtReplays: [{ year: 2022, weather: { seasonRainIn: 8, typicalSeasonRainIn: 14, hotDays: 40, typicalHotDays: 20 }, current: null, plan: { label: rotation.label, crops: [{ crop: "sorghum", cropName: "Grain sorghum", afterCropName: "Winter wheat", pctVsTypical: -40, yield: 20, unit: "bu/acre", netPerAcre: 10 }] }, county: [], insurance: [] }],
} as unknown as PlanResponse;
const opinion = { county: "Finney County", rotations: [{ rank: 1, code: "W-S-F", name: "wheat-sorghum-fallow", crops: ["winter_wheat", "sorghum", "fallow"], weightPct: 38 }], byCurrentCrop: {}, dataThrough: "2026-11-09", disclaimer: "Published source disclaimer.", dryYearRanking: true } as unknown as SecondOpinion;
const validation: CropValidation = { crop: "sorghum", cropName: "Grain sorghum", afterCropName: "Winter wheat", unit: "bu/acre", years: [2020, 2021], actual: [40, 50], modeled: [42, 49], correlation: 0.8, sameDirection: 2, worstYearsFlagged: 1, worstYears: [], source: "USDA NASS", practice: "rain-fed", area: "county" };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
beforeEach(() => {
  localStorage.setItem(LANGUAGE_STORAGE_KEY, "es");
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div"); document.body.append(container); root = createRoot(container);
  vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
});
afterEach(async () => { await act(async () => root.unmount()); container.remove(); localStorage.clear(); vi.unstubAllGlobals(); });
async function render(children: ReactNode) { await act(async () => root.render(h(LanguageProvider, { children }))); }
const group = (...children: ReactNode[]) => h(Fragment, null, ...children);

describe("Spanish plan and evidence cards", () => {
  it("translates every known wind protection rule while preserving English and unfamiliar explanations", () => {
    const cases = [
      ["winter_wheat", "corn", "none"], ["alfalfa", "alfalfa", "none"],
      ["corn", "soybean", "cereal_rye"], ["fallow", "corn", "none"],
      ["alfalfa", null, null], ["corn", null, null], ["corn", "soybean", "none"],
    ] as const;
    for (const [crop, prev, cover] of cases) {
      const y = { year: 2027, crop, ...protectionFor(crop, prev, cover), windyDays: 1 };
      expect(windReason(y, prev, cover, "en")).toBe(y.reason);
      expect(windReason(y, prev, cover, "es")).not.toBe(y.reason);
      expect(windReason(y, prev, cover, "es")).not.toMatch(/Alfalfa \(hay\)|unknown|planted|seeding/);
      expect(windReason({ ...y, reason: "Unfamiliar provider explanation." }, prev, cover, "es")).toBe("Unfamiliar provider explanation.");
    }
    for (const text of [WIND_RULE.adaptation, WIND_RULE.thresholdSource, WIND_RULE.monthsSource, ...WIND_LIMITATIONS, ...ASSUMPTIONS]) {
      expect(translateKnown("es", text)).not.toBe(text);
      expect(translateKnown("en", text)).toBe(text);
    }
    expect(translateKnown("es", WIND_RULE.thresholdSource)).toContain('"are considered erosive when they reach 13 miles per hour at 1 foot above the ground or about 18 miles per hour at a 30-foot height"');
    expect(translateKnown("es", WIND_RULE.monthsSource)).toContain('"is typically February through May when winds are the greatest and crops are not high enough to protect the soil surface"');
  });

  it("translates fixed provenance, fallow units and unknown quality statuses", async () => {
    await render(group(h(EconomicsCard, { plan }), h(DataEvidence, { plan: { ...plan, dataSources: [...plan.dataSources, { name: "NASA GIBS (MODIS Terra true color)", url: "https://example.com", usedFor: "Satellite imagery on the dashboard map" }] } })));
    expect(container.textContent).toContain("no corresponde (sin producto)");
    expect(container.textContent).toContain("no corresponde (sin cultivo)");
    expect(container.textContent).toContain("NASA GIBS (MODIS Terra true color)");
    expect(container.textContent).toContain("Imágenes satelitales del mapa del panel");
    expect(container.textContent).not.toContain("unknown");
    for (const text of ["1991–2025 (retained climate years)", "1991–2025 requested; actual coverage unknown", "100 / 200 required daily rain/max/min values; incomplete years excluded from replay", "10 annual classifications; expected coverage unknown", "Average of NASA POWER (50 km) and NASA Daymet (1 km) daily rain and temperature, 1991–2025; root-zone soil wetness from NASA POWER"]) {
      expect(evidenceText(text, "es")).not.toBe(text);
      expect(evidenceText(text, "en")).toBe(text);
    }
  });

  it("translates loaded GRACE interpretations and known opinion text while retaining credits and arbitrary provider text", async () => {
    const comparison = compareGroundwater(groundwater.grace.months, groundwater.kgs.wells);
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ note: "", bundle: groundwater, comparison }))));
    const op = { ...opinion, disclaimer: savedOpinion.disclaimer, byCurrentCrop: { corn: { rotations: [], message: "Only 2 of the K-State rotations for western Kansas include corn." } } };
    await render(group(h(GraceWellsCard, { plan }), h(SecondOpinionCard, { op, plan: rotation, history: plan.cropHistory, irrigated: false })));
    for (const value of [groundwater.grace.support, groundwater.grace.processing, groundwater.kgs.selection, groundwater.kgs.signConvention, groundwater.kgs.quality, comparison.method, comparison.note, savedOpinion.disclaimer]) expect(container.textContent).not.toContain(value);
    expect(container.textContent).toContain(groundwater.grace.attribution);
    expect(container.textContent).toContain("Solo 2 de las rotaciones de K-State para el oeste de Kansas incluyen maíz.");
    expect(container.textContent).toContain("The data was obtained from");
    expect(translateKnown("es", "Published source disclaimer.")).toBe("Published source disclaimer.");
  });

  it("translates logged-out AuthPage chrome and both account modes", async () => {
    await render(h(AuthPage, { onSignedIn: () => {} }));
    expect(container.textContent).toContain("Inicia sesión para planificar tus próximos tres años.");
    expect(container.textContent).toContain("Correo electrónico");
    expect(container.querySelector('[aria-label="Mostrar contraseña"]')).toBeTruthy();
    await act(async () => [...container.querySelectorAll<HTMLButtonElement>('button[role="tab"]')].find(el => el.textContent === "Crear cuenta")!.click());
    expect(container.textContent).toContain("Crea tu cuenta");
    expect(container.querySelector('input[type="password"]')?.getAttribute("placeholder")).toBe("Al menos 8 caracteres");
    expect(container.textContent).not.toMatch(/Welcome back|Create account|Password|Sign in/);
  });
  it("translates goals, economics, soil, assumptions, glossary and historical controls", async () => {
    await render(group(h(GoalPicker, { value: ["water_conservation"], water: "rain", onChange: () => {} }), h(EconomicsCard, { plan }), h(SoilBuild, { plan: rotation }), h(IndicatorGuide), h(Glossary), h(PlanAssumptions, { plan: rotation, water: "rain" }), h(DataEvidence, { plan }), h(CropTimingEvidence, { lat: 38, lon: -100 }), h(HistoricalScenarios, { lat: 38, lon: -100 })));
    for (const text of ["Conservación del agua", "Fijación de nitrógeno", "Supuestos de las cifras de margen", "Maíz", "Soja", "Barbecho", "Tolera la sequía", "Evapotranspiración", "no equivale a extracción para riego", "Consulta con tu agrónomo", "Datos y limitaciones", "Fechas estimadas de las etapas del maíz", "Cargar historial de la parcela"]) expect(container.textContent).toContain(text);
    expect(container.querySelector('input[type="range"]')?.getAttribute("aria-label")).toContain("porcentaje del presupuesto");
    expect(container.textContent).not.toContain("Grain sorghum");
    expect(container.querySelector('a[href="https://power.larc.nasa.gov/docs/methodology/"]')?.textContent).toContain("NASA POWER methodology");
  });

  it("translates water options, replay, harvest verdicts, charts and accessible names", async () => {
    const options = (["rain", "limited", "full"] as const).map(water => ({ water, bestLabel: rotation.label, crops: rotation.years.map(y => y.crop), badYearsIn10: 2, avgNetReturnPerAcre: 30, waterPumpedIn: 0 }));
    await render(group(h(WaterOptions, { options, current: "rain", onChoose: () => {}, busy: false }), h(DroughtReplay, { replays: plan.droughtReplays! }), h(HarvestCheck, { validation: [validation], planCrops: ["sorghum"], place: "Finney County" }), h(SatelliteNote), h(TrendChart, { ind: indicator })));
    for (const text of ["Trigo de invierno", "Sorgo de grano", "Barbecho", "Riego completo", "8 pulgadas de lluvia", "40 días a 95°F", "En 2 de 2 años", "Datos satelitales y del modelo", "Lluvia en la temporada", "Aumento de 1 pulgada cada 10 años"]) expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain("winter_wheat");
    expect(container.textContent).not.toContain("Grain sorghum");
    expect(container.textContent).toContain("Mostrar estos valores en una tabla");
    expect(container.textContent).toContain("Cosecha real del condado");
    expect(container.querySelector('figure.trend svg')?.getAttribute("aria-label")).toContain("Mínimo de");
    expect(container.querySelector('[aria-label="Año histórico"]')).toBeTruthy();
    expect([...container.querySelectorAll('svg[role="img"]')].every(el => !el.getAttribute("aria-label")?.includes(" to "))).toBe(true);
  });

  it("uses Spanish second-opinion crop names while preserving published credits", async () => {
    await render(h(SecondOpinionCard, { op: opinion, plan: rotation, history: plan.cropHistory, irrigated: false }));
    expect(container.textContent).toContain("Segunda opinión");
    expect(container.textContent).toContain("Trigo de invierno");
    expect(container.textContent).toContain("Sorgo de grano");
    expect(container.textContent).toContain("Finney County");
    expect(container.textContent).toContain("The data was obtained from");
    expect(container.textContent).not.toContain("Wheat→Sorghum");
  });

  it("renders loaded SMAP, vegetation, groundwater and USDM states in Spanish", async () => {
    const timeline = { window: { start: "2022-05-01", end: "2022-09-30" }, expectedWeeks: 1, observedWeeks: 1, mixedWeeks: 0, droughtWeeks: 1, missingWeeks: [], weeks: [{ validStart: "2022-05-03", predominant: "D2", mixed: false, pct: { none: 0, D0: 0, D1: 0, D2: 100, D3: 0, D4: 0 }, mapUrl: "https://example.com/map" }], counts: { none: 0, D0: 0, D1: 0, D2: 1, D3: 0, D4: 0 }, source: { retrievedAt: "2026-11-15", docsUrl: "https://droughtmonitor.unl.edu" }, note: "" } as unknown as UsdmTimeline;
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      const value = url.includes("/smap?") ? { note: "", evidence: summarizeSmap([], 2022, "07-01", "07-01", []), bundle: null }
        : url.includes("/vegetation?") ? { status: "partial", validCount: 1, expectedCount: 23, observations: [{ modisDate: "A2022001", compositeStart: "2022-01-01", observationDate: null, ndvi: 0.2, reliability: 0 }], product: "MOD13Q1", version: "061", resolution: "250 m", interval: "16-day", scale: 0.0001, requestUrls: [], docsUrl: "https://example.com/qa", attribution: "NASA", retrievedAt: "2026-11-15", note: "" }
        : url.includes("/usdm/replay?") ? { timelines: [timeline] } : { status: "unavailable", note: "", bundle: null, comparison: null };
      return new Response(JSON.stringify(value), { status: 200 });
    }));
    await render(group(h(SmapCard, { plan }), h(VegetationCard, { plan }), h(GraceWellsCard, { plan }), h(UsdmContext, { plan })));
    for (const text of ["Humedad del suelo de SMAP", "Zona radicular", "no disponible", "Datos de vegetación", "parcial", "Almacenamiento regional de agua", "D2 sequía severa"]) expect(container.textContent).toContain(text);
    expect(container.querySelector('a[href="https://example.com/map"]')?.getAttribute("title")).toContain("Mapa válido");
    expect(container.querySelector('[aria-label^="NDVI"]')?.getAttribute("aria-label")).toContain("compuestos válidos");
  });

  it("localizes wind and Field Watch loading/error chrome", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("offline"); }));
    await render(group(h(WindScreenCard, { plan }), h(FieldWatchCard)));
    expect(container.textContent).toContain("Exposición a la erosión eólica");
    expect(container.textContent).toContain("Evaluación del viento no disponible");
    expect(container.textContent).toContain("Se ejecuta cada hora en Cloudflare");
    expect(container.textContent).toContain("Revisar ahora");
  });

  it("translates populated wind tables and chart names without changing source identifiers", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({
      rule: { thresholdMs: 8.04672, months: [2, 5], version: "wind-exposure-v1", thresholdSource: "USDA NRCS", monthsSource: "K-State", adaptation: "" },
      wind: { source: "NASA POWER", parameters: [], grid: { lat: 38, lon: -100, resolution: "0.5° × 0.625°" }, start: "2021-01-01", end: "2025-12-31", timeStandard: "LST", missingDays: { WS10M_MAX: 0, WS10M: 0 }, retrievedAt: "2026-11-15", requestUrl: "https://example.com/power" },
      months: [{ month: 2, validDays: 100, windyDays: 20, share: 0.2 }], baseline: { startYear: 2021, endYear: 2025 },
      recentSeason: { year: 2025, dates: ["2025-02-01"], ws10mMax: [9], windyDays: 1, validDays: 1 }, soil: { available: false, source: "USDA SSURGO" },
      rotations: [{ label: rotation.label, windyDaysWithoutLivingCover: 20, windyDaysWithLivingCover: 10, years: [{ year: 2027, crop: "winter_wheat", state: "living-cover", reason: "" }] }], limitations: [],
    }))));
    await render(h(WindScreenCard, { plan }));
    for (const text of ["Días ventosos / días válidos", "feb", "Cobertura viva", "Trigo de invierno", "Sorgo de grano", "USDA NRCS", "USDA SSURGO"]) expect(container.textContent).toContain(text);
    expect(container.querySelector('svg[role="img"]')?.getAttribute("aria-label")).toBe("Máximo diario del viento horario, febrero–mayo de 2025");
  });

  it("translates loaded crop-stage enums and historical selector labels", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => new Response(JSON.stringify(String(input).includes("crop-timing")
      ? { timing: { status: "estimated", emergenceRange: ["2025-05-05", "2025-05-10"], silking: null, physiologicalMaturity: null, missingTemperatureDates: [], fixed: null, estimated: null, windowNote: "", model: { source: "https://example.com/kstate" } }, nassComparison: { status: "unavailable", reason: "", interpretation: "", seasons: [] }, weather: { source: { url: "https://example.com/power", nativeResolution: "0.5°", apiVersion: "2" }, retrievedAt: "2026-11-15", snapshotId: "sha256" } }
      : { candidateYears: { first: 1991, last: 2025 }, candidates: [], tiedYears: [], hot: null, reference: { years: [], rainYears: [] }, catalog: [], snapshot: { id: "sha256", source: { url: "https://example.com/power" } } }
    ))));
    await render(group(h(CropTimingEvidence, { lat: 38, lon: -100 }), h(HistoricalScenarios, { lat: 38, lon: -100 })));
    const buttons = [...container.querySelectorAll("button")];
    await act(async () => { buttons.find(el => el.textContent === "Comparar fechas")!.click(); buttons.find(el => el.textContent === "Cargar historial de la parcela")!.click(); });
    expect(container.textContent).toContain("estimado: emergencia 2025-05-05 a 2025-05-10");
    expect(container.textContent).toContain("NASS no disponible");
    expect(container.querySelector('select option[value="hot"]')?.textContent).toBe("Año caluroso");
    expect(container.textContent).not.toContain("threshold_not_reached");
  });

  it("keeps generated chat text and research passages verbatim while translating chrome", async () => {
    const note = { status: "live", template: "", tags: ["sorghum", "winter_wheat"], cropSource: "watch settings", corpusVersion: "v1", passages: [{ chunkId: "r1", sourceTitle: "K-State Research", sourceUrl: "https://example.com", year: 2025, attribution: "K-State", license: "CC BY", applicability: "Kansas", text: "Verbatim English research quotation." }] } as Parameters<typeof ResearchNote>[0]["note"];
    await render(group(h(ResearchNote, { note }), h(ScoutMessage, { message: { id: "m1", role: "assistant", parts: [{ type: "reasoning", text: "Original model reasoning." }, { type: "text", text: "Original model output about corn." }] }, streaming: false })));
    expect(container.textContent).toContain("Nota de investigación · Investigación consultada");
    expect(container.textContent).toContain("Sorgo de grano, Trigo de invierno");
    expect(container.textContent).not.toContain("Proceso de razonamiento");
    expect(container.textContent).not.toContain("Original model reasoning.");
    expect(container.textContent).toContain("Verbatim English research quotation.");
    expect(container.textContent).toContain("Original model output about corn.");
  });

  it("translates loaded scheduled checks, watch settings, crop and mode enums", async () => {
    vi.stubGlobal("fetch", vi.fn(async (input: string) => {
      const url = String(input);
      const data = url.endsWith("/options") ? { available: true, delaySeconds: 45, fields: [{ id: "finney-ks", name: "Finney County" }], replays: [], weekly: { schedule: "Monday", freshDays: 7, crops: ["corn", "sorghum", "winter_wheat"] } }
        : url.includes("/runs?") ? { runs: [{ runId: "r1", status: "dry", mode: "weekly", headline: "Dry spell starting: 0.10 in of rain in 14 days, drier than 95% of past years, and soil drier than usual (5th percentile)", dueAt: 1700000000000, completedAt: 1700000000000, scheduledAt: 1700000000000, reasons: [{ id: "rootzone", text: "Root-zone soil wetness (7 days to Feb 14): 5th percentile for this time of year.", source: "NASA POWER daily (GWETROOT)" }], snapshot: null, ruleVersion: 1 }] }
        : { settings: { enabled: true, crop: "sorghum", nextWeeklyAt: 1700000000000, nextWindow: { crop: "winter_wheat", from: "2027-04-01", to: "2027-05-01", at: 1700000000000 } } };
      return new Response(JSON.stringify(data));
    }));
    await render(h(ScheduledCheck));
    for (const text of ["Pide al agente de esta parcela", "Revisar condiciones actuales", "Vigilancia semanal", "Sorgo de grano", "Trigo de invierno", "Revisión semanal", "Período seco"]) expect(container.textContent).toContain(text);
    expect(container.textContent).not.toContain("Dry spell");
    expect(container.textContent).not.toContain("winter_wheat");
    expect(container.textContent).toContain("Comienza un período seco");
    expect(container.textContent).toContain("Humedad radicular (7 días hasta feb 14): percentil 5");
  });

  it("translates sidebar and settings controls while keeping editable agent text", async () => {
    const settings = { greeting: "Existing English agent greeting", instructions: "Existing operator instructions", tools: { find_location: { enabled: true, description: "Existing tool prompt" } }, languages: { autoDetect: true, enabled: ["en", "es"] } };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ settings, defaults: settings, status: { database: true, gemini: true, twilio: true, mode: "gemini-live", model: "Gemini" }, tools: [{ name: "find_location", title: "Find location", about: "Turns a spoken or typed ZIP code into a town, state and map point (Zippopotam.us).", required: true }], languages: [{ code: "en", name: "English", native: "English" }, { code: "es", name: "Spanish", native: "Español" }], limits: { greeting: 500, instructions: 5000 }, lockedRules: "Original rules", updatedAt: null }))));
    await render(group(h(Sidebar, { route: "settings", user: null, onSignOut: () => {}, open: false, onClose: () => {}, chats: [], activeChatId: null, onNavigate: () => {}, onNewChat: () => {}, onOpenChat: () => {}, onDeleteChat: () => {} }), h(SettingsPage, { onMenu: () => {} })));
    for (const text of ["Field Watch", "Nueva conversación", "Configuración", "Agente telefónico", "Qué dice", "Qué puede hacer", "Hablar el idioma de quien llama"]) expect(container.textContent).toContain(text);
    expect((container.querySelector('#st-greeting') as HTMLTextAreaElement).value).toBe("Existing English agent greeting");
    expect(container.querySelector('[aria-label="Navegación principal"]')).toBeTruthy();
    const toolsTab = [...container.querySelectorAll('button')].find(el => el.textContent === "Qué puede hacer")!;
    await act(async () => toolsTab.click());
    expect(container.textContent).toContain("Buscar ubicación");
    expect(container.textContent).not.toContain("Turns a spoken");
  });

  it("shares language with nested planner providers and switches existing cards both ways", async () => {
    function Switch() { const { language, setLanguage } = useI18n(); return h("button", { onClick: () => setLanguage(language === "es" ? "en" : "es") }, "switch"); }
    await render(group(h(Switch), h(LanguageProvider, { children: h(GoalPicker, { value: [], water: "rain", onChange: () => {} }) })));
    expect(container.textContent).toContain("Conservación del agua");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Water conservation");
    expect(document.documentElement.lang).toBe("en");
    await act(async () => container.querySelector("button")!.click());
    expect(container.textContent).toContain("Conservación del agua");
    expect(localStorage.getItem(LANGUAGE_STORAGE_KEY)).toBe("es");
  });
});
