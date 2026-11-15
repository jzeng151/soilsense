import { describe, expect, it, vi, afterEach } from "vitest";
import { cornGddF, dateRange, estimateCornTiming } from "../src/engine/cropTiming";
import { cropTiming } from "../src/worker/routes/cropTiming";
import { getTimingPower } from "../src/worker/data/timingPower";
afterEach(() => vi.unstubAllGlobals());
describe("corn timing sensitivity", () => {
  it("matches independently documented ordinary/cold/hot examples", () => {
    expect(cornGddF((55-32)/1.8,(80-32)/1.8)).toBeCloseTo(17.5);
    expect(cornGddF((40-32)/1.8,(66-32)/1.8)).toBeCloseTo(8);
    expect(cornGddF((72-32)/1.8,(92-32)/1.8)).toBeCloseTo(29);
    expect(cornGddF(-10,-5)).toBe(0); expect(cornGddF(null,20)).toBeNull();
  });
  it("tracks units and planting, never crosses through a missing day", () => {
    const days = dateRange("2023-05-01","2023-10-31").map(date => ({ date, tmin:20, tmax:30, rain:0 }));
    const t = estimateCornTiming(days,"2023-05-01","2023-10-31");
    expect(t.silking).toBe("2023-06-25"); expect(t.accumulatedGddC).toBeCloseTo(4968/1.8);
    expect(estimateCornTiming(days,"2023-05-02","2023-10-31").silking).toBe("2023-06-26");
    expect(estimateCornTiming(days.filter(d => d.date !== "2023-05-08"),"2023-05-01","2023-10-31").silking).toBeNull();
    expect(estimateCornTiming(days.map(d => ({...d,tmax:5,tmin:0})),"2023-05-01","2023-10-31").status).toBe("threshold_not_reached");
    expect(JSON.parse(JSON.stringify(t))).toEqual(t);
  });
  it("retains zero, null, metadata and raw data from a mocked network response", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ header:{fill_value:-999,time_standard:"LST",api:{version:"v2.10.3"}},parameters:{T2M_MIN:{units:"C"},T2M_MAX:{units:"C"},PRECTOTCORR:{units:"mm/day"}},properties:{parameter:{T2M_MIN:{20200101:-999},T2M_MAX:{20200101:20},PRECTOTCORR:{20200101:0}}} }))));
    const r = await getTimingPower(undefined,39,-100,2020);
    expect(r.days[0]).toEqual({date:"2020-01-01",tmin:null,tmax:20,rain:0}); expect(r.snapshotId).toMatch(/^[a-f0-9]{64}$/); expect(r.source.timeStandard).toBe("LST");
  });
  it("rejects an invalid planting date before network access", async () => {
    const r = await cropTiming.request("/?lat=38&lon=-100&year=2023&planting=2023-04-31",{},{}); expect(r.status).toBe(400);
  });
});
