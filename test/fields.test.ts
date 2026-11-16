import { describe, it, expect } from 'vitest';
import { fields } from '../src/worker/routes/fields';
describe('field boundary feature flag', () => {
  it('defaults to the exact disabled response', async () => {
    const response = await fields.request('/status', {}, {});
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('{"error":"fields disabled"}');
  });
  it('serves all four bounded, source-backed subsets and rejects unbounded queries', async () => {
    const status = await (await fields.request('/status', {}, { FIELDS_ENABLED: 'on' })).json() as {areas:{id:string}[]};
    expect(status.areas.map(a=>a.id)).toEqual(['finney','story','champaign','lancaster']);
    for (const area of status.areas) {
      const response = await fields.request('/?area='+area.id, {}, { FIELDS_ENABLED:'on' });
      const data = await response.json() as {fields:{id:string;cropSequence:unknown[];provenance:{sha256:string}}[]};
      expect(response.status).toBe(200);
      expect(data.fields.length).toBeGreaterThan(0);
      expect(data.fields[0]!.cropSequence).toHaveLength(8);
      expect(data.fields[0]!.provenance.sha256).toMatch(/^[a-f0-9]{64}$/);
    }
    for (const query of ['', '?bbox=1,2,3,4', '?bbox=NaN,1,2,3', '?bbox=-1,2,-2,3', '?area=unknown']) {
      expect((await fields.request('/'+query, {}, { FIELDS_ENABLED:'on' })).status).toBe(400);
    }
    const bbox = await fields.request('/?bbox=-100.72,38.10,-100.70,38.12', {}, { FIELDS_ENABLED:'on' });
    expect(bbox.status).toBe(200);
    expect(((await bbox.json()) as {fields:unknown[]}).fields.length).toBeGreaterThan(0);
  });
  it('gates all query paths before validation', async () => {
    for (const path of ['/', '/?area=finney','/?bbox=bogus']) {
      const response = await fields.request(path, {}, {});
      expect(response.status).toBe(404);
      expect(await response.text()).toBe('{"error":"fields disabled"}');
    }
  });
  it('advertises enabled status only with explicit on', async () => {
    const response = await fields.request('/status', {}, { FIELDS_ENABLED: 'on' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ enabled: true, areas: expect.any(Array) });
  });
});
