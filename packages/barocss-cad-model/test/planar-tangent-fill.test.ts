import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBezierCoonsSurface, compileCadModel, evaluateCurve, evaluateSurface, surfaceD1Evaluator, type BezierCoonsBoundaries, type Curve, type Point, type Surface } from '@barocss/cad';
import { buildPlanarTangentFill } from '../src/engine/planarTangentFill';

const curve = (id: string, points: Point[]): Curve => ({ kind: 'curve', id, degree: points.length - 1,
  knots: [...points.map(() => 0), ...points.map(() => 1)], controlPoints: points, weights: points.map(() => 1) });
const fixture = (degree = 3): BezierCoonsBoundaries => ({
  bottom: curve('bottom', [[0, 0, 0], [15, 0, 0], [30, 0, 0]]),
  top: curve('top', [[0, 24, 0], [15, 24, 16], [30, 24, 0]]),
  left: curve('left', Array.from({ length: degree + 1 }, (_, i): Point => [0, 24 * i / degree, 0])),
  right: curve('right', Array.from({ length: degree + 1 }, (_, i): Point => [30, 24 * i / degree, 0])),
});
const donor = (): Surface => ({ kind: 'surface', id: 'donor', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
  controlPoints: [[[0, -24, 0], [0, 0, 0]], [[30, -24, 0], [30, 0, 0]]], weights: [[1, 1], [1, 1]] });
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, i) => value - b[i]));
const cross = (a: Point, b: Point): Point => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const near = (a: readonly number[], b: readonly number[]) => assert.ok(distance(a, b) < 2e-11, `${a} versus ${b}`);
function reject(boundaries: BezierCoonsBoundaries, source: Surface, pattern: RegExp) {
  const before = structuredClone({ boundaries, source });
  assert.throws(() => buildPlanarTangentFill(boundaries, source, 'rejected'), pattern);
  assert.deepEqual({ boundaries, source }, before, 'refusal does not change the inputs');
}

test('Tangent Fill: analytical G0 baseline becomes G1 while all four native boundaries stay fixed', () => {
  const boundaries = fixture(), source = donor(), before = structuredClone({ boundaries, source });
  const baseline = buildBezierCoonsSurface(boundaries, { surfaceId: 'baseline' }).surface;
  const made = buildPlanarTangentFill(boundaries, source, 'tangent');
  const baseD1 = surfaceD1Evaluator(baseline), nextD1 = surfaceD1Evaluator(made.surface);
  const baseNormal = cross(baseD1(.5, 0).du, baseD1(.5, 0).dv);
  assert.ok(Math.abs(Math.atan2(Math.hypot(baseNormal[0], baseNormal[1]), baseNormal[2]) * 180 / Math.PI - 18.43494882292201) < 1e-12);
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    near(evaluateSurface(made.surface, t, 0), evaluateCurve(boundaries.bottom, t));
    near(evaluateSurface(made.surface, t, 1), evaluateCurve(boundaries.top, t));
    near(evaluateSurface(made.surface, 0, t), evaluateCurve(boundaries.left, t));
    near(evaluateSurface(made.surface, 1, t), evaluateCurve(boundaries.right, t));
    const seam = nextD1(t, 0), normal = cross(seam.du, seam.dv);
    near(normal, [0, 0, 720]);
  }
  // Independent formula: removing row j=1 changes v to 2v²−v³. Its XY Jacobian
  // is identically 720, so the whole fixture is regular, not just the sampled seam.
  for (const u of [.037, .23, .5, .831]) for (const v of [0, .071, .31, .77, 1]) {
    near(evaluateSurface(made.surface, u, v), [30 * u, 24 * v, 32 * u * (1 - u) * (2 * v * v - v ** 3)]);
    const d1 = nextD1(u, v);
    assert.ok(Math.abs(cross(d1.du, d1.dv)[2] - 720) < 2e-11);
  }
  const net = made.surface.controlPoints;
  assert.deepEqual(net.map(row => row[0]), boundaries.bottom.controlPoints);
  assert.deepEqual(net.map(row => row.at(-1)), boundaries.top.controlPoints);
  assert.deepEqual(net[0], boundaries.left.controlPoints);
  assert.deepEqual(net.at(-1), boundaries.right.controlPoints);
  const compiled = compileCadModel(made.source, { sourceVersion: 0 });
  assert.ok(compiled.ok);
  assert.deepEqual(compiled.model.objects, [made.surface], 'full precision source preserves every stored coefficient');
  assert.deepEqual({ boundaries, source }, before, 'original donor and curves stay unchanged');
});

