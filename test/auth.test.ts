import { readdirSync, readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import app from "../src/worker/index";
import { hashPassword, verifyPassword } from "../src/worker/lib/auth";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

/** Minimal D1 stand-in over Node's built-in SQLite, with the real migrations applied. */
function fakeD1(): D1Database {
  const db = new DatabaseSync(":memory:");
  for (const f of readdirSync("migrations").sort()) db.exec(readFileSync(`migrations/${f}`, "utf8"));
  const stmt = (sql: string, args: unknown[] = []) => ({
    bind: (...a: unknown[]) => stmt(sql, a),
    first: async () => (db.prepare(sql).get(...(args as never[])) as unknown) ?? null,
    all: async () => ({ results: db.prepare(sql).all(...(args as never[])) }),
    run: async () => {
      db.prepare(sql).run(...(args as never[]));
      return { success: true };
    },
  });
  return {
    prepare: (sql: string) => stmt(sql),
    batch: async (stmts: Array<{ run: () => Promise<unknown> }>) => {
      const out = [];
      for (const s of stmts) out.push(await s.run());
      return out;
    },
  } as unknown as D1Database;
}

const json = (body: unknown, extra: Record<string, string> = {}) => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "Content-Type": "application/json", ...extra },
});
const cookieFrom = (res: Response) => (res.headers.get("Set-Cookie") ?? "").split(";")[0]!;

describe("password hashing", () => {
  it("verifies the right password and rejects others", async () => {
    const h = await hashPassword("correct horse battery");
    expect(h).toMatch(/^pbkdf2\$100000\$/);
    expect(await verifyPassword("correct horse battery", h)).toBe(true);
    expect(await verifyPassword("correct horse batterY", h)).toBe(false);
    expect(await verifyPassword("anything", "garbage")).toBe(false);
  });

  it("salts every hash", async () => {
    expect(await hashPassword("same-password")).not.toBe(await hashPassword("same-password"));
  });
});

describe("auth routes", () => {
  it("signs up, reads the session, logs out, and logs back in", async () => {
    const env = { DB: fakeD1() };

    const signup = await app.request("/api/auth/signup", json({ email: "  Farmer@Example.com ", password: "fieldgreen1" }), env, ctx);
    expect(signup.status).toBe(201);
    expect(await signup.json()).toMatchObject({ user: { email: "farmer@example.com" } });
    const setCookie = signup.headers.get("Set-Cookie") ?? "";
    expect(setCookie).toMatch(/ss_session=/);
    expect(setCookie).toMatch(/HttpOnly/i);
    expect(setCookie).toMatch(/SameSite=Lax/i);
    const cookie = cookieFrom(signup);

    const me = await app.request("/api/auth/me", { headers: { Cookie: cookie } }, env, ctx);
    expect(me.status).toBe(200);
    expect(await me.json()).toMatchObject({ user: { email: "farmer@example.com" } });

    const out = await app.request("/api/auth/logout", { method: "POST", headers: { Cookie: cookie } }, env, ctx);
    expect(out.status).toBe(200);
    expect((await app.request("/api/auth/me", { headers: { Cookie: cookie } }, env, ctx)).status).toBe(401);

    const login = await app.request("/api/auth/login", json({ email: "FARMER@example.com", password: "fieldgreen1" }), env, ctx);
    expect(login.status).toBe(200);
    expect(cookieFrom(login)).not.toBe(cookie);
  });

  it("rejects duplicate emails, weak passwords and bad emails", async () => {
    const env = { DB: fakeD1() };
    expect((await app.request("/api/auth/signup", json({ email: "a@b.co", password: "longenough" }), env, ctx)).status).toBe(201);
    const dup = await app.request("/api/auth/signup", json({ email: "A@B.co", password: "longenough" }), env, ctx);
    expect(dup.status).toBe(409);
    expect((await app.request("/api/auth/signup", json({ email: "c@d.co", password: "short" }), env, ctx)).status).toBe(400);
    expect((await app.request("/api/auth/signup", json({ email: "not-an-email", password: "longenough" }), env, ctx)).status).toBe(400);
  });

  it("gives the same answer for a wrong password and an unknown email", async () => {
    const env = { DB: fakeD1() };
    await app.request("/api/auth/signup", json({ email: "a@b.co", password: "longenough" }), env, ctx);
    const wrongPw = await app.request("/api/auth/login", json({ email: "a@b.co", password: "wrongwrong" }), env, ctx);
    const noUser = await app.request("/api/auth/login", json({ email: "x@y.co", password: "wrongwrong" }), env, ctx);
    expect(wrongPw.status).toBe(401);
    expect(noUser.status).toBe(401);
    expect(await wrongPw.json()).toEqual(await noUser.json());
  });

  it("refuses cross-site posts", async () => {
    const env = { DB: fakeD1() };
    const res = await app.request(
      "https://soilsense.test/api/auth/login",
      json({ email: "a@b.co", password: "longenough" }, { Origin: "https://evil.example" }),
      env,
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("protects dashboard data routes but not health", async () => {
    const env = { DB: fakeD1(), ADMIN_TOKEN: "admin-secret" };
    expect((await app.request("/api/health", {}, env, ctx)).status).toBe(200);
    expect((await app.request("/api/field?lat=42&lon=-93", {}, env, ctx)).status).toBe(401);
    expect((await app.request("/api/plan", json({ lat: 51.5, lon: -0.12 }), env, ctx)).status).toBe(401);
    expect((await app.request("/api/scout/status", {}, env, ctx)).status).toBe(401);

    // A signed-in user gets through (400 here only because London is outside the US).
    const signup = await app.request("/api/auth/signup", json({ email: "a@b.co", password: "longenough" }), env, ctx);
    const plan = await app.request("/api/plan", json({ lat: 51.5, lon: -0.12 }, { Cookie: cookieFrom(signup) }), env, ctx);
    expect(plan.status).toBe(400);

    // Scripts can use the admin token instead of a session.
    const scripted = await app.request("/api/plan", json({ lat: 51.5, lon: -0.12 }, { Authorization: "Bearer admin-secret" }), env, ctx);
    expect(scripted.status).toBe(400);
  });

  it("says clearly when the database is missing", async () => {
    const res = await app.request("/api/auth/signup", json({ email: "a@b.co", password: "longenough" }), {}, ctx);
    expect(res.status).toBe(503);
  });
});
