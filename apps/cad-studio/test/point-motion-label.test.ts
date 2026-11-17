import assert from 'node:assert/strict';
import test from 'node:test';
import { pointMotionLabel } from '../src/sketch/pointMotionLabel';

test('distinguishes unresolved directions, the plane, and sign-independent local tangent', () => {
  assert.equal(pointMotionLabel(null), 'Direction unavailable');
  assert.equal(pointMotionLabel({dimension:2}), 'Two independent directions');
  assert.equal(pointMotionLabel({dimension:1,direction:[1,0]}), 'Along ±(1, 0)');
  assert.equal(pointMotionLabel({dimension:1,direction:[0.6,-0.8]}), 'Along ±(0.6, -0.8)');
});
test('display rounding preserves full precision inputs', () => {
  const direction = [Math.SQRT1_2, -Math.SQRT1_2] as const;
  const before = [...direction];
  assert.equal(pointMotionLabel({dimension:1,direction}), 'Along ±(0.707107, -0.707107)');
  assert.deepEqual(direction, before);
});
