/** Published regional evidence only. This module is not imported by ranking or Field Watch. */
export interface AquiferBundle {
  section: {
    attributes: {
      TRS: string;
      gmd: number | null;
      satthick_2022_2024: number | null;
      chng_predev_20222024_act: number | null;
      chng_predev_20222024_pct: number | null;
      chng_3yr_2013_2023: number | null;
      eul_3yr_2013_2023_200gpm: number | null;
    };
    geometry: { rings: number[][][] };
  };
  boundary: { demoPoints: { lat: number; lon: number; inMappedHighPlainsAquifer: boolean }[] };
}
export interface AquiferContext {
  status: 'available' | 'outside-aquifer' | 'unavailable' | 'invalid-point';
  sectionId: string | null;
  saturatedThicknessFt: number | null;
  predevelopmentChangeFt: number | null;
  predevelopmentChangePercent: number | null;
  decadeWaterLevelChangeFt: number | null;
  publishedUsableLifetimeYears: number | null;
  gmd: number | null;
  lema: 'unverified';
}

function empty(status: AquiferContext['status']): AquiferContext {
  return { status, sectionId: null, saturatedThicknessFt: null,
    predevelopmentChangeFt: null, predevelopmentChangePercent: null,
    decadeWaterLevelChangeFt: null, publishedUsableLifetimeYears: null,
    gmd: null, lema: 'unverified' };
}

// Even/odd polygon containment supports holes. Boundary itself is ambiguous:
// don't choose a section or infer water rights for a point exactly on an edge.
function insideSection(lat: number, lon: number, rings: number[][][]): boolean {
  let inside = false;
  for (const ring of rings) {
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const a = ring[i]!, b = ring[j]!;
      const ax = a[0]!, ay = a[1]!, bx = b[0]!, by = b[1]!;
      const cross = (lon - ax) * (by - ay) - (lat - ay) * (bx - ax);
      if (Math.abs(cross) < 1e-12 && lon >= Math.min(ax, bx) && lon <= Math.max(ax, bx)
        && lat >= Math.min(ay, by) && lat <= Math.max(ay, by)) return false;
      if ((ay > lat) !== (by > lat) && lon < (bx - ax) * (lat - ay) / (by - ay) + ax) inside = !inside;
    }
  }
  return inside;
}

/** Do not convert aquifer thickness to an allocation or extrapolate a well yield. */
export function aquiferContext(lat: number, lon: number, bundle: AquiferBundle | null): AquiferContext {
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || Math.abs(lat) > 90 || Math.abs(lon) > 180) return empty('invalid-point');
  if (!bundle) return empty('unavailable');
  // DS543 coverage is retained only for these exact queried demo coordinates.
  const demo = bundle.boundary.demoPoints.find(p => p.lat === lat && p.lon === lon);
  if (demo?.inMappedHighPlainsAquifer === false) return empty('outside-aquifer');
  if (!insideSection(lat, lon, bundle.section.geometry.rings)) return empty('unavailable');
  const a = bundle.section.attributes;
  const finite = (v: number | null) => v !== null && Number.isFinite(v) ? v : null;
  const nonnegative = (v: number | null) => v !== null && Number.isFinite(v) && v >= 0 ? v : null;
  return {
    status: 'available', sectionId: a.TRS,
    saturatedThicknessFt: nonnegative(a.satthick_2022_2024),
    predevelopmentChangeFt: finite(a.chng_predev_20222024_act),
    predevelopmentChangePercent: finite(a.chng_predev_20222024_pct),
    decadeWaterLevelChangeFt: finite(a.chng_3yr_2013_2023),
    publishedUsableLifetimeYears: nonnegative(a.eul_3yr_2013_2023_200gpm),
    gmd: a.gmd, lema: 'unverified',
  };
}
