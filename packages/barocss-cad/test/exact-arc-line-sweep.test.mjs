import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface,
  faceGeometry, joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b, tolerance) => near(Math.hypot(...sub(a, b)), 0, tolerance);
const disk = { id: 's', kind: 'sketch', profile: 'circle', center: [8, -4], radius: 2, sideTags: { outer: ['rim'] } };
const annulus = (radius = 1, center = disk.center, direction = 'ccw') => ({ ...disk,
  holes: [[{ kind: 'arc', center, start: add(center, scale([.6, .8], radius)), direction }]],
  sideTags: { outer: ['rim'], holes: [['bore']] },
});
const pathOf = ({ degree, knots, controlPoints, weights }) => ({ degree, knots, controlPoints, weights });
const document = (path, section = disk, mode = 'exact') => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [structuredClone(section), { id: 'w', kind: 'sweep-curve', sketch: 's', mode, path: pathOf(path) }],
});
const quadratic = (id, controlPoints, weight = 1) => ({ kind: 'curve', id, degree: 2,
  knots: [0, 0, 0, 1, 1, 1], controlPoints, weights: [1, weight, 1] });
function rail({ degrees = 90, radius = 20, length = 14, start = [0, 0, 0],
  tangent = [1, 0, 0], inward = [0, 1, 0], lineTangent } = {}) {
  const angle = degrees * Math.PI / 180, c = degrees === 90 ? 0 : Math.cos(angle), s = Math.sin(angle);
  const join = add(start, scale(add(scale(tangent, s), scale(inward, 1 - c)), radius));
  const atExit = add(scale(tangent, c), scale(inward, s)), direction = lineTangent ?? atExit;
  const end = add(join, scale(direction, length));
  const arc = quadratic('bend', [start, add(start, scale(tangent, degrees === 90 ? radius : radius * Math.tan(angle / 2))), join], Math.cos(angle / 2));
  const line = quadratic('line', [join, add(join, scale(direction, length / 2)), end]);
  const joined = joinCurves(arc, line, { curveId: 'arcLine' }).curve;
  // Unequal, translated knot intervals require true parameter reversal, not array reversal alone.
  const curve = { ...joined, knots: [-3, -3, -3, 1, 1, 2, 2, 2] };
  return { curve, start, join, end, tangent, atExit, inward, radius, angle, length, center: add(start, scale(inward, radius)) };
}

