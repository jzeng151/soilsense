// Conversational phone agent: Twilio ConversationRelay <-> Gemini (AI SDK) with SoilSense tools.
//
// Twilio does speech-to-text and text-to-speech. It opens a WebSocket to /voice-agent and sends
// JSON events: "setup" once, then "prompt" (what the caller said), "interrupt", "dtmf" and
// "error". We stream the reply back as {type:"text", token, last} messages, and send
// {type:"end"} to hang up or hand the call to the keypad menu.
// Protocol: https://www.twilio.com/docs/voice/conversationrelay/websocket-messages

import { createGoogle } from "@ai-sdk/google";
import { type ModelMessage, stepCountIs, streamText, tool } from "ai";
import { z } from "zod";
import { ALL_CROPS } from "../../engine/crops";
import type { CropId, PlanResponse, Priority, WaterLevel } from "../../shared/types";
import { lookupZip } from "../data/geo";
import type { Env } from "../env";
import { ChatResearch, appendResearchUrls, SEARCH_RESEARCH_DESCRIPTION, searchResearchSchema } from "../research/chat";
import { maskPhone, sendSms, xmlEscape } from "../lib/twilio";
import { isLiveDemoOn, publishLive } from "../live/publish";
import { isInContiguousUS, logPlan, makePlan } from "../service";
import { LOCKED_RULES, languageName, languageRules, loadVoiceSettings, logVoiceEvent, type VoiceAgentSettings, type VoiceEventKind } from "../voiceSettings";

// Phone calls use a fast "lite" model: on a tool-calling turn it starts answering in ~0.5 s,
// against ~2 s for gemini-3.8-flash (measured Nov 14). Override with the VOICE_MODEL var.
const DEFAULT_MODEL = "gemini-3.5-flash-lite";
const MAX_STEPS = 6;
const MAX_HISTORY = 40;

// Greeting, instructions and tool settings are editable from the dashboard (Settings page);
// LOCKED_RULES always apply on top. See ../voiceSettings.ts.

const PRIORITIES = ["balanced", "profit", "soil", "risk"] as const satisfies readonly Priority[];

// ---------- Security: a per-call token so only calls we answered can open the socket ----------

const enc = new TextEncoder();

async function callToken(secret: string, callSid: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(`voice-agent:${callSid}`)));
  return Array.from(sig, (b) => b.toString(16).padStart(2, "0")).join("");
}

function tokenSecret(env: Env): string | null {
  return env.TWILIO_AUTH_TOKEN || (env.TWILIO_VALIDATE === "false" ? "local-dev" : null);
}

/** TwiML that connects the call to the agent. Falls back to the keypad menu if the session fails. */
export async function agentTwiml(env: Env, requestUrl: string, callSid: string): Promise<string | null> {
  const secret = tokenSecret(env);
  if (!env.GEMINI_API_KEY || !secret || !callSid) return null;
  const base = new URL(env.PUBLIC_BASE_URL || requestUrl);
  const wsUrl = `${base.protocol === "http:" ? "ws" : "wss"}://${base.host}/voice-agent`;
  const token = await callToken(secret, callSid);
  const { greeting, languages } = await loadVoiceSettings(env.DB);
  const multi = languages.autoDetect && languages.enabled.length > 1;
  const others = languages.enabled.filter((c) => c !== "en").map(languageName);
  const fullGreeting = multi ? `${greeting} You can also talk to me in ${others.length > 1 ? `${others.slice(0, -1).join(", ")} or ${others[others.length - 1]}` : others[0]}.` : greeting;
  const attrs = [
    `url="${xmlEscape(wsUrl)}"`,
    `welcomeGreeting="${xmlEscape(fullGreeting)}"`,
    `interruptible="any"`,
    `dtmfDetection="true"`,
    ...(multi
      ? // Automatic language detection: Deepgram must transcribe and ElevenLabs must speak.
        [`language="multi"`, `transcriptionProvider="Deepgram"`, `speechModel="nova-3-general"`, `ttsProvider="ElevenLabs"`]
      : [`language="en-US"`, `hints="${xmlEscape("corn, soybeans, soybean, wheat, winter wheat, oats, alfalfa, hay, sorghum, irrigated, limited water, rain-fed, dryland, ZIP code")}"`]),
  ];
  return (
    `<?xml version="1.0" encoding="UTF-8"?><Response>` +
    `<Connect action="/voice/agent-done"><ConversationRelay ${attrs.join(" ")}>` +
    `<Parameter name="token" value="${token}"/>` +
    `</ConversationRelay></Connect></Response>`
  );
}

