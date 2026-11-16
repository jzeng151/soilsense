import { Hono } from 'hono';
import type { Env } from '../env';
import type { FieldBoundary, FieldsStatus, LonLat } from '../../shared/fields';
import areasData from '../../../data/fields/areas.json';
import finney from '../../../data/fields/finney.json';
import story from '../../../data/fields/story.json';
import champaign from '../../../data/fields/champaign.json';
import lancaster from '../../../data/fields/lancaster.json';

const areas = areasData as FieldsStatus['areas'];
const subsets = { finney, story, champaign, lancaster } as unknown as Record<string, { fields: FieldBoundary[] }>;
const bounds = (polygon: LonLat[][]): [number,number,number,number] => {
  let west=Infinity,south=Infinity,east=-Infinity,north=-Infinity;
  for (const ring of polygon) for (const [lon,lat] of ring) {
    west=Math.min(west,lon);south=Math.min(south,lat);east=Math.max(east,lon);north=Math.max(north,lat);
  }
  return [west,south,east,north];
};

export const fields = new Hono<{ Bindings: Env }>();
fields.use('*', async (c, next) => {
  if (c.env.FIELDS_ENABLED !== 'on') return c.json({ error: 'fields disabled' }, 404);
  await next();
});
fields.get('/status', (c) => c.json({ enabled: true, areas } satisfies FieldsStatus));
fields.get('/', (c) => {
  const area=c.req.query('area'), bbox=c.req.query('bbox');
  if (area && !bbox && Object.hasOwn(subsets,area)) {
    c.header('Cache-Control','public, max-age=3600');
    return c.json({ fields: subsets[area]!.fields, coverage: areas.filter(a=>a.id===area) });
  }
  if (bbox && !area) {
    const parts=bbox.split(',');
    const b=parts.map(Number);
    const [w,s,e,n]=b as [number,number,number,number];
    if (parts.length!==4 || parts.some(x=>!x.trim()) || !b.every(Number.isFinite) || w < -180 || e > 180 || s < -90 || n > 90 || w>=e || s>=n || e-w>0.06 || n-s>0.06) {
      return c.json({ error: 'bbox must be west,south,east,north, at most 0.06 degrees per side' },400);
    }
    const found=Object.values(subsets).flatMap(a=>a.fields).filter(f=> {
      const [fw,fs,fe,fn]=bounds(f.polygon);
      return fw<=e && fe>=w && fs<=n && fn>=s;
    });
    c.header('Cache-Control','public, max-age=3600');
    return c.json({ fields: found.slice(0,500), coverage: areas, truncated: found.length>500 });
  }
  return c.json({ error: 'Supply a known area or a bounded bbox (not both)' },400);
});
