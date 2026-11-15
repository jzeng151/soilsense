// Voice-agent settings that admins can edit from the dashboard (stored in D1 as JSON), plus the
// locked rules that always apply. Editable: greeting, instructions, tool on/off and descriptions.

import { RESEARCH_CITATION_RULES, SEARCH_RESEARCH_DESCRIPTION } from "./research/chat";

export type VoiceToolName = "find_location" | "build_rotation_plan" | "send_plan_by_text" | "end_call" | "search_research";

export interface VoiceToolMeta {
  name: VoiceToolName;
  title: string;
  /** Plain-language note for the dashboard: what the tool does and what it touches. */
  about: string;
  /** Required tools can't be switched off: the agent can't make a plan without them. */
  required: boolean;
  defaultDescription: string;
}

export const VOICE_TOOLS: VoiceToolMeta[] = [
  {
    name: "search_research",
    title: "Search cited research",
    about: "Retrieves verbatim reviewed research from Vectorize, including source links and applicability. Explicitly reports missing evidence.",
    required: false,
    defaultDescription: SEARCH_RESEARCH_DESCRIPTION,
  },
  {
    name: "find_location",
    title: "Find location",
    about: "Turns a spoken or typed ZIP code into a town, state and map point (Zippopotam.us).",
    required: true,
    defaultDescription: "Look up a US 5-digit ZIP code: place name, state, latitude and longitude.",
  },
  {
    name: "build_rotation_plan",
    title: "Build rotation plan",
    about: "Runs the full Soil Sense engine: NASA POWER climate trends, USDA soil and crop history, and ranked 3-year rotations.",
    required: true,
    defaultDescription:
      "Analyze the field: 35 years of NASA POWER climate trends, USDA soil and crop history, and the ranked 3-year rotations with net return per acre.",
  },
  {
    name: "send_plan_by_text",
    title: "Text the plan",
    about: "Sends the latest plan to the caller's phone by SMS through Twilio.",
    required: false,
    defaultDescription: "Text the latest recommended plan to the caller's phone. Only after the caller agrees.",
  },
  {
    name: "end_call",
    title: "End call",
    about: "Hangs up a few seconds after the agent's goodbye.",
    required: false,
    defaultDescription: "Hang up after your goodbye, when the caller is done.",
  },
];

export interface VoiceAgentSettings {
  greeting: string;
  instructions: string;
  tools: Record<VoiceToolName, { enabled: boolean; description: string }>;
  languages: { autoDetect: boolean; enabled: LanguageCode[] };
}

// ---------- Languages ----------
// Twilio ConversationRelay "multi" mode: Deepgram nova-3 detects the caller's language each turn and
// ElevenLabs speaks the reply in the language of the text. These are the languages Deepgram's
// multilingual model detects. English is always on.

export type LanguageCode = "en" | "es" | "fr" | "de" | "hi" | "ru" | "pt" | "ja" | "it" | "nl";

export const LANGUAGES: { code: LanguageCode; name: string; native: string }[] = [
  { code: "en", name: "English", native: "English" },
  { code: "es", name: "Spanish", native: "Español" },
  { code: "fr", name: "French", native: "Français" },
  { code: "de", name: "German", native: "Deutsch" },
  { code: "hi", name: "Hindi", native: "हिन्दी" },
  { code: "ru", name: "Russian", native: "Русский" },
  { code: "pt", name: "Portuguese", native: "Português" },
  { code: "ja", name: "Japanese", native: "日本語" },
  { code: "it", name: "Italian", native: "Italiano" },
  { code: "nl", name: "Dutch", native: "Nederlands" },
];

export const DEFAULT_LANGUAGES: LanguageCode[] = ["en", "es", "fr", "de", "hi"];

export function languageName(code: string | undefined): string {
  return LANGUAGES.find((l) => l.code === code)?.name ?? "English";
}

