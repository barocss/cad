import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
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
const rail = (length = 10) => ({ degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 3],
  controlPoints: [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 18 + length / 2], [12, 30, 18 + length]],
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
});
const section = (inner = 1, outer = 2, phase = [1, 0], direction = 'ccw') => ({
  id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: outer,
  ...(inner ? { holes: [[{ kind: 'arc', center: [8, -4], start: [8 + inner * phase[0], -4 + inner * phase[1]], direction }]] } : {}),
  sideTags: { outer: ['rim'], ...(inner ? { holes: [['bore']] } : {}) },
});
const document = (length = 10, profile = section(), path = rail(length), mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [profile, { id: 'w', kind: 'sweep-curve', sketch: 's', mode, path }],
});

function sampleRim(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const f of [0, .19, .43, .81, 1]) {
    const q = sub(evaluateCurve(curve, lo + f * (hi - lo)), center);
    near(dot(q, normal), 0); near(norm(q), radius);
  }
}

function verify(output, length = 10, inner = 1, outer = 2) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved'); assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.deepEqual(check.counts, inner
    ? { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 56, edges: 28, vertices: 16 }
    : { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 28, edges: 14, vertices: 8 });
  assert.equal(check.topology.length, 1); assert.equal(check.topology[0].shells, 1); assert.equal(check.topology[0].genus, inner ? 1 : 0);
  // Independent disk/annulus bend integration, plus the original straight cylinder's exact moments.
  const q = outer ** 2 + inner ** 2, area = Math.PI * (outer ** 2 - inner ** 2);
  const bendVolume = 15 * Math.PI * area, tailVolume = length * area, volume = bendVolume + tailVolume;
  const bendCentroid = [36 / 5 + (576 + q) / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - (1296 + q) / (60 * Math.PI)];
  const tailCentroid = [12, 30, 18 + length / 2];
  const centroid = bendCentroid.map((x, i) => (bendVolume * x + tailVolume * tailCentroid[i]) / volume);
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); mass.centroid.forEach((value, axis) => near(value, centroid[axis], 1e-7));
  }
  assert.equal(massPropertiesOf(output).method, 'closed-form');
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const face of caps) {
    const start = face.name === 'w.start', center = start ? [0, 0, 0] : [12, 30, 18 + length];
    const normal = start ? [-1, 0, 0] : [0, 0, 1], plane = faceGeometry(face);
    pointNear(plane.n, normal); near(dot(sub(plane.o, center), normal), 0);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), inner ? ['inner', 'outer'] : ['outer']);
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 2);
      for (const id of loop.coedges) {
        const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
        sampleRim(edge.curve, center, normal, loop.kind === 'inner' ? inner : outer);
      }
    }
  }
  for (const [label, center, axis, R] of [['first', [0, 12, 0], [0, 0, 1], 12], ['second', [12, 12, 18], [1, 0, 0], 18]]) {
    const walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.length, inner ? 4 : 2);
    for (const face of walls) {
      const isBore = boreWall(face.name), radius = isBore ? inner : outer, { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const p = sub(d.point, center), radial = unit(sub(p, scale(axis, dot(p, axis)))), fromCircle = sub(p, scale(radial, R));
        near(norm(fromCircle), radius);
        pointNear(scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1), scale(unit(fromCircle), isBore ? -1 : 1));
      }
    }
  }
  const tail = brep.faces.filter(face => face.name.startsWith('w.tail.'));
  assert.equal(tail.length, inner ? 4 : 2);
  for (const face of tail) {
    const g = faceGeometry(face), isBore = boreWall(face.name), radius = isBore ? inner : outer;
    assert.equal(g.kind, 'cylinder'); near(g.r, radius); near(g.c[0], 12); near(g.c[1], 30);
    near(Math.abs(g.a[2]), 1); near(g.a[0], 0); near(g.a[1], 0); assert.equal(g.out, isBore ? -1 : 1);
    const { u, v } = surfaceDomain(face.surface);
    for (const s of [.17, .53, .89]) for (const t of [.23, .71]) {
      const d = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
      near(Math.hypot(d.point[0] - 12, d.point[1] - 30), radius);
      assert.ok(d.point[2] > 18 && d.point[2] < 18 + length);
      const radial = unit([d.point[0] - 12, d.point[1] - 30, 0]);
      pointNear(scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1), scale(radial, isBore ? -1 : 1));
    }
  }
  for (const [first, second, center, normal] of [['first', 'second', [12, 12, 0], [0, 1, 0]], ['second', 'tail', [12, 30, 18], [0, 0, 1]]]) {
    const seams = brep.edges.filter(edge => edge.name.includes(`w.${first}.`) && edge.name.includes(`w.${second}.`));
    assert.equal(seams.length, inner ? 4 : 2);
    for (const edge of seams) {
      const isBore = boreWall(edge.name); sampleRim(edge.curve, center, normal, isBore ? inner : outer);
      assert.equal(edge.curve.degree, 2); assert.equal(edge.curve.controlPoints.length, 5);
      const uses = brep.coedges.filter(use => use.edge === edge.id), [lo, hi] = curveDomain(edge.curve);
      assert.equal(uses.length, 2);
      for (const [i, use] of uses.entries()) {
        assert.equal(use.twin, uses[1 - i].id); assert.notEqual(use.sense, uses[1 - i].sense);
        assert.ok(use.pcurve); assert.deepEqual(curveDomain(use.pcurve), [lo, hi]);
        const face = brep.faces.find(face => face.loops.includes(use.loop)); assert.equal(boreWall(face.name), isBore);
        for (const f of [0, .23, .5, .79, 1]) {
          const t = lo + f * (hi - lo), uv = evaluateCurve(use.pcurve, t);
          pointNear(evaluateSurface(face.surface, uv[0], uv[1]), evaluateCurve(edge.curve, t));
        }
      }
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured'); assert.ok(continuity.curvature.maximumDifference > 1e-5);
    }
  }
  return massPropertiesOf(output);
}

