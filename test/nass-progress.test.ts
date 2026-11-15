import { afterEach, describe, expect, it, vi } from "vitest";
import { bracketSilking, getNassSilking } from "../src/worker/data/nassProgress";
const desc = "CORN - PROGRESS, MEASURED IN PCT SILKING";
const row = (date: string, value: string) => ({ year: 2025, week_ending: date, Value: value, short_desc: desc });
const county = { countyFips: "20055", countyName: "Finney", stateCode: "KS", stateName: "Kansas" };
afterEach(() => vi.unstubAllGlobals());
describe("regional NASS silking, synthetic protocol rows", () => {
  it("brackets without interpolating and retains missing weeks", () => {
    const r = bracketSilking([row("2025-07-01","30"),row("2025-07-15","70"),row("2025-07-08","(D)")],2025,"2025-07-20");
    expect(r.status).toBe("missing_report_gap"); expect(r.gapDays).toBe(14); expect(r.modelMinusSurveyDays).toEqual([5,19]); expect(r.reports).toHaveLength(2);
  });
  it("does not invent a lower bound or accept declining percentages", () => {
    expect(bracketSilking([row("2025-07-15","70")],2025,null).lower).toBeNull();
    expect(bracketSilking([row("2025-07-01","40"),row("2025-07-08","20"),row("2025-07-15","70")],2025,null).status).toBe("inconsistent_reports");
    expect(bracketSilking([row("2025-07-01",""),row("2025-07-08","(Z)")],2025,null).reports).toEqual([]);
  });
  it("explicitly refuses missing credentials without a request", async () => { const fetcher=vi.fn(); vi.stubGlobal("fetch",fetcher); expect((await getNassSilking(undefined,undefined,county,[])).status).toBe("unavailable"); expect(fetcher).not.toHaveBeenCalled(); });
  it("discovers district, falls back to state and excludes key from provenance", async () => {
    vi.stubGlobal("fetch",vi.fn(async (url: string) => {
      const p = new URL(url).searchParams;
      return Response.json({ data: p.get("agg_level_desc") === "COUNTY" ? [{ asd_code:"90",asd_desc:"SOUTHWEST" }] : p.get("agg_level_desc") === "STATE" ? [row("2025-07-01","40"),row("2025-07-08","60")] : [] });
    }));
    const result = await getNassSilking(undefined,"test-only-not-secret",county,[{year:2025,silking:"2025-07-06"}]);
    expect(result.seasons[0]?.geography).toBe("STATE"); expect(result.seasons[0]?.status).toBe("bracketed"); expect(JSON.stringify(result)).not.toContain("test-only-not-secret"); expect(JSON.stringify(result)).not.toContain("key=");
  });
});
