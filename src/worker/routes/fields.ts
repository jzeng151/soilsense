import { Hono } from 'hono';
import type { Env } from '../env';
import type { FieldsStatus } from '../../shared/fields';

export const fields = new Hono<{ Bindings: Env }>();
fields.use('*', async (c, next) => {
  if (c.env.FIELDS_ENABLED !== 'on') return c.json({ error: 'fields disabled' }, 404);
  await next();
});
fields.get('/status', (c) => c.json({ enabled: true, areas: [] } satisfies FieldsStatus));
