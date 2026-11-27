import assert from 'node:assert/strict';
import test from 'node:test';
import { CadNumericPolicy, evaluateCurve, evaluateCurveD1, validateCurve, type Curve, type Point } from '@barocss/cad';
import { buildBridgeCurve, type BridgeEnd, type BridgePick } from '../src/engine/bridgeCurve';
import { isRefusal } from '../src/engine/refusal';
import { outlineCurve } from '../src/engine/curveSource';
import { xyPlane } from '../src/sketch/plane';

const line = (start: Point, end: Point, weights = [1, 1], knots = [2, 2, 5, 5]): Curve => ({
  kind: 'curve', id: 'line', degree: 1, knots, controlPoints: [start, end], weights,
});
const pick = (id: string, curve: Curve, end: BridgeEnd): BridgePick => ({ id, curve, end });
const near = (actual: Point, expected: Point, tolerance = 1e-12) => actual.forEach((value, axis) =>
  assert.ok(Math.abs(value - expected[axis]) <= tolerance, `${actual} != ${expected}`));
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
}
const refuses = (first: BridgePick, second: BridgePick, message: RegExp, code: 'DIRECT_PICK' | 'DIRECT_VALUE' = 'DIRECT_PICK') => {
  const before = structuredClone([first, second]); freeze(first); freeze(second);
  assert.throws(() => buildBridgeCurve(first, second, 'G1'), error => isRefusal(error, code) && message.test(error.message));
  assert.deepEqual([first, second], before);
};

test('G0 is an exact native line between the chosen 3D endpoints, without source writes or aliases', () => {
  const first = pick('a', line([-5, -2, 3], [1, 2, 3]), 'end');
  const second = pick('b', line([7, 8, 9], [7, 10, 9]), 'start');
  const before = structuredClone([first, second]); freeze(first); freeze(second);
  const result = buildBridgeCurve(first, second, 'G0'); validateCurve(result.curve);
  assert.equal(result.curve.degree, 1);
  assert.deepEqual(result.curve.knots, [0, 0, 1, 1]);
  assert.deepEqual(result.curve.weights, [1, 1]);
  assert.deepEqual(result.ends, [[1, 2, 3], [7, 8, 9]]);
  near(evaluateCurve(result.curve, .25), [2.5, 3.5, 4.5]);
  assert.deepEqual([first, second], before);
  result.curve.controlPoints[0][0] = 90;
  assert.deepEqual(result.ends[0], [1, 2, 3]); assert.deepEqual(first.curve.controlPoints[1], [1, 2, 3]);
});

test('G1 produces the analytic cubic, its interior point and native endpoint derivatives', () => {
  // A=(0,0,0), B=(3,4,0): chord=5, h=5/3, t0=(1,0,0), t1=(0,1,0).
  const first = pick('a', line([-6, 0, 0], [0, 0, 0]), 'end');
  const second = pick('b', line([3, 4, 0], [3, 11, 0]), 'start');
  const before = structuredClone([first, second]); freeze(first); freeze(second);
  const result = buildBridgeCurve(first, second, 'G1'); validateCurve(result.curve);
  assert.equal(result.curve.degree, 3);
  assert.deepEqual(result.curve.knots, [0, 0, 0, 0, 1, 1, 1, 1]);
  assert.deepEqual(result.curve.weights, [1, 1, 1, 1]);
  near(result.curve.controlPoints[1], [5 / 3, 0, 0]);
  near(result.curve.controlPoints[2], [3, 7 / 3, 0]);
  near(evaluateCurve(result.curve, .5), [17 / 8, 11 / 8, 0]);
  const start = evaluateCurveD1(result.curve, 0), end = evaluateCurveD1(result.curve, 1);
  near(start.point, [0, 0, 0]); near(end.point, [3, 4, 0]);
  near(start.derivative, [5, 0, 0]); near(end.derivative, [0, 5, 0]);
  assert.deepEqual(result.tangents, [[1, 0, 0], [0, 1, 0]]);
  assert.deepEqual([first, second], before);
});

test('all four endpoint choices orient the traversal, including unequal positive rational weights and domains', () => {
  const a = line([1, 2, 3], [4, 6, 3], [2, 7], [-7, -7, -2, -2]);
  const b = line([10, 12, 14], [10, 12, 20], [4, .5], [100, 100, 120, 120]);
  for (const firstEnd of ['start', 'end'] as const) for (const secondEnd of ['start', 'end'] as const) {
    const result = buildBridgeCurve(pick('a', a, firstEnd), pick('b', b, secondEnd), 'G1');
    const start = a.controlPoints[firstEnd === 'start' ? 0 : 1], end = b.controlPoints[secondEnd === 'start' ? 0 : 1];
    const signA = firstEnd === 'end' ? 1 : -1, signB = secondEnd === 'start' ? 1 : -1;
    near(result.tangents[0], [.6 * signA, .8 * signA, 0]); near(result.tangents[1], [0, 0, signB]);
    const chord = Math.hypot(...end.map((value, axis) => value - start[axis]));
    near(evaluateCurveD1(result.curve, 0).derivative, [.6 * signA * chord, .8 * signA * chord, 0]);
    near(evaluateCurveD1(result.curve, 1).derivative, [0, 0, signB * chord]);
    near(evaluateCurve(result.curve, 0), start); near(evaluateCurve(result.curve, 1), end);
  }
});

