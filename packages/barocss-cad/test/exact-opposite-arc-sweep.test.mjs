import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, faceGeometry, joinCurves,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, scalar) => a.map(x => x * scalar);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const pointNear = (a, b) => near(norm(sub(a, b)), 0);

const circle = { id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: 2, sideTags: { outer: ['rim'] } };
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = circle, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [section, { id: 'w', kind: 'sweep-curve', sketch: 's', mode, path: pathOf(path) }],
});

function arc(id, start, tangent, inward, radius, degrees) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const end = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const atExit = add(scale(tangent, c), scale(inward, s));
  const exitInward = add(scale(inward, c), scale(tangent, -s));
  const control = add(start, scale(tangent, degrees === 90 ? radius : radius * Math.tan(angle / 2)));
  return { start, tangent, end, atExit, exitInward, radius, angle, length: radius * angle, axis: cross(tangent, inward),
    center: add(start, scale(inward, radius)),
    curve: { kind: 'curve', id, degree: 2, knots: [0, 0, 0, 1, 1, 1], controlPoints: [start, control, end],
      weights: [1, Math.cos(angle / 2), 1] } };
}

function pair({ a = 90, b = 90, R1 = 12, R2 = 18, start = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const first = arc('first', start, tangent, inward, R1, a);
  const second = arc('second', first.end, first.atExit, scale(first.exitInward, -1), R2, b);
  const curve = joinCurves(first.curve, second.curve, { curveId: 'oppositeArcs' }).curve;
  return { first, second, curve };
}

function sampleRim(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const fraction of [0, .27, .59, .84, 1]) {
    const p = sub(evaluateCurve(curve, lo + (hi - lo) * fraction), center);
    near(dot(p, normal), 0);
    near(norm(p), radius);
  }
}

function verify(output, first, second, r) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology[0].genus, 0);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 6);
  const mass = massPropertiesOf(output), volume = Math.PI * r ** 2 * (first.length + second.length);
  assert.equal(mass.method, 'closed-form');
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

  const caps = brep.faces.map(face => ({ face, plane: faceGeometry(face) })).filter(({ plane }) => plane.kind === 'plane');
  assert.deepEqual(caps.map(({ face }) => face.name).sort(), ['w.end', 'w.start']);
  for (const { face, plane } of caps) {
    const start = face.name === 'w.start', center = start ? first.start : second.end;
    const normal = start ? scale(first.tangent, -1) : second.atExit;
    pointNear(plane.n, normal);
    near(dot(sub(plane.o, center), normal), 0);
    const rim = brep.coedges.filter(use => face.loops.includes(use.loop));
    assert.equal(rim.length, 2);
    for (const use of rim) sampleRim(brep.edges.find(edge => edge.id === use.edge).curve, center, normal, r);
  }

  for (const [label, original] of [['first', first], ['second', second]]) {
    const faces = brep.faces.filter(face => face.name.startsWith(`w.${label}.side[rim]`));
    assert.equal(faces.length, 2);
    for (const face of faces) {
      const { u, v } = surfaceDomain(face.surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d1 = evaluateSurfaceD1(face.surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        const p = sub(d1.point, original.center);
        const radial = unit(sub(p, scale(original.axis, dot(p, original.axis))));
        const fromCircle = sub(p, scale(radial, original.radius));
        near(norm(fromCircle), r);
        pointNear(scale(unit(cross(d1.du, d1.dv)), face.sense === 'forward' ? 1 : -1), unit(fromCircle));
      }
    }
  }

  const seams = brep.edges.filter(edge => edge.name.includes('w.first.') && edge.name.includes('w.second.'));
  assert.equal(seams.length, 2);
  for (const edge of seams) {
    sampleRim(edge.curve, first.end, first.atExit, r);
    const uses = brep.coedges.filter(use => use.edge === edge.id);
    assert.equal(uses.length, 2);
    for (const use of uses) assert.deepEqual(curveDomain(use.pcurve), curveDomain(edge.curve));
    const report = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(report.status, 'measured', JSON.stringify(report));
    near(report.maximumAngleDegrees, 0);
    assert.equal(report.curvature.status, 'measured');
    assert.ok(report.curvature.maximumDifference > 1e-5);
    for (const sample of report.curvature.samples) {
      const inward = dot(sub(evaluateCurve(edge.curve, sample.parameter), first.end), first.exitInward);
      // The longitudinal curvature of each torus is the radial normal component divided by its local orbit radius.
      const jump = Math.abs(inward) / r * (1 / (first.radius - inward) + 1 / (second.radius + inward));
      near(sample.difference, jump);
    }
  }
  return mass;
}