// ---------- Text helpers ----------

/** Make streamed model text safe to speak: drop markdown symbols the TTS would read out. */
export function speakable(s: string): string {
  return s.replace(/[*_#`|>~]/g, "").replace(/\[(.*?)\]\((.*?)\)/g, "$1");
}

function plainFact(text: string): string {
  return text
    .replace(/\s*\([^)]*\bp\s*[=<]\s*[\d.]+[^)]*\)/g, "")
    .replace(/,?\s*and that change is statistically real/gi, "")
    .replace(/no statistically clear change/gi, "no clear change")
    .replace(/\s+\./g, ".");
}

/** A compact, speech-friendly view of a plan for the model. */
function planForVoice(p: PlanResponse, place: string | undefined) {
  const describe = (r: PlanResponse["plans"][number]) => ({
    label: r.label,
    years: r.years.map((y) => `${y.year}: ${y.cropName}${y.cover === "none" ? "" : ` with ${y.coverName} over winter`}`),
    netReturnPerAcrePerYear: r.avgNetReturnPerAcre,
    badYearsIn10: r.badYearsIn10,
    ...(r.waterPumpedIn ? { irrigationInchesPerYear: r.waterPumpedIn } : {}),
  });
  const current = p.currentPractice;
  const worst = p.droughtReplays?.[0];
  const outcome = (o: { label: string; avgNetPerAcre: number | null; crops: { cropName: string; pctVsTypical: number | null; mainStress: string | null }[] } | null) =>
    o && { label: o.label, netPerAcre: o.avgNetPerAcre, crops: o.crops.map((c) => `${c.cropName}: ${c.pctVsTypical == null ? "no estimate" : `${c.pctVsTypical > 0 ? "+" : ""}${Math.round(c.pctVsTypical)}% vs a typical year`}${c.mainStress ? ` (${c.mainStress})` : ""}`) };
  return {
    place: place ?? (p.location.county ? `${p.location.county.countyName}, ${p.location.county.stateCode}` : undefined),
    soil: p.soil.available ? [p.soil.mapUnitName?.split(",")[0] ?? p.soil.componentName, p.soil.drainageClass].filter(Boolean).join(", ") : "not mapped",
    recentCrops: p.cropHistory.years.slice(-4).map((y) => `${y.year}: ${y.cdlName}`),
    realClimateChanges: p.climate.indicators
      .filter((i) => i.trend.verdict === "significant_increase" || i.trend.verdict === "significant_decrease")
      .map((i) => `${i.label}: ${i.changePerDecade > 0 ? "up" : "down"} ${Math.abs(Math.round(i.changePerDecade * 10) / 10)} ${i.unit} per decade since ${p.climate.firstYear}`),
    recommended: p.plans[0] ? describe(p.plans[0]) : null,
    otherOptions: p.plans.slice(1).map(describe),
    ifTheyKeepCurrentPattern: current
      ? { label: current.label.replace("Current pattern: ", ""), netReturnPerAcrePerYear: current.avgNetReturnPerAcre, badYearsIn10: current.badYearsIn10 }
      : null,
    waterUsed: p.water ?? (p.request.irrigated ? "full" : "rain"),
    // Best plan if their water changed: "rain" = no irrigation, "limited" = about 10 inches a year, "full" = full irrigation.
    ifWaterChanged: (p.waterOptions ?? []).map((o) => ({ water: o.water, best: o.bestLabel, netReturnPerAcrePerYear: o.avgNetReturnPerAcre, badYearsIn10: o.badYearsIn10 })),
    // This field's worst past year, replayed with real weather: history, not a forecast.
    worstPastYear: worst
      ? {
          year: worst.year,
          seasonRainInches: worst.weather.seasonRainIn,
          typicalSeasonRainInches: worst.weather.typicalSeasonRainIn,
          theirCurrentCrops: outcome(worst.current),
          recommendedPlan: outcome(worst.plan),
          countyActual: worst.county.map((c) => `${c.cropName}: ${Math.round(c.actualPct)}% vs trend`),
          insuranceCause: worst.insurance.map((i) => `${i.cropName}: ${i.cause}`),
        }
      : null,
    reasons: p.facts.slice(0, 8).map((f) => plainFact(f.text)),
  };
}

