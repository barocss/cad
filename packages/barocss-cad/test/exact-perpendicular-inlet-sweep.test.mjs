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
  controlPoints: [[-length, 0, 0], [-length / 2, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1],
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
  // Integrate both toroidal sections independently, then add a cylinder whose centre is at X=-L/2.
  const q = outer ** 2 + inner ** 2, area = Math.PI * (outer ** 2 - inner ** 2);
  const bendVolume = 15 * Math.PI * area, leadVolume = length * area, volume = bendVolume + leadVolume;
  const bendCentroid = [36 / 5 + (576 + q) / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - (1296 + q) / (60 * Math.PI)];
  const leadCentroid = [-length / 2, 0, 0];
  const centroid = bendCentroid.map((x, i) => (bendVolume * x + leadVolume * leadCentroid[i]) / volume);
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); mass.centroid.forEach((value, axis) => near(value, centroid[axis], 1e-7));
  }
  assert.equal(massPropertiesOf(output).method, 'closed-form');
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const face of caps) {
    const start = face.name === 'w.start', center = start ? [-length, 0, 0] : [12, 30, 18];
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
  const lead = brep.faces.filter(face => face.name.startsWith('w.lead.'));
  assert.equal(lead.length, inner ? 4 : 2);
  assert.ok(!brep.faces.some(face => face.name.startsWith('w.tail.')));
  for (const face of lead) {
    const g = faceGeometry(face), isBore = boreWall(face.name), radius = isBore ? inner : outer;
    assert.equal(g.kind, 'cylinder'); near(g.r, radius); near(g.c[1], 0); near(g.c[2], 0);
    near(Math.abs(g.a[0]), 1); near(g.a[1], 0); near(g.a[2], 0); assert.equal(g.out, isBore ? -1 : 1);
    const { u, v } = surfaceDomain(face.surface);
    for (const s of [.17, .53, .89]) for (const t of [.23, .71]) {
      const d = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
      near(Math.hypot(d.point[1], d.point[2]), radius);
      assert.ok(d.point[0] > -length && d.point[0] < 0);
      const radial = unit([0, d.point[1], d.point[2]]);
      pointNear(scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1), scale(radial, isBore ? -1 : 1));
    }
  }
  for (const [first, second, center, normal] of [['lead', 'first', [0, 0, 0], [1, 0, 0]], ['first', 'second', [12, 12, 0], [0, 1, 0]]]) {
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

test('one exact annular inlet preserves both perpendicular quarter carriers, native joins and fresh reopen', () => {
  const source = document(), initial = evaluateCadPart(source), output = initial.outputs[0];
  near(verify(output).volume, 45 * Math.PI ** 2 + 30 * Math.PI, 1e-7);
  const mass = massPropertiesOf(output), denominator = 45 * Math.PI + 30;
  mass.centroid.forEach((x, i) => near(x, [(324 * Math.PI + 1143 / 4) / denominator,
    (540 * Math.PI + 540) / denominator, (486 * Math.PI - 3903 / 4) / denominator][i]));
  assert.deepEqual(initial.document, source);
  const shorter = reevaluate(initial, { document: document(6) }); verify(shorter.outputs[0], 6);
  const bends = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('.first.') || face.name.includes('.second.'))
    .map(({ name, surface, sense }) => ({ name, surface, sense }));
  assert.deepEqual(bends(shorter), bends(initial));
  const edited = reevaluate(initial, { document: document(10, section(1.5)) }); verify(edited.outputs[0], 10, 1.5);
  const outerWalls = snapshot => bends(snapshot).filter(face => !boreWall(face.name));
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], 10, 1.5);
  assert.deepEqual(reevaluate(reopened, { document: source }).outputs[0].brep, output.brep);
});

test('disk and clockwise oblique-bore inlets retain the same native toroidal carriers', () => {
  verify(evaluateCadPart(document(10, section(0))).outputs[0], 10, 0);
  verify(evaluateCadPart(document(10, { ...section(1, 2, [.6, .8], 'cw'), sideTags: undefined })).outputs[0]);
});

test('inlet path refuses short, reversed, kinked, weighted and nonperpendicular variants', () => {
  const refused = (path, code) => assert.throws(() => evaluateCadPart(document(10, section(), path)),
    e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
  for (const length of [0, .00005]) refused(rail(length), 'PARAMETER');
  refused(rail(-4), 'GEOMETRY');
  const kinked = rail(); kinked.controlPoints[1][1] += .01; refused(kinked, 'GEOMETRY');
  const sideways = rail(); sideways.controlPoints[0][1] += .01; refused(sideways, 'GEOMETRY');
  const weighted = rail(); weighted.weights[1] = .9; refused(weighted, 'CAPABILITY');
  const wrongArc = rail(); wrongArc.weights[3] = .71; refused(wrongArc, 'CAPABILITY');
  const nonperpendicular = rail(); nonperpendicular.controlPoints[6] = [22.8, 30, 14.4]; refused(nonperpendicular, 'CAPABILITY');
  const nonquarter = rail(), angle = Math.PI / 3;
  nonquarter.weights[5] = Math.cos(angle / 2); nonquarter.controlPoints[5] = [12, 12 + 18 * Math.tan(angle / 2), 0];
  nonquarter.controlPoints[6] = [12, 12 + 18 * Math.sin(angle), 18 * (1 - Math.cos(angle))];
  refused(nonquarter, 'CAPABILITY');
  const pairedTails = rail(); pairedTails.controlPoints.push([12, 30, 23], [12, 30, 28]);
  pairedTails.weights.push(1, 1); pairedTails.knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4];
  pairedTails.controlPoints[6] = [22.8, 30, 14.4]; // A nonperpendicular pair keeps the original fallback refusal.
  const pairedSource = document(10, section(), pairedTails), unchanged = structuredClone(pairedSource);
  assert.throws(() => evaluateCadPart(pairedSource), e => e instanceof CadPartError && e.feature === 'w'
    && e.code === 'GEOMETRY' && e.message === 'w: The exact closed-circle sweep path must close with a common forward tangent.');
  assert.deepEqual(pairedSource, unchanged);
});

test('inlet section retains concentric, wall, circular and exact-mode limits', () => {
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
