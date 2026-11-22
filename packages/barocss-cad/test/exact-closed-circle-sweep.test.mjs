import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, evaluateCadPart, faceGeometry, joinCurves, loadCadPart,
  massPropertiesOf, measureBrepEdgeContinuity, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, n) => a.map(x => x * n);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(norm(sub(a, b)), 0);

const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [50, -30], radius: 2 };
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = disk, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    section, { id: 'w', kind: 'sweep-curve', sketch: 's', path: pathOf(path), mode },
  ],
});

function quarters(radius = 20, center = [0, 0, 0], e0 = [1, 0, 0], e1 = [0, 1, 0]) {
  const cardinal = [e0, e1, scale(e0, -1), scale(e1, -1), e0];
  return cardinal.slice(0, -1).map((axis, i) => ({ kind: 'curve', id: `q${i}`, degree: 2,
    knots: [0, 0, 0, 1, 1, 1], controlPoints: [axis, add(axis, cardinal[i + 1]), cardinal[i + 1]].map(direction => add(center, scale(direction, radius))),
    weights: [1, Math.SQRT1_2, 1] }));
}

function joinedCircle(...args) {
  return quarters(...args).reduce((curve, quarter, i) => joinCurves(curve, quarter, { curveId: `join${i}`, rightParameterEnd: i + 1 }).curve);
}

/** The four spans from Sketch's Circle and Make curves, at Direct source precision. */
function makerCircle(center, e0, e1, radius) {
  const round = n => Math.round(n * 1e9) / 1e9;
  const controlPoints = Array.from({ length: 9 }, (_, i) => {
    const a = i * Math.PI / 4, rho = i % 2 ? radius / Math.cos(Math.PI / 4) : radius;
    return add(center, add(scale(e0, rho * Math.cos(a)), scale(e1, rho * Math.sin(a)))).map(round);
  });
  return { degree: 2, controlPoints, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
    weights: controlPoints.map((_, i) => i % 2 ? round(Math.cos(Math.PI / 4)) : 1) };
}

function verify(output, center, normal, R, r) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology[0].genus, 1);
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 4, loops: 4, coedges: 16, edges: 8, vertices: 4 });
  assert.ok(brep.coedges.every(use => use.pcurve));
  assert.ok(report.maximumPcurveGap < 1e-8);
  const analytic = massPropertiesOf(output), quadrature = brepMassProperties(brep, 1);
  assert.equal(analytic.method, 'closed-form');
  assert.equal(quadrature.method, 'quadrature');
  const volume = 2 * Math.PI ** 2 * R * r ** 2;
  near(analytic.volume, volume, 1e-9 * volume);
  near(quadrature.volume, volume, 1e-9 * volume);
  pointNear(analytic.centroid, center);
  pointNear(quadrature.centroid, center);

  for (const face of brep.faces) {
    assert.ok(face.name.startsWith('w.side'));
    assert.notEqual(faceGeometry(face).kind, 'plane');
    const { u, v } = surfaceDomain(face.surface);
    for (const s of [0, .15, .39, .63, .8, 1]) for (const t of [0, .11, .42, .66, 1]) {
      const actual = evaluateSurfaceD1(face.surface, u[0] + (u[1] - u[0]) * s, v[0] + (v[1] - v[0]) * t);
      const fromCenter = sub(actual.point, center), axial = dot(fromCenter, normal);
      const radial = unit(sub(fromCenter, scale(normal, axial))), displacement = sub(fromCenter, scale(radial, R));
      near(norm(displacement), r);
      const outward = scale(unit(cross(actual.du, actual.dv)), face.sense === 'forward' ? 1 : -1);
      pointNear(outward, unit(displacement));
    }
  }
  for (const edge of brep.edges) {
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    near(continuity.curvature.maximumDifference, 0);
  }
  return analytic;
}

test('four authored quarter arcs produce one exact closed torus with all eight measurable native edges', () => {
  const path = joinedCircle();
  assert.deepEqual(path.knots, [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4]);
  const snapshot = evaluateCadPart(document(path)), [output] = snapshot.outputs;
  assert.equal(snapshot.outputs.length, 1);
  verify(output, [0, 0, 0], [0, 0, 1], 20, 2);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(reopened.outputs[0].brep, output.brep);
});

