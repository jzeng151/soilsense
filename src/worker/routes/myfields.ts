import { Hono } from "hono";
import { fieldRequestAllowed } from "../fieldwatch/fieldLimit";
import type { AppEnv } from "./auth";
import { agentFor, registeredAccess } from "./fieldwatch";
import { capabilityId, REGISTRATION_BYTES, validateRegistration } from "../fieldwatch/registration";

export const myFields = new Hono<AppEnv>();

myFields.use("*", async (c, next) => {
  c.header("Cache-Control", "no-store");
  if (c.env.FIELDS_ENABLED !== "on") return c.json({ error: "fields disabled" }, 404);
  if (!c.env.FIELD_AGENT) return c.json({ error: "Field agents unavailable." }, 503);
  if (c.req.method !== "GET") {
    const ip = c.req.header("CF-Connecting-IP") ?? "local";
    const allowed = await fieldRequestAllowed(c.env, ip);
    if (!allowed) return c.json({ error: "Too many field requests. Try again in a minute." }, 429);
  }
  await next();
});
myFields.post("/register", async (c) => {
  // Bound body consumption, including chunked bodies (not only Content-Length).
  const reader = c.req.raw.body?.getReader();
  if (!reader) return c.json({ error: "JSON required." }, 400);
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > REGISTRATION_BYTES) { await reader.cancel(); return c.json({ error: "Request too large." }, 413); }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
  let config;
  try { config = await validateRegistration(JSON.parse(new TextDecoder().decode(bytes))); }
  catch (e) { return c.json({ error: e instanceof Error ? e.message : "Invalid field." }, 400); }
  const registry = await agentFor(c.env, "__registry");
  const id = capabilityId();
  if (!await registry.reserveRegistration(id)) return c.json({ error: "Global field registration cap reached." }, 429);
  try { await (await agentFor(c.env, id)).registerField(id, config); }
  catch { await registry.forgetRegistration(id); return c.json({ error: "Registration failed." }, 503); }
  return c.json({ agentFieldId: id, capability: id }, 201);
});
myFields.delete("/:field", async (c) => {
  const id = c.req.param("field");
  const denied = await registeredAccess(c, id);
  if (denied) return denied;
  await (await agentFor(c.env, id)).deleteField(id);
  await (await agentFor(c.env, "__registry")).forgetRegistration(id);
  return c.json({ deleted: true });
});
