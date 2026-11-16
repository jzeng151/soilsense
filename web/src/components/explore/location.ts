export interface ExploreLocation { label: string; lat: number; lon: number; zip?: string; selectedFieldIds?: string[] }
export function locationFromHash(hash: string): ExploreLocation | null {
  const query = hash.split('?')[1];
  if(!query)return null;
  const p=new URLSearchParams(query), lat=Number(p.get('lat')), lon=Number(p.get('lon'));
  if(!p.has('lat')||!p.has('lon')||!Number.isFinite(lat)||!Number.isFinite(lon)||Math.abs(lat)>85||Math.abs(lon)>180)return null;
  return {label:p.get('label')||`${lat.toFixed(4)}, ${lon.toFixed(4)}`,lat,lon};
}
export function landingRedirect(hash: string, enabled: boolean): string | null {
  return enabled && (hash === '' || hash === '#/' || hash === '#') ? '#/explore' : null;
}
