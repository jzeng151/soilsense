// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, expect, it, vi } from "vitest";
import { LanguageProvider, LANGUAGE_STORAGE_KEY, useI18n, type Language } from "../i18n";
import { LivePage } from "./LivePage";

let root: Root | undefined;
let sockets: TestSocket[] = [];
class TestSocket {
  static OPEN = 1;
  readyState = 1;
  onopen: (() => void) | null = null;
  onclose: (() => void) | null = null;
  onmessage: ((event: { data: string }) => void) | null = null;
  send = vi.fn();
  close = vi.fn();
  constructor() { sockets.push(this); }
}

afterEach(async () => {
  if (root) await act(async () => root!.unmount());
  root = undefined;
  sockets = [];
  document.body.replaceChildren();
  localStorage.clear();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

function LanguageControls() {
  const { setLanguage } = useI18n();
  return createElement("button", { onClick: () => setLanguage("ko") }, "switch-to-ko");
}

async function mount(language: Language, status: { demo: boolean; available: boolean; phone?: string }, events: Record<string, unknown>[] = []) {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  vi.stubGlobal("WebSocket", TestSocket);
  vi.stubGlobal("fetch", vi.fn(async (input: RequestInfo | URL) => Response.json(
    String(input).endsWith("/status") ? status : { demo: status.demo, events },
  )));
  localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
  const container = document.createElement("div"); document.body.append(container);
  root = createRoot(container);
  await act(async () => root!.render(createElement(LanguageProvider, { children: createElement("div", null,
    createElement(LanguageControls), createElement(LivePage, { onMenu: () => {} })) })));
  return container;
}

it.each(["en", "es", "ko"] as const)("shows localized demo-off, empty and unavailable states in %s without claiming a live call", async language => {
  const container = await mount(language, { demo: false, available: true });
  expect(container.querySelector("h1")?.textContent).toBe({ en: "Watch a call", es: "Observa una llamada", ko: "통화 지켜보기" }[language]);
  expect(container.querySelector(".lv-status")?.textContent).toContain({
    en: "Demo mode is off. A team member can turn it on in Settings.",
    es: "El modo de demostración está desactivado. Un miembro del equipo puede activarlo en Configuración.",
    ko: "데모 모드가 꺼져 있습니다. 팀원이 설정에서 켤 수 있습니다.",
  }[language]);
  expect(container.querySelector(".sb-toggle")?.getAttribute("aria-label")).toBe({ en: "Open sidebar", es: "Abrir menú lateral", ko: "사이드바 열기" }[language]);
  expect(container.querySelector('[role="log"]')?.getAttribute("aria-label")).toBe({ en: "Call transcript", es: "Transcripción de la llamada", ko: "통화 기록" }[language]);
  expect(container.querySelector(".lv-empty")?.textContent).toBe({ en: "When someone calls, the conversation shows up here.", es: "Cuando alguien llame, la conversación aparecerá aquí.", ko: "전화가 오면 이곳에 대화가 표시됩니다." }[language]);
  expect(container.textContent).toContain({ en: "Not built yet", es: "Aún no se ha creado", ko: "아직 생성되지 않음" }[language]);
  expect(sockets).toHaveLength(0);
  await act(async () => root!.unmount()); root = undefined;
  const unavailable = await mount(language, { demo: false, available: false });
  expect(unavailable.querySelector(".lv-status")?.textContent).toContain({ en: "The live screen isn't set up on this server.", es: "La pantalla en directo no está configurada en este servidor.", ko: "이 서버에는 실시간 화면이 설정되어 있지 않습니다." }[language]);
});

const callerText = "I grew corn last year and need a rotation plan for the next three seasons.";
const agentText = "Puedo revisar los datos de su parcela y preparar un plan de rotación.";
function callEvents() {
  const call = "fixture-call";
  const events: Record<string, unknown>[] = [
    { type: "call.start", call, at: 1_800_000_000_000, caller: "•••1234", languages: ["en", "es", "ko"] },
    { type: "call.say", call, who: "caller", text: callerText, lang: "en", interrupted: true },
    { type: "call.say", call, who: "agent", text: agentText, lang: "es" },
    { type: "source", call, source: "power", prefetch: true, phase: "end", ok: true, ms: 25 },
    { type: "tool.start", call, name: "build_rotation_plan" },
    { type: "tool.end", call, name: "build_rotation_plan", ok: false, result: { error: "Do not build the plan yet: ask the crop first" } },
    { type: "tool.start", call, name: "build_rotation_plan", input: { place_name: "Finney, KS", recent_crops: ["soybean", "corn", "winter_wheat"], water: "limited" } },
    ...["county", "power", "daymet", "soil", "cdl", "nass", "rma", "openet", "engine", "saved"].map(source =>
      ({ type: "source", call, source, phase: source === "rma" ? "start" : "end", ok: source !== "openet", ms: source === "rma" ? undefined : 1250 })),
    { type: "tool.end", call, name: "build_rotation_plan", ok: true, ms: 2000 },
    { type: "tool.start", call, name: "find_location", input: { zip: "00123" } },
    { type: "tool.end", call, name: "find_location", ok: false, ms: 42 },
    { type: "tool.start", call, name: "send_plan_by_text" },
    { type: "sms", call, ok: true },
    { type: "error", call },
    { type: "plan", call, place: "Finney, KS", water: "full", badYearsIn10: 2, netPerAcre: -40,
      years: [
        { year: 2027, crop: "corn", cropName: "Corn", cover: "Cereal rye" },
        { year: 2028, crop: "soybean", cropName: "Soybean", cover: "Hairy vetch" },
        { year: 2029, crop: "winter_wheat", cropName: "Winter wheat", cover: "Crimson clover" },
      ], current: { label: "Corn", netPerAcre: -60, badYearsIn10: 4 },
      replay: { year: 2022, rainIn: 3.1, typicalRainIn: 8.4, currentNet: -60, planNet: -40 } },
    { type: "fieldwatch.run", runId: "watch-fixture", fieldName: "Finney, KS", status: "dry", trigger: "manual", dataThrough: "2026-11-12",
      headline: "Dry spell starting: 0.2 in of rain in 14 days, drier than 95% of past years, and soil drier than usual (4th percentile)" },
    { type: "call.end", call },
  ];
  return events.map((event, index) => ({ ...event, seq: index + 1 }));
}

it.each(["en", "es", "ko"] as const)("localizes call tools, sources, plan and watch results in %s, preserving transcripts, product names and units", async language => {
  const container = await mount(language, { demo: true, available: true, phone: "+1 555 0100" });
  expect(container.querySelector(".lv-status")?.textContent).toContain({ en: "Waiting for a call…", es: "Esperando una llamada…", ko: "통화 대기 중…" }[language]);
  const socket = sockets[0]!;
  await act(async () => { socket.onopen?.(); socket.onmessage?.({ data: JSON.stringify({ type: "snapshot", events: callEvents() }) }); });
  expect(container.querySelector(".lv-status")?.textContent).toContain({ en: "Call ended ·", es: "Llamada finalizada ·", ko: "통화 종료 ·" }[language]);
  expect(container.querySelector(".lv-phone")?.textContent).toBe("+1 555 0100");
  expect(container.querySelector(".lv-say-caller p")?.childNodes[0]?.textContent).toBe(callerText);
  expect(container.querySelector(".lv-say-caller p")?.getAttribute("lang")).toBe("en");
  expect(container.querySelector(".lv-say-agent p")?.textContent).toBe(agentText);
  expect(container.querySelector(".lv-say-agent p")?.getAttribute("lang")).toBe("es");
  expect(container.querySelector(".lv-say-caller small")?.getAttribute("lang")).toBe(language);
  expect(container.querySelector(".lv-say-caller small")?.textContent).toContain({ en: "(interrupted)", es: "(interrumpido)", ko: "(중단됨)" }[language]);
  for (const value of ({
    en: ["Build the 3-year plan", "Asks what the farmer grew this year first", "grew Soybean, Corn, Winter wheat", "Limited water", "Full irrigation", "running…", "didn't work", "skipped", "Plan texted to the caller", "The agent had trouble with that turn and asked again", "Checked on request", "NASA data through 2026-11-12"],
    es: ["Crear el plan de 3 años", "Primero pregunta qué cultivó el agricultor este año", "cultivó Soja, Maíz, Trigo de invierno", "Agua limitada", "Riego completo", "en curso…", "falló", "omitido", "Plan enviado por SMS a la persona que llama", "El agente tuvo un problema en ese turno y volvió a preguntar", "Comprobado a petición", "Datos de NASA hasta 2026-11-12"],
    ko: ["3년 계획 만들기", "먼저 농업인에게 올해 재배한 작물을 질문합니다", "재배 작물: 대두, 옥수수, 겨울밀", "제한 관개", "충분한 관개", "실행 중…", "실패", "건너뜀", "발신자에게 계획을 문자로 보냈습니다", "에이전트가 해당 대화를 처리하지 못해 다시 질문했습니다", "요청에 따라 점검", "NASA 데이터 기준일: 2026-11-12"],
  }[language])) expect(container.textContent).toContain(value);
  expect([...container.querySelectorAll(".lv-year strong")].map(node => node.textContent)).toEqual({ en: ["Corn", "Soybean", "Winter wheat"], es: ["Maíz", "Soja", "Trigo de invierno"], ko: ["옥수수", "대두", "겨울밀"] }[language]);
  expect([...container.querySelectorAll(".lv-year small")].map(node => node.textContent)).toEqual({ en: ["+ Cereal rye", "+ Hairy vetch", "+ Crimson clover"], es: ["+ Centeno", "+ Veza vellosa", "+ Trébol encarnado"], ko: ["+ 호밀", "+ 헤어리베치", "+ 크림슨클로버"] }[language]);
  for (const value of ["NASA POWER", "USDA SSURGO", "OpenET (Landsat)", "1.3 s", "25 ms", "−$40", { en: "/acre/year", es: "/acre/año", ko: "/acre/year" }[language], "3.1", "8.4", "0.2 in", "2022", "00123"]) expect(container.textContent).toContain(value);
  expect(container.querySelector(".lv-watch li p")?.textContent).toContain({ en: "Dry spell starting:", es: "Comienza un período seco:", ko: "건조 기간 시작:" }[language]);
  expect(container.querySelector(".lv-watch li p")?.getAttribute("lang")).toBe(language);
  // Language changes must retain call data and must not reconnect the socket.
  await act(async () => [...container.querySelectorAll("button")].find(button => button.textContent === "switch-to-ko")!.click());
  expect(container.querySelector("h1")?.textContent).toBe("통화 지켜보기");
  expect(container.querySelector(".lv-say-agent p")?.textContent).toBe(agentText);
  expect(container.querySelector(".lv-stats")?.textContent).toContain("충분한 관개");
  expect(sockets).toHaveLength(1);
});

it("translates polling and active-call states without timers leaking after unmount", async () => {
  vi.useFakeTimers();
  const events = [{ type: "call.start", call: "active", seq: 1 }];
  const container = await mount("ko", { demo: true, available: true }, events);
  await act(async () => sockets[0]!.onclose?.());
  expect(container.querySelector(".lv-status")?.textContent).toContain("매초 업데이트");
  await act(async () => vi.advanceTimersByTimeAsync(1000));
  expect(container.querySelector(".lv-status")?.textContent).toContain("통화 중");
  await act(async () => root!.unmount()); root = undefined;
  expect(vi.getTimerCount()).toBe(0);
});
