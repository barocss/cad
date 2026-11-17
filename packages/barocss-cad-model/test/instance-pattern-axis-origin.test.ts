import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart } from '../src/engine/doc';
import { addPart } from '../src/assembly/edit';
import { readStudioDoc } from '../src/engine/migrate';
import { addInstancePattern, editInstancePattern, expandPatterns } from '../src/assembly/patterns';

test('moving a circular axis origin along world Z does not move copies along Z', () => {
  const doc = addPart(rectanglePart(10, 10, 1), { name: 'Pin', doc: rectanglePart(1, 1, 2), position: [12, 0, 1], rotation: [0, 0, 0] }).doc;
  for (const z of [0, 1e16, -1e16]) {
    const r = addInstancePattern(doc, { seed: 'p1', kind: 'circular', axis: [0, 0, 1], origin: [0, 0, z], count: 4, angle: 90 });
    assert.deepEqual(r.doc.instances!.slice(1).map(i => i.position), [[0, 12, 1], [-12, 0, 1], [0, -12, 1]], `axis origin Z=${z}`);
  }
});

for (const [axisIndex, position, expected] of [
  [0, [1, 12, 0], [[1, 0, 12], [1, -12, 0], [1, 0, -12]]],
  [1, [0, 1, 12], [[12, 1, 0], [0, 1, -12], [-12, 1, 0]]],
  [2, [12, 0, 1], [[0, 12, 1], [-12, 0, 1], [0, -12, 1]]],
] as const) {
  test(`cardinal axis ${axisIndex}: arbitrary signed axis origin preserves axial coordinate and file`, () => {
    const doc = addPart(rectanglePart(10, 10, 1), { name: 'Pin', doc: rectanglePart(1, 1, 2), position: [...position], rotation: [10, 20, 30] }).doc;
    for (const sign of [1, -1]) for (const value of [1e16, -1e16, Number.MAX_VALUE, -Number.MAX_VALUE]) {
      const axis: [number, number, number] = [0, 0, 0], origin: [number, number, number] = [0, 0, 0]; axis[axisIndex] = sign * 3; origin[axisIndex] = value;
      const reference = addInstancePattern(doc, { seed: 'p1', kind: 'circular', axis, origin: [0, 0, 0], count: 4, angle: 90 });
      const moved = editInstancePattern(reference.doc, { id: reference.id, origin }).doc;
      const copies = moved.instances!.slice(1);
      assert.deepEqual(copies.map(i => i.position), sign === 1 ? expected : [...expected].reverse());
      assert.deepEqual(copies.map(i => i.rotation), reference.doc.instances!.slice(1).map(i => i.rotation));
      assert.deepEqual(copies.map(i => i.id), reference.doc.instances!.slice(1).map(i => i.id));
      const read = readStudioDoc(JSON.stringify(moved)); assert.ok('doc' in read);
      assert.deepEqual(expandPatterns(read.doc).instances!.map(i => i.position), moved.instances!.map(i => i.position));
      assert.deepEqual(moved.nodes, doc.nodes); assert.deepEqual(moved.instances![0].doc, doc.instances![0].doc);
    }
  });
}
