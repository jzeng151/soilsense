import { describe, it, expect } from 'vitest';
import { fields } from '../src/worker/routes/fields';
describe('field boundary feature flag', () => {
  it('defaults to the exact disabled response', async () => {
    const response = await fields.request('/status', {}, {});
    expect(response.status).toBe(404);
    expect(await response.text()).toBe('{"error":"fields disabled"}');
  });
  it('advertises enabled status only with explicit on', async () => {
    const response = await fields.request('/status', {}, { FIELDS_ENABLED: 'on' });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ enabled: true, areas: expect.any(Array) });
  });
});
