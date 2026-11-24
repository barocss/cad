import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';
import { exactPerpendicularAnnularInletOffsetFrame, offsetExactPerpendicularAnnularInletIfAdmitted } from '../dist/brep/exact-sweep.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = point => Math.hypot(...point);
const nearPoint = (a, b, tolerance = 1e-8) => near(norm(sub(a, b)), 0, tolerance);
const rail = (lead = 10) => ({ degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4],
  weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
  controlPoints: [[-lead, 0, 0], [-lead / 2, 0, 0], [0, 0, 0], [12, 0, 0], [12, 12, 0], [12, 30, 0], [12, 30, 18], [12, 30, 23], [12, 30, 28]],
});
const circle = (radius, direction = 'ccw') => ({ kind: 'arc', start: [radius, 0], center: [0, 0], direction });
const minimal = (path = rail()) => ({ id: 'w', mode: 'exact', path: { ...path, kind: 'curve', id: 'path' } });
const input = (path = rail()) => ({ ...minimal(path), outer: [circle(2)], holes: [[circle(1, 'cw')]],
  xAxis: [1, 0, 0], yAxis: [0, 1, 0], sideTags: { outer: ['e0'], holes: [['bore']] } });
const document = (distance, path = rail()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2, holes: [[circle(1, 'cw')]], sideTags: { outer: ['e0'], holes: [['bore']] } },
  { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path },
  ...(distance === undefined ? [] : [{ id: 'move', kind: 'offset-face', target: 'w', face: 'w.start', distance }]),
] });
const joints = brep => brep.edges.filter(edge => [[0, 0], [1, 12], [2, 18]].some(([axis, at]) =>
  edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-10)));

function retained(brep) {
  const faces = brep.faces.filter(face => face.name !== 'w.start' && !face.name.startsWith('w.lead.'));
  const loops = brep.loops.filter(loop => faces.some(face => face.loops.includes(loop.id)));
  const coedges = brep.coedges.filter(use => loops.some(loop => loop.id === use.loop));
  const edges = brep.edges.filter(edge => coedges.some(use => use.edge === edge.id));
  const vertices = brep.vertices.filter(vertex => edges.some(edge => edge.vertices.includes(vertex.id)));
  return { faces, loops, coedges, edges, vertices };
}

function incidence(brep) {
  return { bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    faces: brep.faces.map(({ surface, ...face }) => face), coedges: brep.coedges.map(({ pcurve, ...use }) => use),
    edges: brep.edges.map(({ curve, ...edge }) => edge), vertices: brep.vertices.map(({ point, ...vertex }) => vertex) };
}

