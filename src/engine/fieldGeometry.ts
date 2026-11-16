import type { LonLat } from '../shared/fields';
const RAD = Math.PI / 180;
const RADIUS = 6371008.8;
const SQ_METERS_PER_ACRE = 4046.8564224;

/** Spherical geodesic area (mean Earth radius). Holes subtract; winding independent.
 * Small CSB fields agree with ellipsoidal/Albers CSBACRES within 0.3%.
 * Intended for local WGS84 fields, not antimeridian or pole-spanning polygons.
 */
export function areaAcres(polygon: LonLat[][]): number {
  if (!polygon.length || polygon.some(r => r.length < 4)) throw new Error('Invalid polygon');
  const areas = polygon.map(ring => {
    let sum = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a = ring[i]!, b = ring[i + 1]!;
      sum += (b[0] - a[0]) * RAD * (2 + Math.sin(a[1] * RAD) + Math.sin(b[1] * RAD));
    }
    return Math.abs(sum * RADIUS ** 2 / 2);
  });
  return Math.max(0, areas[0]! - areas.slice(1).reduce((a,b) => a+b,0)) / SQ_METERS_PER_ACRE;
}

/** Area-weighted centroid in local equirectangular coordinates; not guaranteed inside concave fields. */
export function centroid(polygon: LonLat[][]): { lat: number; lon: number } {
  let sx = 0, sy = 0, mass = 0;
  polygon.forEach((ring, index) => {
    const origin = ring[0];
    if (!origin) return;
    let total = 0, x = 0, y = 0;
    for (let i = 0; i < ring.length - 1; i++) {
      const a: LonLat = [ring[i]![0] - origin[0], ring[i]![1] - origin[1]];
      const b: LonLat = [ring[i+1]![0] - origin[0], ring[i+1]![1] - origin[1]];
      const cross = a[0]*b[1] - b[0]*a[1];
      total += cross; x += (a[0]+b[0])*cross; y += (a[1]+b[1])*cross;
    }
    if (Math.abs(total) < 1e-20) return;
    const weight = Math.abs(total) * (index === 0 ? 1 : -1);
    sx += (x/(3*total)+origin[0])*weight; sy += (y/(3*total)+origin[1])*weight; mass += weight;
  });
  if (mass <= 0) throw new Error('Degenerate polygon');
  return { lat: sy/mass, lon: sx/mass };
}

function onSegment(p: LonLat, a: LonLat, b: LonLat, tolerance = 1e-10): boolean {
  const dx = b[0]-a[0], dy = b[1]-a[1];
  const length = Math.hypot(dx,dy);
  if (!length) return Math.hypot(p[0]-a[0],p[1]-a[1]) <= tolerance;
  return Math.abs((p[0]-a[0])*dy-(p[1]-a[1])*dx)/length <= tolerance &&
    p[0] >= Math.min(a[0],b[0])-tolerance && p[0] <= Math.max(a[0],b[0])+tolerance &&
    p[1] >= Math.min(a[1],b[1])-tolerance && p[1] <= Math.max(a[1],b[1])+tolerance;
}
function inRing(point: LonLat, ring: LonLat[]): boolean {
  let inside = false;
  for (let i=0,j=ring.length-1;i<ring.length;j=i++) {
    const a=ring[j]!, b=ring[i]!;
    if (onSegment(point,a,b)) return true;
    if ((a[1]>point[1]) !== (b[1]>point[1]) && point[0] < (b[0]-a[0])*(point[1]-a[1])/(b[1]-a[1])+a[0]) inside = !inside;
  }
  return inside;
}
/** Outer boundary counts as inside; holes and their boundaries do not. */
export function pointInPolygon(point: LonLat, polygon: LonLat[][]): boolean {
  return !!polygon.length && inRing(point,polygon[0]!) && !polygon.slice(1).some(r=>inRing(point,r));
}

/** Positive-length collinear shared edge, including differently segmented edges.
 * 1e-8 degree (~1 mm) tolerance absorbs transform noise, not roads/field gaps.
 * Corner-only contact is not adjacency. */
export function shareEdge(a: LonLat[][], b: LonLat[][]): boolean {
  const tolerance=1e-8;
  for (const ar of a) for (let i=0;i<ar.length-1;i++) {
    const p=ar[i]!, q=ar[i+1]!, dx=q[0]-p[0], dy=q[1]-p[1], length=Math.hypot(dx,dy);
    if (length<=tolerance) continue;
    for (const br of b) for (let j=0;j<br.length-1;j++) {
      const u=br[j]!,v=br[j+1]!;
      if (Math.abs((u[0]-p[0])*dy-(u[1]-p[1])*dx)/length > tolerance || Math.abs((v[0]-p[0])*dy-(v[1]-p[1])*dx)/length > tolerance) continue;
      const t1=((u[0]-p[0])*dx+(u[1]-p[1])*dy)/length;
      const t2=((v[0]-p[0])*dx+(v[1]-p[1])*dy)/length;
      if (Math.min(length,Math.max(t1,t2))-Math.max(0,Math.min(t1,t2))>tolerance) return true;
    }
  }
  return false;
}
