import assert from 'node:assert/strict';
import test from 'node:test';
import { curveDomain, evaluateCurve, evaluateCurveD1, joinCurves, type Curve, type Point } from '@barocss/cad';
import { directJoinDegreeCompatible, directJoinTangentAngle, directOps, emptyDirect, geometryOf, importSource, type DirectGeometry } from '../src/engine/direct';

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
const cubicAt = (points: Point[], t: number) => points[0].map((value, i) => (1 - t) ** 3 * value + 3 * t * (1 - t) ** 2 * points[1][i] + 3 * t ** 2 * (1 - t) * points[2][i] + t ** 3 * points[3][i]);
const cubicDerivativeAt = (points: Point[], t: number, span: number) => points[0].map((value, i) => 3 * ((1 - t) ** 2 * (points[1][i] - value) + 2 * t * (1 - t) * (points[2][i] - points[1][i]) + t ** 2 * (points[3][i] - points[2][i])) / span);
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
}

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

for (const first of ['line', 'cubic'] as const) for (const nonUnitDomain of [false, true]) {
  test(`Direct Join preserves the independent ${first}-first line/cubic spans with ${nonUnitDomain ? 'non-unit' : 'unit'} domains`, () => {
    const shared: Point = [10.375, -3.25, 2.125];
    const line: Point[] = first === 'line' ? [[-5.125, 2.5, -.75], shared] : [shared, [23.125, 1.75, .5]];
    const cubic: Point[] = first === 'line'
      ? [shared, [12.625, 5.75, -1.5], [17.875, -7.5, 4.25], [23.125, 1.75, .5]]
      : [[-5.125, 2.5, -.75], [-1.625, 5.75, -1.5], [6.875, -7.5, 4.25], shared];
    const lineDomain = nonUnitDomain ? [2, 4] : [0, 1], cubicDomain = nonUnitDomain ? [10, 14] : [0, 1];
    const original = direct([curveSource('line', 1, line, undefined, lineDomain), curveSource('cubic', 3, cubic, undefined, cubicDomain)]);
    const saved = structuredClone(original), ids = [id(original, first), id(original, first === 'line' ? 'cubic' : 'line')];
    const firstDomain = first === 'line' ? lineDomain : cubicDomain, secondDomain = first === 'line' ? cubicDomain : lineDomain;
    const start = firstDomain[0], join = firstDomain[1], end = join + secondDomain[1] - secondDomain[0];
    freeze(original);
    assert.equal(directJoinDegreeCompatible(curveOf(original, ids[0]), curveOf(original, ids[1])), true);
    assert.equal(directJoinDegreeCompatible(curveOf(original, ids[1]), curveOf(original, ids[0])), true);
    const result = directOps.joinCurves(original, ids[0], ids[1]), joined = joinedCurve(result);
    assert.equal(joined.degree, 3);
    assert.deepEqual(curveDomain(joined), [start, end]);
    assert.deepEqual(joined.knots, [start, start, start, start, join, join, join, end, end, end, end]);
    assert.deepEqual(joined.weights, [1, 1, 1, 1, 1, 1, 1]);
    assert.deepEqual(joined.controlPoints[3], shared);
    assert.deepEqual(evaluateCurve(joined, join), shared);
    assert.deepEqual(joined.controlPoints.slice(first === 'cubic' ? 0 : 3, first === 'cubic' ? 4 : 7), cubic);
    const lineOffset = first === 'line' ? 0 : 3;
    assert.deepEqual(joined.controlPoints[lineOffset], line[0]);
    assert.deepEqual(joined.controlPoints[lineOffset + 3], line[1]);
    near(joined.controlPoints[lineOffset + 1], lineAt(line[0], line[1], 1 / 3));
    near(joined.controlPoints[lineOffset + 2], lineAt(line[0], line[1], 2 / 3));
    const lineStart = first === 'line' ? start : join, cubicStart = first === 'cubic' ? start : join;
    const lineSpan = lineDomain[1] - lineDomain[0], cubicSpan = cubicDomain[1] - cubicDomain[0];
    // Compare original authoring formulas directly with the final result, across both elevation steps.
    for (const t of [...Array.from({ length: 65 }, (_, i) => i / 64), .13, .87]) {
      near(evaluateCurve(joined, lineStart + lineSpan * t), lineAt(line[0], line[1], t));
      near(evaluateCurve(joined, cubicStart + cubicSpan * t), cubicAt(cubic, t));
    }
    for (const t of [.13, .5, .87]) {
      near(evaluateCurveD1(joined, lineStart + lineSpan * t).derivative, line[0].map((value, axis) => (line[1][axis] - value) / lineSpan));
      near(evaluateCurveD1(joined, cubicStart + cubicSpan * t).derivative, cubicDerivativeAt(cubic, t, cubicSpan));
    }
    assert.throws(() => evaluateCurveD1(joined, join), /exact C0 interior knot/);
    assert.equal(directJoinTangentAngle(joined, join), null, 'the bounded quadratic tangent-angle scope does not expand');
    assert.equal(Object.keys(result.sources).length, Object.keys(original.sources).length + 1, 'neither scratch source is published');
    assert.equal(result.objects.length, original.objects.length + 1);
    for (const object of original.objects) {
      assert.equal(result.sources[object.source], original.sources[object.source]);
      assert.deepEqual(result.objects.find(candidate => candidate.id === object.id), { ...object, hidden: true });
      assert.deepEqual(curveOf(result, object.id), curveOf(original, object.id), 'original native IDs, domains, degrees and coefficients remain');
    }
    assert.deepEqual(original, saved);
    assert.throws(() => directOps.ruledSurface(original, ids[0], ids[1]), /Original section degrees must be equal/, 'Ruled retains its line/quadratic scope');
    assert.throws(() => directOps.ruledSurface(original, ids[1], ids[0]), /Original section degrees must be equal/);
  });
}

