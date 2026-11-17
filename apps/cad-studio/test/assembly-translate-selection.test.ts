import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, type PartInstance, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { translateSelection } from '../src/assembly/translateSelection';
const part = (id: string, x: number): PartInstance => ({ id, name: id, doc: emptyDoc(), position: [x, 2, 3], rotation: [10, 20, 30], part: { id: 'shared', rev: 'A' } });
const source = (): StudioDoc => ({ ...emptyDoc(), instances: [part('a', 4), part('b', 24), part('c', 50)] });
test('one offset preserves relative placement, rotations, definitions and unselected identities', () => {
  const doc = source(), before = JSON.stringify(doc), out = translateSelection(doc, ['a', 'b', 'b'], [7, -3, 2.5]); assert.ok(out.instances);
  assert.deepEqual(out.instances.map(i => i.position), [[11, -1, 5.5], [31, -1, 5.5], [50, 2, 3]]);
  for (let k = 0; k < 2; k++) { assert.equal(out.instances[k].doc, doc.instances![k].doc); assert.equal(out.instances[k].rotation, doc.instances![k].rotation); assert.equal(out.instances[k].part, doc.instances![k].part); }
  assert.equal(out.instances[2], doc.instances![2]); assert.equal(JSON.stringify(doc), before);
  assert.equal(translateSelection(doc, ['a', 'b'], [0, 0, 0]).instances?.[0], doc.instances![0]);
});
test('all targets preflight before mutation: missing/nested/fixed/hidden/pattern/posed', () => {
  for (const patch of [{ grounded: true }, { hidden: true }, { pattern: { id: 'p', k: 1 } }, { savedPlacement: { position: [0, 0, 0] as [number, number, number], rotation: [0, 0, 0] as [number, number, number] } }]) {
    const doc = source(); Object.assign(doc.instances![1], patch); const before = JSON.stringify(doc); assert.ok(translateSelection(doc, ['a', 'b'], [1, 2, 3]).error); assert.equal(JSON.stringify(doc), before);
  }
  for (const ids of [[], ['a'], ['a', 'a'], ['a', 'missing'], ['a', 'sub/b']]) assert.ok(translateSelection(source(), ids, [1, 2, 3]).error);
  const seed = source(); seed.instancePatterns = [{ id: 'p', seed: 'b', kind: 'linear', count: 2, spacing: 10, dir: [1, 0, 0] }]; assert.ok(translateSelection(seed, ['a', 'b'], [1, 2, 3]).error);
});
test('either mate endpoint and assembly cuts refuse; unrelated cut stays untouched', () => {
  for (const selectedEnd of ['a', 'b'] as const) { const doc = source(); doc.mates = [{ id: 'm', kind: 'coincident', a: { part: 'c', face: 'origin:xy' }, b: { part: 'c', face: 'origin:xy' } }]; doc.mates[0][selectedEnd].part = 'b/leaf'; assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error); }
  const doc = source(); doc.assemblyCuts = [{ id: 'cut', profile: { kind: 'circle', radius: 1 }, at: [0, 0, 0], dir: [0, 0, 1], depth: 'through', targets: ['b'] }]; assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error); doc.assemblyCuts[0].targets = ['c']; assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).instances);
});
test('invalid offset, overflow and nonzero offsets lost to precision refuse', () => {
  for (const delta of [[1, 2], [NaN, 0, 0], [Infinity, 0, 0]]) assert.ok(translateSelection(source(), ['a', 'b'], delta).error);
  assert.ok(translateSelection(source(), ['a', 'b'], [1e30, 0, 0]).error);
  const doc = source(); doc.instances![1].position[0] = Number.MAX_VALUE; assert.ok(translateSelection(doc, ['a', 'b'], [Number.MAX_VALUE, 0, 0]).error); assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error);
});
test('unselected active linked housing blocks without guessing reference ownership', () => {
  const doc = source(); doc.instances![2].doc.nodes = [{ kind: 'bearing', row: '6200', shaft: 0, step: 0, against: 'start', housingRef: { part: 'a', body: 'b0' } }];
  assert.match(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error ?? '', /Linked bearing/);
  doc.instances![2].doc.nodes[0].suppressed = true; assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).instances);
});
test('nested or posed hosts and duplicate occurrence identity refuse', () => {
  const doc = source(); doc.instances![1].doc.instances = [part('leaf', 0)]; assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error);
  delete doc.instances![1].doc.instances; doc.instances![1].joints = {}; assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error);
  delete doc.instances![1].joints; doc.instances!.push(part('b', 90)); assert.ok(translateSelection(doc, ['a', 'b'], [1, 0, 0]).error);
});