function verify(result, distance, originalLead = 10) {
  const { brep } = result, report = checkBrep(brep, { strict: true }), lead = originalLead + distance;
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-10);
  const length = 15 * Math.PI + lead + 10, volume = 3 * Math.PI * length;
  const bendCentroid = [36 / 5 + 581 / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - 1301 / (60 * Math.PI)];
  const centroid = bendCentroid.map((x, i) => (15 * Math.PI * x + lead * [-lead / 2, 0, 0][i] + 10 * [12, 30, 23][i]) / length);
  for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); nearPoint(mass.centroid, centroid, 1e-7);
  }
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  const required = new Set(joints(brep).map(edge => edge.id)); assert.equal(required.size, 12);
  for (const face of caps) {
    const start = face.name === 'w.start', center = start ? [-lead, 0, 0] : [12, 30, 28], normal = start ? [-1, 0, 0] : [0, 0, 1];
    nearPoint(faceGeometry(face).n, normal);
    const loops = face.loops.map(id => brep.loops.find(loop => loop.id === id));
    assert.deepEqual(loops.map(loop => loop.kind).sort(), ['inner', 'outer']);
    for (const loop of loops) {
      assert.equal(loop.coedges.length, 2);
      for (const id of loop.coedges) {
        const use = brep.coedges.find(use => use.id === id), edge = brep.edges.find(edge => edge.id === use.edge), [a, b] = curveDomain(edge.curve);
        required.add(edge.id);
        for (const fraction of [0, .19, .5, .81, 1]) {
          const point = evaluateCurve(edge.curve, a + fraction * (b - a)), delta = sub(point, center);
          near(delta.reduce((sum, x, i) => sum + x * normal[i], 0), 0); near(norm(delta), loop.kind === 'inner' ? 1 : 2);
        }
      }
    }
  }
  assert.equal(required.size, 20);
  const joinIds = new Set(joints(brep).map(edge => edge.id));
  for (const id of required) {
    const edge = brep.edges.find(edge => edge.id === id), pair = brep.coedges.filter(use => use.edge === id), [a, b] = curveDomain(edge.curve);
    assert.equal(pair.length, 2); assert.equal(pair[0].twin, pair[1].id); assert.equal(pair[1].twin, pair[0].id);
    assert.notEqual(pair[0].sense, pair[1].sense);
    for (const use of pair) {
      assert.ok(use.pcurve); assert.deepEqual(curveDomain(use.pcurve), [a, b]);
      const face = brep.faces.find(face => face.loops.includes(use.loop));
      for (const fraction of [0, .17, .5, .79, 1]) {
        const t = a + fraction * (b - a), uv = evaluateCurve(use.pcurve, t);
        nearPoint(evaluateSurface(face.surface, uv[0], uv[1]), evaluateCurve(edge.curve, t), 1e-10);
      }
    }
    const continuity = measureBrepEdgeContinuity(brep, id, { curvature: joinIds.has(id) });
    assert.equal(continuity.status, 'measured'); near(continuity.maximumAngleDegrees, joinIds.has(id) ? 0 : 90);
    if (joinIds.has(id)) { assert.equal(continuity.curvature.status, 'measured'); assert.ok(continuity.curvature.maximumDifference > 1e-5); }
  }
}

for (const distance of [4, -4]) test(`original annular inlet offset ${distance} preserves both mouths and all three native joints`, () => {
  const source = document(), initial = evaluateCadPart(source), before = structuredClone(initial.outputs[0].brep), saved = saveCadPart(initial);
  const frame = exactPerpendicularAnnularInletOffsetFrame(before, 'w.start', minimal());
  nearPoint(frame.anchor, [-10, 0, 0]); nearPoint(frame.normal, [-1, 0, 0]);
  const changed = reevaluate(initial, { document: document(distance) }); verify(changed.outputs[0], distance);
  assert.deepEqual(incidence(changed.outputs[0].brep), incidence(before));
  assert.deepEqual(retained(changed.outputs[0].brep), retained(before));
  const path = rail(); path.controlPoints[0][0] -= distance; path.controlPoints[1][0] -= distance / 2;
  const next = exactPerpendicularAnnularInletOffsetFrame(changed.outputs[0].brep, 'w.start', minimal(path));
  nearPoint(next.anchor, [-10 - distance, 0, 0]); nearPoint(next.normal, frame.normal);
  assert.deepEqual(offsetExactPerpendicularAnnularInletIfAdmitted(before, 'w.start', input(), distance), changed.outputs[0].brep);
  assert.equal(saveCadPart(initial), saved); assert.deepEqual(initial.outputs[0].brep, before);
});

test('signed History edit and native Save/Open replay keep the original rail and exact opposite boundary', () => {
  const first = evaluateCadPart(document(4)), edited = reevaluate(first, { document: document(-4) }); verify(edited.outputs[0], -4);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], -4);
  assert.deepEqual(reopened.document.features[1].path, rail());
  assert.deepEqual(reevaluate(reopened, { document: document(4) }).outputs[0].brep, first.outputs[0].brep);
});