// Circular tube integration uses dV=(1-u/R) du dv ds. Its area moment is A(ro²+ri²)/4.
// This oracle uses authored centerline vectors and has no dependency on revolve or native solid mass.
function independentMass(path, outer, inner) {
  const { angle: a, radius: R, inward: n, tangent: t, center: C, atExit: d, length: L } = path;
  const A = Math.PI * (outer ** 2 - inner ** 2), q = (outer ** 2 + inner ** 2) / 4;
  const V = A * R * a, W = A * L, volume = V + W;
  const meanN = sub(scale(n, Math.sin(a) / a), scale(t, (1 - Math.cos(a)) / a));
  const arcCentroid = sub(C, scale(meanN, R + q / R));
  const midpoint = add(path.join, scale(d, L / 2));
  const centroid = scale(add(scale(arcCentroid, V), scale(midpoint, W)), 1 / volume);
  return { volume, centroid };
}
const boreWall = name => name.includes('[bore]');
function verify(output, path, outer = 2, inner = 0) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, inner ? 1 : 0);
  assert.deepEqual(report.counts, inner
    ? { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 40, edges: 20, vertices: 12 }
    : { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 20, edges: 10, vertices: 6 });
  const expected = independentMass(path, outer, inner);
  for (const actual of [massPropertiesOf(output), brepMassProperties(brep, 1)]) {
    near(actual.volume, expected.volume, 2e-8 * expected.volume);
    pointNear(actual.centroid, expected.centroid, 1e-7);
  }
  assert.equal(brep.faces.filter(face => face.name.includes('[rim]')).length, 4);
  assert.equal(brep.faces.filter(face => boreWall(face.name)).length, inner ? 4 : 0);
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const cap of caps) {
    const isStart = cap.name === 'w.start', center = isStart ? path.start : path.end;
    const normal = isStart ? scale(path.tangent, -1) : path.atExit, geometry = faceGeometry(cap);
    pointNear(geometry.n, normal);
    near(dot(sub(geometry.o, center), normal), 0);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), inner ? ['inner', 'outer'] : ['outer']);
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 2);
      for (const id of loop.coedges) {
        const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
        const radius = loop.kind === 'inner' ? inner : outer;
        const twin = brep.coedges.find(peer => peer.id === use.twin);
        assert.equal(boreWall(brep.faces.find(face => face.loops.includes(twin.loop)).name), loop.kind === 'inner');
        assert.equal(edge.curve.degree, 2);
        assert.ok(edge.name.split('|').includes(cap.name), `${edge.name}: wrong authored cap alias`);
        assert.ok(!edge.name.split('|').includes(isStart ? 'w.end' : 'w.start'));
        sampleSection(edge.curve, center, normal, radius);
      }
    }
  }
  const joints = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes('w.line.'));
  assert.equal(joints.length, inner ? 4 : 2);
  for (const edge of joints) {
    sampleSection(edge.curve, path.join, path.atExit, boreWall(edge.name) ? inner : outer);
    const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
    assert.equal(uses.length, 2);
    for (const [i, use] of uses.entries()) {
      assert.equal(use.twin, uses[1 - i].id);
      assert.notEqual(use.sense, uses[1 - i].sense);
      assert.ok(use.pcurve, `${edge.name}: missing native UV binding`);
      assert.deepEqual(curveDomain(use.pcurve), domain);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      assert.equal(boreWall(face.name), boreWall(edge.name));
      for (const f of [0, .19, .5, .87, 1]) {
        const t = domain[0] + f * (domain[1] - domain[0]), [u, v] = evaluateCurve(use.pcurve, t);
        pointNear(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, t));
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, edge.id, { curvature: true });
    assert.equal(continuity.status, 'measured', JSON.stringify(continuity));
    near(continuity.maximumAngleDegrees, 0);
    assert.equal(continuity.curvature.status, 'measured');
    assert.ok(continuity.curvature.maximumDifference > 1e-5);
  }
}
function sampleSection(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const f of [0, .19, .5, .87, 1]) {
    const q = sub(evaluateCurve(curve, lo + f * (hi - lo)), center);
    near(dot(q, normal), 0);
    near(Math.hypot(...q), radius);
  }
}

for (const inner of [0, 1]) {
  for (const degrees of [30, 90, 120]) test(`${degrees} degree arc then line retains native ${inner ? 'annulus and both open mouths' : 'disk'} caps, mass and reciprocal join charts`, () => {
    const path = rail({ degrees, radius: 10, length: 35, start: [32, 14, -18], tangent: [.6, .8, 0], inward: [0, 0, 1] });
    const section = { ...(inner ? annulus(inner, disk.center, 'cw') : disk), radius: 8 };
    verify(evaluateCadPart(document(path.curve, section)).outputs[0], path, 8, inner);
  });

  test(`arc then line ${inner ? 'bore and outer diameter' : 'diameter'} edits preserve cap, rim and joint IDs across reopen`, () => {
    const path = rail(), doc = document(path.curve, inner ? annulus() : disk);
    doc.parameters = { Outer: 2, BoreX: 8.6, BoreY: -3.2 };
    doc.features[0].radius = { parameter: 'Outer' };
    if (inner) doc.features[0].holes[0][0].start = [{ parameter: 'BoreX' }, { parameter: 'BoreY' }];
    const initial = evaluateCadPart(doc), edited = reevaluate(initial, { parameters: { Outer: 3 } });
    verify(initial.outputs[0], path, 2, inner);
    verify(edited.outputs[0], path, 3, inner);
    const identity = snapshot => ['faces', 'edges'].map(key => snapshot.outputs[0].brep[key].map(item => [item.id, item.name]));
    assert.deepEqual(identity(edited), identity(initial));
    const reopened = loadCadPart(saveCadPart(edited));
    assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
    assert.deepEqual(reevaluate(reopened, { parameters: { Outer: 2 } }).outputs[0].brep, initial.outputs[0].brep);
    if (inner) {
      const boreEdited = reevaluate(reopened, { parameters: { BoreX: 8.9, BoreY: -2.8 } });
      verify(boreEdited.outputs[0], path, 3, 1.5);
      assert.deepEqual(identity(boreEdited), identity(initial));
      const rims = snapshot => snapshot.outputs[0].brep.faces.filter(face => face.name.includes('[rim]'));
      assert.deepEqual(rims(boreEdited), rims(reopened));
      assert.deepEqual(loadCadPart(saveCadPart(boreEdited)).outputs[0].brep, boreEdited.outputs[0].brep);
    }
  });
}

