import test from 'node:test';
import assert from 'node:assert/strict';
import { commandFieldLabel } from '../src/app/commandFieldLabel';
import type { Active } from '../src/app/commandState';

const varying: NonNullable<Active['fillet']> = { type: 'edge', radiusMode: 'varying' };

test('the explicit edge varying radius has one HUD and handle presentation name', () => {
  const field = Object.freeze({ key: 'radius', label: 'Radius', kind: 'mm' });
  const state = Object.freeze({ ...varying, varyingDraft: Object.freeze({ radius: 1, endRadius: 3 }) });
  assert.equal(commandFieldLabel('fillet', state, field.key, field.label), 'Start radius');
  assert.deepEqual(field, { key: 'radius', label: 'Radius', kind: 'mm' });
  assert.deepEqual(state.varyingDraft, { radius: 1, endRadius: 3 });
});

test('constant, face, full round, absent state and unrelated commands retain their original labels', () => {
  const states: Active['fillet'][] = [undefined, { type: 'edge', radiusMode: 'constant' },
    { type: 'face', radiusMode: 'varying' }, { type: 'full-round', radiusMode: 'varying' }];
  for (const state of states) assert.equal(commandFieldLabel('fillet', state, 'radius', 'Radius'), 'Radius');
  for (const id of ['edit', 'face-fillet', 'full-round', 'chamfer'])
    assert.equal(commandFieldLabel(id, varying, 'radius', 'Original label'), 'Original label');
});

test('end and interior fields and History names are not rewritten; mode changes have no cached label', () => {
  for (const [key, label] of [['endRadius', 'End radius (0: same)'], ['stationRadius', 'Interior radius'], ['r', 'Start radius']])
    assert.equal(commandFieldLabel('fillet', varying, key, label), label);
  assert.equal(commandFieldLabel('edit', varying, 'r', 'Start radius'), 'Start radius');
  assert.equal(commandFieldLabel('fillet', varying, 'radius', 'Radius'), 'Start radius');
  assert.equal(commandFieldLabel('fillet', { type: 'edge', radiusMode: 'constant' }, 'radius', 'Radius'), 'Radius');
  assert.equal(commandFieldLabel('fillet', varying, 'radius', 'Radius'), 'Start radius');
});
