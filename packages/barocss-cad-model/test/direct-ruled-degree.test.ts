import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlignedRationalRuledSurface, curveDomain, evaluateSurface, surfaceDomain, type Curve, type Point, type Surface } from '@barocss/cad';
import { analyzeSurface, directOps, emptyDirect, geometryOf, importSource, type DirectGeometry } from '../src/engine/direct';

const literal = (value: number): string => Object.is(value, -0) ? '-0' : String(value);
const curveSource = (id: string, degree: number, points: Point[], weights = points.map(() => 1), domain = [0, 1], knots?: number[]) =>
  `@curve #${id} { type:nurbs; degree:${degree}; knots:[${(knots ?? [...Array(degree + 1).fill(domain[0]), ...Array(degree + 1).fill(domain[1])]).map(literal).join(',')}]; control-points:[${points.map(point => `[${point.map(literal).join(',')}]`).join(',')}]; weights:[${weights.map(literal).join(',')}]; }`;
const direct = (curves: string[]) => importSource(emptyDirect(), `@model study { version:0; length-unit:mm; ${curves.join('\n')} }`, 'study');
const objectId = (d: DirectGeometry, name: string): string => {
  const object = d.objects.find(object => object.geometry === name); assert.ok(object); return object.id;
};
const curveOf = (d: DirectGeometry, id: string): Curve => {
  const object = d.objects.find(object => object.id === id); assert.ok(object);
  const curve = geometryOf(d, object); assert.equal(curve.kind, 'curve'); return curve as Curve;
};
const surfaceOf = (d: DirectGeometry): Surface => {
  const object = d.objects.at(-1); assert.ok(object && object.name === 'Ruled surface' && !object.hidden);
  const surface = geometryOf(d, object); assert.equal(surface.kind, 'surface'); return surface as Surface;
};
const near = (actual: readonly number[], expected: readonly number[]) => assert.ok(Math.hypot(...actual.map((value, axis) => value - expected[axis])) < 1e-10, `${actual} != ${expected}`);
const line: Point[] = [[10, 10, 0], [40, 10, 0]];
const crown: Point[] = [[10, 30, 0], [25, 37, 8], [40, 30, 0]];
const lineAt = (points: Point[], t: number) => points[0].map((value, axis) => (1 - t) * value + t * points[1][axis]);
const quadraticAt = (points: Point[], t: number) => points[0].map((value, axis) => (1 - t) ** 2 * value + 2 * t * (1 - t) * points[1][axis] + t ** 2 * points[2][axis]);
const cubicAt = (points: Point[], t: number) => points[0].map((value, axis) => (1 - t) ** 3 * value + 3 * t * (1 - t) ** 2 * points[1][axis] + 3 * t ** 2 * (1 - t) * points[2][axis] + t ** 3 * points[3][axis]);
const cubicDerivativeAt = (points: Point[], t: number) => points[0].map((value, axis) => 3 * ((1 - t) ** 2 * (points[1][axis] - value) + 2 * t * (1 - t) * (points[2][axis] - points[1][axis]) + t ** 2 * (points[3][axis] - points[2][axis])));
const cross = (a: number[], b: number[]) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const line3d: Point[] = [[10, 10, 0], [40, 10, 6]];
const cubic3d: Point[] = [[10, 30, 3], [18, 37, 12], [32, 25, -3], [40, 30, 9]];
function freeze(value: unknown): void {
  if (value && typeof value === 'object') { for (const child of Object.values(value)) freeze(child); Object.freeze(value); }
}

