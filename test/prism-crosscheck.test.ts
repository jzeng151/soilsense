import { describe,it,expect,vi,afterEach } from "vitest";
import { compareWeather,type WeatherSeries } from "../src/engine/weatherCrosscheck";
import { getPrism,parsePrismCsv } from "../src/worker/data/prism";
const csv=`PRISM Time Series Data
Location: Lat: 38 Lon: -101.25 Elev: unknown
Spatial resolution: 4km
Dataset: AN91d
PRISM day definition: 24 hours ending at 1200 UTC on the day shown
Grid Cell Interpolation: Off
Date,ppt (mm),tmin (degrees C),tmax (degrees C)
2023-05-01,0.00,3.1,19.5
2023-05-02,,-999,22.1
`;
const series=(rain:number|null,boundary="12UTC"):WeatherSeries=>({id:"fixture",dayBoundary:boundary,rows:[{date:"2023-05-01",rain,tmin:3,tmax:20}]});
afterEach(()=>vi.unstubAllGlobals());
describe("weather consistency diagnostics",()=>{
 it("matching, disagreeing and dry intervals do not declare truth",()=>{
  const [a]=compareWeather(series(10),series(10),["2023-05-01"]);expect(a!.state).toBe("consistent");
  const [b]=compareWeather(series(10),series(20),["2023-05-01"]);expect(b!.absoluteDifference).toBe(10);expect(b!.relativeDifferencePct).toBeCloseTo(66.6666667);expect(b!.state).toBe("disagreeing");
  expect(compareWeather(series(0),series(1.9),["2023-05-01"])[0]).toMatchObject({ state: "descriptive", disagreeing: null, relativeDifferencePct: null });
  expect(compareWeather(series(0),series(0),["2023-05-01"])[0]!.relativeDifferencePct).toBeNull();
  expect(compareWeather(series(10),series(20),["2023-05-01"],75)[0]!.state).toBe("consistent");
 });
 it("boundary mismatch and missing overlap remain independent",()=>{
  const r=compareWeather(series(null),series(5,"LST"),["2023-05-01","2023-05-02"]);expect(r[0]).toMatchObject({state:"missing",missing:true,notComparable:true,absoluteDifference:null});
  expect(compareWeather(series(1),series(5,"LST"),["2023-05-01"])[0]).toMatchObject({state:"not_comparable",absoluteDifference:4,disagreeing:null});expect(r[3]!.missing).toBe(true);
 });
 it("parses real-source schema, preserves null/zero and rejects relabelled version",()=>{expect(parsePrismCsv(csv).rows[0]!.rain).toBe(0);expect(parsePrismCsv(csv).rows[1]!.tmin).toBeNull();expect(parsePrismCsv(csv).rows[1]!.rain).toBeNull();expect(()=>parsePrismCsv(csv.replace("AN91d","unknown"))).toThrow();});
 it("fetches a point subset and retains raw source, not grids",async()=>{
  const fetch=vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({errors:false,result:{csv:"abc/PRISM_daily.csv"}}))).mockResolvedValueOnce(new Response(csv));vi.stubGlobal("fetch",fetch);
  const r=await getPrism(undefined,38,-101.25,"2023-05-01","2023-05-02");expect(r.source.product).toBe("AN91d");expect(r.csv).toBe(csv);expect(r.snapshotId).toMatch(/^[a-f0-9]{64}$/);expect(fetch.mock.calls[0]![0]).toContain("rpc.php");expect(fetch.mock.calls[1]![0]).toContain("/explorer/tmp/abc/");
 });
});
