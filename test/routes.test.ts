import { describe, expect, it } from "vitest";
import app from "../src/worker/index";
import { computeTwilioSignature } from "../src/worker/lib/twilio";

const ctx = { waitUntil: () => {}, passThroughOnException: () => {}, props: {} } as unknown as ExecutionContext;

describe("worker routes", () => {
  it("health", async () => {
    const res = await app.request("/api/health", {}, {}, ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toMatchObject({ ok: true });
  });

  it("rejects invalid plan requests with 400", async () => {
    const res = await app.request(
      "/api/plan",
      { method: "POST", body: JSON.stringify({ lat: 51.5, lon: -0.12 }), headers: { "Content-Type": "application/json", Authorization: "Bearer t" } },
      { ADMIN_TOKEN: "t" },
      ctx,
    );
    expect(res.status).toBe(400);
  });

  it("requires sign-in for plans", async () => {
    const res = await app.request("/api/plan", { method: "POST", body: JSON.stringify({ lat: 42, lon: -93 }), headers: { "Content-Type": "application/json" } }, {}, ctx);
    expect(res.status).toBe(401);
  });

  it("rejects unsigned Twilio webhooks", async () => {
    const res = await app.request(
      "https://soilsense.test/voice/incoming",
      { method: "POST", body: new URLSearchParams({ CallSid: "CA1" }), headers: { "Content-Type": "application/x-www-form-urlencoded" } },
      { TWILIO_AUTH_TOKEN: "secret" },
      ctx,
    );
    expect(res.status).toBe(403);
  });

  it("accepts correctly signed Twilio webhooks and returns TwiML", async () => {
    const url = "https://soilsense.test/voice/incoming";
    const params = { CallSid: "CA1", From: "+15155550123" };
    const sig = await computeTwilioSignature("secret", url, params);
    const res = await app.request(
      url,
      { method: "POST", body: new URLSearchParams(params), headers: { "Content-Type": "application/x-www-form-urlencoded", "X-Twilio-Signature": sig } },
      { TWILIO_AUTH_TOKEN: "secret" },
      ctx,
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("text/xml");
    expect(await res.text()).toContain("<Gather");
  });

  it("refuses voice when validation is on but no token is configured", async () => {
    const res = await app.request("/voice/incoming", { method: "POST", body: new URLSearchParams({}) }, {}, ctx);
    expect(res.status).toBe(503);
  });
});
