import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const pointNear = (a, b) => near(norm(sub(a, b)), 0);

const section = { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2 };
const rail = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
};
const document = (path = rail, profile = section, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [profile, { id: 'w', kind: 'sweep-curve', sketch: 's', mode,
    path: { degree: path.degree, knots: path.knots, controlPoints: path.controlPoints, weights: path.weights } }],
});

function verify(output, r) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  assert.equal(check.topology[0].genus, 0);

  // Integrate each torus using its circular-section Jacobian, including the r²/(4R) centroid bias.
  const volume = 15 * r ** 2 * Math.PI ** 2;
  const a = 2 / Math.PI * (12 + r ** 2 / 48), b = 2 / Math.PI * (18 + r ** 2 / 72);
  const centroid = [.4 * a + .6 * 12, .4 * (12 - a) + .6 * (12 + b), .6 * (18 - b)];
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7);
    mass.centroid.forEach((value, axis) => near(value, centroid[axis], 1e-7));
  }
  assert.equal(massPropertiesOf(output).method, 'closed-form');

  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const face of caps) {
    const start = face.name === 'w.start', center = start ? [0, 0, 0] : [12, 30, 18];
    const normal = start ? [-1, 0, 0] : [0, 0, 1], plane = faceGeometry(face);
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const uses = brep.coedges.filter(use => face.loops.includes(use.loop));
    assert.equal(uses.length, 2);
    for (const use of uses) {
      const edge = brep.edges.find(edge => edge.id === use.edge), [lo, hi] = curveDomain(edge.curve);
      for (const t of [0, .23, .61, 1]) {
        const p = sub(evaluateCurve(edge.curve, lo + t * (hi - lo)), center);
        near(dot(p, normal), 0); near(norm(p), r);
      }
    }
  }

  for (const [label, center, axis, R] of [['first', [0, 12, 0], [0, 0, 1], 12], ['second', [12, 12, 18], [1, 0, 0], 18]]) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.length, 2);
    for (const face of walls) {
      const { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const p = sub(d.point, center), radial = unit(sub(p, scale(axis, dot(p, axis))));
        const fromCircle = sub(p, scale(radial, R));
        near(norm(fromCircle), r);
        pointNear(scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1), unit(fromCircle));
        assert.ok(label === 'first' ? d.point[1] <= 12 + 1e-8 : d.point[1] >= 12 - 1e-8);
      }
    }
  }

  const seams = brep.edges.filter(edge => edge.name.includes('w.first.') && edge.name.includes('w.second.'));
  assert.equal(seams.length, 2);
  for (const edge of seams) {
    assert.equal(edge.curve.degree, 2);
    assert.equal(edge.curve.controlPoints.length, 5);
    assert.deepEqual(edge.curve.weights, [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1]);
    const uses = brep.coedges.filter(use => use.edge === edge.id), [lo, hi] = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    for (const [index, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - index].id);
      assert.notEqual(use.sense, uses[1 - index].sense);
      assert.ok(use.pcurve);
      assert.deepEqual(curveDomain(use.pcurve), [lo, hi]);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const f of [0, .19, .5, .87, 1]) {
        const t = lo + f * (hi - lo), p = evaluateCurve(edge.curve, t), uv = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(face.surface, ...uv), p);
        near(p[1], 12); near(Math.hypot(p[0] - 12, p[2]), r);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured');
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    assert.ok(continuity.curvature.maximumDifference > 1e-5); // G1, not G2.
  }
}

test('two perpendicular native quarter arcs retain the disk seam, solid mass and fresh native reopen', () => {
  const source = document(), initial = evaluateCadPart(source);
  verify(initial.outputs[0], 2);
  assert.deepEqual(initial.document, source);
  const edited = reevaluate(initial, { document: document(rail, { ...section, radius: 3 }) });
  verify(edited.outputs[0], 3);
  assert.deepEqual(edited.outputs[0].brep.faces.map(face => face.name), initial.outputs[0].brep.faces.map(face => face.name));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  verify(reopened.outputs[0], 3);
});

test('the perpendicular extension refuses non-quarter, nonperpendicular, reversed, holed and axis-contact input', () => {
  const refused = (path, code, profile = section, mode = 'exact') => assert.throws(() => evaluateCadPart(document(path, profile, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code);
  const first = { kind: 'curve', id: 'first', degree: 2, knots: [0, 0, 0, 1, 1, 1],
    controlPoints: rail.controlPoints.slice(0, 3), weights: rail.weights.slice(0, 3) };
  const changedSecond = (tangent, inward, angle = Math.PI / 2) => {
    const start = [12, 12, 0], quarter = angle === Math.PI / 2;
    const middle = add(start, scale(tangent, quarter ? 18 : 18 * Math.tan(angle / 2)));
    const end = add(start, scale(add(scale(tangent, Math.sin(angle)), scale(inward, quarter ? 1 : 1 - Math.cos(angle))), 18));
    return joinCurves(first, { kind: 'curve', id: 'second', degree: 2, knots: [0, 0, 0, 1, 1, 1],
      controlPoints: [start, middle, end], weights: [1, Math.cos(angle / 2), 1] }, { curveId: 'changed' }).curve;
  };
  refused(changedSecond([0, 1, 0], [0, 0, 1], Math.PI / 3), 'CAPABILITY');
  refused(changedSecond([0, 1, 0], [.6, 0, .8]), 'CAPABILITY');
  refused(changedSecond([0, -1, 0], [0, 0, 1]), 'GEOMETRY');
  refused(rail, 'CAPABILITY', { ...section, holes: [[{ kind: 'arc', center: [0, 0], start: [1, 0], direction: 'ccw' }]] });
  refused(rail, 'CAPABILITY', { id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] });
  refused(rail, 'CAPABILITY', section, 'exact-straight');
  for (const radius of [12, 13]) refused(rail, 'PARAMETER', { ...section, radius });
  refused({ ...rail, weights: [1, .71, 1, Math.SQRT1_2, 1] }, 'CAPABILITY');
});