test('joined authored arcs sweep an exact solid and retain both supports through a diameter edit and reopen', () => {
  const { first, second, curve } = pair();
  assert.deepEqual(curve.controlPoints, [[0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [30, 30, 0]]);
  assert.deepEqual(curve.knots, [0, 0, 0, 1, 1, 2, 2, 2]);
  const snapshot = evaluateCadPart(document(curve));
  verify(snapshot.outputs[0], first, second, 2);
  const edited = reevaluate(snapshot, { document: document(curve, { ...circle, radius: 3 }) });
  verify(edited.outputs[0], first, second, 3);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document);
  assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
});

test('the join plane also separates a translated oblique 120° and 30° pair close to the bend axis', () => {
  const { first, second, curve } = pair({ a: 120, b: 30, R1: 10, R2: 23, start: [40, -30, 7], tangent: [.6, .8, 0], inward: [0, 0, 1] });
  const section = { ...circle, radius: 8 };
  verify(evaluateCadPart(document(curve, section)).outputs[0], first, second, 8);
});

test('exact two-arc sweep refuses a kink, reversal, nonplanarity, same curvature and axis contact', () => {
  const { first, curve } = pair();
  const refused = (rail, code, detail, section, mode) => assert.throws(() => evaluateCadPart(document(rail, section, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const joinedWith = (tangent, inward) => joinCurves(first.curve, arc('changed', first.end, tangent, inward, 18, 90).curve,
    { curveId: 'changedPair' }).curve;
  refused(joinedWith([1, 0, 0], [0, 1, 0]), 'GEOMETRY', /common forward tangent/);
  refused(joinedWith(scale(first.atExit, -1), [1, 0, 0]), 'GEOMETRY', /common forward tangent/);
  refused(joinedWith(first.atExit, [0, 0, 1]), 'CAPABILITY', /coplanar arcs of opposite curvature/);
  refused(joinedWith(first.atExit, first.exitInward), 'CAPABILITY', /one open circular arc from 30° to 120°/);
  refused(pair({ a: 29 }).curve, 'CAPABILITY', /30° to 120°/);
  refused(pair({ b: 121 }).curve, 'CAPABILITY', /30° to 120°/);
  refused({ ...curve, knots: [0, 0, 0, 1, 1.1, 2, 2, 2] }, 'CAPABILITY', /30° to 120°/);
  for (const radius of [12, 13]) refused(curve, 'PARAMETER', /both path radii larger/, { ...circle, radius });
  refused(curve, 'CAPABILITY', /one circular disk section/, { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, -3], max: [2, 3] });
  refused(curve, 'CAPABILITY', /without holes/, { ...circle, center: [0, 0], sideTags: { outer: ['rim'], holes: [['hole']] },
    holes: [[{ kind: 'arc', center: [0, 0], start: [1, 0], direction: 'ccw' }]] });
  refused(curve, 'CAPABILITY', /one open straight segment/, circle, 'exact-straight');
});

test('two joined spans of the same circle still use the one-arc sweep', () => {
  const a = arc('a', [0, 0, 0], [1, 0, 0], [0, 1, 0], 12, 45);
  const b = arc('b', a.end, a.atExit, a.exitInward, 12, 45);
  const rail = joinCurves(a.curve, b.curve, { curveId: 'sameCircle' }).curve;
  const [out] = evaluateCadPart(document(rail)).outputs;
  assert.ok(checkBrep(out.brep, { strict: true }).valid);
  assert.equal(out.brep.faces.length, 4);
  near(massPropertiesOf(out).volume, Math.PI * 4 * (a.length + b.length));
});
