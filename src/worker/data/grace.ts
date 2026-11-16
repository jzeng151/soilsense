import artifact from "../../../data/grace-wells-finney.json";
import type { GroundwaterResult } from "../../shared/groundwater";
import { compareGroundwater } from "../../engine/groundwater";
import { cached, DAY_SECONDS } from "../lib/cache";
/** A reviewed offline netCDF+KGS subset, not a Worker-sized global netCDF download. */
export async function getGraceWells(db:D1Database|undefined,lat:number,lon:number):Promise<GroundwaterResult> {
 const b=artifact;
 if(Math.abs(lat-b.point.lat)>1e-6||Math.abs(lon-b.point.lon)>1e-6)return {status:"unavailable",note:"Only the documented Finney demo region/well selection is published. This field has no associated comparison; missing is not zero or stable groundwater.",bundle:null,comparison:null};
 const {value}=await cached(db,`grace:RL06.3Mv04:861:kgs:2015-2025:parser1:${b.grace.sha256}:${b.retrievedAt}`,365*DAY_SECONDS,async()=>({bundle:b,comparison:compareGroundwater(b.grace.months,b.kgs.wells)}));
 return {status:"available",note:"Regional-only total terrestrial water storage versus separate point well observations. Not a field/well forecast, pumping measurement or irrigation allocation.",...value};
}
