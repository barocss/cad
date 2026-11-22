import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  joinCurves, loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart, surfaceDomain,
} from '../dist/index.js';
import { evaluateSurfaceD1 } from '../dist/core/derivatives.js';

const add = (a, b) => a.map((x, i) => x + b[i]);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const scale = (a, s) => a.map(x => x * s);
const dot = (a, b) => a.reduce((sum, x, i) => sum + x * b[i], 0);
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const norm = a => Math.hypot(...a);
const unit = a => scale(a, 1 / norm(a));
const near = (a, b, tolerance = 1e-8) => assert.ok(Math.abs(a - b) <= tolerance, `${a} vs ${b} at tolerance ${tolerance}`);
const pointNear = (a, b) => near(norm(sub(a, b)), 0);
const center = [50, -30];
const section = (r = 1, holeCenter = center, phase = [1, 0], direction = 'ccw') => ({
  id: 's', kind: 'sketch', profile: 'circle', center, radius: 2,
  holes: [[{ kind: 'arc', center: holeCenter, start: add(holeCenter, scale(phase, r)), direction }]],
  sideTags: { outer: ['rim'], holes: [['bore']] },
});
const document = ({ degree, knots, controlPoints, weights }, sketch = section()) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {},
  features: [sketch, { kind: 'sweep-curve', id: 'w', sketch: 's', mode: 'exact', path: { degree, knots, controlPoints, weights } }],
});
const quadratic = (id, controlPoints, weight = 1) => ({
  kind: 'curve', id, degree: 2, controlPoints, weights: [1, weight, 1], knots: [0, 0, 0, 1, 1, 1],
});

function elbow({ angle = 90, radius = 20, lead = 10, tail = 14,
  first = [0, 0, 0], tangent = [1, 0, 0], inward = [0, 1, 0] } = {}) {
  const theta = angle * Math.PI / 180, c = Math.cos(theta), s = Math.sin(theta);
  const atExit = add(scale(tangent, c), scale(inward, s));
  const last = add(first, add(scale(tangent, radius * s), scale(inward, radius * (1 - c))));
  const start = add(first, scale(tangent, -lead)), end = add(last, scale(atExit, tail));
  const line = quadratic('lead', [start, add(first, scale(tangent, -lead / 2)), first]);
  const bend = quadratic('bend', [first, add(first, scale(tangent, radius * Math.tan(theta / 2))), last], Math.cos(theta / 2));
  const final = quadratic('tail', [last, add(last, scale(atExit, tail / 2)), end]);
  const lineArc = joinCurves(line, bend, { curveId: 'lineArc' }).curve;
  const curve = joinCurves(lineArc, final, { curveId: 'lineArcLine' }).curve;
  const axis = cross(tangent, inward);
  return { curve, lineArc, start, first, last, end, tangent, atExit, axis, center: add(first, scale(inward, radius)),
    inward, exitInward: cross(axis, atExit), radius, lead, tail, length: lead + radius * theta + tail };
}

const boreWall = name => name.includes('[bore]') || name.includes('.hole0.side');
const leadBend = rail => ({ ...rail, curve: rail.lineArc, end: rail.last, tail: undefined, length: rail.length - rail.tail });
function sampleSection(curve, center, normal, radius) {
  const [lo, hi] = curveDomain(curve);
  for (const f of [0, .19, .5, .87, 1]) {
    const p = sub(evaluateCurve(curve, lo + f * (hi - lo)), center);
    near(dot(p, normal), 0);
    near(norm(p), radius);
  }
}