/** A short, non-reversible id for a call on the public live screen (never the Twilio SID itself). */
function shortId(sid: string): string {
  let h = 2166136261;
  for (let i = 0; i < sid.length; i++) h = Math.imul(h ^ sid.charCodeAt(i), 16777619);
  return (h >>> 0).toString(36);
}

/** The plan as the live screen shows it: compact, no raw data. */
function livePlan(p: PlanResponse, place: string | undefined) {
  const top = p.plans[0];
  const worst = p.droughtReplays?.[0];
  return {
    place: place ?? (p.location.county ? `${p.location.county.countyName}, ${p.location.county.stateCode}` : undefined),
    water: p.water ?? (p.request.irrigated ? "full" : "rain"),
    label: top?.label,
    years: top?.years.map((y) => ({ year: y.year, crop: y.crop, cropName: y.cropName, cover: y.cover === "none" ? null : y.coverName })) ?? [],
    netPerAcre: top?.avgNetReturnPerAcre,
    badYearsIn10: top?.badYearsIn10,
    current: p.currentPractice ? { label: p.currentPractice.label.replace("Current pattern: ", ""), netPerAcre: p.currentPractice.avgNetReturnPerAcre, badYearsIn10: p.currentPractice.badYearsIn10 } : null,
    replay: worst
      ? { year: worst.year, rainIn: worst.weather.seasonRainIn, typicalRainIn: worst.weather.typicalSeasonRainIn, currentNet: worst.current?.avgNetPerAcre ?? null, planNet: worst.plan.avgNetPerAcre }
      : null,
  };
}

/** Said while the plan is being built, in the caller's language. */
const WAIT_LINES: Record<string, string> = {
  en: "Sprout is checking the NASA data for your field. Give me a few seconds.",
  es: "Sprout está revisando los datos de la NASA para su campo. Deme unos segundos.",
  fr: "Donnez-moi quelques secondes pour consulter les données météo de la NASA pour votre champ.",
  de: "Einen Moment bitte, ich prüfe die NASA-Wetterdaten für Ihr Feld.",
  hi: "कुछ सेकंड दीजिए, मैं आपके खेत के लिए नासा का मौसम डेटा देख रहा हूँ।",
  pt: "Me dê alguns segundos para verificar os dados climáticos da NASA para o seu campo.",
  it: "Mi dia qualche secondo per controllare i dati meteo della NASA per il suo campo.",
  nl: "Een paar seconden, ik bekijk de NASA-weergegevens voor uw veld.",
  ru: "Дайте мне несколько секунд, я проверю данные NASA о погоде для вашего поля.",
  ja: "少々お待ちください。あなたの畑のNASAの気象データを確認しています。",
};

/** Keep tool results short in the Activity log (plans are large). */
function summarizeResult(out: unknown): unknown {
  if (!out || typeof out !== "object") return out;
  const o = out as Record<string, unknown>;
  if ("recommended" in o) {
    const rec = o.recommended as { label?: string; netReturnPerAcrePerYear?: number } | null;
    return {
      place: o.place,
      recommended: rec?.label,
      netReturnPerAcrePerYear: rec?.netReturnPerAcrePerYear,
      otherOptions: (o.otherOptions as { label?: string }[] | undefined)?.map((x) => x.label),
      realClimateChanges: o.realClimateChanges,
    };
  }
  return out;
}

