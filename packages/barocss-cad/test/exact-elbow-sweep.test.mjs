import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, faceGeometry, joinCurves,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, saveCadPart,
} from '../dist/index.js';

const degrees = Math.PI / 180;
const near = (a, b, tolerance = 1e-7) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const norm = a => Math.hypot(...a);
const pointNear = (a, b) => near(norm(sub(a, b)), 0);

const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [50, -30], radius: 2 };
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = disk, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    section, { id: 'w', kind: 'sweep-curve', sketch: 's', path: pathOf(path), mode },
  ],
});
const quadratic = (id, controlPoints, middleWeight = 1) => ({ kind: 'curve', id, degree: 2,
  knots: [0, 0, 0, 1, 1, 1], controlPoints, weights: [1, middleWeight, 1] });

function elbow({ angle = 90, radius = 20, lead = 10, tail = 14, first = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const theta = angle * degrees;
  const atExit = add(scale(tangent, Math.cos(theta)), scale(inward, Math.sin(theta)));
  const advance = add(scale(tangent, radius * Math.sin(theta)), scale(inward, radius * (1 - Math.cos(theta))));
  const last = add(first, advance);
  const start = add(first, scale(tangent, -lead)), end = add(last, scale(atExit, tail));
  const straightIn = quadratic('lead', [start, add(first, scale(tangent, -lead / 2)), first]);
  const arc = quadratic('bend', [first, add(first, scale(tangent, radius * Math.tan(theta / 2))), last], Math.cos(theta / 2));
  const straightOut = quadratic('tail', [last, add(last, scale(atExit, tail / 2)), end]);
  const lineArc = joinCurves(straightIn, arc, { curveId: 'lineArc' }).curve;
  const curve = joinCurves(lineArc, straightOut, { curveId: 'lineArcLine' }).curve;
  return { curve, lineArc, straightIn, arc, straightOut, start, first, last, end, tangent, atExit, length: lead + radius * theta + tail };
}

function sampleSection(curve, centre, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const fraction of [0, .18, .5, .77, 1]) {
    const p = sub(evaluateCurve(curve, lo + (hi - lo) * fraction), centre);
    near(dot(p, normal), 0);
    near(norm(p), radius);
  }
}

function verify(output, rail, r) {
  const { brep } = output, check = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(check.valid, check.issues.join('\n'));
  assert.equal(check.topology[0].genus, 0);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 28, edges: 14, vertices: 8 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 8);
  const mass = massPropertiesOf(output);
  assert.equal(mass.method, 'closed-form');
  const volume = Math.PI * r ** 2 * rail.length;
  near(mass.volume, volume, 1e-10 * volume);
  near(brepMassProperties(brep, 1).volume, volume, 1e-8 * volume);

  const caps = brep.faces.map(face => ({ face, geometry: faceGeometry(face) })).filter(({ geometry }) => geometry.kind === 'plane');
  assert.deepEqual(caps.map(({ face }) => face.name).sort(), ['w.end', 'w.start']);
  for (const { face, geometry } of caps) {
    const atStart = face.name === 'w.start', normal = atStart ? scale(rail.tangent, -1) : rail.atExit;
    const center = atStart ? rail.start : rail.end;
    pointNear(geometry.n, normal);
    near(dot(sub(geometry.o, center), normal), 0);
    const boundary = brep.coedges.filter(use => face.loops.includes(use.loop));
    assert.equal(boundary.length, 2);
    for (const use of boundary) sampleSection(brep.edges.find(edge => edge.id === use.edge).curve, center, normal, r);
  }

  for (const [wall, center, normal] of [['line', rail.first, rail.tangent], ['tail', rail.last, rail.atExit]]) {
    const joins = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes(`w.${wall}.`));
    assert.equal(joins.length, 2);
    for (const edge of joins) {
      sampleSection(edge.curve, center, normal, r);
      const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
      assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
      near(continuity.maximumAngleDegrees, 0);
      assert.equal(continuity.curvature.status, 'measured');
      assert.ok(continuity.curvature.maximumDifference > 1e-5);
    }
  }
  return mass;
}

test('two native Curve joins supply the exact 90° elbow with both exterior caps', () => {
  const rail = elbow();
  assert.deepEqual(rail.curve.controlPoints[6], [20, 34, 0]);
  assert.deepEqual(rail.curve.knots, [0, 0, 0, 1, 1, 2, 2, 3, 3, 3]);
  const snapshot = evaluateCadPart(document(rail.curve));
  verify(snapshot.outputs[0], rail, 2);
  const reopened = loadCadPart(saveCadPart(snapshot));
  assert.deepEqual(reopened.document, snapshot.document);
  assert.deepEqual(reopened.outputs[0].brep, snapshot.outputs[0].brep);
});