function verify(output, rail, outer = 2, inner = 1) {
  const { brep } = output, report = checkBrep(brep, { strict: true });
  const hasTail = rail.tail !== undefined;
  assert.equal(output.representation, 'curved');
  assert.deepEqual(brep.source, { family: 'sweep-curve', id: 'w' });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.equal(report.topology.length, 1);
  assert.equal(report.topology[0].genus, 1);
  assert.deepEqual(report.counts, hasTail
    ? { bodies: 1, shells: 1, faces: 14, loops: 16, coedges: 56, edges: 28, vertices: 16 }
    : { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 40, edges: 20, vertices: 12 });
  assert.equal(new Set(brep.faces.map(face => face.name)).size, hasTail ? 14 : 10);
  // Independent annular area times the authored centerline length; no producer supplies this value.
  const volume = Math.PI * (outer ** 2 - inner ** 2) * rail.length, mass = massPropertiesOf(output);
  assert.equal(mass.method, 'closed-form');
  // A thin wall far from sketch origin loses a few absolute ulps when its hole radius is reconstructed.
  near(mass.volume, volume, Math.max(1e-10, 1e-10 * volume));
  near(brepMassProperties(brep, 1).volume, volume, Math.max(1e-9, 1e-8 * volume));

  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  for (const cap of caps) {
    const first = cap.name === 'w.start', center = first ? rail.start : rail.end;
    const normal = first ? scale(rail.tangent, -1) : rail.atExit;
    pointNear(faceGeometry(cap).n, normal);
    const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 2);
      for (const id of loop.coedges) {
        const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge);
        sampleSection(edge.curve, center, normal, loop.kind === 'inner' ? inner : outer);
        const twin = brep.coedges.find(peer => peer.id === use.twin);
        assert.equal(boreWall(brep.faces.find(face => face.loops.includes(twin.loop)).name), loop.kind === 'inner');
      }
    }
  }

  for (const label of hasTail ? ['line', 'bend', 'tail'] : ['line', 'bend']) {
    const faces = brep.faces.filter(face => face.name.startsWith(`w.${label}.`));
    assert.equal(faces.filter(face => boreWall(face.name)).length, 2);
    assert.equal(faces.filter(face => !boreWall(face.name)).length, 2);
    for (const face of faces) {
      const innerWall = boreWall(face.name), r = innerWall ? inner : outer, surface = face.surface;
      assert.equal(surface.degreeU, 2);
      assert.equal(surface.degreeV, label === 'bend' ? 2 : 1);
      if (label !== 'bend') assert.equal(faceGeometry(face).kind, 'cylinder');
      const { u, v } = surfaceDomain(surface);
      for (const s of [.17, .43, .83]) for (const t of [.24, .69]) {
        const d = evaluateSurfaceD1(surface, u[0] + s * (u[1] - u[0]), v[0] + t * (v[1] - v[0]));
        let fromRail;
        if (label === 'bend') {
          const q = sub(d.point, rail.center), radial = unit(sub(q, scale(rail.axis, dot(q, rail.axis))));
          fromRail = sub(q, scale(radial, rail.radius));
        } else {
          const center = label === 'line' ? rail.first : rail.last, tangent = label === 'line' ? rail.tangent : rail.atExit;
          const q = sub(d.point, center), station = dot(q, tangent);
          assert.ok(label === 'line' ? station > -rail.lead && station < 0 : station > 0 && station < rail.tail);
          fromRail = sub(q, scale(tangent, station));
        }
        near(norm(fromRail), r);
        const normal = scale(unit(cross(d.du, d.dv)), face.sense === 'forward' ? 1 : -1);
        pointNear(normal, scale(unit(fromRail), innerWall ? -1 : 1));
      }
    }
  }

  const joints = [];
  const stations = [['line', rail.first, rail.tangent, rail.inward]];
  if (hasTail) stations.push(['tail', rail.last, rail.atExit, rail.exitInward]);
  for (const [label, center, normal, inward] of stations) {
    const seams = brep.edges.filter(edge => edge.name?.includes('w.bend.') && edge.name.includes(`w.${label}.`));
    assert.equal(seams.filter(edge => boreWall(edge.name)).length, 2);
    assert.equal(seams.filter(edge => !boreWall(edge.name)).length, 2);
    for (const edge of seams) {
      joints.push(edge.id);
      const innerWall = boreWall(edge.name), r = innerWall ? inner : outer;
      assert.equal(edge.curve.degree, 2);
      assert.equal(edge.curve.controlPoints.length, 5);
      for (const [i, w] of [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].entries()) near(edge.curve.weights[i], w, 4 * Number.EPSILON);
      sampleSection(edge.curve, center, normal, r);
      const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
      assert.equal(uses.length, 2);
      for (const [i, use] of uses.entries()) {
        assert.equal(use.twin, uses[1 - i].id);
        assert.notEqual(use.sense, uses[1 - i].sense);
        assert.ok(use.pcurve, `${edge.name}: missing native UV binding`);
        assert.deepEqual(curveDomain(use.pcurve), domain);
        const face = brep.faces.find(face => face.loops.includes(use.loop));
        assert.equal(boreWall(face.name), innerWall);
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
      for (const sample of continuity.curvature.samples) {
        const q = dot(sub(evaluateCurve(edge.curve, sample.parameter), center), inward);
        const expected = (innerWall ? -1 : 1) * q / (r * (rail.radius - q));
        const curvature = face => face.name.startsWith('w.bend.') ? expected : 0;
        near(sample.first, curvature(continuity.faces[0]));
        near(sample.second, curvature(continuity.faces[1]));
      }
    }
  }
  assert.equal(new Set(joints).size, hasTail ? 8 : 4);
  return mass;
}

