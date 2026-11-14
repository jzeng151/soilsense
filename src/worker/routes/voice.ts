// Twilio Voice webhooks: a short, keypad-or-speech call flow that ends with a spoken
// 3-year plan and an optional SMS. State travels in each action URL's query string.
//
// Call flow: /incoming → /lang → /zip → /crop → /irrigation → /priority → /plan → /menu

import { Hono, type Context } from "hono";
import { CROPS } from "../../engine/crops";
import { toSpeech } from "../../engine/explain";
import type { CropId, PlanResponse, Priority } from "../../shared/types";
import { lookupZip } from "../data/geo";
import type { Env } from "../env";
import { gather, type Lang, maskPhone, pause, redirect, response, say, sendSms, validateTwilioRequest } from "../lib/twilio";
import { isInContiguousUS, logPlan, makePlan } from "../service";
import { agentTwiml } from "./agent";

type Ctx = Context<{ Bindings: Env; Variables: { form: Record<string, string> } }>;

export const voice = new Hono<{ Bindings: Env; Variables: { form: Record<string, string> } }>();

const T = {
  en: {
    welcome: "Welcome to SoilSense, your crop rotation advisor powered by NASA climate data.",
    langPrompt: "For English, press 1. Para español, oprima 2.",
    zipPrompt: "Please enter or say the five digit ZIP code where your field is.",
    zipRetry: "Sorry, I didn't catch a valid US ZIP code.",
    zipGot: (place: string) => `Got it. A field near ${place}.`,
    cropPrompt: "What did you grow on this field this year? Press 1 for corn, 2 for soybeans, 3 for wheat, 4 for oats, or 5 for alfalfa or hay.",
    cropRetry: "Sorry, I didn't get that.",
    irrPrompt: "Is the field irrigated? Press 1 for yes, or 2 for no.",
    priPrompt: "What matters most to you? Press 1 for profit, 2 for soil health, 3 for lower risk, or 4 for a balance of all three.",
    working: "Thanks. I'm checking about thirty five years of NASA climate data for your field. This takes a few seconds.",
    menu: "Press 1 to hear why, 2 to get this plan by text message, 3 to hear another option, 9 to hear the plan again, or hang up when you're done.",
    smsSent: "I've sent the plan to your phone.",
    smsFailed: "Sorry, I couldn't send the text message right now.",
    goodbye: "Thanks for calling SoilSense. Good luck this season.",
    error: "Sorry, I couldn't reach the climate data service right now. Please call back in a few minutes.",
    outside: "Sorry, SoilSense currently covers farms in the lower forty-eight states.",
    why: "Here's why.",
    alt: (label: string) => `Another good option is ${label}.`,
  },
  es: {
    welcome: "Bienvenido a SoilSense, su asesor de rotación de cultivos con datos climáticos de la NASA.",
    langPrompt: "",
    zipPrompt: "Por favor marque o diga el código postal de cinco dígitos de su campo.",
    zipRetry: "Lo siento, no entendí un código postal válido.",
    zipGot: (place: string) => `Entendido. Un campo cerca de ${place}.`,
    cropPrompt: "¿Qué sembró en este campo este año? Oprima 1 para maíz, 2 para soya, 3 para trigo, 4 para avena, o 5 para alfalfa o heno.",
    cropRetry: "Lo siento, no entendí.",
    irrPrompt: "¿El campo tiene riego? Oprima 1 para sí, o 2 para no.",
    priPrompt: "¿Qué es lo más importante para usted? Oprima 1 para ganancia, 2 para salud del suelo, 3 para menor riesgo, o 4 para un balance.",
    working: "Gracias. Estoy revisando unos treinta y cinco años de datos climáticos de la NASA para su campo.",
    menu: "Oprima 2 para recibir el plan por mensaje de texto, 9 para escucharlo otra vez, o cuelgue cuando termine.",
    smsSent: "Le envié el plan a su teléfono.",
    smsFailed: "Lo siento, no pude enviar el mensaje ahora.",
    goodbye: "Gracias por llamar a SoilSense.",
    error: "Lo siento, no pude conectar con el servicio de datos climáticos. Por favor llame más tarde.",
    outside: "Lo siento, SoilSense cubre granjas en los cuarenta y ocho estados continentales.",
    why: "Estas son las razones.",
    alt: (label: string) => `Otra buena opción es ${label}.`,
  },
} as const;

const CROP_KEYS: Record<string, CropId> = { "1": "corn", "2": "soybean", "3": "winter_wheat", "4": "oats", "5": "alfalfa" };
const PRI_KEYS: Record<string, Priority> = { "1": "profit", "2": "soil", "3": "risk", "4": "balanced" };

