import assert from 'node:assert/strict';
import test from 'node:test';
import { curveDomain, evaluateCurve, joinCurves, type Curve, type Point } from '@barocss/cad';
import { directJoinDegreeCompatible, directOps, emptyDirect, geometryOf, importSource, type DirectGeometry } from '../src/engine/direct';

const curveSource = (id: string, degree: number, points: Point[], weights = points.map(() => 1), domain = [0, 1], knots?: number[]) =>
  `@curve #${id} { type:nurbs; degree:${degree}; knots:[${(knots ?? [...Array(degree + 1).fill(domain[0]), ...Array(degree + 1).fill(domain[1])]).join(',')}]; control-points:[${points.map(point => `[${point.join(',')}]`).join(',')}]; weights:[${weights.join(',')}]; }`;
const direct = (curves: string[]) => importSource(emptyDirect(), `@model study { version:0; length-unit:mm; ${curves.join('\n')} }`, 'study');
const id = (d: DirectGeometry, name: string) => {
  const object = d.objects.find(object => object.geometry === name);
  assert.ok(object);
  return object.id;
};
const curveOf = (d: DirectGeometry, objectId: string): Curve => {
  const object = d.objects.find(object => object.id === objectId);
  assert.ok(object);
  const curve = geometryOf(d, object);
  assert.equal(curve.kind, 'curve');
  return curve as Curve;
};
const joinedCurve = (d: DirectGeometry): Curve => {
  const object = d.objects.at(-1);
  assert.ok(object && object.name === 'Joined curve' && !object.hidden);
  return curveOf(d, object.id);
};
const near = (actual: readonly number[], expected: readonly number[]) => assert.ok(Math.hypot(...actual.map((value, i) => value - expected[i])) < 1e-10, `${actual} != ${expected}`);
const lineAt = (a: Point, b: Point, t: number) => a.map((value, i) => (1 - t) * value + t * b[i]);
const quadraticAt = (points: Point[], t: number) => points[0].map((value, i) => (1 - t) ** 2 * value + 2 * t * (1 - t) * points[1][i] + t ** 2 * points[2][i]);

for (const first of ['line', 'quadratic'] as const) {
  test(`Direct Join preserves both independent halves for ordered ${first}-first mixed spans`, () => {
    const line: Point[] = first === 'line' ? [[0, 0, 0], [10, 0, 0]] : [[10, 0, 0], [20, 0, 0]];
    const quadratic: Point[] = first === 'line' ? [[10, 0, 0], [15, 5, 2], [20, 0, 0]] : [[0, 0, 0], [5, 5, 2], [10, 0, 0]];
    const original = direct([curveSource('line', 1, line), curveSource('quadratic', 2, quadratic)]), saved = structuredClone(original);
    const ids = [id(original, first), id(original, first === 'line' ? 'quadratic' : 'line')];
    const parents = ids.map(objectId => structuredClone(curveOf(original, objectId)));
    assert.equal(directJoinDegreeCompatible(parents[0], parents[1]), true);
    assert.equal(directJoinDegreeCompatible(parents[1], parents[0]), true);
    const result = directOps.joinCurves(original, ids[0], ids[1]), joined = joinedCurve(result);
    assert.equal(joined.degree, 2);
    assert.deepEqual(joined.knots, [0, 0, 0, 1, 1, 2, 2, 2]);
    assert.deepEqual(joined.weights, [1, 1, 1, 1, 1]);
    assert.deepEqual(joined.controlPoints[2], [10, 0, 0]);
    assert.deepEqual(evaluateCurve(joined, 1), [10, 0, 0]);
    for (const t of [0, .13, .5, .87, 1]) {
      near(evaluateCurve(joined, first === 'line' ? t : 1 + t), lineAt(line[0], line[1], t));
      near(evaluateCurve(joined, first === 'quadratic' ? t : 1 + t), quadraticAt(quadratic, t));
    }
    assert.equal(Object.keys(result.sources).length, Object.keys(original.sources).length + 1, 'only the joined source is published');
    assert.equal(result.objects.length, original.objects.length + 1);
    for (const object of original.objects) {
      assert.equal(result.sources[object.source], original.sources[object.source]);
      const retained = result.objects.find(candidate => candidate.id === object.id);
      assert.deepEqual(retained, { ...object, hidden: true });
      assert.deepEqual(curveOf(result, object.id), curveOf(original, object.id), 'the hidden original keeps its original degree, source and poles');
    }
    assert.deepEqual(original, saved);
  });
}

test('mixed Join preserves authored parameter domains and the native right-domain map', () => {
  const d = direct([
    curveSource('line', 1, [[.125, -.25, .5], [10.375, 1.5, -2.25]], undefined, [2, 4]),
    curveSource('quadratic', 2, [[10.375, 1.5, -2.25], [15, 6, 2], [21, 1, 0]], undefined, [10, 14]),
  ]);
  const line = id(d, 'line'), quadratic = id(d, 'quadratic'), result = directOps.joinCurves(d, line, quadratic), joined = joinedCurve(result);
  assert.deepEqual(curveDomain(joined), [2, 8]);
  assert.deepEqual(curveDomain(curveOf(result, line)), [2, 4]);
  assert.deepEqual(curveDomain(curveOf(result, quadratic)), [10, 14]);
  assert.deepEqual(evaluateCurve(joined, 4), [10.375, 1.5, -2.25]);
  near(evaluateCurve(joined, 3), lineAt([.125, -.25, .5], [10.375, 1.5, -2.25], .5));
  near(evaluateCurve(joined, 6), quadraticAt([[10.375, 1.5, -2.25], [15, 6, 2], [21, 1, 0]], .5));
});