for (const first of ['straight', 'crown'] as const) for (const domain of [[0, 1], [2, 4], [-3, -.5]]) {
  test(`mixed Direct Ruled ${first}-first on ${domain} is the independent affine section blend`, () => {
    const d = direct([curveSource('straight', 1, line, undefined, domain), curveSource('crown', 2, crown, undefined, domain)]);
    const saved = structuredClone(d), parents = d.objects.map(object => geometryOf(d, object)), parentSnapshots = structuredClone(parents);
    freeze(d); parents.forEach(freeze);
    const second = first === 'straight' ? 'crown' : 'straight';
    const result = directOps.ruledSurface(d, objectId(d, first), objectId(d, second)), surface = surfaceOf(result);
    assert.equal(surface.degreeU, 2); assert.equal(surface.degreeV, 1);
    assert.deepEqual(surfaceDomain(surface), { u: domain, v: [0, 1] });
    assert.deepEqual(surface.knotsU, [domain[0], domain[0], domain[0], domain[1], domain[1], domain[1]]);
    assert.deepEqual(surface.weights, [[1, 1], [1, 1], [1, 1]]);
    for (const t of [0, .13, .5, .87, 1]) for (const v of [0, .19, .5, .73, 1]) {
      const u = t === 1 ? domain[1] : domain[0] + (domain[1] - domain[0]) * t;
      const straight = lineAt(line, t), quadratic = quadraticAt(crown, t);
      const [a, b] = first === 'straight' ? [straight, quadratic] : [quadratic, straight];
      near(evaluateSurface(surface, u, v), a.map((value, axis) => (1 - v) * value + v * b[axis]));
    }
    assert.equal(Object.keys(result.sources).length, Object.keys(d.sources).length + 1, 'the scratch elevated source is not published');
    assert.equal(result.objects.length, d.objects.length + 1);
    d.objects.forEach((object, index) => {
      assert.equal(result.objects[index], object, 'Ruled retains the exact source object');
      assert.equal(geometryOf(result, object), parents[index], 'the source curve object remains unchanged');
      assert.deepEqual(geometryOf(result, object), parentSnapshots[index]);
      assert.equal(result.sources[object.source], d.sources[object.source]);
      assert.equal(object.hidden, undefined);
    });
    assert.deepEqual(d, saved);
  });
}

for (const first of ['straight', 'cubic'] as const) for (const domain of [[0, 1], [2, 4], [-3, -.5], [-0, 1], [-2, -0]]) {
  test(`line/cubic Direct Ruled ${first}-first on ${domain.map(literal)} preserves the analytic rails, interior and orientation`, () => {
    const d = direct([curveSource('straight', 1, line3d, undefined, domain), curveSource('cubic', 3, cubic3d, undefined, domain)]);
    const saved = structuredClone(d), parents = d.objects.map(object => geometryOf(d, object)), snapshots = structuredClone(parents);
    freeze(d); parents.forEach(freeze);
    const second = first === 'straight' ? 'cubic' : 'straight', a = objectId(d, first), b = objectId(d, second);
    const result = directOps.ruledSurface(d, a, b), surface = surfaceOf(result), surfaceId = result.objects.at(-1)!.id;
    assert.deepEqual([surface.degreeU, surface.degreeV], [3, 1]);
    assert.deepEqual(surfaceDomain(surface), { u: domain, v: [0, 1] });
    assert.deepEqual(surface.knotsU, [...Array(4).fill(domain[0]), ...Array(4).fill(domain[1])]);
    assert.deepEqual(surface.knotsV, [0, 0, 1, 1]);
    assert.deepEqual(surface.weights, [[1, 1], [1, 1], [1, 1], [1, 1]]);
    const cubicColumn = first === 'cubic' ? 0 : 1;
    assert.deepEqual(surface.controlPoints.map(row => row[cubicColumn]), cubic3d, 'the cubic rail coefficients remain exact');
    const parameter = (t: number) => t === 0 ? domain[0] : t === 1 ? domain[1] : domain[0] + (domain[1] - domain[0]) * t;
    for (const t of [...Array.from({ length: 65 }, (_, i) => i / 64), .13, .87]) for (const v of [0, .19, .5, .73, 1]) {
      const straight = lineAt(line3d, t), cubic = cubicAt(cubic3d, t), [left, right] = first === 'straight' ? [straight, cubic] : [cubic, straight];
      near(evaluateSurface(surface, parameter(t), v), left.map((value, axis) => (1 - v) * value + v * right[axis]));
    }
    for (const t of [0, .13, .5, .87, 1]) for (const v of [0, .5, 1]) {
      const straight = lineAt(line3d, t), cubic = cubicAt(cubic3d, t);
      const straightD1 = line3d[0].map((value, axis) => line3d[1][axis] - value), cubicD1 = cubicDerivativeAt(cubic3d, t);
      const [left, right, leftD1, rightD1] = first === 'straight' ? [straight, cubic, straightD1, cubicD1] : [cubic, straight, cubicD1, straightD1];
      // The omitted positive common-domain scale changes the magnitude, not the normal direction.
      const du = leftD1.map((value, axis) => (1 - v) * value + v * rightD1[axis]), dv = right.map((value, axis) => value - left[axis]);
      const normal = cross(du, dv), length = Math.hypot(...normal);
      assert.ok(length > 0);
      near(analyzeSurface(result, surfaceId, parameter(t), v).normal, normal.map(value => value / length));
    }
    near(evaluateSurface(surface, parameter(.5), .5), [25, 20.375, 3.9375]);
    const swapped = directOps.ruledSurface(d, b, a), swappedSurface = surfaceOf(swapped);
    for (const t of [0, .13, .5, .87, 1]) for (const v of [0, .19, .5, .73, 1])
      near(evaluateSurface(swappedSurface, parameter(t), v), evaluateSurface(surface, parameter(t), 1 - v));
    near(analyzeSurface(swapped, swapped.objects.at(-1)!.id, parameter(.5), .5).normal,
      analyzeSurface(result, surfaceId, parameter(.5), .5).normal.map(value => -value));
    assert.equal(Object.keys(result.sources).length, Object.keys(d.sources).length + 1, 'both elevated scratch sources stay private');
    assert.equal(result.objects.length, d.objects.length + 1);
    d.objects.forEach((object, index) => {
      assert.equal(result.objects[index], object, 'the original visible rail object remains');
      assert.equal(result.sources[object.source], d.sources[object.source]);
      assert.equal(geometryOf(result, object), parents[index]);
      assert.deepEqual(geometryOf(result, object), snapshots[index]);
      assert.equal(object.hidden, undefined);
    });
    assert.deepEqual(d, saved);
  });
}