test('Tangent Fill: smallest biquadratic net has the independent v² height', () => {
  const boundaries = fixture(2), result = buildPlanarTangentFill(boundaries, donor(), 'smallest');
  assert.deepEqual(result.surface.controlPoints[1][1], [15, 12, 0]);
  for (const [u, v] of [[.13, .41], [.61, .29], [.91, .81]])
    near(evaluateSurface(result.surface, u, v), [30 * u, 24 * v, 32 * u * (1 - u) * v * v]);
});

test('Tangent Fill: all donor edge directions and a represented oblique plane are supported', () => {
  const original = donor();
  const variants: Surface[] = [];
  for (const transpose of [false, true]) for (const reverseU of [false, true]) for (const reverseV of [false, true]) {
    let points = transpose ? original.controlPoints[0].map((_, i) => original.controlPoints.map(row => row[i])) : original.controlPoints;
    if (reverseU) points = [...points].reverse();
    if (reverseV) points = points.map(row => [...row].reverse());
    variants.push({ ...original, controlPoints: points });
  }
  for (const variant of variants) {
    const result = buildPlanarTangentFill(fixture(), variant, 'orientation');
    near(evaluateSurface(result.surface, .5, .5), [15, 12, 3]);
  }
  const map = ([x, y, z]: Point): Point => [x + 71, .6 * y - .8 * z - 13, .8 * y + .6 * z + 29];
  const boundaries = fixture();
  for (const side of Object.values(boundaries)) side.controlPoints = side.controlPoints.map(map);
  const rotated = donor(); rotated.controlPoints = rotated.controlPoints.map(row => row.map(map));
  const made = buildPlanarTangentFill(boundaries, rotated, 'oblique');
  near(evaluateSurface(made.surface, .23, .37), map([6.9, 8.88, 32 * .23 * .77 * (2 * .37 ** 2 - .37 ** 3)]));
});

test('Tangent Fill: source decimals below the legacy serializer precision remain present', () => {
  const boundaries = fixture(); boundaries.top.controlPoints[1][2] = 1e-12; boundaries.bottom.controlPoints[1][1] = -0;
  const made = buildPlanarTangentFill(boundaries, donor(), 'tiny');
  assert.equal(made.surface.controlPoints[1][3][2], 1e-12);
  assert.ok(Object.is(made.surface.controlPoints[1][0][1], -0));
  const compiled = compileCadModel(made.source, { sourceVersion: 0 }); assert.ok(compiled.ok);
  assert.deepEqual(compiled.model.objects, [made.surface]);
});

test('Tangent Fill: cubic straight seam and reversed seam parameter retain analytical G1', () => {
  const boundaries = fixture();
  boundaries.bottom = curve('bottom', [[0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0]]);
  boundaries.top = curve('top', [[0, 24, 0], [10, 24, 16], [20, 24, 16], [30, 24, 0]]);
  const forward = buildPlanarTangentFill(boundaries, donor(), 'cubic');
  const reverse = { bottom: { ...boundaries.bottom, controlPoints: [...boundaries.bottom.controlPoints].reverse() },
    top: { ...boundaries.top, controlPoints: [...boundaries.top.controlPoints].reverse() }, left: boundaries.right, right: boundaries.left };
  const backward = buildPlanarTangentFill(reverse, donor(), 'backward');
  for (const t of [0, .037, .23, .5, .83, 1]) {
    const a = surfaceD1Evaluator(forward.surface)(t, 0), b = surfaceD1Evaluator(backward.surface)(1 - t, 0);
    near(a.point, b.point);
    near(cross(a.du, a.dv), [0, 0, 720]); near(cross(b.du, b.dv), [0, 0, -720]);
  }
});