test('mixed Join neither swaps the selection nor reverses a curve or snaps a sub-tolerance gap', () => {
  for (const gap of [0, 1e-9]) {
    const d = direct([curveSource('line', 1, [[0, 0, 0], [10, 0, 0]]),
      curveSource('quadratic', 2, [[10 + gap, 0, 0], [15, 5, 2], [20, 0, 0]])]);
    const saved = structuredClone(d), line = id(d, 'line'), quadratic = id(d, 'quadratic');
    assert.equal(directJoinDegreeCompatible(curveOf(d, line), curveOf(d, quadratic)), true, 'degree guidance does not claim endpoint validity');
    assert.throws(() => directOps.joinCurves(d, quadratic, line), /shared parent XYZ must be exactly numerically equal/);
    if (gap) assert.throws(() => directOps.joinCurves(d, line, quadratic), /shared parent XYZ must be exactly numerically equal/);
    const reversed = directOps.reverseCurve(d, line), reverseId = reversed.objects.at(-1)!.id;
    assert.throws(() => directOps.joinCurves(reversed, reverseId, quadratic), /shared parent XYZ must be exactly numerically equal/);
    assert.deepEqual(d, saved);
  }
});

test('mixed-degree admission excludes rational weights, multiple or unclamped spans and other degree pairs', () => {
  const line = curveSource('line', 1, [[0, 0, 0], [10, 0, 0]]);
  const inputs = [
    [line, curveSource('other', 3, [[10, 0, 0], [12, 2, 0], [16, 4, 0], [20, 0, 0]])],
    [curveSource('line', 2, [[0, 0, 0], [5, 2, 0], [10, 0, 0]]), curveSource('other', 3, [[10, 0, 0], [12, 2, 0], [16, 4, 0], [20, 0, 0]])],
    [line, curveSource('other', 2, [[10, 0, 0], [15, 5, 0], [20, 0, 0]], [1, .8, 1])],
    [curveSource('line', 1, [[0, 0, 0], [10, 0, 0]], [2, 2]), curveSource('other', 2, [[10, 0, 0], [15, 5, 0], [20, 0, 0]])],
    [curveSource('line', 1, [[0, 0, 0], [5, 0, 0], [10, 0, 0]], undefined, [0, 1], [0, 0, .5, 1, 1]),
      curveSource('other', 2, [[10, 0, 0], [15, 5, 0], [20, 0, 0]])],
    [line, curveSource('other', 2, [[10, 0, 0], [12, 2, 0], [15, 3, 0], [18, 2, 0], [20, 0, 0]], undefined, [0, 1], [0, 0, 0, .5, .5, 1, 1, 1])],
  ];
  for (const input of inputs) {
    const d = direct(input), saved = structuredClone(d), a = id(d, 'line'), b = id(d, 'other');
    assert.equal(directJoinDegreeCompatible(curveOf(d, a), curveOf(d, b)), false);
    assert.equal(directJoinDegreeCompatible(curveOf(d, b), curveOf(d, a)), false);
    assert.throws(() => directOps.joinCurves(d, a, b), /same native degree required/);
    assert.deepEqual(d, saved);
  }
  const d = direct([line, curveSource('other', 2, [[10, 0, 0], [15, 5, 0], [20, 0, 0]])]);
  const unclamped = { ...curveOf(d, id(d, 'line')), knots: [-1, 0, 1, 2] };
  assert.equal(directJoinDegreeCompatible(unclamped, curveOf(d, id(d, 'other'))), false);
  assert.throws(() => direct([curveSource('line', 1, [[0, 0, 0], [10, 0, 0]], undefined, [0, 1], [-1, 0, 1, 2])]), /open and clamped/i);
});

test('same-degree Join keeps the exact old native result, including rational quadratics', () => {
  for (const curves of [
    [curveSource('left', 1, [[0, 0, 0], [10, 0, 0]]), curveSource('right', 1, [[10, 0, 0], [20, 0, 0]])],
    [curveSource('left', 2, [[0, 0, 0], [5, 5, 0], [10, 0, 0]], [1, .8, 1]),
      curveSource('right', 2, [[10, 0, 0], [15, 4, 0], [20, 0, 0]], [1, .7, 1])],
  ]) {
    const d = direct(curves), left = id(d, 'left'), right = id(d, 'right');
    assert.equal(directJoinDegreeCompatible(curveOf(d, left), curveOf(d, right)), true);
    const joined = joinedCurve(directOps.joinCurves(d, left, right));
    assert.deepEqual(joined, joinCurves(curveOf(d, left), curveOf(d, right), { curveId: joined.id }).curve);
    assert.throws(() => directOps.joinCurves(d, right, left), /shared parent XYZ must be exactly numerically equal/);
  }
});