test('a long oblique 120° tail crosses the entry plane and the reverse rail sweeps the same solid', () => {
  const rail = elbow({ angle: 120, radius: 10, lead: 50, tail: 35, first: [32, 14, -18], tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  assert.ok(dot(sub(rail.end, rail.first), rail.tangent) < 0);
  const section = { ...disk, radius: 8, sideTags: { outer: ['rim'] } };
  const [original] = evaluateCadPart(document(rail.curve, section)).outputs;
  const forward = verify(original, rail, 8);
  assert.equal(original.brep.faces.filter(face => face.name.includes('.side[rim]')).length, 6);
  const curve = { ...rail.curve, controlPoints: rail.curve.controlPoints.toReversed(), weights: rail.curve.weights.toReversed() };
  const [reversed] = evaluateCadPart(document(curve, section)).outputs;
  const reverse = verify(reversed, { ...rail, start: rail.end, end: rail.start, first: rail.last, last: rail.first,
    tangent: scale(rail.atExit, -1), atExit: scale(rail.tangent, -1) }, 8);
  pointNear(forward.centroid, reverse.centroid);
  for (const [i, row] of forward.inertia.entries()) pointNear(row, reverse.inertia[i]);
});

test('a small disk keeps the native terminal section on a much larger 30° bend', () => {
  const rail = elbow({ angle: 30, radius: 3000, tangent: [.6, .8, 0], inward: [.8, -.6, 0] });
  verify(evaluateCadPart(document(rail.curve, { ...disk, radius: .1 })).outputs[0], rail, .1);
});

test('exact elbow refuses kinks at either join, reversal at one join, axis contact and malformed spans', () => {
  const { curve } = elbow();
  const refused = (path, code, detail, section, mode) => assert.throws(() => evaluateCadPart(document(path, section, mode)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
  const alter = points => ({ ...curve, controlPoints: curve.controlPoints.map((point, i) => points[i] ?? point) });
  refused(alter({ 0: [0, 0, -10], 1: [0, 0, -5] }), 'GEOMETRY', /common forward tangent at both joins/);
  refused(alter({ 5: [20, 20, 7], 6: [20, 20, 14] }), 'GEOMETRY', /common forward tangent at both joins/);
  refused(alter({ 5: [20, 13, 0], 6: [20, 6, 0] }), 'GEOMETRY', /common forward tangent at both joins/);
  refused(alter({ 5: curve.controlPoints[4], 6: curve.controlPoints[4] }), 'PARAMETER', /both straight segments/);
  refused(alter({ 5: [21, 27, 0] }), 'CAPABILITY', /straight segment, one circular arc/);
  refused({ ...curve, weights: [1, 1, 1, Math.SQRT1_2, 1, 0.99, 1] }, 'CAPABILITY', /straight segment, one circular arc/);
  refused({ ...curve, knots: [0, 0, 0, 1, 1, 2, 2.1, 3, 3, 3] }, 'CAPABILITY', /straight segment, one circular arc/);
  for (const angle of [29, 121]) refused(elbow({ angle }).curve, 'CAPABILITY', /30° to 120°/);
  for (const radius of [20, 21]) refused(curve, 'PARAMETER', /path radius larger/, { ...disk, radius });
  refused(curve, 'CAPABILITY', /without holes/, { ...disk, center: [0, 0], holes: [[{ kind: 'arc', center: [0, 0], start: [1, 0], direction: 'ccw' }]] });
  refused(curve, 'CAPABILITY', /one circular disk or one bend-aligned rectangular section/,
    { id: 's', kind: 'sketch', profile: 'polygon', points: [[0, 0], [3, 0], [0, 2]] });
  refused(curve, 'CAPABILITY', /one open straight segment/, disk, 'exact-straight');
});

test('the same authored components still support straight, arc and line-and-arc native sweeps', () => {
  const rail = elbow();
  for (const [path, mode, faceCount, length] of [
    [rail.straightIn, 'exact-straight', 4, 10], [rail.arc, 'exact', 4, 10 * Math.PI],
    [rail.lineArc, 'exact', 6, 10 + 10 * Math.PI], [rail.straightOut, 'exact-straight', 4, 14],
  ]) {
    const [output] = evaluateCadPart(document(path, disk, mode)).outputs;
    assert.ok(checkBrep(output.brep, { strict: true }).valid);
    assert.equal(output.brep.faces.length, faceCount);
    assert.deepEqual(output.brep.faces.filter(face => faceGeometry(face).kind === 'plane').map(face => face.name).sort(), ['w.end', 'w.start']);
    near(massPropertiesOf(output).volume, Math.PI * 4 * length);
  }
});
