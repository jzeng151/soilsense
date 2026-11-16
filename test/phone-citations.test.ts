import { expect, it, vi } from "vitest";
import { streamText } from "ai";
import { CallSession, agentTwiml } from "../src/worker/routes/agent";
import { sendSms } from "../src/worker/lib/twilio";
import { logVoiceEvent } from "../src/worker/voiceSettings";
import { makePlan } from "../src/worker/service";
import { CORPUS, SOURCES_BY_ID } from "../src/worker/research/config";
import type { Env } from "../src/worker/env";

vi.mock("ai", async importOriginal => ({ ...await importOriginal<typeof import("ai")>(), streamText: vi.fn() }));
vi.mock("../src/worker/lib/twilio", async importOriginal => ({ ...await importOriginal<typeof import("../src/worker/lib/twilio")>(), sendSms: vi.fn(async () => true) }));
vi.mock("../src/worker/voiceSettings", async importOriginal => ({ ...await importOriginal<typeof import("../src/worker/voiceSettings")>(), logVoiceEvent: vi.fn(async () => {}) }));
vi.mock("../src/worker/service", async importOriginal => ({ ...await importOriginal<typeof import("../src/worker/service")>(), makePlan: vi.fn(), logPlan: vi.fn(async () => {}) }));

it("phone protocol validates split citations before speech, logs research, and appends only cited links to the consented SMS", async () => {
  const chunk = CORPUS.chunks[0]!;
  const source = SOURCES_BY_ID.get(chunk.sourceId)!;
  // Deliberately minimal plan fixture; not a forecast or live farm data.
  vi.mocked(makePlan).mockResolvedValue({
    location: { lat: 38, lon: -100, county: null },
    soil: { available: false }, cropHistory: { years: [] },
    climate: { indicators: [] }, plans: [], facts: [],
    request: { irrigated: false }, explanation: { sms: "SoilSense test fixture plan." },
  } as unknown as Awaited<ReturnType<typeof makePlan>>);
  const env = {
    GEMINI_API_KEY: "fixture-not-a-real-key", TWILIO_AUTH_TOKEN: "fixture-not-a-real-secret",
    TWILIO_ACCOUNT_SID: "fixture-account", TWILIO_FROM_NUMBER: "+15005550006",
    AI: { run: async () => ({ data: [new Array(768).fill(0)] }) },
    RESEARCH_INDEX: { query: async () => ({ matches: [{ id: chunk.id, score: 0.9 }] }) },
  } as unknown as Env;
  const ws = { send: vi.fn(), close: vi.fn() };
  const session = new CallSession(ws as unknown as WebSocket, env);
  const twiml = await agentTwiml(env, "https://example.invalid/voice", "fixture-call");
  const token = /name="token" value="([^"]+)"/.exec(twiml!)![1]!;
  await session.onMessage(JSON.stringify({ type: "setup", callSid: "fixture-call", from: "+15005550009", to: "+15005550006", customParameters: { token } }));

  type Executable = { execute: (input: unknown, options: unknown) => Promise<unknown> };
  const readable = (iterator: AsyncGenerator) => new ReadableStream({ async pull(controller) { const part = await iterator.next(); if (part.done) controller.close(); else controller.enqueue(part.value); } }, { highWaterMark: 0 });
  let smsSawAttribution = false;
  vi.mocked(streamText).mockImplementation((options) => {
    const tools = options.tools as unknown as Record<string, Executable>;
    const execute = (name: string, input: unknown) => tools[name]!.execute(input, { toolCallId: name, messages: [], context: {} });
    return {
      fullStream: readable((async function* () {
        await execute("search_research", { question: "rotation", crops: chunk.crops });
        await execute("build_rotation_plan", { lat: 38, lon: -100, recent_crops: ["corn"] });
        yield { type: "text-delta", text: "Research evidence [R" };
        yield { type: "text-delta", text: "1]. Invalid [R999]." };
        yield { type: "text-end", id: "fixture-text" };
        smsSawAttribution = ws.send.mock.calls.some(([raw]) => String(raw).includes(source.title));
        await execute("send_plan_by_text", {});
      })()),
      responseMessages: Promise.resolve([]),
    } as unknown as ReturnType<typeof streamText>;
  });
  await session.onMessage(JSON.stringify({ type: "prompt", voicePrompt: "Yes, research this and text the plan", last: true }));
  expect(smsSawAttribution).toBe(true);
  const said = ws.send.mock.calls.map(([raw]) => JSON.parse(String(raw)) as { token?: string }).map(m => m.token ?? "").join("");
  expect(said).toContain(`according to ${source.publisher}`);
  expect(said).toContain(source.title);
  expect(said).toContain("source unavailable");
  expect(said).not.toMatch(/\[R\d+\]/);
  expect(sendSms).toHaveBeenCalledWith(expect.objectContaining({ body: expect.stringContaining(source.url) }));
  expect(vi.mocked(sendSms).mock.calls[0]![0].body.length).toBeLessThanOrEqual(1600);
  expect(logVoiceEvent).toHaveBeenCalledWith(undefined, expect.objectContaining({ kind: "tool", name: "search_research" }));
  expect(logVoiceEvent).toHaveBeenCalledWith(undefined, expect.objectContaining({ kind: "error", name: "invalid_research_citation", detail: expect.stringContaining("R999") }));
  session.onClose();
});