/** Extra instructions for a multilingual call, built from the enabled languages. */
export function languageRules(enabled: LanguageCode[]): string {
  const names = enabled.map(languageName);
  return `Languages:
- Callers may speak ${names.join(", ")}. Each caller message starts with a tag like "[language: es]" giving the language the phone system detected.
- Always reply in the caller's language when it is one of those. If they speak another language, reply in English and say which languages you speak.
- If the caller asks to switch language, switch. Keep the same language until they change.
- Tool results are in English: translate them naturally. Use the everyday local word for each crop. Say numbers the way a native speaker would.`;
}

export const DEFAULT_GREETING =
  "Hi, this is Sprout from Soil Sense. I can suggest a three year crop plan for your field, based on thirty five years of NASA weather data. To start, what's the ZIP code where your field is?";

export const DEFAULT_INSTRUCTIONS = `You are Sprout, the Soil Sense crop advisor, talking with a US farmer on a phone call.

Your job: recommend a 3-year crop rotation for the caller's field.
1. You need the field's 5-digit ZIP code and what they grew this year. Ask one question at a time.
   If they also say last year's crop, their water (rain only, limited irrigation of about ten inches a year, or full irrigation), or what matters most (profit, soil health, lower risk, or a balance), use it. Otherwise assume rain only and a balance; do not quiz them about everything.
2. Call find_location with the ZIP, then build_rotation_plan. Do not say anything before calling build_rotation_plan; the phone system already tells the caller to wait, in their language.
3. Tell them the recommended plan year by year in one or two sentences, then the single most important reason, and how it compares with what they do now, including bad years: for example "your current crops would have a bad harvest about four years in ten; this plan about two".
   Then offer: hear how the plan would have done in their field's worst past year, what changes if their water changes, another option, or the plan by text message.
   When replaying a past year, say it is history with real weather, not a forecast.
4. Before the call ends, if you built a plan and haven't texted it yet, offer to text them a short summary.
5. When they say goodbye or are done, say a short goodbye and end the call.
If the caller asks about something unrelated to their farm, steer back politely.`;

/** Always appended after the editable instructions; not editable from the dashboard. */
export const LOCKED_RULES = `Rules that always apply:
- ${RESEARCH_CITATION_RULES}
- For research, write inline [R1] markers even on the phone. The server converts each verified marker to spoken source name, year and title; do not invent spoken attributions or read URLs. Cite before offering the SMS so cited links can be included.
- Everything you write is converted to speech. Speak in short, natural sentences, one to three per turn, then let the caller talk.
- Apart from required inline research citation markers, never use markdown, bullet points, lists, emojis, symbols, URLs or abbreviations. Write "per acre", not "/ac", and "degrees", not "°F".
- Round numbers and say them simply, like "about two hundred twenty dollars an acre".
- Only use numbers and facts that tools returned. Never invent yields, prices, weather or soil data. If a tool fails, apologize briefly and ask the caller to check the ZIP code or try again.
- Never mention p-values, statistics terms or model names.
- Coverage is the lower 48 US states only.
- Spoken ZIP codes may arrive as words or with spaces: turn them into 5 digits. Keypad presses arrive as text like "[keypad] 50010".
- Only text the caller after they say yes to a text message.
- Only call tools that are available to you; if you can't do something, say so plainly.`;

export const LIMITS = { greeting: 600, instructions: 8000, toolDescription: 600 } as const;

export function defaultVoiceSettings(): VoiceAgentSettings {
  const tools = {} as VoiceAgentSettings["tools"];
  for (const t of VOICE_TOOLS) tools[t.name] = { enabled: true, description: t.defaultDescription };
  return { greeting: DEFAULT_GREETING, instructions: DEFAULT_INSTRUCTIONS, tools, languages: { autoDetect: true, enabled: [...DEFAULT_LANGUAGES] } };
}