test('two perpendicular quarter bends append one exact annular outlet with both native joints and fresh reopen', () => {
  const source = document(), initial = evaluateCadPart(source), output = initial.outputs[0];
  near(verify(output).volume, 45 * Math.PI ** 2 + 30 * Math.PI, 1e-7);
  const mass = massPropertiesOf(output), denominator = 45 * Math.PI + 30;
  mass.centroid.forEach((x, i) => near(x, [(324 * Math.PI + 3183 / 4) / denominator,
    (540 * Math.PI + 1440) / denominator, (486 * Math.PI - 1143 / 4) / denominator][i]));
  assert.deepEqual(initial.document, source);
  const edited = reevaluate(initial, { document: document(6) }); verify(edited.outputs[0], 6);
  const bends = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('.first.') || face.name.includes('.second.'))
    .map(({ name, surface, sense }) => ({ name, surface, sense }));
  assert.deepEqual(bends(edited), bends(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], 6);
  assert.deepEqual(reevaluate(reopened, { document: source }).outputs[0].brep, output.brep);
});

test('disk and clockwise oblique-bore outlets retain the same two quarter carriers', () => {
  verify(evaluateCadPart(document(10, section(0))).outputs[0], 10, 0);
  verify(evaluateCadPart(document(10, { ...section(1, 2, [.6, .8], 'cw'), sideTags: undefined })).outputs[0]);
});

test('outlet path refuses short, reversed, kinked, weighted and nonperpendicular variants', () => {
  const refused = (path, code) => assert.throws(() => evaluateCadPart(document(10, section(), path)),
    e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
  for (const length of [0, .00005]) refused(rail(length), 'PARAMETER');
  refused(rail(-4), 'GEOMETRY');
  const kinked = rail(); kinked.controlPoints[5][0] += .01; refused(kinked, 'GEOMETRY');
  const sideways = rail(); sideways.controlPoints[6][0] += .01; refused(sideways, 'GEOMETRY');
  const weighted = rail(); weighted.weights[5] = .9; refused(weighted, 'CAPABILITY');
  const wrongArc = rail(); wrongArc.weights[1] = .71; refused(wrongArc, 'CAPABILITY');
  const nonperpendicular = rail(); nonperpendicular.controlPoints.splice(4, 3, [22.8, 30, 14.4], [25.8, 30, 18.4], [28.8, 30, 22.4]);
  refused(nonperpendicular, 'CAPABILITY');
  const nonquarter = rail(), angle = Math.PI / 3, terminal = [0, Math.cos(angle), Math.sin(angle)];
  const end = [12, 12 + 18 * Math.sin(angle), 18 * (1 - Math.cos(angle))];
  nonquarter.weights[3] = Math.cos(angle / 2); nonquarter.controlPoints[3] = [12, 12 + 18 * Math.tan(angle / 2), 0];
  nonquarter.controlPoints.splice(4, 3, end, end.map((x, i) => x + 5 * terminal[i]), end.map((x, i) => x + 10 * terminal[i]));
  refused(nonquarter, 'CAPABILITY');
});

test('outlet section retains concentric, clearance, circular and exact-mode limits', () => {
  const refused = (profile, code, mode = 'exact') => assert.throws(() => evaluateCadPart(document(10, profile, rail(), mode)),
    e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
  const eccentric = section(); eccentric.holes[0][0].center[0] += .01; eccentric.holes[0][0].start[0] += .01;
  refused(eccentric, 'GEOMETRY');
  for (const inner of [2 - 5e-7, 2, 2.1]) refused(section(inner), 'GEOMETRY');
  refused(section(.005), 'PARAMETER'); refused(section(1, 12), 'PARAMETER');
  refused({ id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] }, 'CAPABILITY');
  refused({ ...section(), sideTags: undefined, holes: [-.5, .5].map(x => [{ kind: 'arc', center: [8 + x, -4], start: [8 + x + .25, -4], direction: 'ccw' }]) }, 'CAPABILITY');
  refused(section(), 'CAPABILITY', 'exact-straight');
});
