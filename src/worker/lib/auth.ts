// Email + password auth primitives, built on Web Crypto so they run in Workers with no dependencies.
//
// Passwords: PBKDF2-SHA256, 100,000 iterations (the Workers runtime maximum), 16-byte random salt.
//   Stored as "pbkdf2$<iterations>$<salt b64>$<hash b64>" so the cost can be raised later.
// Sessions: a 32-byte random token lives only in an HttpOnly cookie. D1 stores its SHA-256 hash,
//   so a leaked database cannot be used to log in.

import type { Context } from "hono";
import { deleteCookie, getCookie, setCookie } from "hono/cookie";
import type { Env } from "../env";

export const SESSION_COOKIE = "ss_session";
export const SESSION_DAYS = 30;
const PBKDF2_ITERATIONS = 100_000;
const enc = new TextEncoder();

export interface User {
  id: string;
  email: string;
  createdAt: number;
}

// ---------- encoding ----------

function toB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}
function fromB64(s: string): Uint8Array {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function toB64Url(bytes: Uint8Array): string {
  return toB64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
function randomBytes(n: number): Uint8Array {
  const b = new Uint8Array(n);
  crypto.getRandomValues(b);
  return b;
}
function timingSafeEqual(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i]! ^ b[i]!;
  return diff === 0;
}

// ---------- passwords ----------

async function pbkdf2(password: string, salt: Uint8Array, iterations: number): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256);
  return new Uint8Array(bits);
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const hash = await pbkdf2(password, salt, PBKDF2_ITERATIONS);
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toB64(salt)}$${toB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, iter, salt, hash] = stored.split("$");
  const iterations = Number(iter);
  if (scheme !== "pbkdf2" || !Number.isInteger(iterations) || iterations < 1 || !salt || !hash) return false;
  const got = await pbkdf2(password, fromB64(salt), iterations);
  return timingSafeEqual(got, fromB64(hash));
}

/** Spend the same time as a real check when the email doesn't exist, so login timing doesn't reveal accounts. */
const DUMMY_HASH = "pbkdf2$100000$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
export async function burnPasswordCheck(password: string): Promise<void> {
  await verifyPassword(password, DUMMY_HASH);
}

// ---------- validation ----------

export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.trim().toLowerCase();
  if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 128;
export function passwordProblem(raw: unknown): string | null {
  if (typeof raw !== "string") return "Enter a password.";
  if (raw.length < PASSWORD_MIN) return `Use at least ${PASSWORD_MIN} characters for your password.`;
  if (raw.length > PASSWORD_MAX) return `Use at most ${PASSWORD_MAX} characters for your password.`;
  return null;
}

// ---------- sessions ----------

async function sha256B64Url(s: string): Promise<string> {
  return toB64Url(new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(s))));
}

export async function createSession(db: D1Database, userId: string): Promise<{ token: string; expiresAt: number }> {
  const token = toB64Url(randomBytes(32));
  const now = Date.now();
  const expiresAt = now + SESSION_DAYS * 86_400_000;
  await db.batch([
    db.prepare("DELETE FROM sessions WHERE user_id = ?1 AND expires_at < ?2").bind(userId, now),
    db.prepare("INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?1, ?2, ?3, ?4)").bind(await sha256B64Url(token), userId, now, expiresAt),
  ]);
  return { token, expiresAt };
}

export async function userForToken(db: D1Database, token: string): Promise<User | null> {
  const row = await db
    .prepare("SELECT u.id, u.email, u.created_at FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.id = ?1 AND s.expires_at > ?2")
    .bind(await sha256B64Url(token), Date.now())
    .first<{ id: string; email: string; created_at: number }>();
  return row ? { id: row.id, email: row.email, createdAt: row.created_at } : null;
}

export async function deleteSession(db: D1Database, token: string): Promise<void> {
  await db.prepare("DELETE FROM sessions WHERE id = ?1").bind(await sha256B64Url(token)).run();
}

// ---------- cookies ----------

const isHttps = (c: Context) => new URL(c.req.url).protocol === "https:";

export function setSessionCookie(c: Context, token: string, expiresAt: number) {
  setCookie(c, SESSION_COOKIE, token, {
    httpOnly: true,
    secure: isHttps(c),
    sameSite: "Lax",
    path: "/",
    expires: new Date(expiresAt),
  });
}

export function clearSessionCookie(c: Context) {
  deleteCookie(c, SESSION_COOKIE, { path: "/", secure: isHttps(c) });
}

export function sessionToken(c: Context): string | undefined {
  const t = getCookie(c, SESSION_COOKIE);
  return t && /^[A-Za-z0-9_-]{20,100}$/.test(t) ? t : undefined;
}

/** The signed-in user for this request, or null. Cached on the context. */
export async function currentUser(c: Context<{ Bindings: Env; Variables: { user?: User | null } }>): Promise<User | null> {
  const cached = c.get("user");
  if (cached !== undefined) return cached;
  const token = sessionToken(c);
  const user = token && c.env.DB ? await userForToken(c.env.DB, token) : null;
  c.set("user", user);
  return user;
}
