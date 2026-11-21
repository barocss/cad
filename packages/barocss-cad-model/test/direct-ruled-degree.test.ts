import assert from 'node:assert/strict';
import test from 'node:test';
import { buildAlignedRationalRuledSurface, curveDomain, evaluateSurface, surfaceDomain, type Curve, type Point, type Surface } from '@barocss/cad';
import { directOps, emptyDirect, geometryOf, importSource, type DirectGeometry } from '../src/engine/direct';

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

test('mixed Direct Ruled excludes other degrees, rational weights and multiple spans without changing sources', () => {
  const straight = curveSource('straight', 1, line), quadratic = curveSource('other', 2, crown);
  for (const curves of [
    [straight, curveSource('other', 3, [[10, 30, 0], [20, 37, 8], [30, 37, 8], [40, 30, 0]])],
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

test('same-degree Direct Ruled keeps the original aligned native result including rational sections', () => {
  for (const curves of [[curveSource('straight', 1, line), curveSource('other', 1, [[10, 30, 0], [40, 30, 0]])],
    [curveSource('straight', 2, [[10, 10, 0], [25, 15, 2], [40, 10, 0]], [1, .8, 1]), curveSource('other', 2, crown, [1, .7, 1])],
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
