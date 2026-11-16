import { describe, expect, it, vi } from "vitest";
import type { UIMessageStreamWriter } from "ai";
import type { Env } from "../src/worker/env";
import { ChatResearch } from "../src/worker/research/chat";
import { ChatFieldMemory } from "../src/worker/fieldMemory";
import { makePlan } from "../src/worker/service";
import { makeTools } from "../src/worker/routes/scout";

vi.mock("../src/worker/service", async importOriginal => ({
  ...await importOriginal<typeof import("../src/worker/service")>(),
  makePlan: vi.fn(async () => { throw new Error("request boundary observed"); }),
}));

describe("Sprout planner tool language propagation", () => {
  it.each(["en", "es", "ko", "zh-Hans"] as const)("forwards %s without letting tool arguments override the UI preference", async language => {
    vi.mocked(makePlan).mockClear();
    const env = {} as Env;
    const tools = makeTools(env, { write: vi.fn() } as unknown as UIMessageStreamWriter, new ChatResearch({}), new ChatFieldMemory(env), language);
    const execute = tools.build_rotation_plan.execute!;
    await expect(execute({ lat: 42.03, lon: -93.62 }, { toolCallId: "language-check", messages: [], context: {} })).rejects.toThrow("request boundary observed");
    expect(makePlan).toHaveBeenCalledWith(env, expect.objectContaining({ language, lat: 42.03, lon: -93.62, priority: "balanced", irrigated: false }));
  });
});
