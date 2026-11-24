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
const rail = (inlet = 10, outlet = 10) => ({ degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  controlPoints: [[-inlet, 0, 0], [-inlet / 2, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18],
    [12, 30, 18 + outlet / 2], [12, 30, 18 + outlet]],
  weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
});
const section = (inner = 1, outer = 2, phase = [1, 0], direction = 'ccw') => ({
  id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: outer,
  ...(inner ? { holes: [[{ kind: 'arc', center: [8, -4], start: [8 + inner * phase[0], -4 + inner * phase[1]], direction }]] } : {}),
  sideTags: { outer: ['rim'], ...(inner ? { holes: [['bore']] } : {}) },
});
const document = (inlet = 10, outlet = 10, profile = section(), path = rail(inlet, outlet), mode = 'exact') => ({
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

function verify(output, inlet = 10, outlet = 10, inner = 1, outer = 2) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved'); assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.deepEqual(check.counts, inner
    ? { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 }
    : { bodies: 1, shells: 1, faces: 10, loops: 10, coedges: 36, edges: 18, vertices: 10 });
  assert.equal(check.topology.length, 1); assert.equal(check.topology[0].shells, 1); assert.equal(check.topology[0].genus, inner ? 1 : 0);
  // Independent toroidal moments plus two disjoint straight cylinders at their physical centres.
  const q = outer ** 2 + inner ** 2, area = Math.PI * (outer ** 2 - inner ** 2);
  const length = 15 * Math.PI + inlet + outlet, volume = area * length;
  const bendCentroid = [36 / 5 + (576 + q) / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - (1296 + q) / (60 * Math.PI)];
  const leadCentroid = [-inlet / 2, 0, 0], tailCentroid = [12, 30, 18 + outlet / 2];
  const centroid = bendCentroid.map((x, i) => (15 * Math.PI * x + inlet * leadCentroid[i] + outlet * tailCentroid[i]) / length);
  for (const mass of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); mass.centroid.forEach((value, axis) => near(value, centroid[axis], 1e-7));
  }
  assert.equal(massPropertiesOf(output).method, 'closed-form');
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const face of caps) {
    const start = face.name === 'w.start', center = start ? [-inlet, 0, 0] : [12, 30, 18 + outlet];
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
  for (const label of ['lead', 'tail']) {
    const lead = label === 'lead', walls = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(walls.length, inner ? 4 : 2);
    for (const face of walls) {
      const g = faceGeometry(face), isBore = boreWall(face.name), radius = isBore ? inner : outer;
      const axis = lead ? [1, 0, 0] : [0, 0, 1], center = lead ? [0, 0, 0] : [12, 30, 18];
      assert.equal(g.kind, 'cylinder'); near(g.r, radius); near(norm(cross(sub(g.c, center), axis)), 0);
      near(Math.abs(dot(g.a, axis)), 1); assert.equal(g.out, isBore ? -1 : 1);
      const { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .53, .89]) for (const t of [.23, .71]) {
        const d = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const delta = sub(d.point, center), radial = sub(delta, scale(axis, dot(delta, axis)));
        near(norm(radial), radius);
        assert.ok(lead ? d.point[0] > -inlet && d.point[0] < 0 : d.point[2] > 18 && d.point[2] < 18 + outlet);
        pointNear(scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1), scale(unit(radial), isBore ? -1 : 1));
      }
    }
  }
  // Physical separation of all three nonadjacent piece pairs, read from native chart poles.
  const poles = label => brep.faces.filter(face => face.name.startsWith(`w.${label}.`)).flatMap(face => {
    assert.ok(face.surface.weights.flat().every(weight => weight > 0)); return face.surface.controlPoints.flat();
  });
  const first = poles('first'), second = poles('second'), lead = poles('lead'), tail = poles('tail');
  near(Math.min(...second.map(p => p[0])) - Math.max(...lead.map(p => p[0])), 12 - outer);
  near(Math.min(...tail.map(p => p[2])) - Math.max(...first.map(p => p[2])), 18 - outer);
  near(Math.min(...tail.map(p => p[0])) - Math.max(...lead.map(p => p[0])), 12 - outer);
  for (const [a, b, center, normal] of [['lead', 'first', [0, 0, 0], [1, 0, 0]],
    ['first', 'second', [12, 12, 0], [0, 1, 0]], ['second', 'tail', [12, 30, 18], [0, 0, 1]]]) {
    const seams = brep.edges.filter(edge => edge.name.includes(`w.${a}.`) && edge.name.includes(`w.${b}.`));
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

test('two exact straight ends preserve perpendicular annular bends, all three native joins and fresh reopen', () => {
  const source = document(), initial = evaluateCadPart(source), output = initial.outputs[0];
  near(verify(output).volume, 45 * Math.PI ** 2 + 60 * Math.PI, 1e-7);
  const mass = massPropertiesOf(output), denominator = 45 * Math.PI + 60;
  mass.centroid.forEach((x, i) => near(x, [(324 * Math.PI + 2583 / 4) / denominator,
    (540 * Math.PI + 1440) / denominator, (486 * Math.PI - 1143 / 4) / denominator][i]));
  assert.deepEqual(initial.document, source);
  const bends = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('.first.') || face.name.includes('.second.'))
    .map(({ name, surface, sense }) => ({ name, surface, sense }));
  for (const [inlet, outlet] of [[6, 10], [10, 14], [6, 14]]) {
    const edited = reevaluate(initial, { document: document(inlet, outlet) }); verify(edited.outputs[0], inlet, outlet);
    assert.deepEqual(bends(edited), bends(initial));
  }
  const edited = reevaluate(initial, { document: document(10, 10, section(1.5)) }); verify(edited.outputs[0], 10, 10, 1.5);
  const outerWalls = snapshot => bends(snapshot).filter(face => !boreWall(face.name));
  assert.deepEqual(outerWalls(edited), outerWalls(initial));
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], 10, 10, 1.5);
  assert.deepEqual(reevaluate(reopened, { document: source }).outputs[0].brep, output.brep);
});