// ---------- One call = one session ----------

interface RelayMessage {
  type: string;
  callSid?: string;
  from?: string;
  to?: string;
  customParameters?: Record<string, string>;
  voicePrompt?: string;
  /** Detected language of a prompt; in multi mode only the primary tag, e.g. "es". */
  lang?: string;
  last?: boolean;
  digit?: string;
  utteranceUntilInterrupt?: string;
  description?: string;
}

export class CallSession {
  private history: ModelMessage[] = [];
  private callSid = "";
  private caller = "";
  private calledNumber = "";
  private verified = false;
  private running: AbortController | null = null;
  private spoken = "";
  private research: ChatResearch;
  private lastPlan: { plan: PlanResponse; place?: string } | null = null;
  /** Caller turn number, and the turn in which the agent was sent back to ask about the crop. */
  private turn = 0;
  private askedForCropTurn: number | null = null;
  /** Plans built (or being built) this call, by request, so an interrupted turn never builds one twice. */
  private plans = new Map<string, Promise<PlanResponse>>();
  /** Background cache-warming runs started when a ZIP code was found, by "lat,lon". */
  private warmups = new Map<string, Promise<unknown>>();

  /** Fetch and cache all data for a location in the background (result discarded). */
  private prefetch(lat: number, lon: number) {
    const key = `${lat.toFixed(3)},${lon.toFixed(3)}`;
    if (this.warmups.has(key)) return;
    const t0 = Date.now();
    const run = makePlan(this.env, { lat, lon, irrigated: false, priority: "balanced" }, { onEvent: (e) => this.live("source", { ...e, prefetch: true }) })
      .then(() => this.log("tool", { name: "prefetch_field_data", detail: JSON.stringify({ input: { lat, lon } }), durationMs: Date.now() - t0, ok: true }))
      .catch((err) => this.log("tool", { name: "prefetch_field_data", detail: JSON.stringify({ input: { lat, lon }, error: String(err) }), durationMs: Date.now() - t0, ok: false }));
    this.warmups.set(key, run);
  }
  private smsSent = false;
  private hangUpAfterTurn = false;
  private digits = "";
  private digitTimer: ReturnType<typeof setTimeout> | null = null;
  private settings: VoiceAgentSettings | null = null;
  /** Caller's language as last detected by Twilio (primary tag, e.g. "en", "es"). */
  private lang = "en";
  private ready: Promise<void>;
  private markReady!: () => void;

  constructor(
    private ws: WebSocket,
    private env: Env,
  ) {
    this.research = new ChatResearch({ ai: env.AI, index: env.RESEARCH_INDEX, db: env.DB, gatewayId: env.AI_GATEWAY_ID });
    this.ready = new Promise((r) => (this.markReady = r));
  }

  /** Record a step of the call for the dashboard's Activity tab. Never blocks the conversation. */
  private log(kind: VoiceEventKind, e: { name?: string; detail?: string; durationMs?: number; ok?: boolean } = {}) {
    void logVoiceEvent(this.env.DB, { callSid: this.callSid, kind, ...e });
  }

  /** Live screen (#/live): only while demo mode is on. Ordered, fire-and-forget. */
  private liveOn = false;
  private liveChain: Promise<void> = Promise.resolve();
  private live(type: string, data: Record<string, unknown> = {}) {
    if (!this.liveOn) return;
    const event = { type, call: shortId(this.callSid), at: Date.now(), ...data };
    this.liveChain = this.liveChain.then(() => publishLive(this.env, event));
  }

  private send(msg: Record<string, unknown>) {
    try {
      this.ws.send(JSON.stringify(msg));
    } catch {
      // socket already closed
    }
  }

  private get multi(): boolean {
    return Boolean(this.settings?.languages.autoDetect && this.settings.languages.enabled.length > 1);
  }

  private say(text: string, last = true) {
    // In multi mode, "lang: multi" makes ElevenLabs speak each token in the language it's written in.
    this.send(this.multi ? { type: "text", token: text, last, lang: "multi" } : { type: "text", token: text, last });
  }