test('the actual Studio two-point outline is admitted as an exact elevated quadratic line in either direction', () => {
  const outline = outlineCurve(xyPlane(), [[-6, -8], [0, 0]], undefined, false);
  const curve: Curve = { kind: 'curve', id: 'studio_line', degree: outline.degree,
    knots: outline.knots, controlPoints: outline.points, weights: outline.weights };
  const second = pick('b', line([3, 4, 0], [3, 11, 0]), 'start');
  const before = structuredClone(curve); freeze(curve);
  assert.equal(curve.degree, 2);
  for (const end of ['start', 'end'] as const) for (const continuity of ['G0', 'G1'] as const) {
    const result = buildBridgeCurve(pick('a', curve, end), second, continuity);
    assert.deepEqual(result.ends[0], end === 'start' ? [-6, -8, 0] : [0, 0, 0]);
    near(result.tangents[0], end === 'start' ? [-.6, -.8, 0] : [.6, .8, 0]);
    if (continuity === 'G1') {
      const derivative = evaluateCurveD1(result.curve, 0).derivative;
      near(derivative.map(value => value / Math.hypot(...derivative)) as Point, result.tangents[0]);
    }
  }
  assert.deepEqual(curve, before);
});

test('same object, exact copies and reversed copies are refused before creating geometry', () => {
  const a = line([0, 0, 0], [4, 0, 0]), b = line([8, 0, 0], [8, 4, 0]);
  refuses(pick('same', a, 'end'), pick('same', b, 'start'), /distinct/);
  refuses(pick('a', a, 'start'), pick('b', structuredClone(a), 'end'), /same segment/);
  refuses(pick('a', a, 'start'), pick('b', line([4, 0, 0], [0, 0, 0], [2, 8]), 'end'), /same segment/);
});

test('closed, tiny, coincident and unsupported native source families are refused unchanged', () => {
  const good = pick('b', line([8, 0, 0], [8, 4, 0]), 'start'), floor = CadNumericPolicy.linearTolerance;
  refuses(pick('a', line([0, 0, 0], [0, 0, 0]), 'end'), good, /closed source/);
  for (const length of [floor / 2, floor])
    refuses(pick('a', line([0, 0, 0], [length, 0, 0]), 'end'), good, /modeling tolerance/);
  refuses(pick('a', line([0, 0, 0], [8, 0, 0]), 'end'), good, /coincide/);
  refuses(pick('a', line([0, 0, 0], [8 - floor / 2, 0, 0]), 'end'), good, /coincide/);
  const curved: Curve = { kind: 'curve', id: 'arc', degree: 2, knots: [0, 0, 0, 1, 1, 1],
    controlPoints: [[0, 0, 0], [3, 4, 0], [6, 0, 0]], weights: [1, 1, 1] };
  refuses(pick('a', curved, 'end'), good, /single native straight/);
  for (const controlPoints of [
    [[0, 0, 0], [2, 0, 0], [6, 0, 0]],
    [[0, 0, 0], [3, 1e-12, 0], [6, 0, 0]],
    [[0, 0, 0], [3 + Number.EPSILON * 2, 0, 0], [6, 0, 0]],
  ] as Point[][]) refuses(pick('a', { ...curved, controlPoints }, 'end'), good, /single native straight/);
  for (const weights of [[1, .8, 1], [2, 2, 2]])
    refuses(pick('a', { ...curved, controlPoints: [[0, 0, 0], [3, 0, 0], [6, 0, 0]], weights }, 'end'), good, /single native straight/);
  const joined: Curve = { kind: 'curve', id: 'joined', degree: 1, knots: [0, 0, 1, 2, 2],
    controlPoints: [[0, 0, 0], [3, 0, 0], [6, 0, 0]], weights: [1, 1, 1] };
  refuses(pick('a', joined, 'end'), good, /single native straight/);
});

test('invalid native data, out-of-range controls, and lost small handles have typed atomic refusals', () => {
  const a = line([0, 0, 0], [4, 0, 0]), good = pick('b', line([8, 0, 0], [8, 4, 0]), 'start');
  for (const bad of [
    { ...a, knots: [0, 0, 0, 0] }, { ...a, knots: [0, 1, 2, 2] },
    { ...a, knots: [-1e308, -1e308, 1e308, 1e308] },
    { ...a, controlPoints: [[NaN, 0, 0], [4, 0, 0]] as Point[] },
    { ...a, controlPoints: [[-10001, 0, 0], [4, 0, 0]] as Point[] },
    ...[0, -1, Infinity, 1e-7, 1e7].map(weight => ({ ...a, weights: [weight, 1] })),
  ]) refuses(pick('a', bad, 'end'), good, /native/);
  refuses(pick('a', line([9998, 0, 0], [10000, 0, 0]), 'end'),
    pick('b', line([9999, 30, 0], [9999, 40, 0]), 'start'), /controls cannot be represented/, 'DIRECT_VALUE');
  refuses(pick('a', line([9998, 0, 0], [9999, 0, 0]), 'end'),
    pick('b', line([9999, 2e-7, 0], [10000, 2e-7, 0]), 'start'), /controls cannot be represented/, 'DIRECT_VALUE');
  assert.throws(() => buildBridgeCurve(pick('a', a, 'end'), good, 'G2' as 'G1'), error => isRefusal(error, 'DIRECT_VALUE'));
  assert.throws(() => buildBridgeCurve(pick('a', a, 'middle' as BridgeEnd), good, 'G1'), error => isRefusal(error, 'DIRECT_PICK'));
});
