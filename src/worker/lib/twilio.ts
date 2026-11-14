// Twilio helpers: webhook signature validation, TwiML building, SMS sending.

const enc = new TextEncoder();

function base64(bytes: ArrayBuffer): string {
  let s = "";
  for (const b of new Uint8Array(bytes)) s += String.fromCharCode(b);
  return btoa(s);
}

/** Signature per https://www.twilio.com/docs/usage/security#validating-requests */
export async function computeTwilioSignature(authToken: string, url: string, params: Record<string, string>): Promise<string> {
  const data = url + Object.keys(params).sort().map((k) => k + params[k]).join("");
  const key = await crypto.subtle.importKey("raw", enc.encode(authToken), { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  return base64(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function validateTwilioRequest(
  authToken: string,
  url: string,
  params: Record<string, string>,
  signature: string | null | undefined,
): Promise<boolean> {
  if (!signature) return false;
  const expected = await computeTwilioSignature(authToken, url, params);
  return timingSafeEqual(expected, signature);
}

// ---------------- TwiML ----------------

export function xmlEscape(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

export type Lang = "en" | "es";
const VOICE: Record<Lang, { voice: string; language: string }> = {
  en: { voice: "Polly.Joanna", language: "en-US" },
  es: { voice: "Polly.Lupe", language: "es-US" },
};

export function say(text: string, lang: Lang = "en"): string {
  const v = VOICE[lang];
  return `<Say voice="${v.voice}" language="${v.language}">${xmlEscape(text)}</Say>`;
}

export function pause(seconds = 1): string {
  return `<Pause length="${seconds}"/>`;
}

export interface GatherOptions {
  action: string;
  input?: "dtmf" | "speech" | "dtmf speech";
  numDigits?: number;
  timeout?: number;
  hints?: string;
  lang?: Lang;
  finishOnKey?: string;
}

export function gather(opts: GatherOptions, inner: string): string {
  const attrs = [
    `action="${xmlEscape(opts.action)}"`,
    `method="POST"`,
    `input="${opts.input ?? "dtmf speech"}"`,
    `timeout="${opts.timeout ?? 6}"`,
    `speechTimeout="auto"`,
    `language="${VOICE[opts.lang ?? "en"].language}"`,
    `actionOnEmptyResult="true"`,
  ];
  if (opts.numDigits) attrs.push(`numDigits="${opts.numDigits}"`);
  if (opts.hints) attrs.push(`hints="${xmlEscape(opts.hints)}"`);
  if (opts.finishOnKey !== undefined) attrs.push(`finishOnKey="${xmlEscape(opts.finishOnKey)}"`);
  return `<Gather ${attrs.join(" ")}>${inner}</Gather>`;
}

export function redirect(url: string): string {
  return `<Redirect method="POST">${xmlEscape(url)}</Redirect>`;
}

export function response(...parts: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><Response>${parts.join("")}</Response>`;
}

// ---------------- SMS ----------------

export async function sendSms(opts: { accountSid: string; authToken: string; from: string; to: string; body: string }): Promise<boolean> {
  const url = `https://api.twilio.com/2010-04-01/Accounts/${encodeURIComponent(opts.accountSid)}/Messages.json`;
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Basic ${btoa(`${opts.accountSid}:${opts.authToken}`)}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({ From: opts.from, To: opts.to, Body: opts.body.slice(0, 1500) }),
  });
  if (!res.ok) {
    console.warn(JSON.stringify({ msg: "sms failed", status: res.status, body: (await res.text()).slice(0, 300) }));
    return false;
  }
  return true;
}

export function maskPhone(phone: string | undefined): string | null {
  if (!phone) return null;
  const digits = phone.replace(/\D/g, "");
  return digits.length >= 4 ? `***${digits.slice(-4)}` : "***";
}
