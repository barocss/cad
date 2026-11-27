import test from 'node:test';
import assert from 'node:assert/strict';
import { checkBrep, compileCadModel, evaluateCurve, evaluateSurface, surfaceD1Evaluator, type Curve, type Point, type Surface } from '@barocss/cad';
import { buildGuidedJunction } from '../src/engine/guidedJunction';

const curve = (id: string, controlPoints: Point[]): Curve => ({ kind: 'curve', id, degree: controlPoints.length - 1,
  knots: [...controlPoints.map(() => 0), ...controlPoints.map(() => 1)], controlPoints, weights: controlPoints.map(() => 1) });
const reversed = (c: Curve): Curve => ({ ...c, controlPoints: [...c.controlPoints].reverse() });
const distance = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, i) => value - b[i]));
const near = (a: readonly number[], b: readonly number[]) => assert.ok(distance(a, b) < 1e-10, `${a} versus ${b}`);
function fixture(shape = 96, width = 30, length = 24, height = 12) {
  const seam = curve('seam', [[0, 0, 0], [width / 2, 0, 0], [width, 0, 0]]);
  const left = curve('left', [[0, 0, 0], [0, length / 2, 0], [0, length, height]]);
  const right = curve('right', [[width, 0, 0], [width / 2, length / 2, 0], [0, length, height]]);
  const u = .25, end = .75;
  const guide = curve('guide', [[width * u, 0, 0], [width * u, length * end / 3, 0],
    [width * u, length * end * 2 / 3, (height * end ** 2 + shape * u * end ** 3) / 3], [width * u, length * end, height * end ** 2]]);
  const donor: Surface = { kind: 'surface', id: 'donor', degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
    controlPoints: [[[0, -length, 0], [0, 0, 0]], [[width, -length, 0], [width, 0, 0]]], weights: [[1, 1], [1, 1]] };
  return { seam, left, right, guide, donor, surfaceId: 'junction' };
}
function refuses(change: (f: ReturnType<typeof fixture>) => void, pattern: RegExp) {
  const f = fixture(); change(f); const before = structuredClone(f);
  assert.throws(() => buildGuidedJunction(f), pattern); assert.deepEqual(f, before, 'refusals retain every source');
}

test('Guided Junction: the actual guide changes the interior while all three native boundaries stay fixed', () => {
  const input = fixture(), before = structuredClone(input), made = buildGuidedJunction(input), base = buildGuidedJunction(fixture(0));
  assert.deepEqual(input, before, 'construction preserves all originals');
  assert.deepEqual(made.surface.controlPoints.map(row => row.map(point => point[2])), [[0, 0, 4, 12], [0, 0, 20, 12], [0, 0, 4, -84]]);
  near(evaluateSurface(made.surface, .25, .5), [7.5, 12, 4.5]); near(evaluateSurface(base.surface, .25, .5), [7.5, 12, 3]);
  for (let i = 0; i <= 64; i++) {
    const t = i / 64;
    near(evaluateSurface(made.surface, t, 0), evaluateCurve(input.seam, t));
    near(evaluateSurface(made.surface, 0, t), evaluateCurve(input.left, t));
    near(evaluateSurface(made.surface, 1 - t, t), evaluateCurve(input.right, t));
    near(evaluateSurface(made.surface, .25, .75 * t), evaluateCurve(input.guide, t));
    const d = surfaceD1Evaluator(made.surface)(t, 0); near(d.du, [30, 0, 0]); near(d.dv, [0, 24, 0]);
  }
  for (const u of [0, .13, .5, .83, 1]) for (const v of [0, .07, .41, .79, 1]) {
    near(evaluateSurface(made.surface, u, v), [30 * u, 24 * v, 12 * v ** 2 + 96 * u * v ** 2 * (1 - u - v)]);
    const d = surfaceD1Evaluator(made.surface)(u, v); assert.ok(Math.abs(d.du[0] * d.dv[1] - d.du[1] * d.dv[0] - 720) < 1e-10);
  }
});

test('Guided Junction: every authored direction and either shoulder pick order keeps the same accepted support', () => {
  const expected = buildGuidedJunction(fixture()).surface;
  for (let mask = 0; mask < 32; mask++) {
    const f = fixture();
    if (mask & 1) f.seam = reversed(f.seam);
    if (mask & 2) f.left = reversed(f.left);
    if (mask & 4) f.right = reversed(f.right);
    if (mask & 8) f.guide = reversed(f.guide);
    if (mask & 16) [f.left, f.right] = [f.right, f.left];
    assert.deepEqual(buildGuidedJunction(f).surface, expected, `source directions/pick order ${mask}`);
  }
});