test('line/cubic Direct Ruled preserves an explicitly reversed native rail without automatic reversal or swapping', () => {
  const original = direct([curveSource('straight', 1, line3d, undefined, [2, 4]), curveSource('cubic', 3, cubic3d, undefined, [2, 4])]);
  for (const picked of ['straight', 'cubic']) {
    const reversed = directOps.reverseCurve(original, objectId(original, picked)), reverseId = reversed.objects.at(-1)!.id, saved = structuredClone(reversed);
    const result = directOps.ruledSurface(reversed, picked === 'straight' ? reverseId : objectId(reversed, 'straight'), picked === 'cubic' ? reverseId : objectId(reversed, 'cubic'));
    const surface = surfaceOf(result);
    for (const t of [0, .13, .5, .87, 1]) for (const v of [0, .19, .5, .73, 1]) {
      const a = lineAt(line3d, picked === 'straight' ? 1 - t : t), b = cubicAt(cubic3d, picked === 'cubic' ? 1 - t : t);
      near(evaluateSurface(surface, 2 + 2 * t, v), a.map((value, axis) => (1 - v) * value + v * b[axis]));
    }
    assert.deepEqual(reversed, saved);
  }
});

test('mixed Direct Ruled preserves reversed section parameter direction', () => {
  const reversed = [...line].reverse(), d = direct([curveSource('straight', 1, reversed), curveSource('crown', 2, crown)]);
  const result = directOps.ruledSurface(d, objectId(d, 'straight'), objectId(d, 'crown')), surface = surfaceOf(result);
  for (const t of [0, .25, .75, 1]) for (const v of [0, .5, 1]) {
    const a = lineAt(reversed, t), b = quadraticAt(crown, t);
    near(evaluateSurface(surface, t, v), a.map((value, axis) => (1 - v) * value + v * b[axis]));
  }
});

test('mixed Direct Ruled retains exact native domain and distinct-ID refusals', () => {
  for (const [firstDomain, secondDomain] of [[[0, 1], [0, 2]], [[0, 1], [0, 1 + Number.EPSILON]], [[-0, 1], [0, 1]]]) {
    const d = direct([curveSource('straight', 1, line, undefined, firstDomain), curveSource('crown', 2, crown, undefined, secondDomain)]), saved = structuredClone(d);
    assert.throws(() => directOps.ruledSurface(d, objectId(d, 'straight'), objectId(d, 'crown')), /domain endpoint bits must agree/);
    assert.throws(() => directOps.ruledSurface(d, objectId(d, 'crown'), objectId(d, 'straight')), /domain endpoint bits must agree/);
    assert.deepEqual(d, saved);
  }
  const first = direct([curveSource('same', 1, line)]);
  const both = importSource(first, `@model other { version:0; length-unit:mm; ${curveSource('same', 2, crown)} }`, 'other');
  assert.throws(() => directOps.ruledSurface(both, both.objects[0].id, both.objects[1].id), /Original section IDs must be distinct/);
  assert.throws(() => directOps.ruledSurface(first, first.objects[0].id, first.objects[0].id), /Original section IDs must be distinct/);
  const ambiguousClamp = direct([curveSource('straight', 1, line, undefined, [0, 1], [-0, 0, 1, 1]), curveSource('crown', 2, crown)]);
  assert.throws(() => directOps.ruledSurface(ambiguousClamp, objectId(ambiguousClamp, 'straight'), objectId(ambiguousClamp, 'crown')), /domain endpoint bits must agree/);
});

