// ADMIN_TOKEN=... node scripts/prefetch-modis.mjs https://your-worker.example [completed-year]
// External sequential requests: no cron/waitUntil wall-time assumptions. Never prints the token.
import { pathToFileURL } from 'node:url';
const farms = [
  { id: 'finney-ks', lat: 38.1095, lon: -100.706 },
  { id: 'story-ia', lat: 42.0563, lon: -93.495 },
  { id: 'champaign-il', lat: 40.048, lon: -88.33 },
  { id: 'lancaster-ne', lat: 40.73, lon: -96.55 },
];
export async function prefetchModis(base, year, token, fetcher = fetch, log = console.log) {
  if (!token) throw Error('ADMIN_TOKEN is required');
  const origin = new URL(base);
  if (origin.protocol !== 'https:' && !(origin.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(origin.hostname))) throw Error('Use HTTPS (or local loopback)');
  if (!Number.isInteger(year) || year < 2001 || year >= new Date().getUTCFullYear()) throw Error('Use a completed year from 2001 onward');
  const headers = { Authorization: `Bearer ${token}` };
  for (const farm of farms) {
    const query = `lat=${farm.lat}&lon=${farm.lon}&year=${year}`;
    const t = Date.now();
    const warm = await fetcher(`${origin.origin}/api/vegetation/prefetch?${query}`, { method: 'POST', headers, redirect: 'error', signal: AbortSignal.timeout(600000) });
    if (!warm.ok) throw Error(`${farm.id}: HTTP ${warm.status}`);
    const data = await warm.json();
    if (data.status === 'unavailable' || !(data.validCount > 0) || !data.retrievedAt) throw Error(`${farm.id}: unavailable; demo cache not confirmed`);
    const read = await fetcher(`${origin.origin}/api/vegetation?${query}`, { method: 'GET', headers, redirect: 'error', signal: AbortSignal.timeout(600000) });
    if (!read.ok) throw Error(`${farm.id}: readback HTTP ${read.status}`);
    const verified = await read.json();
    if (JSON.stringify(verified) !== JSON.stringify(data)) throw Error(`${farm.id}: cache readback mismatch`);
    log(`${farm.id}: ${data.status}, ${data.validCount}/${data.expectedCount} valid composites, retrieved ${data.retrievedAt}; warm + readback ${Date.now() - t} ms`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try { await prefetchModis(process.argv[2] ?? 'http://127.0.0.1:8792', Number(process.argv[3] ?? new Date().getUTCFullYear() - 1), process.env.ADMIN_TOKEN); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