export function parseCropAnswer(digits: string, speech: string): CropId | null {
  if (digits && CROP_KEYS[digits]) return CROP_KEYS[digits] ?? null;
  const s = speech.toLowerCase();
  if (/corn|maíz|maiz/.test(s)) return "corn";
  if (/soy/.test(s)) return "soybean";
  if (/wheat|trigo/.test(s)) return "winter_wheat";
  if (/oat|avena/.test(s)) return "oats";
  if (/alfalfa|hay|heno/.test(s)) return "alfalfa";
  return null;
}

export function parsePriorityAnswer(digits: string, speech: string): Priority | null {
  if (digits && PRI_KEYS[digits]) return PRI_KEYS[digits] ?? null;
  const s = speech.toLowerCase();
  if (/profit|money|income|ganancia/.test(s)) return "profit";
  if (/soil|suelo/.test(s)) return "soil";
  if (/risk|safe|riesgo/.test(s)) return "risk";
  if (/balance|all|todo/.test(s)) return "balanced";
  return null;
}

export function parseYesNo(digits: string, speech: string): boolean | null {
  if (digits === "1") return true;
  if (digits === "2") return false;
  const s = speech.toLowerCase();
  if (/\b(yes|yeah|yep|sí|si)\b/.test(s)) return true;
  if (/\b(no|nope)\b/.test(s)) return false;
  return null;
}