/** Validate and fill in a (possibly partial or stale) settings object. Throws on invalid input. */
export function normalizeVoiceSettings(input: unknown): VoiceAgentSettings {
  const d = defaultVoiceSettings();
  if (!input || typeof input !== "object") return d;
  const o = input as Partial<VoiceAgentSettings>;
  const str = (v: unknown, fallback: string, max: number, label: string) => {
    if (v === undefined || v === null) return fallback;
    if (typeof v !== "string") throw new Error(`${label} must be text`);
    const s = v.trim();
    if (!s) throw new Error(`${label} can't be empty`);
    if (s.length > max) throw new Error(`${label} is too long (max ${max} characters)`);
    return s;
  };
  const out: VoiceAgentSettings = {
    greeting: str(o.greeting, d.greeting, LIMITS.greeting, "Greeting"),
    instructions: str(o.instructions, d.instructions, LIMITS.instructions, "Instructions"),
    tools: d.tools,
    languages: d.languages,
  };
  const lang = o.languages as { autoDetect?: unknown; enabled?: unknown } | undefined;
  if (lang) {
    const valid = new Set(LANGUAGES.map((l) => l.code));
    const picked = Array.isArray(lang.enabled) ? lang.enabled.filter((c): c is LanguageCode => typeof c === "string" && valid.has(c as LanguageCode)) : d.languages.enabled;
    out.languages = {
      autoDetect: typeof lang.autoDetect === "boolean" ? lang.autoDetect : d.languages.autoDetect,
      // Keep the list's order and always include English.
      enabled: LANGUAGES.map((l) => l.code).filter((c) => c === "en" || picked.includes(c)),
    };
  }
  for (const t of VOICE_TOOLS) {
    const given = (o.tools as Record<string, { enabled?: unknown; description?: unknown }> | undefined)?.[t.name];
    out.tools[t.name] = {
      enabled: t.required ? true : typeof given?.enabled === "boolean" ? given.enabled : true,
      description: str(given?.description, t.defaultDescription, LIMITS.toolDescription, `${t.title} description`),
    };
  }
  return out;
}

const KEY = "voice_agent";

export async function loadVoiceSettings(db: D1Database | undefined): Promise<VoiceAgentSettings & { updatedAt: number | null }> {
  if (!db) return { ...defaultVoiceSettings(), updatedAt: null };
  try {
    const row = await db.prepare("SELECT value, updated_at FROM settings WHERE key = ?1").bind(KEY).first<{ value: string; updated_at: number }>();
    if (!row) return { ...defaultVoiceSettings(), updatedAt: null };
    return { ...normalizeVoiceSettings(JSON.parse(row.value)), updatedAt: row.updated_at };
  } catch (err) {
    // A missing table (migration not applied) or bad JSON must never break live calls.
    console.warn(JSON.stringify({ msg: "voice settings load failed, using defaults", err: String(err) }));
    return { ...defaultVoiceSettings(), updatedAt: null };
  }
}

export async function saveVoiceSettings(db: D1Database, s: VoiceAgentSettings): Promise<number> {
  const now = Date.now();
  await db
    .prepare("INSERT INTO settings (key, value, updated_at) VALUES (?1, ?2, ?3) ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at")
    .bind(KEY, JSON.stringify(s), now)
    .run();
  return now;
}

export async function resetVoiceSettings(db: D1Database): Promise<void> {
  await db.prepare("DELETE FROM settings WHERE key = ?1").bind(KEY).run();
}

// ---------- Call activity log ----------

export type VoiceEventKind = "session_start" | "caller" | "agent" | "tool" | "error" | "session_end";

export async function logVoiceEvent(
  db: D1Database | undefined,
  e: { callSid: string; kind: VoiceEventKind; name?: string; detail?: string; durationMs?: number; ok?: boolean },
): Promise<void> {
  if (!db || !e.callSid) return;
  try {
    await db
      .prepare("INSERT INTO voice_events (call_sid, created_at, kind, name, detail, duration_ms, ok) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)")
      .bind(e.callSid, Date.now(), e.kind, e.name ?? null, e.detail?.slice(0, 4000) ?? null, e.durationMs ?? null, e.ok === undefined ? null : e.ok ? 1 : 0)
      .run();
  } catch (err) {
    console.warn(JSON.stringify({ msg: "voice event log failed", err: String(err) }));
  }
}