for (const hasTail of [true, false]) {
  const route = hasTail ? 'line-arc-line' : 'line-and-arc', selectedRail = rail => hasTail ? rail : leadBend(rail);
  test(`R20 ${route} preserves a concentric bore, ${hasTail ? 'eight' : 'four'} native G1 edges, ID and OD edits, and reopened identity`, () => {
    const rail = selectedRail(elbow()), doc = document(rail.curve);
    assert.deepEqual(rail.start, [-10, 0, 0]);
    pointNear(rail.end, hasTail ? [20, 34, 0] : [20, 20, 0]);
    near(rail.length, (hasTail ? 24 : 10) + 10 * Math.PI);
    doc.parameters = { OuterRadius: 2, BoreEdgeX: 51 };
    doc.features[0].radius = { parameter: 'OuterRadius' };
    doc.features[0].holes[0][0].start = [{ parameter: 'BoreEdgeX' }, -30];
    const initial = evaluateCadPart(doc), firstMass = verify(initial.outputs[0], rail);
    const edited = reevaluate(initial, { parameters: { BoreEdgeX: 51.5 } }), editedMass = verify(edited.outputs[0], rail, 2, 1.5);
    near(editedMass.volume / firstMass.volume, 7 / 12);
    const walls = snapshot => snapshot.outputs[0].brep.faces.filter(face => !boreWall(face.name));
    assert.deepEqual(walls(edited).filter(face => face.name.includes('.side[rim]')), walls(initial).filter(face => face.name.includes('.side[rim]')));
    const identity = snapshot => snapshot.outputs[0].brep.edges.map(edge => [edge.id, edge.name]);
    assert.deepEqual(identity(edited), identity(initial));
    const expanded = reevaluate(edited, { parameters: { OuterRadius: 3 } });
    verify(expanded.outputs[0], rail, 3, 1.5);
    assert.deepEqual(identity(expanded), identity(initial));
    const reopened = loadCadPart(saveCadPart(edited));
    assert.deepEqual(reopened.document, edited.document);
    assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep);
    verify(reopened.outputs[0], rail, 2, 1.5);
    assert.deepEqual(reevaluate(reopened, { parameters: { OuterRadius: 3 } }).outputs[0].brep, expanded.outputs[0].brep);
    const restored = reevaluate(reopened, { parameters: { BoreEdgeX: 51 } });
    assert.deepEqual(restored.outputs[0].brep, initial.outputs[0].brep);
  });

  test(`oblique 30 and 120 degree ${route} retains clockwise phased bore charts and oriented inner walls`, () => {
    for (const angle of [30, 120]) {
      const rail = selectedRail(elbow({ angle, radius: 10, lead: 50, tail: 35, first: [32, 14, -18], tangent: [.6, .8, 0], inward: [0, 0, 1] }));
      verify(evaluateCadPart(document(rail.curve, { ...section(1.5, center, [.6, .8], 'cw'), radius: 8, sideTags: undefined })).outputs[0], rail, 8, 1.5);
    }
  });

  test(`annular ${route} refuses eccentric, unsupported and thin holes without admitting arc-first paths`, () => {
    const rail = selectedRail(elbow()), refused = (sketch, code, detail, path = rail.curve) => assert.throws(() => evaluateCadPart(document(path, sketch)),
      error => error instanceof CadPartError && error.feature === 'w' && error.code === code && detail.test(error.message));
    refused(section(1, [50.25, -30]), 'GEOMETRY', new RegExp(`Exact ${route} sweep needs the bore concentric`));
    refused(section(.005), 'PARAMETER', new RegExp(`Exact ${route} sweep needs a hole radius of at least 0.01`));
    for (const radius of [2 - 5e-7, 2, 2.1]) refused(section(radius), 'GEOMETRY', /strictly positive wall clearance around the bore/);
    const jointGap = 1e-6 + 2e-13;
    assert.ok(2 - (2 - jointGap) > 1e-6);
    refused(section(2 - jointGap), 'GEOMETRY', /strictly positive wall clearance around the bore/);
    verify(evaluateCadPart(document(rail.curve, section(2 - 5e-6))).outputs[0], rail, 2, 2 - 5e-6);
    for (const radius of [20, 21]) refused({ ...section(1), radius }, 'PARAMETER', /path radius larger/);
    refused({ ...section(.2), sideTags: undefined, holes: [...section(.2).holes, ...section(.2).holes] }, 'CAPABILITY', /accepts at most one circular hole/);
    const rectangle = [[49.5, -30.5], [50.5, -30.5], [50.5, -29.5], [49.5, -29.5]].map(start => ({ kind: 'line', start }));
    refused({ ...section(), sideTags: undefined, holes: [rectangle] }, 'CAPABILITY', /accepts at most one circular hole/);
    const arcFirst = { ...rail.lineArc, controlPoints: rail.lineArc.controlPoints.toReversed(), weights: rail.lineArc.weights.toReversed() };
    refused(section(), 'CAPABILITY', /one open circular arc/, arcFirst);
  });
}