test('arc then line refuses unsupported profiles, openings, carrier errors, kinks, reversals and radius contact with its own diagnostics', () => {
  const path = rail(), refused = (curve, code, pattern, section = disk) => assert.throws(() => evaluateCadPart(document(curve, section)),
    error => error instanceof CadPartError && error.feature === 'w' && error.code === code && pattern.test(error.message));
  for (const degrees of [29, 121]) refused(rail({ degrees }).curve, 'CAPABILITY', /Exact arc-and-line sweep needs one circular arc from 30° to 120° followed by one straight segment/);
  for (const lineTangent of [[0, 0, 1], [0, -1, 0]]) refused(rail({ lineTangent }).curve, 'GEOMETRY', /arc-and-line sweep path must meet with a common forward tangent/);
  refused(rail({ length: 0 }).curve, 'PARAMETER', /arc-and-line sweep needs a straight segment at least/);
  refused({ ...path.curve, weights: [1, .7, 1, 1, 1] }, 'CAPABILITY', /arc-and-line sweep needs one circular arc/);
  refused({ ...path.curve, knots: [-3, -3, -3, 1, 1.1, 2, 2, 2] }, 'CAPABILITY', /arc-and-line sweep needs one circular arc/);
  const malformedLine = path.curve.controlPoints.map((p, i) => i === 3 ? add(p, [1, 0, 0]) : p);
  refused({ ...path.curve, controlPoints: malformedLine }, 'CAPABILITY', /arc-and-line sweep needs one circular arc/);
  for (const radius of [20, 21]) refused(path.curve, 'PARAMETER', /Exact arc-and-line sweep needs a path radius larger/, { ...disk, radius });
  const rectangle = { id: 's', kind: 'sketch', profile: 'rectangle', min: [-2, -1], max: [2, 1] };
  const triangle = { id: 's', kind: 'sketch', profile: 'polygon', points: [[0, 0], [3, 0], [0, 2]] };
  for (const section of [rectangle, triangle]) refused(path.curve, 'CAPABILITY', /Exact arc-and-line sweep needs one circular disk section/, section);
  refused(path.curve, 'GEOMETRY', /Exact arc-and-line sweep needs the bore concentric/, annulus(1, [8.25, -4]));
  refused(path.curve, 'PARAMETER', /Exact arc-and-line sweep needs a hole radius of at least/, annulus(.005));
  for (const radius of [2 - 5e-7, 2, 2.1]) refused(path.curve, 'GEOMETRY', /arc-and-line sweep needs strictly positive wall clearance around the bore/, annulus(radius));
  refused(path.curve, 'CAPABILITY', /arc-and-line sweep accepts at most one circular hole/, { ...annulus(), sideTags: undefined, holes: [...annulus().holes, ...annulus().holes] });
  const opening = [[-1, -1], [1, -1], [1, 1], [-1, 1]].map(start => ({ kind: 'line', start }));
  refused(path.curve, 'CAPABILITY', /arc-and-line sweep accepts at most one circular hole/, { ...disk, sideTags: undefined, holes: [opening] });
  const prior = evaluateCadPart(document(path.curve));
  assert.throws(() => reevaluate(prior, { document: { ...prior.document,
    features: [{ ...prior.document.features[0], radius: 20 }, prior.document.features[1]] } }),
  error => error instanceof CadPartError && error.code === 'PARAMETER' && /arc-and-line sweep needs a path radius larger/.test(error.message));
  verify(prior.outputs[0], path);
});
