// Email + password accounts for the web dashboard.
//   POST /api/auth/signup  { email, password }  → 201 { user }   + session cookie
//   POST /api/auth/login   { email, password }  → 200 { user }   + session cookie
//   POST /api/auth/logout                        → 200 { ok }     + cookie cleared
//   GET  /api/auth/me                            → 200 { user }   or 401

import { Hono } from "hono";
import type { Env } from "../env";
import {
  burnPasswordCheck,
  clearSessionCookie,
  createSession,
  currentUser,
  deleteSession,
  hashPassword,
  normalizeEmail,
  passwordProblem,
  sessionToken,
  setSessionCookie,
  verifyPassword,
  type User,
} from "../lib/auth";

export type AppEnv = { Bindings: Env; Variables: { user?: User | null } };

export const auth = new Hono<AppEnv>();

// Per-isolate brake on password guessing. Add a Cloudflare rate-limiting rule on /api/auth/* for a hard limit.
const attempts = new Map<string, { count: number; reset: number }>();
function tooManyAttempts(ip: string, limit = 20, windowMs = 15 * 60_000): boolean {
  const now = Date.now();
  const a = attempts.get(ip);
  if (!a || a.reset < now) {
    attempts.set(ip, { count: 1, reset: now + windowMs });
    if (attempts.size > 5000) attempts.clear();
    return false;
  }
  a.count += 1;
  return a.count > limit;
}

const noDb = { error: "Accounts aren't available: the database isn't connected. Run the D1 migrations, then try again." };

auth.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (c.req.method === "POST") {
    // CSRF guard: only same-origin JSON posts. (SameSite=Lax cookies already block most cross-site posts.)
    const origin = c.req.header("Origin");
    if (origin && new URL(origin).host !== new URL(c.req.url).host) return c.json({ error: "Cross-site request refused." }, 403);
    if (!(c.req.header("Content-Type") ?? "").includes("application/json") && c.req.path !== "/api/auth/logout")
      return c.json({ error: "Send JSON." }, 415);
  }
  await next();
});

async function readCredentials(c: { req: { json: () => Promise<unknown> } }) {
  const body = (await c.req.json().catch(() => null)) as { email?: unknown; password?: unknown } | null;
  return { email: normalizeEmail(body?.email), password: body?.password };
}

auth.post("/signup", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  if (tooManyAttempts(c.req.header("CF-Connecting-IP") ?? "local")) return c.json({ error: "Too many attempts. Wait 15 minutes and try again." }, 429);
  const { email, password } = await readCredentials(c);
  if (!email) return c.json({ error: "Enter a valid email address." }, 400);
  const problem = passwordProblem(password);
  if (problem) return c.json({ error: problem }, 400);

  const id = crypto.randomUUID();
  const now = Date.now();
  const hash = await hashPassword(password as string);
  try {
    await c.env.DB.prepare("INSERT INTO users (id, email, password_hash, created_at) VALUES (?1, ?2, ?3, ?4)").bind(id, email, hash, now).run();
  } catch (err) {
    if (/UNIQUE/i.test(String(err))) return c.json({ error: "An account with this email already exists. Sign in instead." }, 409);
    throw err;
  }
  const s = await createSession(c.env.DB, id);
  setSessionCookie(c, s.token, s.expiresAt);
  console.log(JSON.stringify({ msg: "account created", userId: id }));
  return c.json({ user: { id, email, createdAt: now } }, 201);
});

auth.post("/login", async (c) => {
  if (!c.env.DB) return c.json(noDb, 503);
  if (tooManyAttempts(c.req.header("CF-Connecting-IP") ?? "local")) return c.json({ error: "Too many attempts. Wait 15 minutes and try again." }, 429);
  const { email, password } = await readCredentials(c);
  const wrong = { error: "That email and password don't match an account." };
  if (!email || typeof password !== "string" || !password || password.length > 1024) return c.json(wrong, 401);

  const row = await c.env.DB.prepare("SELECT id, email, password_hash, created_at FROM users WHERE email = ?1")
    .bind(email)
    .first<{ id: string; email: string; password_hash: string; created_at: number }>();
  if (!row) {
    await burnPasswordCheck(password);
    return c.json(wrong, 401);
  }
  if (!(await verifyPassword(password, row.password_hash))) return c.json(wrong, 401);

  const s = await createSession(c.env.DB, row.id);
  setSessionCookie(c, s.token, s.expiresAt);
  return c.json({ user: { id: row.id, email: row.email, createdAt: row.created_at } });
});

auth.post("/logout", async (c) => {
  const token = sessionToken(c);
  if (token && c.env.DB) await deleteSession(c.env.DB, token);
  clearSessionCookie(c);
  return c.json({ ok: true });
});

auth.get("/me", async (c) => {
  const user = await currentUser(c);
  if (!user) return c.json({ error: "Not signed in." }, 401);
  return c.json({ user });
});
