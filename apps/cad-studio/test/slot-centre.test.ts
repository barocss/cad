import test from 'node:test';
import assert from 'node:assert/strict';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
import { slotCentre } from '../src/sketch/slotCentre';
type Slot = Extract<SketchShape, { kind: 'slot' }>;
const near = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-12, `${a} != ${b}`);
const vector = (s: Slot) => [s.b[0] - s.a[0], s.b[1] - s.a[1]];
test('Fractional Centre X and Y translate both horizontal Slot centres without quantization', () => {
  const source: Slot = { kind: 'slot', a: [10, 15], b: [45, 15], r: 4 };
  for (const [axis, value] of [[0, 10.123456789], [1, 15.234567891]] as const) {
    const result = slotCentre(source, axis, value);
    assert.equal(result.a[axis], value);
    assert.equal(result.b[axis], source.b[axis] + (value - source.a[axis]));
    assert.equal(result.a[1-axis], source.a[1-axis]); assert.equal(result.b[1-axis], source.b[1-axis]);
    vector(result).forEach((v, i) => near(v, vector(source)[i]));
  }
  assert.deepEqual(source, { kind: 'slot', a: [10, 15], b: [45, 15], r: 4 });
});
test('Oblique repeated X/Y edits preserve vector, radius and metadata without mutating source', () => {
  const source: Slot = { kind: 'slot', a: [1.125, -3.5], b: [14.25, 7.75], r: 2.123456789, construction: true };
  const original = structuredClone(source); Object.freeze(source.a); Object.freeze(source.b); Object.freeze(source);
  let current = source;
  for (const [axis, value] of [[0, -1.23456789], [1, 4.987654321], [0, 9.123456789], [1, -7.234567891]] as const) {
    current = slotCentre(current, axis, value);
    assert.equal(current.a[axis], value); assert.equal(current.r, source.r); assert.equal(current.construction, true);
    vector(current).forEach((v, i) => near(v, vector(source)[i]));
    near(Math.hypot(...vector(current)), Math.hypot(...vector(source)));
    near(Math.atan2(vector(current)[1], vector(current)[0]), Math.atan2(vector(source)[1], vector(source)[0]));
  }
  assert.deepEqual(source, original); assert.notEqual(current.a, source.a); assert.notEqual(current.b, source.b);
});
test('Unchanged input and nonfinite or overflowing coordinate arithmetic safely preserve the source', () => {
  const s: Slot = { kind: 'slot', a: [10, 15], b: [45, 15], r: 4 };
  for (const v of [10, NaN, Infinity, -Infinity]) assert.equal(slotCentre(s, 0, v), s);
  const overflow: Slot = { ...s, a: [-Number.MAX_VALUE, 0], b: [Number.MAX_VALUE, 0] };
  assert.equal(slotCentre(overflow, 0, Number.MAX_VALUE), overflow);
  const bad: Slot = { ...s, b: [Infinity, 15] }; assert.equal(slotCentre(bad, 0, 12), bad);
});
