import assert from 'node:assert/strict';
import test from 'node:test';
import { type Curve, type Point } from '@barocss/cad';
import { directJoinTangentAngle, directOps, emptyDirect, geometryOf, importSource } from '../src/engine/direct';

const joined = (points: Point[], knots = [0, 0, 0, 1, 1, 2, 2, 2]): Curve => ({
  kind: 'curve', id: 'joined', degree: 2, knots, controlPoints: points, weights: [1, 1, 1, 1, 1],
});
const corner = (): Curve => joined([[-20, 0, 0], [-10, 0, 0], [0, 0, 0], [10, 14, 0], [30, 0, 0]]);
const near = (actual: number | null, expected: number): void => {
  assert.notEqual(actual, null); assert.ok(Math.abs(actual! - expected) < 1e-12, `${actual} != ${expected}`);
};
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
}

test('the exact C0 knot uses independent one-sided endpoint directions, with no source mutation', () => {
  const curve = corner(), saved = structuredClone(curve); freeze(curve);
  near(directJoinTangentAngle(curve, 1), Math.atan2(14, 10) * 180 / Math.PI);
  assert.deepEqual(curve, saved);
  for (const parameter of [0, .5, 1 - Number.EPSILON, 1 + Number.EPSILON, 1.5, 2, NaN, Infinity])
    assert.equal(directJoinTangentAngle(curve, parameter), null);
});

test('same and opposite tangent directions report zero and 180 degrees', () => {
  const straight = joined([[-20, 0, 0], [-10, 0, 0], [0, 0, 0], [10, 0, 0], [30, 8, 0]]);
  assert.equal(directJoinTangentAngle(straight, 1), 0);
  const opposite = joined([[-20, 0, 0], [-10, 0, 0], [0, 0, 0], [-10, 0, 0], [-30, 8, 0]]);
  assert.equal(directJoinTangentAngle(opposite, 1), 180);
});

test('the straight span can come last and reversal retains the one-sided angle', () => {
  const quadraticFirst = joined([[-30, 0, 0], [-10, -14, 0], [0, 0, 0], [10, 0, 0], [20, 0, 0]]);
  near(directJoinTangentAngle(quadraticFirst, 1), Math.atan2(14, 10) * 180 / Math.PI);
  const reversed = { ...corner(), controlPoints: [...corner().controlPoints].reverse() };
  near(directJoinTangentAngle(reversed, 1), Math.atan2(14, 10) * 180 / Math.PI);
  const rotated = joined([[-20, 0, 0], [-10, 0, 0], [0, 0, 0], [10, 0, 14], [30, 0, 0]]);
  near(directJoinTangentAngle(rotated, 1), Math.atan2(14, 10) * 180 / Math.PI);
});

test('unequal positive native parameter spans do not change the tangent directions', () => {
  const curve = { ...corner(), knots: [2, 2, 2, 4, 4, 8, 8, 8] };
  near(directJoinTangentAngle(curve, 4), Math.atan2(14, 10) * 180 / Math.PI);
  assert.equal(directJoinTangentAngle(curve, 1), null);
  const signed = { ...corner(), knots: [-1, -1, -1, -0, -0, 2, 2, 2] };
  near(directJoinTangentAngle(signed, -0), Math.atan2(14, 10) * 180 / Math.PI);
  assert.equal(directJoinTangentAngle(signed, 0), null);
});

test('the helper reads the actual D1605 mixed Join result in either authoring order', () => {
  for (const first of ['line', 'quadratic'] as const) {
    const line = first === 'line' ? '[[-20,0,0],[0,0,0]]' : '[[0,0,0],[20,0,0]]';
    const quadratic = first === 'line' ? '[[0,0,0],[10,14,0],[30,0,0]]' : '[[-30,0,0],[-10,-14,0],[0,0,0]]';
    const d = importSource(emptyDirect(), `@model study { version:0; length-unit:mm;
      @curve #line { type:nurbs; degree:1; knots:[2,2,4,4]; control-points:${line}; weights:[1,1]; }
      @curve #quadratic { type:nurbs; degree:2; knots:[10,10,10,14,14,14]; control-points:${quadratic}; weights:[1,1,1]; }
    }`, 'study');
    const saved = structuredClone(d); freeze(d);
    const a = d.objects.find(object => object.geometry === first)!, b = d.objects.find(object => object.geometry !== first)!;
    const result = directOps.joinCurves(d, a.id, b.id), object = result.objects.at(-1)!, curve = geometryOf(result, object);
    assert.ok(curve.kind === 'curve');
    near(directJoinTangentAngle(curve, first === 'line' ? 4 : 14), Math.atan2(14, 10) * 180 / Math.PI);
    assert.deepEqual(d, saved);
  }
});

test('incompatible basis, weights, coefficients and undefined tangents return null unchanged', () => {
  const base = corner();
  const edits: Curve[] = [
    { ...base, degree: 1 }, { ...base, degree: 3 }, { ...base, weights: [1, 1, 1, .8, 1] },
    { ...base, weights: [2, 2, 2, 2, 2] }, { ...base, weights: [1, 1, 1, 1] },
    { ...base, knots: [0, 0, 0, .5, 1, 2, 2, 2] }, { ...base, knots: [0, 0, 0, 1, 1, 1, 2, 2] },
    { ...base, knots: [0, 0, 0, 1, 1, Infinity, Infinity, Infinity] },
    { ...base, knots: [-1e308, -1e308, -1e308, 1, 1, 1e308, 1e308, 1e308] },
    { ...base, knots: [0, 0, 0, 1, 1, 2, 2, 3] },
    { ...base, controlPoints: base.controlPoints.concat([[40, 0, 0]]) },
    { ...base, controlPoints: [[-20, 0, 0], [-10, 1e-9, 0], ...base.controlPoints.slice(2)] },
    { ...base, controlPoints: [[0, 0, 0], [0, 0, 0], ...base.controlPoints.slice(2)] },
    { ...base, controlPoints: [...base.controlPoints.slice(0, 3), [0, 0, 0], [30, 0, 0]] },
    { ...base, controlPoints: [...base.controlPoints.slice(0, 3), [1e-8, 0, 0], [30, 0, 0]] },
    { ...base, controlPoints: [[-20001, 0, 0], ...base.controlPoints.slice(1)] },
    { ...base, controlPoints: [[NaN, 0, 0], ...base.controlPoints.slice(1)] },
  ];
  for (const curve of edits) {
    const saved = structuredClone(curve); freeze(curve);
    assert.equal(directJoinTangentAngle(curve, 1), null); assert.deepEqual(curve, saved);
  }
});
