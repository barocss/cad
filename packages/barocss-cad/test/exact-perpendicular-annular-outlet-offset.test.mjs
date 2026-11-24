import assert from 'node:assert/strict';
import test from 'node:test';
import {
  brepMassProperties, CadPartError, checkBrep, curveDomain, evaluateCadPart, evaluateCurve, evaluateSurface, faceGeometry,
  loadCadPart, massPropertiesOf, measureBrepEdgeContinuity, reevaluate, saveCadPart,
} from '../dist/index.js';
import {
  exactPerpendicularAnnularInletOffsetFrame, exactPerpendicularAnnularOutletOffsetFrame,
  offsetExactPerpendicularAnnularInletIfAdmitted, offsetExactPerpendicularAnnularOutletIfAdmitted,
} from '../dist/brep/exact-sweep.js';

const near = (a, b, tolerance = 1e-8) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${a} vs ${b}, tolerance ${tolerance}`);
const sub = (a, b) => a.map((x, i) => x - b[i]);
const norm = point => Math.hypot(...point);
const nearPoint = (a, b, tolerance = 1e-8) => near(norm(sub(a, b)), 0, tolerance);
const rail = (tail = 10, shift = 0) => {
  const join = 18 + shift;
  return { degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4, 4], weights: [1, 1, 1, Math.SQRT1_2, 1, Math.SQRT1_2, 1, 1, 1],
    controlPoints: [[-10, 0, shift], [-5, 0, shift], [0, 0, shift], [12, 0, shift], [12, 12, shift], [12, 30, shift],
      [12, 30, join], [12, 30, join + tail / 2], [12, 30, join + tail]] };
};
const circle = (radius, direction = 'ccw') => ({ kind: 'arc', start: [radius, 0], center: [0, 0], direction });
const minimal = (path = rail()) => ({ id: 'w', mode: 'exact', path: { ...path, kind: 'curve', id: 'path' } });
const input = (path = rail()) => ({ ...minimal(path), outer: [circle(2)], holes: [[circle(1, 'cw')]],
  xAxis: [1, 0, 0], yAxis: [0, 1, 0], sideTags: { outer: ['e0'], holes: [['bore']] } });
const document = (distance, path = rail()) => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 's', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 2, holes: [[circle(1, 'cw')]], sideTags: { outer: ['e0'], holes: [['bore']] } },
  { id: 'w', kind: 'sweep-curve', sketch: 's', mode: 'exact', path },
  ...(distance === undefined ? [] : [{ id: 'move', kind: 'offset-face', target: 'w', face: 'w.end', distance }]),
] });
const joints = (brep, shift = 0) => brep.edges.filter(edge => [[0, 0], [1, 12], [2, 18 + shift]].some(([axis, at]) =>
  edge.curve.controlPoints.every(point => Math.abs(point[axis] - at) < 1e-10)));

function retained(brep) {
  const faces = brep.faces.filter(face => face.name !== 'w.end' && !face.name.startsWith('w.tail.'));
  const loops = brep.loops.filter(loop => faces.some(face => face.loops.includes(loop.id)));
  const coedges = brep.coedges.filter(use => loops.some(loop => loop.id === use.loop));
  const edges = brep.edges.filter(edge => coedges.some(use => use.edge === edge.id));
  const vertices = brep.vertices.filter(vertex => edges.some(edge => edge.vertices.includes(vertex.id)));
  return { faces, loops, coedges, edges, vertices };
}

function incidence(brep) {
  return { bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
    faces: brep.faces.map(({ surface: _surface, ...face }) => face), coedges: brep.coedges.map(({ pcurve: _pcurve, ...use }) => use),
    edges: brep.edges.map(({ curve: _curve, ...edge }) => edge), vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex) };
}

function verify(result, distance, originalTail = 10, shift = 0) {
  const { brep } = result, report = checkBrep(brep, { strict: true }), tail = originalTail + distance;
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 18, loops: 20, coedges: 72, edges: 36, vertices: 20 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].shells, 1); assert.equal(report.topology[0].genus, 1);
  assert.ok(report.maximumPcurveGap < 1e-10);
  const length = 15 * Math.PI + 10 + tail, volume = 3 * Math.PI * length;
  const bendCentroid = [36 / 5 + 581 / (60 * Math.PI), 12 + 12 / Math.PI, 54 / 5 - 1301 / (60 * Math.PI)];
  // Moving the outlet adds/removes a cylinder at (12,30,28+d/2); moving the inlet has the same volume but different moments.
  const centroid = bendCentroid.map((x, i) => (15 * Math.PI * x + [-50, 0, 0][i] + tail * [12, 30, 18 + tail / 2][i]) / length + (i === 2 ? shift : 0));
  for (const mass of [massPropertiesOf(result), brepMassProperties(brep, 1)]) {
    near(mass.volume, volume, 1e-7); nearPoint(mass.centroid, centroid, 1e-7);
  }
  const caps = brep.faces.filter(face => faceGeometry(face).kind === 'plane');
  assert.deepEqual(caps.map(face => face.name).sort(), ['w.end', 'w.start']);
  const required = new Set(joints(brep, shift).map(edge => edge.id)); assert.equal(required.size, 12);
  for (const face of caps) {
    const start = face.name === 'w.start', center = start ? [-10, 0, shift] : [12, 30, 18 + tail + shift], normal = start ? [-1, 0, 0] : [0, 0, 1];
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
  const joinIds = new Set(joints(brep, shift).map(edge => edge.id));
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

for (const distance of [4, -4]) test(`original annular outlet offset ${distance} retains the inlet and all three native joints`, () => {
  const initial = evaluateCadPart(document()), before = structuredClone(initial.outputs[0].brep), saved = saveCadPart(initial);
  const frame = exactPerpendicularAnnularOutletOffsetFrame(before, 'w.end', minimal());
  nearPoint(frame.anchor, [12, 30, 28]); nearPoint(frame.normal, [0, 0, 1]);
  const changed = reevaluate(initial, { document: document(distance) }); verify(changed.outputs[0], distance);
  assert.deepEqual(incidence(changed.outputs[0].brep), incidence(before)); assert.deepEqual(retained(changed.outputs[0].brep), retained(before));
  const path = rail(); path.controlPoints[8][2] += distance; path.controlPoints[7][2] += distance / 2;
  const next = exactPerpendicularAnnularOutletOffsetFrame(changed.outputs[0].brep, 'w.end', minimal(path));
  nearPoint(next.anchor, [12, 30, 28 + distance]); nearPoint(next.normal, frame.normal);
  assert.deepEqual(offsetExactPerpendicularAnnularOutletIfAdmitted(before, 'w.end', input(), distance), changed.outputs[0].brep);
  assert.equal(exactPerpendicularAnnularInletOffsetFrame(before, 'w.end', minimal()), undefined);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(before, 'w.end', input(), distance), undefined);
  assert.equal(saveCadPart(initial), saved); assert.deepEqual(initial.outputs[0].brep, before);
});

test('signed History edit and fresh native reopen preserve the stored original rail and exact replay', () => {
  const first = evaluateCadPart(document(4)), edited = reevaluate(first, { document: document(-4) }); verify(edited.outputs[0], -4);
  const reopened = loadCadPart(saveCadPart(edited));
  assert.deepEqual(reopened.document, edited.document); assert.deepEqual(reopened.outputs[0].brep, edited.outputs[0].brep); verify(reopened.outputs[0], -4);
  assert.deepEqual(reopened.document.features[1].path, rail());
  assert.deepEqual(reevaluate(reopened, { document: document(4) }).outputs[0].brep, first.outputs[0].brep);
});

test('translated exact minimum is admitted; contact, crossing, sub-ULP and range violations leave the source unchanged', () => {
  // Put the second exit at Z=0 so the stored .0001 mm minimum needs no subtraction from Z=18.
  const path = rail(.0002, -18), initial = evaluateCadPart(document(undefined, path)), saved = saveCadPart(initial);
  const changed = reevaluate(initial, { document: document(-.0001, path) }); verify(changed.outputs[0], -.0001, .0002, -18);
  for (const distance of [-.0002, -.0003, -.000100001])
    assert.throws(() => reevaluate(initial, { document: document(distance, path) }), error => error instanceof CadPartError
      && error.feature === 'move' && error.code === 'GEOMETRY' && /reach or cross the retained bend-to-outlet join/.test(error.message));
  const stock = evaluateCadPart(document()), brep = stock.outputs[0].brep;
  for (const distance of [-10, -11]) assert.throws(() => reevaluate(stock, { document: document(distance) }), /reach or cross the retained bend-to-outlet join/);
  for (const distance of [0, NaN, Infinity, 10001])
    assert.throws(() => offsetExactPerpendicularAnnularOutletIfAdmitted(brep, 'w.end', input(), distance), /distance must be nonzero and within the modeling range/);
  assert.throws(() => offsetExactPerpendicularAnnularOutletIfAdmitted(brep, 'w.end', input(), Number.MIN_VALUE), /distance is too small to move the outlet/);
  assert.throws(() => offsetExactPerpendicularAnnularOutletIfAdmitted(brep, 'w.end', input(), 9973), /path coordinates must be within/);
  assert.equal(saveCadPart(initial), saved);
});

test('stale retained geometry, profile and incomplete or changed cap/joint authority cannot authorize an outlet', () => {
  const initial = evaluateCadPart(document()), brep = initial.outputs[0].brep, saved = saveCadPart(initial);
  for (const face of ['w.start', 'w.tail.side[e0]#1', 'w.second.side[e0]#1']) {
    assert.equal(exactPerpendicularAnnularOutletOffsetFrame(brep, face, minimal()), undefined);
    assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(brep, face, input(), 4), undefined);
  }
  assert.equal(exactPerpendicularAnnularOutletOffsetFrame(brep, 'w.end', { ...minimal(), id: 'stale' }), undefined);
  assert.equal(exactPerpendicularAnnularOutletOffsetFrame(brep, 'w.end', { ...minimal(), mode: 'exact-straight' }), undefined);
  const staleRail = rail(); staleRail.controlPoints[0][0] -= 1; staleRail.controlPoints[1][0] -= .5;
  assert.equal(exactPerpendicularAnnularOutletOffsetFrame(brep, 'w.end', minimal(staleRail)), undefined);
  assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(brep, 'w.end', input(staleRail), 4), undefined);
  assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(brep, 'w.end', { ...input(), holes: [[circle(1.1, 'cw')]] }, 4), undefined);
  const metadata = structuredClone(brep); metadata.vertices[0].tolerance *= 2;
  assert.ok(checkBrep(metadata, { strict: true }).valid);
  assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(metadata, 'w.end', input(), 4), undefined);
  const caps = ['w.start', 'w.end'].map(name => brep.faces.find(face => face.name === name));
  const required = [...caps.map(cap => brep.coedges.find(use => cap.loops.includes(use.loop))),
    brep.coedges.find(use => use.edge === joints(brep).at(-1).id)];
  for (const selected of [...required, brep.coedges.find(use => use.id === required[1].twin)]) {
    for (const pcurve of [null, { ...selected.pcurve, controlPoints: selected.pcurve.controlPoints.map(([u, v, z]) => [u + .001, v, z]) }]) {
      const changed = { ...brep, coedges: brep.coedges.map(use => use.id === selected.id ? { ...use, pcurve } : use) };
      assert.equal(exactPerpendicularAnnularOutletOffsetFrame(changed, 'w.end', minimal()), undefined);
      assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(changed, 'w.end', input(), 4), undefined);
    }
  }
  assert.equal(saveCadPart(initial), saved);
});

test('disk, one-ended and prior-offset bodies do not acquire this original outlet authority', () => {
  const disk = document(); delete disk.features[0].holes; disk.features[0].sideTags = { outer: ['e0'] };
  const body = evaluateCadPart(disk).outputs[0].brep;
  assert.equal(exactPerpendicularAnnularOutletOffsetFrame(body, 'w.end', minimal()), undefined);
  assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(body, 'w.end', { ...input(), holes: [] }, 4), undefined);
  const shorter = document(); shorter.features[1].path.controlPoints.splice(0, 2); shorter.features[1].path.weights.splice(0, 2);
  shorter.features[1].path.knots = [0, 0, 0, 1, 1, 2, 2, 3, 3, 3];
  const oneEnd = evaluateCadPart(shorter).outputs[0].brep;
  assert.equal(exactPerpendicularAnnularOutletOffsetFrame(oneEnd, 'w.end', minimal(shorter.features[1].path)), undefined);
  assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(oneEnd, 'w.end', input(shorter.features[1].path), 4), undefined);
  const moved = evaluateCadPart(document(4)).outputs[0].brep;
  assert.equal(offsetExactPerpendicularAnnularOutletIfAdmitted(moved, 'w.end', input(), 1), undefined);
  assert.equal(offsetExactPerpendicularAnnularInletIfAdmitted(moved, 'w.start', input(), 1), undefined);
  const nested = document(4); nested.features.push({ id: 'second', kind: 'offset-face', target: 'move', face: 'w.start', distance: 1 });
  assert.throws(() => evaluateCadPart(nested));
});
