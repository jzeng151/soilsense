// WGS84/NAD83 latitude-longitude → USA Contiguous Albers Equal Area Conic (EPSG:5070),
// the projection used by the USDA Cropland Data Layer. Ellipsoidal formulas from
// Snyder, "Map Projections: A Working Manual" (USGS PP 1395), pp. 101–102.

const A = 6378137.0; // GRS80 semi-major axis (m)
const F = 1 / 298.257222101;
const E2 = 2 * F - F * F;
const E = Math.sqrt(E2);
const RAD = Math.PI / 180;

const LAT1 = 29.5 * RAD;
const LAT2 = 45.5 * RAD;
const LAT0 = 23.0 * RAD;
const LON0 = -96.0 * RAD;

function q(phi: number): number {
  const s = Math.sin(phi);
  return (1 - E2) * (s / (1 - E2 * s * s) - (1 / (2 * E)) * Math.log((1 - E * s) / (1 + E * s)));
}
function m(phi: number): number {
  const s = Math.sin(phi);
  return Math.cos(phi) / Math.sqrt(1 - E2 * s * s);
}

const m1 = m(LAT1);
const m2 = m(LAT2);
const q0 = q(LAT0);
const q1 = q(LAT1);
const q2 = q(LAT2);
const N = (m1 * m1 - m2 * m2) / (q2 - q1);
const C = m1 * m1 + N * q1;
const RHO0 = (A * Math.sqrt(C - N * q0)) / N;

export function toConusAlbers(lat: number, lon: number): { x: number; y: number } {
  const rho = (A * Math.sqrt(C - N * q(lat * RAD))) / N;
  const theta = N * (lon * RAD - LON0);
  return { x: rho * Math.sin(theta), y: RHO0 - rho * Math.cos(theta) };
}