test('exact minimum straight inlet is admitted and contact, crossing or unrepresentable movement refuse without writes', () => {
  const path = rail(.0002), initial = evaluateCadPart(document(undefined, path)), saved = saveCadPart(initial);
  const minimalResult = reevaluate(initial, { document: document(-.0001, path) }); verify(minimalResult.outputs[0], -.0001, .0002);
  for (const distance of [-.0002, -.0003, -.000100001])
    assert.throws(() => reevaluate(initial, { document: document(distance, path) }), error => error instanceof CadPartError
      && error.feature === 'move' && error.code === 'GEOMETRY' && /reach or cross the retained inlet-to-bend join/.test(error.message));
  const stock = evaluateCadPart(document()), brep = stock.outputs[0].brep;
  for (const distance of [-10, -11]) assert.throws(() => reevaluate(stock, { document: document(distance) }), /reach or cross the retained inlet-to-bend join/);
  for (const distance of [0, NaN, Infinity, 10001])
    assert.throws(() => offsetExactPerpendicularAnnularInletIfAdmitted(brep, 'w.start', input(), distance), /distance must be nonzero and within the modeling range/);
  assert.throws(() => offsetExactPerpendicularAnnularInletIfAdmitted(brep, 'w.start', input(), Number.MIN_VALUE), /distance is too small to move the inlet/);
  assert.throws(() => offsetExactPerpendicularAnnularInletIfAdmitted(brep, 'w.start', input(), 9991), /path coordinates must be within/);
  assert.equal(saveCadPart(initial), saved);
});

test('stale shape, rail, profile and incomplete or changed cap/joint pcurves cannot authorize an offset', () => {
  const source = document(), initial = evaluateCadPart(source), brep = initial.outputs[0].brep, saved = saveCadPart(initial);
  for (const face of ['w.end', 'w.lead.side[e0]#1', 'w.first.side[e0]#1']) {
    assert.equal(exactPerpendicularAnnularInletOffsetFrame(brep, face, minimal()), undefined);
    assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(brep, face, input(), 4), undefined);
  }
  assert.equal(exactPerpendicularAnnularInletOffsetFrame(brep, 'w.start', { ...minimal(), id: 'stale' }), undefined);
  assert.equal(exactPerpendicularAnnularInletOffsetFrame(brep, 'w.start', { ...minimal(), mode: 'exact-straight' }), undefined);
  const staleRail = rail(); staleRail.controlPoints[8][2] += 1; staleRail.controlPoints[7][2] += .5;
  assert.equal(exactPerpendicularAnnularInletOffsetFrame(brep, 'w.start', minimal(staleRail)), undefined);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(brep, 'w.start', input(staleRail), 4), undefined);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(brep, 'w.start', { ...input(), holes: [[circle(1.1, 'cw')]] }, 4), undefined);
  const metadata = structuredClone(brep); metadata.vertices[0].tolerance *= 2;
  assert.ok(checkBrep(metadata, { strict: true }).valid);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(metadata, 'w.start', input(), 4), undefined);
  const caps = ['w.start', 'w.end'].map(name => brep.faces.find(face => face.name === name));
  const required = [...caps.map(cap => brep.coedges.find(use => cap.loops.includes(use.loop))),
    brep.coedges.find(use => use.edge === joints(brep)[0].id)];
  for (const selected of [...required, brep.coedges.find(use => use.id === required[0].twin)]) {
    for (const pcurve of [null, { ...selected.pcurve, controlPoints: selected.pcurve.controlPoints.map(([u, v, z]) => [u + .001, v, z]) }]) {
      const changed = { ...brep, coedges: brep.coedges.map(use => use.id === selected.id ? { ...use, pcurve } : use) };
      assert.equal(exactPerpendicularAnnularInletOffsetFrame(changed, 'w.start', minimal()), undefined);
      assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(changed, 'w.start', input(), 4), undefined);
    }
  }
  assert.equal(saveCadPart(initial), saved); assert.deepEqual(initial.outputs[0].brep, brep);
});

test('disk and partial-path families retain their existing unsupported inlet-offset scope', () => {
  const disk = document(); delete disk.features[0].holes; disk.features[0].sideTags = { outer: ['e0'] };
  const body = evaluateCadPart(disk).outputs[0].brep;
  assert.equal(exactPerpendicularAnnularInletOffsetFrame(body, 'w.start', minimal()), undefined);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(body, 'w.start', { ...input(), holes: [] }, 4), undefined);
  const shorter = document(); shorter.features[1].path.controlPoints.splice(-2); shorter.features[1].path.weights.splice(-2);
  shorter.features[1].path.knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 3];
  const oneEnd = evaluateCadPart(shorter).outputs[0].brep;
  assert.equal(exactPerpendicularAnnularInletOffsetFrame(oneEnd, 'w.start', minimal(shorter.features[1].path)), undefined);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(oneEnd, 'w.start', input(shorter.features[1].path), 4), undefined);
});
