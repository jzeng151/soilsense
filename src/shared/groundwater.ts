import type artifact from "../../data/grace-wells-finney.json";
import type { compareGroundwater } from "../engine/groundwater";
export type GroundwaterBundle = typeof artifact;
export interface GroundwaterResult {status:"available"|"unavailable";note:string;bundle:GroundwaterBundle|null;comparison:ReturnType<typeof compareGroundwater>|null}