test('line/cubic Ruled refuses different represented domains and ambiguous clamp slots before elevation', () => {
  for (const [firstDomain, secondDomain] of [[[0, 1], [0, 2]], [[0, 1], [0, 1 + Number.EPSILON]], [[-0, 1], [0, 1]], [[-2, -0], [-2, 0]], [[2, 4], [2 + 2 * Number.EPSILON, 4]]]) {
    const d = direct([curveSource('straight', 1, line3d, undefined, firstDomain), curveSource('cubic', 3, cubic3d, undefined, secondDomain)]), saved = structuredClone(d);
    const a = objectId(d, 'straight'), b = objectId(d, 'cubic');
    assert.throws(() => directOps.ruledSurface(d, a, b), /domain endpoint bits must agree/);
    assert.throws(() => directOps.ruledSurface(d, b, a), /domain endpoint bits must agree/);
    assert.deepEqual(d, saved);
  }
  for (const slot of [0, 1, 2, 3, 4, 5, 6, 7]) {
    const domain = slot < 4 ? [-0, 1] : [-2, -0], knots = [...Array(4).fill(domain[0]), ...Array(4).fill(domain[1])];
    knots[slot] = 0;
    const d = direct([curveSource('straight', 1, line3d, undefined, domain), curveSource('cubic', 3, cubic3d, undefined, domain, knots)]), saved = structuredClone(d);
    const a = objectId(d, 'straight'), b = objectId(d, 'cubic');
    assert.throws(() => directOps.ruledSurface(d, a, b), /domain endpoint bits must agree/);
    assert.throws(() => directOps.ruledSurface(d, b, a), /domain endpoint bits must agree/);
    assert.deepEqual(d, saved);
  }
});

test('line/cubic Ruled retains distinct native section IDs across separate source objects', () => {
  const first = direct([curveSource('same', 1, line3d)]), saved = structuredClone(first);
  const both = importSource(first, `@model other { version:0; length-unit:mm; ${curveSource('same', 3, cubic3d)} }`, 'other'), before = structuredClone(both);
  for (const [a, b] of [[both.objects[0].id, both.objects[1].id], [both.objects[1].id, both.objects[0].id]])
    assert.throws(() => directOps.ruledSurface(both, a, b), /Original section IDs must be distinct/);
  assert.throws(() => directOps.ruledSurface(first, first.objects[0].id, first.objects[0].id), /Original section IDs must be distinct/);
  assert.deepEqual(first, saved); assert.deepEqual(both, before);
});

test('mixed Direct Ruled excludes other degrees, rational weights and multiple spans without changing sources', () => {
  const straight = curveSource('straight', 1, line), quadratic = curveSource('other', 2, crown);
  for (const curves of [
    [curveSource('straight', 2, line.concat([[45, 10, 0]])), curveSource('other', 3, [[10, 30, 0], [20, 37, 8], [30, 37, 8], [40, 30, 0]])],
    [straight, curveSource('other', 2, crown, [1, .8, 1])],
    [curveSource('straight', 1, line, [2, 2]), quadratic],
    [curveSource('straight', 1, [[10, 10, 0], [25, 10, 0], [40, 10, 0]], undefined, [0, 1], [0, 0, .5, 1, 1]), quadratic],
    [straight, curveSource('other', 2, [[10, 30, 0], [20, 37, 8], [25, 37, 8], [30, 37, 8], [40, 30, 0]], undefined, [0, 1], [0, 0, 0, .5, .5, 1, 1, 1])],
  ]) {
    const d = direct(curves), saved = structuredClone(d);
    for (const ids of [[objectId(d, 'straight'), objectId(d, 'other')], [objectId(d, 'other'), objectId(d, 'straight')]])
      assert.throws(() => directOps.ruledSurface(d, ids[0], ids[1]), /Original section degrees must be equal/);
    assert.deepEqual(d, saved);
  }
  assert.throws(() => direct([curveSource('straight', 1, line, undefined, [0, 1], [-1, 0, 1, 2]), quadratic]), /open and clamped/i);
});

