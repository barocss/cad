import assert from 'node:assert/strict';
import { test } from 'node:test';
import { placeConstraintMarks, placeConstraintMarksDetailed } from '../src/ui/sketchConstraintMarkLayout';

const view = { width: 120, height: 100 };

test('keeps an unblocked mark and gives a nearby mark its own space', () => {
  const a = [40, 50] as const, b = [50, 50] as const;
  const placed = placeConstraintMarks([a, b], [], view);
  assert.equal(placed[0], a);
  assert.deepEqual(placed[1], [70, 50]);
  assert.deepEqual(placeConstraintMarks([a, b], [], view), placed);
});

test('protects the driving dimension and rejects placements outside the viewport', () => {
  const preferred = [108, 50] as const;
  const dimension = { x: 99, y: 40, width: 18, height: 22 };
  assert.deepEqual(placeConstraintMarks([preferred], [dimension], view), [[88, 50]]);
});

test('keeps unavailable placements and preserves both mark identities', () => {
  const a = [10, 8] as const, b = [10, 8] as const;
  const placed = placeConstraintMarks([a, b], [], { width: 20, height: 16 });
  assert.equal(placed[0], a);
  assert.equal(placed[1], b);
  const offscreen = [-50, -50] as const;
  assert.equal(placeConstraintMarks([offscreen], [], view)[0], offscreen);
});


test('detailed placement reports empty and collision-free inputs without changing identity', () => {
  assert.deepEqual(placeConstraintMarksDetailed([], [], view), { positions: [], crowdedCount: 0, budgetExceeded: false });
  const points = [[30, 30], [90, 70]] as const;
  const result = placeConstraintMarksDetailed(points, [], view);
  assert.equal(result.crowdedCount, 0);
  assert.equal(result.budgetExceeded, false);
  result.positions.forEach((point, i) => assert.equal(point, points[i]));
  assert.deepEqual(result.positions, placeConstraintMarks(points, [], view));
});

test('counts only exhausted visible marks, preserving deterministic local fallback', () => {
  const points = [[10, 8], [10, 8], [10, 8]] as const;
  const tiny = { width: 20, height: 16 };
  const result = placeConstraintMarksDetailed(points, [], tiny);
  assert.equal(result.crowdedCount, 2);
  assert.equal(result.budgetExceeded, false);
  result.positions.forEach((point, i) => assert.equal(point, points[i]));
  assert.deepEqual(placeConstraintMarksDetailed(points, [], tiny), result);
  assert.deepEqual(placeConstraintMarks(points, [], tiny), result.positions);
});

test('offscreen and nonfinite marks are not counted as crowded', () => {
  const points = [[-50, -50], [200, 200], [NaN, 20], [20, Infinity]] as const;
  const result = placeConstraintMarksDetailed(points, [{ x: 0, y: 0, width: 120, height: 100 }], view);
  assert.equal(result.crowdedCount, 0);
  assert.equal(result.budgetExceeded, false);
  result.positions.forEach((point, i) => assert.equal(point, points[i]));
});

test('128 marks retain the local budget while 129 preserve positions without estimating crowding', () => {
  const points = Array.from({ length: 129 }, () => [10, 8] as const);
  const before = JSON.stringify(points), tiny = { width: 20, height: 16 };
  const atLimit = placeConstraintMarksDetailed(points.slice(0, 128), [], tiny);
  assert.equal(atLimit.crowdedCount, 127);
  assert.equal(atLimit.budgetExceeded, false);
  const result = placeConstraintMarksDetailed(points, [], tiny);
  assert.equal(result.crowdedCount, 0);
  assert.equal(result.budgetExceeded, true);
  assert.notEqual(result.positions, points);
  result.positions.forEach((point, i) => assert.equal(point, points[i]));
  assert.deepEqual(placeConstraintMarksDetailed(points, [], tiny), result);
  assert.deepEqual(placeConstraintMarks(points, [], tiny), result.positions);
  assert.equal(JSON.stringify(points), before);
});
