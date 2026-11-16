import { Hono } from 'hono';
import type { Env } from '../env';
import { lookupZip } from '../data/geo';
export const explore = new Hono<{ Bindings: Env }>();
explore.get('/zip/:zip', async c => {
  const zip = c.req.param('zip');
  if (!/^\d{5}$/.test(zip)) return c.json({ error: 'Enter a five-digit US ZIP code.' },400);
  const place = await lookupZip(c.env.DB,zip);
  if (!place) return c.json({ error: 'ZIP lookup unavailable or ZIP not found.' },404);
  c.header('Cache-Control','public, max-age=86400');
  return c.json(place);
});