  async onMessage(raw: string) {
    let msg: RelayMessage;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (msg.type === "setup") return this.onSetup(msg);
    if (!this.verified) return;
    if (msg.type === "prompt" && msg.voicePrompt && msg.last !== false) {
      if (msg.lang) this.lang = msg.lang.split("-")[0]!.toLowerCase();
      return this.respond(msg.voicePrompt);
    }
    if (msg.type === "interrupt") return this.onInterrupt();
    if (msg.type === "dtmf" && msg.digit) return this.onDigit(msg.digit);
    if (msg.type === "error") {
      console.warn(JSON.stringify({ msg: "relay error", callSid: this.callSid, description: msg.description }));
      this.log("error", { name: "twilio", detail: msg.description });
    }
  }

  private async onSetup(msg: RelayMessage) {
    const secret = tokenSecret(this.env);
    const expected = secret && msg.callSid ? await callToken(secret, msg.callSid) : null;
    if (!expected || msg.customParameters?.token !== expected) {
      console.warn(JSON.stringify({ msg: "voice agent rejected session", reason: "bad token" }));
      this.ws.close(1008, "unauthorized");
      return;
    }
    this.verified = true;
    this.callSid = msg.callSid ?? "";
    this.caller = msg.from ?? "";
    this.calledNumber = msg.to ?? "";
    this.settings = await loadVoiceSettings(this.env.DB);
    this.history.push({ role: "assistant", content: this.settings.greeting });
    console.log(JSON.stringify({ msg: "voice agent session started", callSid: this.callSid, caller: maskPhone(this.caller) }));
    this.log("session_start", {
      detail: JSON.stringify({ caller: maskPhone(this.caller), languages: this.multi ? this.settings.languages.enabled.map(languageName) : ["English"] }),
    });
    this.log("agent", { detail: this.settings.greeting });
    this.liveOn = await isLiveDemoOn(this.env.DB);
    this.live("call.start", { caller: maskPhone(this.caller), languages: this.multi ? this.settings.languages.enabled.map(languageName) : ["English"] });
    this.live("call.say", { who: "agent", text: this.settings.greeting });
    this.markReady();
  }

  private onInterrupt() {
    if (!this.running) return;
    this.running.abort();
    this.running = null;
    // Keep what the caller actually heard, so the model knows it was cut off.
    if (this.spoken.trim()) {
      this.history.push({ role: "assistant", content: `${this.spoken.trim()} [interrupted by caller]` });
      this.log("agent", { detail: `${this.spoken.trim()} [interrupted]` });
      this.live("call.say", { who: "agent", text: this.spoken.trim(), interrupted: true });
    }
    this.spoken = "";
  }

  private onDigit(d: string) {
    if (this.digitTimer) clearTimeout(this.digitTimer);
    if (d === "#") return this.flushDigits();
    this.digits += d;
    if (this.digits.length >= 5) return this.flushDigits();
    this.digitTimer = setTimeout(() => this.flushDigits(), 2500);
  }

  private flushDigits() {
    if (this.digitTimer) clearTimeout(this.digitTimer);
    this.digitTimer = null;
    const d = this.digits;
    this.digits = "";
    if (d) void this.respond(`[keypad] ${d}`);
  }

  /** Wrap a tool so each call is timed and recorded in the Activity log. */
  private timed<I, O>(name: string, fn: (input: I) => Promise<O>): (input: I) => Promise<O> {
    return async (input: I) => {
      const t0 = Date.now();
      this.live("tool.start", { name, input });
      try {
        const out = await fn(input);
        const failed = Boolean(out && typeof out === "object" && ("error" in out || (out as { sent?: boolean }).sent === false));
        this.log("tool", { name, detail: JSON.stringify({ input, result: summarizeResult(out) }), durationMs: Date.now() - t0, ok: !failed });
        this.live("tool.end", { name, ms: Date.now() - t0, ok: !failed, result: summarizeResult(out) });
        return out;
      } catch (err) {
        this.log("tool", { name, detail: JSON.stringify({ input, error: String(err) }), durationMs: Date.now() - t0, ok: false });
        this.live("tool.end", { name, ms: Date.now() - t0, ok: false, error: String(err).slice(0, 200) });
        throw err;
      }
    };
  }

