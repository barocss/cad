import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const pointNear = (a, b) => near(norm(sub(a, b)), 0);
const boreWall = name => name.includes('[bore]') || name.includes('.hole0.side');
const rail = {
  degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
};
const section = (inner = 1, outer = 2, phase = [1, 0], direction = 'ccw') => ({
  id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: outer,
  holes: [[{ kind: 'arc', center: [8, -4], start: [8 + inner * phase[0], -4 + inner * phase[1]], direction }]],
  sideTags: { outer: ['rim'], holes: [['bore']] },
});
const document = (profile = section(), path = rail, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [profile, { id: 'w', kind: 'sweep-curve', sketch: 's', mode,
    path: { degree: path.degree, knots: path.knots, controlPoints: path.controlPoints, weights: path.weights } }],
});

function sampleRim(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const f of [0, .19, .43, .81, 1]) {
    const q = sub(evaluateCurve(curve, lo + f * (hi - lo)), center);
    near(dot(q, normal), 0); near(norm(q), radius);
  }
}

function verify(output, outer = 2, inner = 1) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(check.topology.length, 1); assert.equal(check.topology[0].shells, 1); assert.equal(check.topology[0].genus, 1);
  // Independent toroidal-section integration, including the annulus Jacobian bias (outer²+inner²)/4.
  const q = outer ** 2 + inner ** 2, volume = 15 * Math.PI ** 2 * (outer ** 2 - inner ** 2);
  const centroid = [36 / 5 + (576 + q) / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - (1296 + q) / (60 * Math.PI)];
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
    pointNear(plane.n, normal); near(dot(sub(plane.o, center), normal), 0);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 2);
      for (const id of loop.coedges) {
        const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
        sampleRim(edge.curve, center, normal, loop.kind === 'inner' ? inner : outer);
        const twin = brep.coedges.find(peer => peer.id === use.twin), wall = brep.faces.find(wall => wall.loops.includes(twin.loop));
        assert.equal(boreWall(wall.name), loop.kind === 'inner');
      }
    }
  }
  for (const [label, center, axis, R] of [['first', [0, 12, 0], [0, 0, 1], 12], ['second', [12, 12, 18], [1, 0, 0], 18]]) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.filter(face => boreWall(face.name)).length, 2);
    assert.equal(walls.filter(face => !boreWall(face.name)).length, 2);
    for (const face of walls) {
      const isBore = boreWall(face.name), radius = isBore ? inner : outer, { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const p = sub(d.point, center), radial = unit(sub(p, scale(axis, dot(p, axis))));
        const fromCircle = sub(p, scale(radial, R));
        near(norm(fromCircle), radius);
        pointNear(scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1), scale(unit(fromCircle), isBore ? -1 : 1));
        assert.ok(label === 'first' ? d.point[1] <= 12 + 1e-8 : d.point[1] >= 12 - 1e-8);
      }
    }
  }
  const seams = brep.edges.filter(edge => edge.name.includes('w.first.') && edge.name.includes('w.second.'));
  assert.equal(seams.filter(edge => boreWall(edge.name)).length, 2);
  assert.equal(seams.filter(edge => !boreWall(edge.name)).length, 2);
  for (const edge of seams) {
    const isBore = boreWall(edge.name);
    sampleRim(edge.curve, [12, 12, 0], [0, 1, 0], isBore ? inner : outer);
    assert.equal(edge.curve.degree, 2); assert.equal(edge.curve.controlPoints.length, 5);
    const uses = brep.coedges.filter(use => use.edge === edge.id), [lo, hi] = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    for (const [i, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - i].id); assert.notEqual(use.sense, uses[1 - i].sense);
      assert.ok(use.pcurve); assert.deepEqual(curveDomain(use.pcurve), [lo, hi]);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      assert.equal(boreWall(face.name), isBore);
      for (const f of [0, .23, .5, .79, 1]) {
        const t = lo + f * (hi - lo), uv = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(face.surface, uv[0], uv[1]), evaluateCurve(edge.curve, t));
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured'); assert.ok(continuity.curvature.maximumDifference > 1e-5);
  }
  return massPropertiesOf(output);
}

test('perpendicular quarters preserve both annular mouths, inward bore walls and both native seam lanes', () => {
  const source = document(), initial = evaluateCadPart(source);
  near(verify(initial.outputs[0]).volume, 45 * Math.PI ** 2, 1e-7);
  assert.deepEqual(initial.document, source);
  const edited = reevaluate(initial, { document: document(section(1.5)) });
  verify(edited.outputs[0], 2, 1.5);
  const outerWalls = snapshot => snapshot.outputs[0].brep.faces.filter(face => !boreWall(face.name) && face.name.includes('.side'));
  assert.equal(outerWalls(initial).length, 4); assert.deepEqual(outerWalls(edited), outerWalls(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
  verify(reopened.outputs[0], 2, 1.5);
  const restored = reevaluate(reopened, { document: source });
  assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
});

test('the bore keeps an authored oblique seam and clockwise traversal in the preserved exit frame', () => {
  const profile = { ...section(1, 2, [.6, .8], 'cw'), sideTags: undefined };
  const initial = evaluateCadPart(document(profile)); verify(initial.outputs[0]);
  assert.deepEqual(loadCadPart(saveCadPart(initial)).outputs[0].brep, initial.outputs[0].brep);
});

test('annular perpendicular quarters refuse eccentric, thin, multiple and noncircular openings', () => {
  const refused = (profile, code) => assert.throws(() => evaluateCadPart(document(profile)),
    e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
  const eccentric = section(); eccentric.holes[0][0].center[0] += .01; eccentric.holes[0][0].start[0] += .01;
  refused(eccentric, 'GEOMETRY');
  for (const inner of [2 - 5e-7, 2, 2.1]) refused(section(inner), 'GEOMETRY');
  refused(section(.005), 'PARAMETER'); refused(section(1, 12), 'PARAMETER');
  refused({ ...section(), sideTags: undefined, holes: [-.5, .5].map(x => [{ kind: 'arc', center: [8 + x, -4], start: [8 + x + .25, -4], direction: 'ccw' }]) }, 'CAPABILITY');
  refused({ ...section(), sideTags: undefined, holes: [[{ kind: 'line', start: [7.5, -4.5] },
    { kind: 'line', start: [8.5, -4.5] }, { kind: 'line', start: [8, -3.5] }]] }, 'CAPABILITY');
});

test('the annulus does not admit nonquarter, nonperpendicular or reversed joins', () => {
  const first = { kind: 'curve', id: 'first', degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: rail.controlPoints.slice(0, 3), weights: rail.weights.slice(0, 3) };
  const second = (tangent, inward, angle) => {
    const quarter = angle === Math.PI / 2, start = [12, 12, 0];
    const middle = start.map((x, i) => x + 18 * (quarter ? 1 : Math.tan(angle / 2)) * tangent[i]);
    const end = start.map((x, i) => x + 18 * (Math.sin(angle) * tangent[i] + (quarter ? 1 : 1 - Math.cos(angle)) * inward[i]));
    return joinCurves(first, { kind: 'curve', id: 'second', degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [start, middle, end], weights: [1, Math.cos(angle / 2), 1] }, { curveId: 'changed' }).curve;
  };
  for (const [path, code] of [[second([0, 1, 0], [0, 0, 1], Math.PI / 3), 'CAPABILITY'],
    [second([0, 1, 0], [.6, 0, .8], Math.PI / 2), 'CAPABILITY'], [second([0, -1, 0], [0, 0, 1], Math.PI / 2), 'GEOMETRY']])
    assert.throws(() => evaluateCadPart(document(section(), path)), e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
});
