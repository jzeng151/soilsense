import { test } from 'node:test';
import assert from 'node:assert/strict';
import { prefetchModis } from './prefetch-modis.mjs';

test('warms the four exact demo points with admin auth and verifies cache readback', async () => {
  const calls = [];
  const fetcher = async (url, init) => {
    calls.push({ url, init });
    return new Response(JSON.stringify({ status: 'partial', validCount: 10, expectedCount: 23, retrievedAt: '2026-11-15T15:00:00Z' }));
  };
  await prefetchModis('http://127.0.0.1:8792', 2025, 'test-only', fetcher, () => {});
  assert.equal(calls.length, 8);
  assert.deepEqual(calls.filter(c => c.init.method === 'POST').map(c => new URL(c.url).searchParams.get('lat')), ['38.1095', '42.0563', '40.048', '40.73']);
  assert.ok(calls.every(c => c.init.headers.Authorization === 'Bearer test-only'));
});
test('fails closed without admin token or when warm-up is unavailable', async () => {
  await assert.rejects(prefetchModis('http://127.0.0.1:8792', 2025, '', () => { throw Error('must not fetch'); }), /ADMIN_TOKEN/);
  await assert.rejects(prefetchModis('http://127.0.0.1:8792', 2025, 'test-only', async () => new Response(JSON.stringify({ status: 'unavailable', validCount: 0 })), () => {}), /unavailable/);
});
