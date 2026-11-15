// Opt-in integration test: calls the real USDM data services API (public, no key).
// Skipped by default. Run with:  LIVE_USDM=1 npx vitest run test/live-usdm.test.ts
import { describe, expect, it } from "vitest";
import { getUsdmTimeline, usdmCategoryFor } from "../src/worker/data/usdm";

describe.skipIf(process.env.LIVE_USDM !== "1")("live USDM", () => {
  it("2022 Finney County May-Sep timeline and the current category", async () => {
    const t = await getUsdmTimeline(undefined, "20055", "2022-05-01", "2022-09-30");
    console.log(`## 2022 ${t.observedWeeks}/${t.expectedWeeks} ${JSON.stringify(t.counts)} ${t.note}`);
    expect(t.observedWeeks).toBe(23);
    const now = await usdmCategoryFor("20055", new Date().toISOString().slice(0, 10));
    console.log(`## now ${now.status} ${now.label} ${now.source.requestUrl}`);
    expect(now.status === "matched" || now.status === "latest").toBe(true);
  });
});
