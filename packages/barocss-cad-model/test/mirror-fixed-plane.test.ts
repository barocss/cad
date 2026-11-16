import test from 'node:test';
import assert from 'node:assert/strict';
import { commandById, type Ctx } from '../src/app/commands';
import { emptyDoc } from '../src/engine/doc';
const ctx: Ctx = { doc: emptyDoc(), bodies: [], selection: { bodies: [], edges: [], faces: [] } };
const mirror = commandById('mirror')!;
test('picked mirror face explicitly describes a fixed snapshot, not an associative plane', () => {
  const values = { plane: 'xy', at: 20, planeFace: 'n4.top' };
  const steps = mirror.steps!(ctx, values);
  assert.equal(steps[0].text, 'n4.top');
  assert.match(steps[1].text, /Later face changes do not move the mirror plane/);
  assert.deepEqual(values, { plane: 'xy', at: 20, planeFace: 'n4.top' });
});
test('manual numeric edit removes face provenance; replacement picking keeps previous-face recovery', () => {
  const values = { plane: 'xy', at: 20, planeFace: 'n4.top' };
  const edited = mirror.derive!(ctx, { ...values, at: 25 }, ['at']);
  assert.equal(edited.planeFace, '');
  assert.deepEqual(mirror.steps!(ctx, edited), []);
  const picking = mirror.steps!(ctx, { ...values, pickPlane: 'yes' });
  assert.match(picking[0].text, /Cancel plane pick restores/);
  assert.equal(picking[1].label, 'Previous face');
});