test('Tangent Fill: incompatible or collapsed fixed corner tangents refuse', () => {
  const conflict = fixture(); conflict.left.controlPoints[1][2] = 1;
  reject(conflict, donor(), /DIRECT_VALUE.*corner tangent/);
  const collapsed = fixture(); collapsed.left.controlPoints[1] = [...collapsed.left.controlPoints[0]];
  reject(collapsed, donor(), /DIRECT_VALUE.*full seam.*regular/);
});

test('Tangent Fill: same-side donor and an interior seam fold refuse despite regular corners', () => {
  const sameSide = donor(); sameSide.controlPoints = sameSide.controlPoints.map(row => row.map(([x, y, z]): Point => [x, -y, z]));
  reject(fixture(), sameSide, /DIRECT_VALUE.*opposite side/);
  const folded = fixture();
  folded.bottom = curve('bottom', [[0, 0, 0], [10, 0, 0], [20, 0, 0], [30, 0, 0]]);
  folded.top = curve('top', [[0, 24, 0], [10, -48, 16], [20, -48, 16], [30, 24, 0]]);
  reject(folded, donor(), /DIRECT_VALUE.*full seam.*regular/);
});

test('Tangent Fill: exact donor edge ownership is required, not matching endpoints alone', () => {
  const bent = fixture(); bent.bottom.controlPoints[1][1] = .001;
  reject(bent, donor(), /DIRECT_VALUE.*straight-edge coefficients/);
  const short = fixture(); short.bottom.controlPoints[2][0] = 29; short.right.controlPoints[0][0] = 29;
  reject(short, donor(), /DIRECT_PICK.*entire donor edge/);
});

test('Tangent Fill: donor nonplanarity, rational weights, folded corners and unsupported knots refuse', () => {
  const nonplanar = donor(); nonplanar.controlPoints[0][0][2] = 1e-8;
  reject(fixture(), nonplanar, /DIRECT_PICK.*planar/);
  // A tiny positional residual can still cause a large normal error on a narrow donor.
  const illConditioned = donor();
  illConditioned.controlPoints = [[[0, -2e-7, 0], [0, 0, 0]], [[30, -2e-7, 1e-13], [30, 0, 0]]];
  reject(fixture(), illConditioned, /DIRECT_PICK.*angle tolerance/);
  const rational = donor(); rational.weights[0][0] = .5;
  reject(fixture(), rational, /DIRECT_PICK.*bilinear/);
  const folded = donor(); folded.controlPoints[1][0][0] = -30;
  reject(fixture(), folded, /DIRECT_PICK.*regular/);
  const domain = donor(); domain.knotsU = [2, 2, 3, 3];
  reject(fixture(), domain, /DIRECT_PICK.*bilinear/);
  const degenerate = donor(); degenerate.controlPoints[1] = structuredClone(degenerate.controlPoints[0]);
  reject(fixture(), degenerate, /DIRECT_PICK.*nondegenerate/);
});

test('Tangent Fill: sampled Fill families and degree-one cross directions have no silent fallback', () => {
  const rational = fixture(); rational.top.weights[1] = .8;
  reject(rational, donor(), /DIRECT_VALUE.*exact polynomial/);
  const span = fixture(); span.top.knots = [0, 0, 0, .5, 1, 1, 1];
  reject(span, donor(), /DIRECT_VALUE.*exact polynomial/);
  reject(fixture(1), donor(), /DIRECT_VALUE.*at least two/);
});
