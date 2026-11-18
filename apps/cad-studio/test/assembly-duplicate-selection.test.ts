import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc, type PartInstance } from '@barocss/cad-model/engine/doc';
import { duplicateSelection } from '../src/assembly/duplicateSelection';
const fixture = (): StudioDoc => ({ ...emptyDoc(), instances: ['a', 'b', 'c'].map((id, k) => ({ id, name: id, doc: rectanglePart(10, 20, 30), position: [k * 40, 2, 3], rotation: [10, 20, 30], part: { id: 'shared', rev: 'A' }, looks: { b3: { material: 'steel' } } })) });
test('one offset copies the group, preserving originals, definitions, appearance and rotation', () => {
  const doc = fixture(), before = structuredClone(doc), out = duplicateSelection(doc, ['b', 'a', 'b'], [7, -3, 2]);
  assert.ok(out.instances); assert.deepEqual(out.ids, ['inst1', 'inst2']); assert.equal(out.instances.length, 5);
  doc.instances!.forEach((i, k) => assert.equal(out.instances[k], i));
  for (let k = 0; k < 2; k++) {
    const old = doc.instances![k]; const copy: PartInstance = out.instances[k + 3];
    assert.deepEqual(copy.position, [old.position[0] + 7, -1, 5]);
    assert.equal(copy.doc, old.doc); assert.equal(copy.rotation, old.rotation); assert.equal(copy.part, old.part); assert.equal(copy.looks, old.looks);
  }
  assert.deepEqual(doc, before);
});
test('zero offset is an explicit duplicate, not a move no-op; names do not collide', () => {
  const doc = fixture(); doc.instances![2].name = 'a copy';
  const out = duplicateSelection(doc, ['a', 'b'], [0, 0, 0]); assert.ok(out.instances);
  assert.equal(out.instances[3].name, 'a copy 2'); assert.equal(out.instances[4].name, 'b copy');
  assert.deepEqual(out.instances[3].position, doc.instances![0].position); assert.notEqual(out.instances[3].position, doc.instances![0].position);
});
test('retained references and sequential allocations reserve IDs without rewriting references', () => {
  const doc = fixture(); doc.assemblySteps = [{ id: 's', name: 'Missing', add: ['inst1'] }];
  doc.variability = { version: 1, inputs: [{ name: 'Height', type: 'number', default: 10, bindings: [{ to: 'parameter', part: 'inst2', parameter: 'h' }] }] };
  const before = structuredClone(doc), out = duplicateSelection(doc, ['a', 'b'], [0, 0, 0]); assert.ok(out.instances);
  assert.deepEqual(out.ids, ['inst3', 'inst4']); assert.deepEqual(doc, before);
});
test('invalid selection, constrained sources, malformed offsets and precision loss refuse atomically', () => {
  const value = [1, 2, 3];
  for (const selected of [[], ['a'], ['a', 'a'], ['a', 'missing'], ['a', 'sub/b']]) assert.ok(duplicateSelection(fixture(), selected, value).error);
  for (const patch of [{ grounded: true }, { hidden: true }, { pattern: { id: 'p', k: 1 } }, { joints: {} }]) {
    const doc = fixture(); Object.assign(doc.instances![1], patch); const before = structuredClone(doc);
    const out = duplicateSelection(doc, ['a', 'b'], value); assert.ok(out.error); assert.equal(out.instances, undefined); assert.deepEqual(doc, before);
  }
  for (const delta of [Array(3), [NaN, 0, 0], [Infinity, 0, 0], [1, 2], [1e30, 0, 0]]) {
    const doc = fixture(), before = structuredClone(doc); assert.ok(duplicateSelection(doc, ['a', 'b'], delta).error); assert.deepEqual(doc, before);
  }
});
test('mates, cuts and pattern seeds refuse while unrelated document data remains untouched', () => {
  const doc = fixture(); doc.mates = [{ id: 'm', kind: 'coincident', a: { part: 'a', face: 'origin:xy' }, b: { part: 'b', face: 'origin:xy' } }];
  assert.ok(duplicateSelection(doc, ['a', 'b'], [1, 0, 0]).error); delete doc.mates;
  doc.instancePatterns = [{ id: 'p', seed: 'b', kind: 'linear', count: 2, spacing: 10, dir: [1, 0, 0] }];
  assert.ok(duplicateSelection(doc, ['a', 'b'], [1, 0, 0]).error); delete doc.instancePatterns;
  doc.assemblyCuts = [{ id: 'cut', profile: { kind: 'circle', radius: 1 }, at: [0, 0, 0], dir: [0, 0, 1], depth: 'through', targets: ['b'] }];
  assert.ok(duplicateSelection(doc, ['a', 'b'], [1, 0, 0]).error);
});