test('Guided Junction: native topology declares an open three-edge sheet and refuses a false solid claim', () => {
  const { brep } = buildGuidedJunction(fixture()), report = checkBrep(brep, { strict: true, pcurveSamples: 65 });
  assert.ok(report.valid, report.issues.join('; '));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 1, loops: 1, coedges: 3, edges: 3, vertices: 3 });
  assert.equal(report.maximumVertexGap, 0); assert.equal(report.maximumPcurveGap, 0); assert.equal(report.maximumEdgeSurfaceGap, 0);
  assert.equal(brep.bodies[0].kind, 'sheet'); assert.equal(brep.shells[0].closed, false);
  assert.ok(brep.coedges.every(coedge => coedge.twin === null && coedge.pcurve !== null));
  const closed = { ...brep, bodies: brep.bodies.map(body => ({ ...body, kind: 'solid' as const })), shells: brep.shells.map(shell => ({ ...shell, closed: true })) };
  assert.equal(checkBrep(closed).valid, false);
  const off = structuredClone(brep); off.coedges[1].pcurve!.controlPoints[1][0] = .01;
  assert.equal(checkBrep(off, { pcurveSamples: 65 }).valid, false, 'a changed diagonal trim is detected');
});

test('Guided Junction: decimal, signed shape, translated oblique and sheared inputs preserve the entire stored source', () => {
  for (const shape of [0, -17.123456789012344, 96.12345678901234]) {
    const f = fixture(shape, 31.123456789012344, 23.54321098765432, 11.23456789012345);
    const map = ([x, y, z]: Point): Point => [x + .125 * y + 71.12345678901235, .6 * y - .8 * z - 13, .8 * y + .6 * z + 29];
    for (const c of [f.seam, f.left, f.right, f.guide]) c.controlPoints = c.controlPoints.map(map);
    f.donor.controlPoints = f.donor.controlPoints.map(row => row.map(map));
    const made = buildGuidedJunction(f), compiled = compileCadModel(made.source, { sourceVersion: 0 });
    assert.ok(compiled.ok); assert.deepEqual(compiled.model.objects, [made.surface]);
    near(evaluateSurface(made.surface, .25, .5), map([31.123456789012344 / 4, 23.54321098765432 / 2, 11.23456789012345 / 4 + shape / 64]));
    assert.ok(checkBrep(made.brep, { strict: true, pcurveSamples: 65 }).valid);
  }
});

test('Guided Junction: disconnected, endpoint-only, nonconstant and unsupported guides refuse', () => {
  refuses(f => { f.guide.controlPoints[0][2] = .001; }, /guide/);
  refuses(f => { f.guide.controlPoints[1][0] += .01; }, /guide/);
  refuses(f => { f.guide.controlPoints[1][2] = .001; }, /guide/);
  refuses(f => { f.guide.controlPoints[3][2] += .001; }, /guide/);
  refuses(f => { f.guide = curve('guide', [[0, 0, 0], [0, 8, 0], [0, 16, 4], [0, 24, 12]]); }, /guide/);
  refuses(f => { f.guide.weights[1] = .9; }, /polynomial/);
  refuses(f => { f.guide.controlPoints[2][2] = 1e6; }, /coordinate range/);
});

test('Guided Junction: ambiguous boundaries, collapsed projection, mismatched shoulders and nonstraight seam refuse', () => {
  refuses(f => { f.right = structuredClone(f.left); }, /unambiguous triangle/);
  refuses(f => { f.right.controlPoints[2][0] = .001; }, /third corner/);
  refuses(f => { f.right.controlPoints[1][2] = .001; }, /shoulder controls/);
  refuses(f => { f.left.controlPoints[1] = [10, 0, 0]; }, /regular.*area/);
  refuses(f => { f.seam.controlPoints[1][2] = .001; }, /straight/);
});

test('Guided Junction: donor overlap, partial seam, fold and nonplanarity refuse before publication', () => {
  refuses(f => { f.donor.controlPoints = f.donor.controlPoints.map(row => row.map(([x, y, z]): Point => [x, -y, z])); }, /opposite side|overlap/);
  refuses(f => { f.donor.controlPoints[1][1][0] = 31; }, /entire unambiguous donor edge/);
  refuses(f => { f.donor.controlPoints[1][0][0] = -30; }, /fold or overlap/);
  refuses(f => { f.donor.controlPoints[0][0][2] = .001; }, /planar/);
  refuses(f => { f.donor.weights[0][0] = .9; }, /bilinear planar/);
  refuses(f => { f.donor.controlPoints = [[[0, -.000001, 5e-13], [0, 0, 0]], [[30, -.000001, 5e-13], [30, 0, 0]]]; }, /normal field.*tangent plane/);
});


test('Guided Junction: native clamped domains and all donor parameter directions preserve the same physical result', () => {
  const baseline = buildGuidedJunction(fixture()).surface;
  for (let mask = 0; mask < 8; mask++) {
    const f = fixture();
    for (const c of [f.seam, f.left, f.right, f.guide]) c.knots = c.knots.map(value => 2 + value * 5);
    let net = f.donor.controlPoints;
    if (mask & 1) net = net[0].map((_, i) => net.map(row => row[i]));
    if (mask & 2) net = [...net].reverse();
    if (mask & 4) net = net.map(row => [...row].reverse());
    f.donor.controlPoints = net;
    assert.deepEqual(buildGuidedJunction(f).surface, baseline);
  }
});
