import test from 'node:test';
import assert from 'node:assert/strict';
import type { SketchShape } from '@barocss/cad-model/sketch/types';
import { slotWidth } from '../src/sketch/slotWidth';
type Slot = Extract<SketchShape, { kind: 'slot' }>;

test('Fractional and oblique Slot width changes retain exact authored centre identities and metadata', () => {
  const shapes: Slot[] = [
    { kind: 'slot', a: [10.123456789, 15], b: [45.123456789, 15], r: 4 },
    { kind: 'slot', a: [-1.234567891, 7.987654321], b: [17.345678912, -2.456789123], r: 4, construction: true },
  ];
  for (const shape of shapes) {
    const saved = structuredClone(shape);
    Object.freeze(shape.a); Object.freeze(shape.b); Object.freeze(shape);
    let current = shape;
    for (const width of [10, 3.123456789, 8]) {
      current = slotWidth(current, width);
      assert.equal(current.r, width / 2); assert.equal(current.a, shape.a); assert.equal(current.b, shape.b);
      assert.deepEqual({ ...current, r: shape.r }, shape);
    }
    assert.deepEqual(shape, saved);
  }
});
test('Width retains the existing minimum radius and ignores nonfinite or unchanged input', () => {
  const shape: Slot = { kind: 'slot', a: [10.123456789, 15], b: [45.123456789, 15], r: 4 };
  for (const width of [-10, 0, 0.1, 0.5]) {
    const result = slotWidth(shape, width); assert.equal(result.r, 0.25);
    assert.equal(result.a, shape.a); assert.equal(result.b, shape.b);
  }
  for (const width of [8, NaN, Infinity, -Infinity]) assert.equal(slotWidth(shape, width), shape);
  const large = slotWidth(shape, Number.MAX_VALUE); assert.equal(large.r, Number.MAX_VALUE / 2);
  assert.equal(large.a, shape.a); assert.equal(large.b, shape.b);
});
