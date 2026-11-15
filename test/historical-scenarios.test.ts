import { describe,it,expect,vi,afterEach } from "vitest";
import { buildHistoricalScenarios } from "../src/engine/historicalScenarios";
import type { DailyClimate } from "../src/engine/climate";
import { historicalScenarios } from "../src/worker/routes/historicalScenarios";
vi.mock("../src/worker/data/power",()=>({snapToPowerGrid:(lat:number,lon:number)=>({lat,lon}),getDailyClimate:vi.fn()}));
import { getDailyClimate } from "../src/worker/data/power";
function fixture():DailyClimate{return {gridCell:{lat:38,lon:-101},firstYear:2021,lastYear:2023,years:[2021,2022,2023].map(year=>({year,days:Array.from({length:62},(_,i)=>{const d=new Date(Date.UTC(year,6,1+i));return {month:d.getUTCMonth()+1,day:d.getUTCDate(),doy:182+i,tmax:year===2022?31:32,tmin:20,t2m:25,gwetroot:null,prcp:0};})}))};}
afterEach(()=>vi.clearAllMocks());
describe("hot-year scenarios",()=>{
 it("selects by the declared metric, retains ties and does not force 2022",()=>{const r=buildHistoricalScenarios(fixture(),2021,2023);expect(r.tiedYears).toEqual([2021,2023]);expect(r.hot?.heatDegreeDaysC).toBe(124);expect(r.replay2022?.heatDegreeDaysC).toBe(62);expect(r.hot?.rainMm).toBe(0);expect(JSON.parse(JSON.stringify(r))).toEqual(r);});
 it("excludes gaps, includes absent candidate years, keeps missing rain separate",()=>{const f=fixture();f.years[0]!.days.pop();f.years[2]!.days[0]!.prcp=null;const r=buildHistoricalScenarios(f,2020,2023);expect(r.candidates[0]!.missingHeat).toBe(62);expect(r.tiedYears).toEqual([2023]);expect(r.hot?.rainMm).toBeNull();expect(r.reference.rainYears).toEqual([2022]);expect(f.years[1]!.days[0]!.tmax).toBe(31);});
 it("returns immutable parsed weather/config snapshot from mocked upstream",async()=>{vi.mocked(getDailyClimate).mockResolvedValue(fixture());const r=await historicalScenarios.request("/?lat=38&lon=-101",{},{});const j=await r.json() as {snapshot:{id:string;inputs:{climate:DailyClimate}}};expect(r.status).toBe(200);expect(j.snapshot.id).toMatch(/^[a-f0-9]{64}$/);expect(j.snapshot.inputs.climate).toEqual(fixture());});
});
