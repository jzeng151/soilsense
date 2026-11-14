export interface Env {
  ASSETS?: Fetcher;
  DB?: D1Database;
  AI?: Ai;
  AI_MODEL?: string;
  TWILIO_ACCOUNT_SID?: string;
  TWILIO_AUTH_TOKEN?: string;
  TWILIO_FROM_NUMBER?: string;
  TWILIO_VALIDATE?: string;
  NASS_API_KEY?: string;
  /** OpenET API key (https://etdata.org): measured field water use, used to check the water model. Optional. */
  OPENET_API_KEY?: string;
  PUBLIC_BASE_URL?: string;
  PLAN_START_YEAR?: string;
  HISTORY_START_YEAR?: string;
  ADMIN_TOKEN?: string;
  /** Google Gemini API key for the Scout chat agent. */
  GEMINI_API_KEY?: string;
  /** Optional Gemini model override (default gemini-3.8-flash). */
  GEMINI_MODEL?: string;
  /** Optional Gemini model for the phone voice agent (default gemini-3.5-flash-lite, chosen for speed). */
  VOICE_MODEL?: string;
  /** "ivr" forces the keypad phone menu; otherwise calls go to the conversational voice agent. */
  VOICE_MODE?: string;
}