test('line/cubic Ruled excludes rational and multi-span rails and retains the native maximum degree', () => {
  const straight = curveSource('straight', 1, line3d), cubic = curveSource('other', 3, cubic3d);
  for (const curves of [
    [straight, curveSource('other', 3, cubic3d, [1, .8, 1, 1])],
    [straight, curveSource('other', 3, cubic3d, [2, 2, 2, 2])],
    [curveSource('straight', 1, line3d, [2, 2]), cubic],
    [curveSource('straight', 1, line3d, [1, .8]), cubic],
    [curveSource('straight', 1, [line3d[0], [25, 10, 3], line3d[1]], undefined, [0, 1], [0, 0, .5, 1, 1]), cubic],
    [straight, curveSource('other', 3, [[10, 30, 3], [18, 37, 12], [25, 27, 4], [32, 25, -3], [40, 30, 9]], undefined, [0, 1], [0, 0, 0, 0, .5, 1, 1, 1, 1])],
    [straight, curveSource('other', 3, [[10, 30, 3], [14, 33, 8], [18, 37, 12], [25, 27, 4], [32, 25, -3], [36, 27, 5], [40, 30, 9]], undefined, [0, 1], [0, 0, 0, 0, .5, .5, .5, 1, 1, 1, 1])],
  ]) {
    const d = direct(curves), saved = structuredClone(d), a = objectId(d, 'straight'), b = objectId(d, 'other');
    assert.throws(() => directOps.ruledSurface(d, a, b), /Original section degrees must be equal/);
    assert.throws(() => directOps.ruledSurface(d, b, a), /Original section degrees must be equal/);
    assert.deepEqual(d, saved);
  }
  for (const degree of [4, 5]) {
    const d = direct([straight, curveSource('other', degree, Array.from({ length: degree + 1 }, (_, i): Point => [10 + i * 5, 30 + i, i]))]), saved = structuredClone(d);
    const a = objectId(d, 'straight'), b = objectId(d, 'other');
    assert.throws(() => directOps.ruledSurface(d, a, b), /native degree1\.\.3 section is required/);
    assert.throws(() => directOps.ruledSurface(d, b, a), /native degree1\.\.3 section is required/);
    assert.deepEqual(d, saved);
  }
  assert.throws(() => direct([straight, curveSource('other', 3, cubic3d, undefined, [0, 1], [-1, 0, 0, 0, 1, 1, 1, 2])]), /open and clamped/i);
});

test('same-degree Direct Ruled keeps the original aligned native result including rational sections', () => {
  for (const curves of [[curveSource('straight', 1, line), curveSource('other', 1, [[10, 30, 0], [40, 30, 0]])],
    [curveSource('straight', 2, [[10, 10, 0], [25, 15, 2], [40, 10, 0]], [1, .8, 1]), curveSource('other', 2, crown, [1, .7, 1])],
    [curveSource('straight', 3, [[10, 10, 0], [18, 17, 6], [32, 5, -3], [40, 10, 6]], [1, .8, .9, 1]), curveSource('other', 3, cubic3d, [1, .7, .6, 1])],
    [curveSource('straight', 2, [[10, 10, 0], [20, 15, 2], [30, 15, 2], [40, 10, 0]], undefined, [0, 1], [0, 0, 0, .25, 1, 1, 1]),
      curveSource('other', 2, [[10, 30, 0], [20, 37, 8], [30, 37, 8], [40, 30, 0]], undefined, [0, 1], [0, 0, 0, .75, 1, 1, 1])]]) {
    const d = direct(curves), a = objectId(d, 'straight'), b = objectId(d, 'other');
    const result = surfaceOf(directOps.ruledSurface(d, a, b)), first = curveOf(d, a), second = curveOf(d, b);
    const expected = buildAlignedRationalRuledSurface(first, second, { surfaceId: result.id,
      firstAlignedId: second.knots.some(knot => !first.knots.includes(knot)) ? 'proof_first' : first.id,
      secondAlignedId: first.knots.some(knot => !second.knots.includes(knot)) ? 'proof_second' : second.id,
      resultIdPrefix: 'proof', maximumInsertedKnots: 14, maximumRefinementOperations: 14 });
    assert.deepEqual(result, expected.ruled.surface);
    assert.deepEqual(curveDomain(curveOf(d, a)), [0, 1]);
  }
});