test('rounded Make curves circle, close seam and reversed nonuniform parameterization preserve an oblique torus', () => {
  const center = [123.456789123, -2.125, 21.875], e0 = [.36, .48, .8], e1 = [-.8, .6, 0], normal = cross(e0, e1);
  const path = makerCircle(center, e0, e1, 20), section = { ...disk, sideTags: { outer: ['rim'] } };
  assert.equal(path.weights[1], .707106781);
  path.controlPoints[8][2] += 1e-9;
  path.knots = [-4, -4, -4, -2, -2, 1, 1, 2.25, 2.25, 3, 3, 3];
  const [forward] = evaluateCadPart(document(path, section)).outputs;
  const reverse = { ...path, controlPoints: path.controlPoints.toReversed(), weights: path.weights.toReversed().map(weight => 2 * weight),
    knots: path.knots.toReversed().map(knot => -knot) };
  const [backward] = evaluateCadPart(document(reverse, section)).outputs;
  const a = verify(forward, center, normal, 20, 2), b = verify(backward, center, normal, 20, 2);
  near(a.volume, b.volume);
  pointNear(a.centroid, b.centroid);
  assert.equal(forward.brep.faces.filter(face => face.name.startsWith('w.side[rim]#')).length, 4);
});

test('closed-circle sweep refuses an open seam, wrong turn, noncircular and non-quarter controls', () => {
  const circle = joinedCircle();
  const refused = (path, code, detail, section, mode) => assert.throws(() => evaluateCadPart(document(path, section, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const altered = points => ({ ...circle, controlPoints: circle.controlPoints.map((point, i) => points[i] ?? point) });
  refused(altered({ 8: [20, 8e-9, 0] }), 'GEOMETRY', /close with a common forward tangent/);
  refused(altered({ 7: [20, -20, 1.2e-8] }), 'GEOMETRY', /close with a common forward tangent/);
  refused(altered({ 6: [0, 20, 0] }), 'CAPABILITY', /four rational quarter spans/);
  refused(altered({ 3: [-20, 20, 1e-4] }), 'CAPABILITY', /four rational quarter spans/);
  const ellipse = { ...circle, controlPoints: circle.controlPoints.map(([x, y, z]) => [x, 1.1 * y, z]) };
  refused(ellipse, 'CAPABILITY', /four rational quarter spans/);
  const weights = [...circle.weights]; weights[3] = .71;
  refused({ ...circle, weights }, 'CAPABILITY', /four rational quarter spans/);
  refused({ ...circle, knots: [0, 0, 0, 1, 1, 2, 2.1, 3, 3, 4, 4, 4] }, 'CAPABILITY', /four rational quarter spans/);
  const fifth = joinCurves(circle, quarters()[0], { curveId: 'fiveQuarters' }).curve;
  refused(fifth, 'CAPABILITY', /one open circular arc/);
  refused(circle, 'CAPABILITY', /one open straight segment/, disk, 'exact-straight');
});

test('closed-circle sweep keeps the path accuracy cutoff and requires one disk clear of the axis', () => {
  const circle = joinedCircle();
  const refused = (path, code, detail, section) => assert.throws(() => evaluateCadPart(document(path, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  for (const radius of [20, 21]) refused(circle, 'PARAMETER', /larger than the profile radius/, { ...disk, radius });
  refused(circle, 'CAPABILITY', /without holes/, { ...disk, center: [0, 0], holes: [[{ kind: 'arc', center: [0, 0], start: [1, 0], direction: 'ccw' }]] });
  refused(circle, 'CAPABILITY', /one circular disk section/, { id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] });
  refused(makerCircle([0, 0, 0], [1, 0, 0], [0, 1, 0], 3000), 'CAPABILITY', /four rational quarter spans/);
  const a = [1 / 3, -2 / 3, -2 / 3], b = [-2 / 3, 1 / 3, -2 / 3];
  const wide = joinedCircle(10100, [0, 0, 0], scale(add(a, b), Math.SQRT1_2), scale(sub(a, b), Math.SQRT1_2));
  assert.ok(wide.controlPoints.flat().every(value => Math.abs(value) < 10000));
  refused(wide, 'PARAMETER', /radius must be at most 10000/);
});
