import { expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { buildPlan } from '../src/engine/plan';
import { finneyInputs } from './helpers/finney';
// Entire response captured on d0e175f, before constraints implementation; never auto-update.
const before = JSON.parse(readFileSync(new URL('./fixtures/constraints-defaults-before.json', import.meta.url), 'utf8'));
it('preserves complete Finney responses without constraints, all priorities × water levels', () => {
 const rows = ['rain','limited','full'].flatMap(water => ['balanced','profit','soil','risk'].map(priority => {
  const input = { ...finneyInputs, request: { ...finneyInputs.request, water, priority, irrigated: water !== 'rain' } } as typeof finneyInputs;
  return JSON.parse(JSON.stringify(buildPlan(input)));
 }));
 expect(rows).toEqual(before);
});