  /** Only the tools switched on in Settings, with their (possibly edited) descriptions. */
  private tools() {
    const all = this.allTools();
    const cfg = this.settings?.tools;
    const out: Partial<typeof all> = {};
    for (const name of Object.keys(all) as (keyof typeof all)[]) {
      const c = cfg?.[name];
      if (c && !c.enabled) continue;
      (out as Record<string, unknown>)[name] = c ? { ...all[name], description: c.description } : all[name];
    }
    return out as typeof all;
  }

  private allTools() {
    const env = this.env;
    return {
      search_research: tool({
        description: SEARCH_RESEARCH_DESCRIPTION,
        inputSchema: searchResearchSchema,
        execute: this.timed("search_research", (input: z.infer<typeof searchResearchSchema>) => this.research.search(input)),
      }),
      find_location: tool({
        description: "Look up a US 5-digit ZIP code: place name, state, latitude and longitude.",
        inputSchema: z.object({ zip: z.string().describe("5-digit US ZIP code, digits only") }),
        execute: this.timed("find_location", async ({ zip }: { zip: string }) => {
          const clean = zip.replace(/\D/g, "");
          const place = clean.length === 5 ? await lookupZip(env.DB, clean) : null;
          if (!place) return { error: `ZIP code ${zip} was not found. Ask the caller to repeat it.` };
          if (!isInContiguousUS(place.lat, place.lon)) return { error: "That ZIP is outside the lower 48 states, which Soil Sense covers." };
          // Warm every data source now, while the caller answers the next question, so the
          // real plan is served from cache instead of fetching NASA/USDA data cold (~20 s).
          this.prefetch(place.lat, place.lon);
          return place;
        }),
      }),
      build_rotation_plan: tool({
        description:
          "Analyze the field: 35 years of NASA climate, USDA soil and crop history, and the ranked 3-year rotations with net return per acre and how many years in 10 each would have a bad harvest. Also returns the best plan for each water level and a replay of this field's worst past year.",
        inputSchema: z.object({
          lat: z.number(),
          lon: z.number(),
          place_name: z.string().optional().describe("Town and state from find_location, e.g. 'Ames, IA'"),
          water: z
            .enum(["rain", "limited", "full"])
            .optional()
            .describe('Water beyond rain: "rain" (no irrigation, the default), "limited" (some irrigation, about 10 inches a year or a weak well) or "full" (fully irrigated)'),
          priority: z.enum(PRIORITIES).optional().describe("What the caller cares most about; default balanced"),
          recent_crops: z
            .array(z.enum(ALL_CROPS as [CropId, ...CropId[]]))
            .max(3)
            .optional()
            .describe("Crops grown in the last 1-3 seasons, most recent (this year) LAST"),
        }),
        execute: this.timed(
          "build_rotation_plan",
          async ({
            lat,
            lon,
            place_name,
            water,
            priority,
            recent_crops,
          }: {
            lat: number;
            lon: number;
            place_name?: string;
            water?: WaterLevel;
            priority?: Priority;
            recent_crops?: CropId[];
          }) => {
          if (!isInContiguousUS(lat, lon)) return { error: "Location is outside the lower 48 states." };
          // Fast models sometimes skip the crop question. Send them back to ask it once; if the
          // caller doesn't know, the second call goes ahead without it.
          // Only allow a plan without a crop after the caller has had a turn to answer the question.
          if (!recent_crops?.length && (this.askedForCropTurn === null || this.askedForCropTurn === this.turn)) {
            this.askedForCropTurn = this.turn;
            return { error: "Do not build the plan yet. End your turn now by asking the caller what they grew on this field this year, in their language." };
          }
          const request = {
            lat,
            lon,
            irrigated: (water ?? "rain") !== "rain",
            water: water ?? "rain",
            priority: priority ?? "balanced",
            recentCrops: recent_crops?.length ? recent_crops : undefined,
            // The engine writes text messages in English or Spanish.
            language: this.lang === "es" ? ("es" as const) : ("en" as const),
          };
          // If the caller interrupts while a plan is being built, the next turn often asks for the
          // same plan again: reuse the one already in flight instead of building it twice.
          const key = JSON.stringify(request);
          let pending = this.plans.get(key);
          if (!pending) {
            const prefetched = this.warmups.get(`${lat.toFixed(3)},${lon.toFixed(3)}`);
            pending = (prefetched ? prefetched.catch(() => undefined) : Promise.resolve()).then(() => makePlan(env, request, { placeName: place_name, onEvent: (e) => this.live("source", { ...e }) }));
            this.plans.set(key, pending);
            pending.catch(() => this.plans.delete(key));
          }
          const plan = await pending;
          this.lastPlan = { plan, place: place_name };
          this.smsSent = false;
          this.live("plan", livePlan(plan, place_name));
          void logPlan(env, { channel: "voice", callSid: this.callSid, caller: maskPhone(this.caller), place: place_name, plan });
          return planForVoice(plan, place_name);
          },
        ),
      }),
      send_plan_by_text: tool({
        description: "Text the latest recommended plan to the caller's phone. Only after the caller agrees.",
        inputSchema: z.object({}),
        execute: this.timed("send_plan_by_text", async (_: Record<string, never>) => {
          if (!this.lastPlan) return { sent: false, reason: "No plan has been built yet." };
          if (this.smsSent) return { sent: true, note: "Already sent during this call." };
          const from = env.TWILIO_FROM_NUMBER || this.calledNumber;
          const ok =
            Boolean(this.caller && from && env.TWILIO_ACCOUNT_SID && env.TWILIO_AUTH_TOKEN) &&
            (await sendSms({ accountSid: env.TWILIO_ACCOUNT_SID!, authToken: env.TWILIO_AUTH_TOKEN!, from, to: this.caller, body: appendResearchUrls(this.lastPlan.plan.explanation.sms, this.research.citedPassages()) }));
          this.smsSent = ok;
          this.live("sms", { ok, to: maskPhone(this.caller) });
          return { sent: ok };
        }),
      }),
      end_call: tool({
        description: "Hang up after your goodbye, when the caller is done.",
        inputSchema: z.object({}),
        execute: this.timed("end_call", async (_: Record<string, never>) => {
          this.hangUpAfterTurn = true;
          return { ok: true };
        }),
      }),
    };
  }

