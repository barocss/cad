import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { groundSelection, pickPlacedPart } from '../src/assembly/groundSelection';
const part = (id: string, grounded?: boolean): PartInstance => ({ id, name: id, doc: emptyDoc(), position: [1, 2, 3], rotation: [10, 20, 30], grounded });
const doc: StudioDoc = { ...emptyDoc(), instances: [part('a', true), part('b'), part('c')] };
test('batch Fix and Unfix preserve every other property and unselected occurrence', () => {
  const before = JSON.stringify(doc), fixed = groundSelection(doc, ['a', 'b', 'b'], true);
  assert.equal(fixed.error, undefined); assert.ok(fixed.instances);
  assert.equal(fixed.instances[0], doc.instances![0]); assert.equal(fixed.instances[2], doc.instances![2]);
  assert.deepEqual(fixed.instances[1], { ...doc.instances![1], grounded: true });
  assert.equal(JSON.stringify(doc), before);
  const unfixed = groundSelection({ ...doc, instances: fixed.instances }, ['a', 'b'], false);
  assert.ok(unfixed.instances); assert.ok(unfixed.instances.every(i => !i.grounded));
  assert.equal(groundSelection({ ...doc, instances: fixed.instances }, ['a', 'b'], true).instances?.[1], fixed.instances[1]);
});
test('missing, nested and pattern-driven targets refuse the entire batch', () => {
  for (const ids of [[], ['a', 'missing'], ['a', 'sub/b']]) assert.ok(groundSelection(doc, ids, true).error);
  const driven = { ...doc, instances: [part('a'), { ...part('b'), pattern: { id: 'pat', k: 1 } }] };
  const before = JSON.stringify(driven);
  assert.ok(groundSelection(driven, ['a', 'b'], true).error); assert.ok(groundSelection(driven, ['a', 'b'], false).error);
  assert.equal(JSON.stringify(driven), before);
});
test('a mate-driven target refuses mixed batch Fix but preserves existing Unfix policy', () => {
  const mated: StudioDoc = { ...doc, mates: [{ id: 'm', kind: 'coincident', a: { part: 'a', face: 'origin:xy' }, b: { part: 'b', face: 'origin:xy' } }] };
  const before = JSON.stringify(mated);
  assert.match(groundSelection(mated, ['c', 'b'], true).error ?? '', /Nothing was changed/);
  assert.ok(groundSelection(mated, ['a', 'b'], false).instances); assert.equal(JSON.stringify(mated), before);
});
test('ordinary picking replaces; additive toggles only top-level ownership', () => {
  assert.deepEqual(pickPlacedPart(['a'], 'b'), ['b']); assert.deepEqual(pickPlacedPart(['a'], 'b', true), ['a', 'b']);
  assert.deepEqual(pickPlacedPart(['a', 'b'], 'a', true), ['b']); assert.deepEqual(pickPlacedPart(['sub/p'], 'a', true), ['a']);
  assert.deepEqual(pickPlacedPart(['a', 'b'], 'sub/p', true), ['sub/p']);
});
