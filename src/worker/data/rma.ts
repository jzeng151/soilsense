// USDA Risk Management Agency crop-insurance losses by cause, per county.
// Built offline by scripts/build-rma-losses.py from the public "Cause of Loss" files and shipped as static
// assets (web/public/data/rma/<state fips>.json), so no database or API key is needed.

import type { CountyInfo, CountyLosses, CropId, LossGroup } from "../../shared/types";

interface StateFile {
  source: string;
  years: number[];
  groups: LossGroup[];
  counties: Record<string, Partial<Record<CropId, Record<string, number[]>>>>;
}

const stateCache = new Map<string, Promise<StateFile | null>>();

async function loadState(assets: Fetcher, stateFips: string): Promise<StateFile | null> {
  try {
    const res = await assets.fetch(new Request(`https://assets.local/data/rma/${stateFips}.json`));
    if (!res.ok) return null;
    return (await res.json()) as StateFile;
  } catch (err) {
    console.warn(JSON.stringify({ msg: "rma losses unavailable", stateFips, err: String(err) }));
    return null;
  }
}

/** Crop-insurance losses for a county, or null when the file or county is missing. Never throws. */
export async function getCountyLosses(assets: Fetcher | undefined, county: CountyInfo | null): Promise<CountyLosses | null> {
  if (!assets || !county) return null;
  const stateFips = county.countyFips.slice(0, 2);
  let p = stateCache.get(stateFips);
  if (!p) {
    p = loadState(assets, stateFips);
    stateCache.set(stateFips, p);
    // Failed loads are retried on a later request instead of being remembered.
    void p.then((v) => v === null && stateCache.delete(stateFips));
  }
  const file = await p;
  const crops = file?.counties[county.countyFips.slice(2)];
  if (!file || !crops) return null;
  return {
    groups: file.groups,
    crops,
    firstYear: Math.min(...file.years),
    lastYear: Math.max(...file.years),
    source: file.source,
  };
}