  private async respond(userText: string) {
    if (!this.env.GEMINI_API_KEY) {
      this.say("Sorry, the advisor isn't available right now. Let me move you to the keypad menu.");
      setTimeout(() => this.send({ type: "end", handoffData: JSON.stringify({ reason: "ivr" }) }), 4000);
      return;
    }
    await this.ready;
    // A new turn replaces anything still running.
    this.running?.abort();
    const ctrl = new AbortController();
    this.running = ctrl;
    this.spoken = "";
    this.history.push({ role: "user", content: this.multi ? `[language: ${this.lang}] ${userText}` : userText });
    this.log("caller", { detail: userText, name: this.multi ? this.lang : undefined });
    this.live("call.say", { who: "caller", text: userText, lang: this.lang });
    this.turn++;
    const turnStart = Date.now();
    if (this.history.length > MAX_HISTORY) this.history = this.history.slice(-MAX_HISTORY);

    const google = createGoogle({ apiKey: this.env.GEMINI_API_KEY });
    // Buffer each text block so a citation split across stream tokens is validated before TTS.
    let pendingText = "";
    const flushSpeech = () => {
      if (!pendingText) return;
      const checked = this.research.forSpeech(pendingText);
      pendingText = "";
      if (checked.invalid.length) this.log("error", { name: "invalid_research_citation", detail: JSON.stringify({ ids: checked.invalid }), ok: false });
      const text = speakable(checked.text);
      this.spoken += text;
      this.say(text, false);
    };
    let filled = false;
    let fillerTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      const result = streamText({
        model: google(this.env.VOICE_MODEL || DEFAULT_MODEL),
        instructions: [this.settings?.instructions ?? "", LOCKED_RULES, this.multi && this.settings ? languageRules(this.settings.languages.enabled) : ""].filter(Boolean).join("\n\n"),
        messages: this.history,
        tools: this.tools(),
        stopWhen: stepCountIs(MAX_STEPS),
        temperature: 0.4,
        abortSignal: ctrl.signal,
        // Phone callers notice every second of silence: keep model thinking minimal.
        providerOptions: { google: { thinkingConfig: { thinkingLevel: "low" } } },
      });
      for await (const part of result.fullStream) {
        if (ctrl.signal.aborted) return;
        if (part.type === "start-step" && this.spoken && !/\s$/.test(this.spoken)) {
          // Text from separate steps (before and after a tool call) needs a space between sentences.
          this.spoken += " ";
          this.say(" ", false);
        } else if (part.type === "text-delta") {
          pendingText += part.text;
        } else if (part.type === "text-end") {
          flushSpeech();
        } else if (part.type === "tool-call" && part.toolName === "build_rotation_plan" && !this.spoken.trim() && !filled) {
          // If the plan takes more than a moment (data not cached yet), tell the caller to wait
          // instead of leaving them in silence. A cached plan answers before this ever plays.
          filled = true;
          fillerTimer = setTimeout(() => {
            if (ctrl.signal.aborted || this.spoken.trim()) return;
            const line = WAIT_LINES[this.lang] ?? WAIT_LINES.en!;
            this.spoken += `${line} `;
            this.say(`${line} `, false);
          }, 800);
        } else if (part.type === "tool-result" && part.toolName === "build_rotation_plan" && fillerTimer) {
          clearTimeout(fillerTimer);
          fillerTimer = null;
        } else if (part.type === "error") {
          throw part.error;
        }
      }
      if (ctrl.signal.aborted) return;
      flushSpeech();
      this.history.push(...((await result.responseMessages) as ModelMessage[]));
      this.say("", true);
      this.log("agent", { detail: this.spoken.trim(), durationMs: Date.now() - turnStart, ok: true });
      this.live("call.say", { who: "agent", text: this.spoken.trim(), ms: Date.now() - turnStart });
    } catch (err) {
      if (ctrl.signal.aborted) return;
      console.error(JSON.stringify({ msg: "voice agent turn failed", callSid: this.callSid, err: String(err) }));
      this.log("error", { name: "model", detail: String(err).slice(0, 500), durationMs: Date.now() - turnStart, ok: false });
      this.live("error", { name: "model" });
      this.say("Sorry, I had trouble with that. Could you say it again?", true);
      this.history.push({ role: "assistant", content: "Sorry, I had trouble with that. Could you say it again?" });
    } finally {
      if (fillerTimer) clearTimeout(fillerTimer);
      if (this.running === ctrl) this.running = null;
    }
    if (this.hangUpAfterTurn) {
      // Let the goodbye finish playing before ending the session.
      setTimeout(() => this.send({ type: "end", handoffData: JSON.stringify({ reason: "goodbye" }) }), 4000);
    }
  }

  onClose() {
    this.running?.abort();
    if (this.digitTimer) clearTimeout(this.digitTimer);
    console.log(JSON.stringify({ msg: "voice agent session ended", callSid: this.callSid }));
    if (this.verified) this.log("session_end");
    this.live("call.end");
  }
}

/** GET /voice-agent: the WebSocket Twilio ConversationRelay connects to. */
export function handleAgentSocket(request: Request, env: Env): Response {
  if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") return new Response("Expected WebSocket", { status: 426 });
  const pair = new WebSocketPair();
  const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
  server.accept();
  const session = new CallSession(server, env);
  server.addEventListener("message", (e) => void session.onMessage(typeof e.data === "string" ? e.data : new TextDecoder().decode(e.data as ArrayBuffer)));
  server.addEventListener("close", () => session.onClose());
  server.addEventListener("error", () => session.onClose());
  return new Response(null, { status: 101, webSocket: client });
}