test('disk and clockwise oblique bore preserve the perpendicular carriers and both cylinders', () => {
  verify(evaluateCadPart(document(10, 10, section(0))).outputs[0], 10, 10, 0);
  verify(evaluateCadPart(document(10, 10, { ...section(1, 2, [.6, .8], 'cw'), sideTags: undefined })).outputs[0]);
});

test('both straight ends refuse short, reversed, kinked, weighted and unsupported arc paths without mutation', () => {
  const refused = (path, code) => {
    const source = document(10, 10, section(), path), unchanged = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
    assert.deepEqual(source, unchanged);
  };
  for (const length of [0, .00005]) { refused(rail(length, 10), 'PARAMETER'); refused(rail(10, length), 'PARAMETER'); }
  refused(rail(-4, 10), 'GEOMETRY'); refused(rail(10, -4), 'GEOMETRY');
  for (const index of [1, 7]) {
    const kinked = rail(); kinked.controlPoints[index][1] += .01; refused(kinked, 'GEOMETRY');
    const weighted = rail(); weighted.weights[index] = .9; refused(weighted, 'GEOMETRY');
  }
  const sidewaysLead = rail(); sidewaysLead.controlPoints[0][1] += .01; refused(sidewaysLead, 'GEOMETRY');
  const sidewaysTail = rail(); sidewaysTail.controlPoints[8][0] += .01; refused(sidewaysTail, 'GEOMETRY');
  const wrongArc = rail(); wrongArc.weights[3] = .71; refused(wrongArc, 'GEOMETRY');
  const nonperpendicular = rail(); nonperpendicular.controlPoints[6] = [22.8, 30, 14.4]; refused(nonperpendicular, 'GEOMETRY');
  const nonquarter = rail(), angle = Math.PI / 3, terminal = [0, Math.cos(angle), Math.sin(angle)];
  const end = [12, 12 + 18 * Math.sin(angle), 18 * (1 - Math.cos(angle))];
  nonquarter.weights[5] = Math.cos(angle / 2); nonquarter.controlPoints[5] = [12, 12 + 18 * Math.tan(angle / 2), 0];
  nonquarter.controlPoints.splice(6, 3, end, end.map((x, i) => x + 5 * terminal[i]), end.map((x, i) => x + 10 * terminal[i]));
  refused(nonquarter, 'GEOMETRY');
  const extraSpan = rail(); extraSpan.controlPoints.push([12, 30, 33], [12, 30, 38]); extraSpan.weights.push(1, 1);
  extraSpan.knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 5, 5, 5]; refused(extraSpan, 'CAPABILITY');
});

test('both-end section retains exact circular, concentric, wall and mode refusal boundaries', () => {
  const refused = (profile, code, mode = 'exact') => {
    const source = document(10, 10, profile, rail(), mode), unchanged = structuredClone(source);
    assert.throws(() => evaluateCadPart(source), e => e instanceof CadPartError && e.feature === 'w' && e.code === code);
    assert.deepEqual(source, unchanged);
  };
  const eccentric = section(); eccentric.holes[0][0].center[0] += .01; eccentric.holes[0][0].start[0] += .01;
  refused(eccentric, 'GEOMETRY');
  for (const inner of [2 - 5e-7, 2, 2.1]) refused(section(inner), 'GEOMETRY');
  refused(section(.005), 'PARAMETER'); refused(section(1, 12), 'PARAMETER');
  refused({ id: 's', kind: 'sketch', profile: 'rectangle', min: [-1, -1], max: [1, 1] }, 'CAPABILITY');
  refused({ ...section(), sideTags: undefined, holes: [-.5, .5].map(x => [{ kind: 'arc', center: [8 + x, -4], start: [8 + x + .25, -4], direction: 'ccw' }]) }, 'CAPABILITY');
  refused(section(), 'CAPABILITY', 'exact-straight');
});