test('the two scratch elevations retain a translated short line within the original-to-final point tolerance', () => {
  const line: Point[] = [[9999.125, -9998.875, 9999.5], [9999.375, -9998.625, 9999.75]];
  const cubic: Point[] = [line[1], [9999.5, -9998.25, 9999.5], [9999.75, -9998, 9999.625], [9999.875, -9997.75, 9999.875]];
  const d = direct([curveSource('line', 1, line), curveSource('cubic', 3, cubic)]);
  const joined = joinedCurve(directOps.joinCurves(d, id(d, 'line'), id(d, 'cubic')));
  for (const t of [0, .13, .25, .5, .75, .87, 1]) {
    near(evaluateCurve(joined, t), lineAt(line[0], line[1], t));
    near(evaluateCurve(joined, 1 + t), cubicAt(cubic, t));
  }
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

test('line/cubic Join retains exact endpoint, selection order and reversal refusals', () => {
  for (const gap of [0, 1e-9]) {
    const d = direct([curveSource('line', 1, [[0, 0, 0], [10, 0, 0]]),
      curveSource('cubic', 3, [[10 + gap, 0, 0], [12, 2, 1], [16, 4, -1], [20, 0, 0]])]);
    const saved = structuredClone(d), line = id(d, 'line'), cubic = id(d, 'cubic');
    assert.equal(directJoinDegreeCompatible(curveOf(d, line), curveOf(d, cubic)), true, 'degree guidance is not endpoint admission');
    assert.throws(() => directOps.joinCurves(d, cubic, line), /shared parent XYZ must be exactly numerically equal/);
    if (gap) assert.throws(() => directOps.joinCurves(d, line, cubic), /shared parent XYZ must be exactly numerically equal/);
    for (const picked of [line, cubic]) {
      const reversed = directOps.reverseCurve(d, picked), reverseId = reversed.objects.at(-1)!.id;
      assert.throws(() => directOps.joinCurves(reversed, picked === line ? reverseId : line, picked === cubic ? reverseId : cubic), /shared parent XYZ must be exactly numerically equal/);
    }
    assert.deepEqual(d, saved);
  }
});

test('mixed-degree admission excludes rational weights, multiple or unclamped spans and other degree pairs', () => {
  const line = curveSource('line', 1, [[0, 0, 0], [10, 0, 0]]);
  const inputs = [
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

test('line/cubic degree matching excludes rational weights and multiple spans in either slot', () => {
  const line = curveSource('line', 1, [[0, 0, 0], [10, 0, 0]]);
  const cubicPoints: Point[] = [[10, 0, 0], [12, 2, 0], [16, 4, 0], [20, 0, 0]], cubic = curveSource('other', 3, cubicPoints);
  const inputs = [
    [line, curveSource('other', 3, cubicPoints, [1, .8, 1, 1])],
    [line, curveSource('other', 3, cubicPoints, [2, 2, 2, 2])],
    [curveSource('line', 1, [[0, 0, 0], [10, 0, 0]], [2, 2]), cubic],
    [curveSource('line', 1, [[0, 0, 0], [10, 0, 0]], [1, .8]), cubic],
    [curveSource('line', 1, [[0, 0, 0], [5, 0, 0], [10, 0, 0]], undefined, [0, 1], [0, 0, .5, 1, 1]), cubic],
    [line, curveSource('other', 3, [[10, 0, 0], [12, 2, 0], [15, 3, 0], [18, 2, 0], [20, 0, 0]], undefined, [0, 1], [0, 0, 0, 0, .5, 1, 1, 1, 1])],
    [line, curveSource('other', 3, [[10, 0, 0], [11, 2, 0], [12, 3, 0], [15, 4, 0], [18, 3, 0], [19, 2, 0], [20, 0, 0]], undefined, [0, 1], [0, 0, 0, 0, .5, .5, .5, 1, 1, 1, 1])],
  ];
  for (const input of inputs) {
    const d = direct(input), saved = structuredClone(d), ids = [id(d, 'line'), id(d, 'other')];
    for (const [a, b] of [ids, [...ids].reverse()]) {
      assert.equal(directJoinDegreeCompatible(curveOf(d, a), curveOf(d, b)), false);
      assert.throws(() => directOps.joinCurves(d, a, b), /same native degree required/);
    }
    assert.deepEqual(d, saved);
  }
  const d = direct([line, cubic]), other = curveOf(d, id(d, 'other'));
  const unclamped = { ...other, knots: [-1, 0, 0, 0, 1, 1, 1, 2] };
  assert.equal(directJoinDegreeCompatible(curveOf(d, id(d, 'line')), unclamped), false);
  assert.throws(() => direct([line, curveSource('other', 3, cubicPoints, undefined, [0, 1], unclamped.knots)]), /open and clamped/i);
});

test('line/higher-degree Join retains the native degree bound without publishing scratch sources', () => {
  for (const degree of [4, 5]) {
    const d = direct([curveSource('line', 1, [[0, 0, 0], [10, 0, 0]]),
      curveSource('other', degree, Array.from({ length: degree + 1 }, (_, i): Point => [10 + 2 * i, i % 2, 0]))]);
    const saved = structuredClone(d), ids = [id(d, 'line'), id(d, 'other')];
    for (const [a, b] of [ids, [...ids].reverse()]) {
      assert.equal(directJoinDegreeCompatible(curveOf(d, a), curveOf(d, b)), false);
      assert.throws(() => directOps.joinCurves(d, a, b), /native degree1\.\.3 parent Curve required/);
    }
    assert.deepEqual(d, saved);
  }
});

test('same-degree Join keeps the exact old native result, including rational quadratics and cubics', () => {
  for (const curves of [
    [curveSource('left', 1, [[0, 0, 0], [10, 0, 0]]), curveSource('right', 1, [[10, 0, 0], [20, 0, 0]])],
    [curveSource('left', 2, [[0, 0, 0], [5, 5, 0], [10, 0, 0]], [1, .8, 1]),
      curveSource('right', 2, [[10, 0, 0], [15, 4, 0], [20, 0, 0]], [1, .7, 1])],
    [curveSource('left', 3, [[0, 0, 0], [3, 5, 1], [7, -2, 0], [10, 0, 0]], [1, .8, .9, 1]),
      curveSource('right', 3, [[10, 0, 0], [13, 4, 0], [17, -3, 2], [20, 0, 0]], [1, .7, .6, 1])],
  ]) {
    const d = direct(curves), left = id(d, 'left'), right = id(d, 'right');
    assert.equal(directJoinDegreeCompatible(curveOf(d, left), curveOf(d, right)), true);
    const joined = joinedCurve(directOps.joinCurves(d, left, right));
    assert.deepEqual(joined, joinCurves(curveOf(d, left), curveOf(d, right), { curveId: joined.id }).curve);
    assert.throws(() => directOps.joinCurves(d, right, left), /shared parent XYZ must be exactly numerically equal/);
  }
});
