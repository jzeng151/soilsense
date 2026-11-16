import { describe, expect, it } from 'vitest';
import app from '../src/worker/index';
describe('explore public endpoints', () => {
  it('opens Explore by default with an explicit off escape hatch', async () => {
      for (const [flag, expected] of [[undefined,true], ['off',false], ['true',true], ['on',true]] as const) {
      const r = await app.request('/api/ui/status', {}, { EXPLORE_LANDING: flag });
      expect(r.status).toBe(200);
      expect(await r.json()).toEqual({ exploreLanding: expected });
    }
  });
  it('rejects malformed ZIPs before lookup', async () => {
    expect((await app.request('/api/explore/zip/1234')).status).toBe(400);
    expect((await app.request('/api/explore/zip/123456')).status).toBe(400);
  });
});
