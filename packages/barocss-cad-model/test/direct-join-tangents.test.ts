import assert from 'node:assert/strict';
import test from 'node:test';
import { type Curve, type Point } from '@barocss/cad';
import { directJoinTangentAngle, directOps, emptyDirect, geometryOf, importSource } from '../src/engine/direct';

const joined = (points: Point[], knots = [0, 0, 0, 1, 1, 2, 2, 2]): Curve => ({
  kind: 'curve', id: 'joined', degree: 2, knots, controlPoints: points, weights: [1, 1, 1, 1, 1],
});
const corner = (): Curve => joined([[-20, 0, 0], [-10, 0, 0], [0, 0, 0], [10, 14, 0], [30, 0, 0]]);
const cubicJoined = (points: Point[], knots = [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 2]): Curve => ({
  kind: 'curve', id: 'joined', degree: 3, knots, controlPoints: points, weights: [1, 1, 1, 1, 1, 1, 1],
});
const cubicCorner = (): Curve => cubicJoined([[-30, 0, 0], [-20, 0, 0], [-10, 0, 0], [0, 0, 0], [10, 14, 6], [25, 7, -3], [30, 0, 0]]);
const near = (actual: number | null, expected: number): void => {
  assert.notEqual(actual, null); assert.ok(Math.abs(actual! - expected) < 1e-12, `${actual} != ${expected}`);
};
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
}
function nativeCubicJoin(first: 'line' | 'cubic', line: Point[], cubic: Point[]) {
  const original = importSource(emptyDirect(), `@model study { version:0; length-unit:mm;
    @curve #line { type:nurbs; degree:1; knots:[2,2,4,4]; control-points:${JSON.stringify(line)}; weights:[1,1]; }
    @curve #cubic { type:nurbs; degree:3; knots:[10,10,10,10,14,14,14,14]; control-points:${JSON.stringify(cubic)}; weights:[1,1,1,1]; }
  }`, 'study');
  const a = original.objects.find(object => object.geometry === first)!, b = original.objects.find(object => object.geometry !== first)!;
  const result = directOps.joinCurves(original, a.id, b.id), object = result.objects.at(-1)!, curve = geometryOf(result, object);
  assert.ok(curve.kind === 'curve');
  return { original, result, object, curve };
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

test('native cubic Join and Reverse retain the independent 3D angle in either authoring order and unequal domains', () => {
  // Original endpoint directions v=(6,9,18), w=(18,-12,6): dot=108, cross=(270,288,-234).
  const expected = Math.atan2(Math.sqrt(210600), 108) * 180 / Math.PI;
  for (const first of ['line', 'cubic'] as const) {
    const shared: Point = [1, 2, 3];
    const line: Point[] = first === 'line' ? [[-5, -7, -15], shared] : [shared, [7, 11, 21]];
    const cubic: Point[] = first === 'line'
      ? [shared, [19, -10, 9], [11, 21, -2], [23, -4, 11]]
      : [[23, -4, 11], [11, 21, -2], [-17, 14, -3], shared];
    const { original, result, object, curve } = nativeCubicJoin(first, line, cubic);
    const savedOriginal = structuredClone(original), saved = structuredClone(result); freeze(original); freeze(result);
    const parameter = first === 'line' ? 4 : 14;
    near(directJoinTangentAngle(curve, parameter), expected);
    for (const wrong of [curve.knots[0], curve.knots.at(-1)!, parameter - parameter * Number.EPSILON, parameter + parameter * Number.EPSILON, NaN, Infinity]) {
      assert.ok(!Object.is(wrong, parameter));
      assert.equal(directJoinTangentAngle(curve, wrong), null);
    }
    const reversed = directOps.reverseCurve(result, object.id), reversedCurve = geometryOf(reversed, reversed.objects.at(-1)!);
    assert.ok(reversedCurve.kind === 'curve');
    const reversedParameter = first === 'line' ? 6 : 12;
    near(directJoinTangentAngle(reversedCurve, reversedParameter), expected);
    assert.equal(directJoinTangentAngle(reversedCurve, parameter), null);
    assert.deepEqual(original, savedOriginal); assert.deepEqual(result, saved);
  }
});

test('native asymmetric cubic elevation and its Reverse require one whole coefficient-generation direction', () => {
  const line: Point[] = [[.125, -5.125, .125], [10.375, 10.375, 10.375]];
  const cubic: Point[] = [line[1], [13, 12, 14], [15, 10, 12], [20, 14, 18]];
  const { original, result, object, curve } = nativeCubicJoin('line', line, cubic);
  const before = structuredClone(result); freeze(result);
  assert.equal(curve.controlPoints[1][0], 3.541666666666667);
  const angle = directJoinTangentAngle(curve, 4);
  assert.notEqual(angle, null);
  const reversed = directOps.reverseCurve(result, object.id), reversedCurve = geometryOf(reversed, reversed.objects.at(-1)!);
  assert.ok(reversedCurve.kind === 'curve');
  near(directJoinTangentAngle(reversedCurve, 6), angle!);

  // Obtain the other exact representation from the native reversed-line producer.
  const lineId = original.objects.find(candidate => candidate.geometry === 'line')!.id;
  const reverseLine = directOps.reverseCurve(original, lineId), reverseId = reverseLine.objects.at(-1)!.id;
  const elevated = directOps.elevateCurveDegree(directOps.elevateCurveDegree(reverseLine, reverseId), reverseId);
  const otherLine = geometryOf(elevated, elevated.objects.find(candidate => candidate.id === reverseId)!);
  assert.ok(otherLine.kind === 'curve');
  const alternate = [...otherLine.controlPoints].reverse();
  assert.equal(alternate[1][0], 3.5416666666666665);
  assert.notEqual(curve.controlPoints[1][1], alternate[1][1]);
  const hybrid = structuredClone(curve);
  for (const pole of [1, 2]) hybrid.controlPoints[pole][0] = alternate[pole][0];
  assert.equal(directJoinTangentAngle(hybrid, 4), null, 'per-axis mixing of the two native representations is not admitted');
  assert.deepEqual(result, before);
});

test('cubic zero and 180 degree angles and signed exact knots retain their boundaries', () => {
  const base = cubicCorner(), straight = { ...base, controlPoints: [...base.controlPoints.slice(0, 4), [10, 0, 0] as Point, ...base.controlPoints.slice(5)] };
  assert.equal(directJoinTangentAngle(straight, 1), 0);
  const opposite = { ...straight, controlPoints: [...straight.controlPoints.slice(0, 4), [-10, 0, 0] as Point, ...straight.controlPoints.slice(5)] };
  assert.equal(directJoinTangentAngle(opposite, 1), 180);
  const signed = { ...base, knots: [-2, -2, -2, -2, -0, -0, -0, 3, 3, 3, 3] };
  near(directJoinTangentAngle(signed, -0), directJoinTangentAngle(base, 1)!);
  for (const parameter of [0, Number.MIN_VALUE, -Number.MIN_VALUE]) assert.equal(directJoinTangentAngle(signed, parameter), null);
  for (const slot of [4, 5, 6]) {
    const mixed = { ...signed, knots: [...signed.knots] }; mixed.knots[slot] = 0;
    assert.equal(directJoinTangentAngle(mixed, -0), null);
  }
  const mixedStart = { ...base, knots: [-0, 0, -0, -0, 1, 1, 1, 2, 2, 2, 2] };
  assert.equal(directJoinTangentAngle(mixedStart, 1), null);
});

test('unsupported cubic bases, non-affine coefficients, weights and degenerate directions return null without writing', () => {
  const base = cubicCorner();
  const edits: Curve[] = [
    { ...base, degree: 1 }, { ...base, degree: 2 }, { ...base, degree: 4 },
    { ...base, weights: [1, 1, 1, 1, .8, 1, 1] }, { ...base, weights: [2, 2, 2, 2, 2, 2, 2] },
    { ...base, weights: base.weights.slice(1) }, { ...base, knots: base.knots.slice(1) },
    { ...base, knots: [0, 0, 0, 0, 1, 1 + Number.EPSILON, 1 + Number.EPSILON, 2, 2, 2, 2] },
    { ...base, knots: [0, 0, 0, 0, 1, 1, 2, 2, 2, 2, 2] },
    { ...base, knots: [0, 0, 0, 0, 1, 1, 1, 2, 2, 2, 3] },
    { ...base, knots: [0, 0, 0, 0, 1, 1, 1, Infinity, Infinity, Infinity, Infinity] },
    { ...base, knots: [-1e308, -1e308, -1e308, -1e308, 1, 1, 1, 1e308, 1e308, 1e308, 1e308] },
    { ...base, controlPoints: base.controlPoints.concat([[40, 0, 0]]) },
    { ...base, controlPoints: [[-30, 0, 0], [-20, 1e-9, 0], ...base.controlPoints.slice(2)] },
    { ...base, controlPoints: [[-30, 0, 0], [-24, 0, 0], [-6, 0, 0], ...base.controlPoints.slice(3)] },
    { ...base, controlPoints: [[0, 0, 0], [0, 0, 0], [0, 0, 0], ...base.controlPoints.slice(3)] },
    ...[0, 1e-8, 1e-7].map((length): Curve => ({ ...base, controlPoints: [...base.controlPoints.slice(0, 4), [length, 0, 0], ...base.controlPoints.slice(5)] })),
    { ...base, controlPoints: [[-10001, 0, 0], ...base.controlPoints.slice(1)] },
    { ...base, controlPoints: [[NaN, 0, 0], ...base.controlPoints.slice(1)] },
  ];
  for (const curve of edits) {
    const saved = structuredClone(curve); freeze(curve);
    assert.equal(directJoinTangentAngle(curve, 1), null); assert.deepEqual(curve, saved);
  }
});