const WORD_DIGITS: Record<string, string> = { zero: "0", oh: "0", o: "0", one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7", eight: "8", nine: "9" };
export function parseZip(digits: string, speech: string): string | null {
  if (/^\d{5}$/.test(digits)) return digits;
  const spoken = speech
    .toLowerCase()
    .split(/[\s,.-]+/)
    .map((w) => WORD_DIGITS[w] ?? w)
    .join("")
    .replace(/\D/g, "");
  return /^\d{5}$/.test(spoken) ? spoken : null;
}

// ---------------- Middleware: Twilio signature check + form parsing ----------------

voice.use("*", async (c, next) => {
  const form: Record<string, string> = {};
  if (c.req.method === "POST") {
    const body = await c.req.parseBody();
    for (const [k, v] of Object.entries(body)) if (typeof v === "string") form[k] = v;
  }
  c.set("form", form);

  const mustValidate = c.env.TWILIO_VALIDATE !== "false";
  if (mustValidate) {
    if (!c.env.TWILIO_AUTH_TOKEN) {
      console.error("TWILIO_AUTH_TOKEN missing while TWILIO_VALIDATE is on");
      return c.text("Voice is not configured", 503);
    }
    const reqUrl = new URL(c.req.url);
    const url = c.env.PUBLIC_BASE_URL ? `${c.env.PUBLIC_BASE_URL.replace(/\/$/, "")}${reqUrl.pathname}${reqUrl.search}` : c.req.url;
    const ok = await validateTwilioRequest(c.env.TWILIO_AUTH_TOKEN, url, form, c.req.header("X-Twilio-Signature"));
    if (!ok) return c.text("Invalid signature", 403);
  }
  await next();
});

function twiml(c: Ctx, xml: string) {
  return c.body(xml, 200, { "Content-Type": "text/xml; charset=utf-8" });
}

function state(c: Ctx): URLSearchParams {
  return new URL(c.req.url).searchParams;
}

function lang(c: Ctx): Lang {
  return state(c).get("lang") === "es" ? "es" : "en";
}

function next(path: string, params: URLSearchParams, extra: Record<string, string> = {}): string {
  const p = new URLSearchParams(params);
  for (const [k, v] of Object.entries(extra)) p.set(k, v);
  p.delete("try");
  if (extra.try) p.set("try", extra.try);
  return `/voice/${path}?${p.toString()}`;
}

function input(c: Ctx): { digits: string; speech: string } {
  const f = c.get("form");
  return { digits: (f.Digits ?? "").trim(), speech: (f.SpeechResult ?? "").trim() };
}

function retryOrGiveUp(c: Ctx, step: string, sorry: string, prompt: string, gatherXml: (inner: string) => string) {
  const tries = Number(state(c).get("try") ?? "0");
  const l = lang(c);
  if (tries >= 2) return twiml(c, response(say(T[l].goodbye, l), "<Hangup/>"));
  return twiml(c, response(gatherXml(say(`${sorry} ${prompt}`, l)), redirect(next(step, state(c), { try: String(tries + 1) }))));
}

// ---------------- Steps ----------------

// Calls go to the conversational agent (Gemini over ConversationRelay) when it is configured.
// The keypad menu below stays as the fallback: VOICE_MODE=ivr forces it, and /agent-done
// falls back to it if the agent session fails.
voice.post("/incoming", async (c) => {
  if (c.env.VOICE_MODE !== "ivr") {
    const xml = await agentTwiml(c.env, c.req.url, c.get("form").CallSid ?? "");
    if (xml) return twiml(c, xml);
  }
  return ivrStart(c);
});

voice.post("/ivr", (c) => ivrStart(c));

voice.post("/agent-done", (c) => {
  const f = c.get("form");
  let reason = "";
  try {
    reason = (JSON.parse(f.HandoffData || "{}") as { reason?: string }).reason ?? "";
  } catch {
    // not JSON
  }
  const failed = Boolean(f.ErrorCode) || f.SessionStatus === "failed";
  if (failed) console.warn(JSON.stringify({ msg: "voice agent session failed", callSid: f.CallSid, errorCode: f.ErrorCode, errorMessage: f.ErrorMessage }));
  if (reason === "ivr" || failed) return twiml(c, response(say("Let me move you to the keypad menu."), redirect("/voice/ivr")));
  return twiml(c, response("<Hangup/>"));
});

function ivrStart(c: Ctx) {
  const params = new URLSearchParams();
  return twiml(
    c,
    response(
      say(T.en.welcome),
      gather({ action: next("lang", params), input: "dtmf", numDigits: 1, timeout: 4 }, say(T.en.langPrompt)),
      redirect(next("lang", params, { lang: "en" })),
    ),
  );
}

voice.post("/lang", (c) => {
  const { digits } = input(c);
  const l: Lang = digits === "2" || state(c).get("lang") === "es" ? "es" : "en";
  const params = new URLSearchParams({ lang: l });
  const g = (inner: string) => gather({ action: next("zip", params), numDigits: 5, lang: l, hints: "zip code" }, inner);
  return twiml(c, response(l === "es" ? say(T.es.welcome, "es") : "", g(say(T[l].zipPrompt, l)), redirect(next("zip", params, { try: "1" }))));
});

voice.post("/zip", async (c) => {
  const l = lang(c);
  const { digits, speech } = input(c);
  const zip = parseZip(digits, speech);
  const place = zip ? await lookupZip(c.env.DB, zip) : null;
  const g = (inner: string) => gather({ action: next("zip", state(c)), numDigits: 5, lang: l }, inner);
  if (!zip || !place) return retryOrGiveUp(c, "zip", T[l].zipRetry, T[l].zipPrompt, g);
  if (!isInContiguousUS(place.lat, place.lon)) return twiml(c, response(say(T[l].outside, l), "<Hangup/>"));

  const params = new URLSearchParams(state(c));
  params.set("zip", zip);
  params.set("lat", place.lat.toFixed(4));
  params.set("lon", place.lon.toFixed(4));
  params.set("place", `${place.place}, ${place.state}`);
  return twiml(
    c,
    response(
      say(T[l].zipGot(`${place.place}, ${place.state}`), l),
      gather({ action: next("crop", params), numDigits: 1, lang: l, hints: "corn, soybeans, wheat, oats, alfalfa, hay" }, say(T[l].cropPrompt, l)),
      redirect(next("crop", params, { try: "1" })),
    ),
  );
});

voice.post("/crop", (c) => {
  const l = lang(c);
  const { digits, speech } = input(c);
  const crop = parseCropAnswer(digits, speech);
  if (!crop)
    return retryOrGiveUp(c, "crop", T[l].cropRetry, T[l].cropPrompt, (inner) => gather({ action: next("crop", state(c)), numDigits: 1, lang: l }, inner));
  const params = new URLSearchParams(state(c));
  params.set("crop", crop);
  return twiml(c, response(gather({ action: next("irrigation", params), numDigits: 1, lang: l }, say(T[l].irrPrompt, l)), redirect(next("irrigation", params, { try: "1" }))));
});

voice.post("/irrigation", (c) => {
  const l = lang(c);
  const { digits, speech } = input(c);
  const irr = parseYesNo(digits, speech);
  if (irr === null)
    return retryOrGiveUp(c, "irrigation", T[l].cropRetry, T[l].irrPrompt, (inner) => gather({ action: next("irrigation", state(c)), numDigits: 1, lang: l }, inner));
  const params = new URLSearchParams(state(c));
  params.set("irr", irr ? "1" : "0");
  return twiml(c, response(gather({ action: next("priority", params), numDigits: 1, lang: l }, say(T[l].priPrompt, l)), redirect(next("priority", params, { try: "1" }))));
});

voice.post("/priority", (c) => {
  const l = lang(c);
  const { digits, speech } = input(c);
  const pri = parsePriorityAnswer(digits, speech);
  if (!pri)
    return retryOrGiveUp(c, "priority", T[l].cropRetry, T[l].priPrompt, (inner) => gather({ action: next("priority", state(c)), numDigits: 1, lang: l }, inner));
  const params = new URLSearchParams(state(c));
  params.set("pri", pri);
  return twiml(c, response(say(T[l].working, l), redirect(next("plan", params))));
});

async function planFromState(c: Ctx): Promise<PlanResponse | null> {
  const s = state(c);
  const lat = Number(s.get("lat"));
  const lon = Number(s.get("lon"));
  const crop = s.get("crop") as CropId | null;
  const pri = (s.get("pri") ?? "balanced") as Priority;
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !crop || !CROPS[crop]) return null;
  // Twilio waits at most 15 s for a webhook; keep a margin for speech synthesis.
  return withTimeout(
    makePlan(c.env, { lat, lon, irrigated: s.get("irr") === "1", priority: pri, recentCrops: [crop], language: lang(c) }, { placeName: s.get("place") ?? undefined, skipCropHistory: true }),
    12_000,
  );
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timed out after ${ms} ms`)), ms);
    p.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function menu(c: Ctx, l: Lang) {
  return gather({ action: next("menu", state(c)), numDigits: 1, lang: l, timeout: 8 }, say(T[l].menu, l));
}

voice.post("/plan", async (c) => {
  const l = lang(c);
  try {
    const plan = await planFromState(c);
    if (!plan) return twiml(c, response(say(T[l].error, l), "<Hangup/>"));
    c.executionCtx.waitUntil(
      logPlan(c.env, { channel: "voice", callSid: c.get("form").CallSid, caller: maskPhone(c.get("form").From), place: state(c).get("place") ?? undefined, plan }),
    );
    return twiml(c, response(say(plan.explanation.speech, l), pause(1), menu(c, l), say(T[l].goodbye, l)));
  } catch (err) {
    console.error(JSON.stringify({ msg: "voice plan failed", err: String(err) }));
    return twiml(c, response(say(T[l].error, l), "<Hangup/>"));
  }
});

voice.post("/menu", async (c) => {
  const l = lang(c);
  const { digits, speech } = input(c);
  const choice = digits || (/why|por qu/i.test(speech) ? "1" : /text|mensaje/i.test(speech) ? "2" : /other|another|otra/i.test(speech) ? "3" : /again|repeat|otra vez/i.test(speech) ? "9" : "");
  if (!["1", "2", "3", "9"].includes(choice)) return twiml(c, response(say(T[l].goodbye, l), "<Hangup/>"));

  try {
    const plan = await planFromState(c);
    if (!plan) return twiml(c, response(say(T[l].error, l), "<Hangup/>"));
    let speak = "";
    if (choice === "1") {
      const facts = [
        ...plan.facts.filter((f) => f.kind === "climate" && f.significant).slice(0, 1),
        ...plan.facts.filter((f) => f.id.startsWith("risk-")).slice(0, 1),
        ...plan.facts.filter((f) => f.kind === "agronomy").slice(0, 1),
        ...plan.facts.filter((f) => f.id === "vs-current"),
      ];
      speak = toSpeech(`${T[l].why} ${facts.map((f) => f.text).join(" ")}`);
    } else if (choice === "2") {
      const f = c.get("form");
      const to = f.From;
      const from = c.env.TWILIO_FROM_NUMBER || f.To;
      const ok =
        Boolean(to && from && c.env.TWILIO_ACCOUNT_SID && c.env.TWILIO_AUTH_TOKEN) &&
        (await sendSms({ accountSid: c.env.TWILIO_ACCOUNT_SID!, authToken: c.env.TWILIO_AUTH_TOKEN!, from: from!, to: to!, body: plan.explanation.sms }));
      speak = ok ? T[l].smsSent : T[l].smsFailed;
    } else if (choice === "3") {
      const alt = plan.plans[1];
      speak = alt
        ? toSpeech(T[l].alt(alt.years.map((y) => `${y.cropName.toLowerCase()} in ${y.year}${y.cover !== "none" ? ` with ${y.coverName.toLowerCase()}` : ""}`).join(", then ")))
        : T[l].goodbye;
    } else speak = plan.explanation.speech;
    return twiml(c, response(say(speak, l), pause(1), menu(c, l), say(T[l].goodbye, l)));
  } catch (err) {
    console.error(JSON.stringify({ msg: "voice menu failed", err: String(err) }));
    return twiml(c, response(say(T[l].error, l), "<Hangup/>"));
  }
});
