import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, evaluateCurve, faceGeometry } from '../dist/index.js';
import { exactSemicylinderCapOffsetFrame, offsetExactSemicylinderCapIfAdmitted } from '../dist/features/exact-cylinder-cap-offset.js';

const raw = () => ({
  degreeU: 2, degreeV: 1, knotsU: [0, 0, 0, 1, 1, 2, 2, 2], knotsV: [0, 0, 1, 1],
  controlPoints: [[30, 20], [30, 30], [20, 30], [10, 30], [10, 20]].map(([x, y]) => [[x, y, 0], [x, y, 12]]),
  weights: [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1].map(weight => [weight, weight]),
});
const doc = surface => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
  { id: 'h', kind: 'thicken', surface: surface ?? raw(), thickness: 2, side: 'reverse', mode: 'exact-cylinder' },
] });
const withOffset = (base, distance, face = 'h.v-max', target = 'h') => ({ ...base,
  features: [...base.features, { id: 'move', kind: 'offset-face', target, face, distance }],
});
const body = (spec, id) => {
  const outputs = evaluateCadPart(spec).outputs;
  assert.equal(outputs.length, 1);
  if (id) assert.equal(outputs[0].id, id);
  return outputs[0].brep;
};
const sourceOf = spec => ({ id: 'h', surface: { ...spec.features[0].surface, kind: 'surface', id: 'surface' }, thickness: 2, side: 'reverse' });
const near = (actual, expected, tolerance = 1e-8) => assert.ok(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const freeze = value => {
  if (value && typeof value === 'object') { Object.values(value).forEach(freeze); Object.freeze(value); }
  return value;
};
const incidence = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops, coedges: brep.coedges,
  faces: brep.faces.map(({ surface, ...face }) => [face, surface.id]),
  edges: brep.edges.map(({ curve, ...edge }) => [edge, curve.id]),
  vertices: brep.vertices.map(({ point: _point, ...vertex }) => vertex),
});

for (const distance of [2, -3]) test(`original Exact semicylinder upper Offset ${distance} preserves native supports and topology`, () => {
  const base = doc(), source = freeze(body(base, 'h')), saved = structuredClone(source), recipe = structuredClone(base);
  assert.deepEqual(exactSemicylinderCapOffsetFrame(source, 'h.v-max', sourceOf(base)), { anchor: [20, 29, 12], normal: [0, 0, 1] });
  const result = body(withOffset(base, distance), 'move'), height = 12 + distance;
  const report = checkBrep(result, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
  assert.deepEqual(incidence(result), incidence(source));
  assert.deepEqual(result.faces.find(face => face.name === 'h.v-min'), source.faces.find(face => face.name === 'h.v-min'));
  assert.deepEqual(result.coedges, source.coedges);
  const expectedPoint = point => [point[0], point[1], point[2] === 12 ? height : point[2]];
  for (const vertex of result.vertices) assert.deepEqual(vertex.point, expectedPoint(source.vertices.find(v => v.id === vertex.id).point));
  for (const edge of result.edges) {
    const original = source.edges.find(e => e.id === edge.id);
    assert.deepEqual(edge.curve, { ...original.curve, controlPoints: original.curve.controlPoints.map(expectedPoint) });
  }
  for (const face of result.faces) {
    const original = source.faces.find(f => f.id === face.id);
    assert.deepEqual(face.surface, { ...original.surface, controlPoints: original.surface.controlPoints.map(row => row.map(expectedPoint)) });
  }
  for (const [name, radius, out] of [['h.normal', 10, 1], ['h.reverse', 8, -1]]) {
    const geometry = faceGeometry(result.faces.find(face => face.name === name));
    assert.equal(geometry.kind, 'cylinder');
    assert.deepEqual(geometry.a, [0, 0, 1]);
    assert.equal(geometry.out, out);
    near(geometry.r, radius); near(geometry.c[0], 20); near(geometry.c[1], 20);
  }
  const top = result.faces.find(face => face.name === 'h.v-max'), plane = faceGeometry(top);
  assert.equal(plane.kind, 'plane'); assert.deepEqual(plane.n, [0, 0, 1]); near(plane.o[2], height);
  const loop = result.loops.find(loop => loop.id === top.loops[0]);
  const rims = loop.coedges.map(id => result.edges.find(edge => edge.id === result.coedges.find(use => use.id === id).edge));
  assert.deepEqual(rims.map(edge => edge.curve.degree).sort(), [1, 1, 2, 2]);
  for (const edge of rims) for (const t of [0, .17, .5, .83, 1]) {
    const point = evaluateCurve(edge.curve, t);
    near(point[2], height);
    if (edge.curve.degree === 2) {
      const radius = Math.round(Math.hypot(edge.curve.controlPoints[0][0] - 20, edge.curve.controlPoints[0][1] - 20));
      near(Math.hypot(point[0] - 20, point[1] - 20), radius); assert.ok(point[1] >= 20 - 1e-9);
    } else near(point[1], 20);
  }
  // Independent semicircular-annulus area and first moment, without a production geometry predicate.
  const area = Math.PI * (10 ** 2 - 8 ** 2) / 2, mass = brepMassProperties(result, 1);
  near(mass.volume, area * height, 1e-7);
  near(mass.volume - brepMassProperties(source, 1).volume, area * distance, 1e-7);
  mass.centroid.forEach((value, axis) => near(value, [20, 20 + 488 / (27 * Math.PI), height / 2][axis]));
  assert.deepEqual(source, saved); assert.deepEqual(base, recipe);
});

test('upper-cap admission rejects another cap, a stale source, changed geometry and a quarter source', () => {
  const base = doc(), source = body(base), input = sourceOf(base);
  for (const face of ['h.v-min', 'h.normal', 'h.reverse', 'h.u-min', 'h.u-max', 'h.v-max#1', 'missing']) {
    assert.equal(exactSemicylinderCapOffsetFrame(source, face, input), undefined);
    assert.throws(() => body(withOffset(base, 2, face)));
  }
  const staleSurface = structuredClone(input.surface);
  staleSurface.controlPoints.forEach(row => { row[1][2] = 14; });
  for (const stale of [{ ...input, id: 'other' }, { ...input, thickness: 3 }, { ...input, side: 'normal' }, { ...input, surface: staleSurface }])
    assert.equal(exactSemicylinderCapOffsetFrame(source, 'h.v-max', stale), undefined);
  const altered = structuredClone(source); altered.edges[0].curve.controlPoints[0][0] += .01;
  assert.equal(exactSemicylinderCapOffsetFrame(altered, 'h.v-max', input), undefined);
  const quarter = raw(); quarter.controlPoints.length = quarter.weights.length = 3; quarter.knotsU = [0, 0, 0, 1, 1, 1];
  const quarterDoc = doc(quarter), quarterBody = body(quarterDoc);
  assert.equal(exactSemicylinderCapOffsetFrame(quarterBody, 'h.v-max', sourceOf(quarterDoc)), undefined);
  assert.throws(() => body(withOffset(quarterDoc, 2)), /original upper cap/);
});

test('signed upper Offset refuses collapse, an unchanged station, range overflow, transforms and chains', () => {
  const base = doc(), original = structuredClone(base), native = body(base), source = sourceOf(base);
  for (const distance of [-12, -13, -12 + 1e-8]) assert.throws(() => body(withOffset(base, distance)), /reach or cross the opposite cap/);
  assert.throws(() => body(withOffset(base, Number.MIN_VALUE)), /too small to move/);
  assert.throws(() => body(withOffset(base, 10000)), /modeling range/);
  for (const distance of [0, NaN, Infinity, -Infinity, 10001]) {
    assert.throws(() => body(withOffset(base, distance)), /nonzero signed distance/);
    assert.throws(() => offsetExactSemicylinderCapIfAdmitted(native, 'h.v-max', source, distance), /nonzero.*modeling range/);
  }
  const chain = withOffset(base, 2); chain.features.push({ id: 'again', kind: 'offset-face', target: 'move', face: 'h.v-max', distance: -3 });
  assert.throws(() => body(chain));
  const moved = { ...base, features: [...base.features, { id: 'placed', kind: 'translate', target: 'h', offset: [0, 0, 0] }] };
  assert.throws(() => body(withOffset(moved, 2, 'h.v-max', 'placed')));
  const sampled = doc(); delete sampled.features[0].mode;
  assert.throws(() => body(withOffset(sampled, 2)));
  assert.deepEqual(base, original);
});

test('existing Exact planar Thicken cap offset continues through its original fallback', () => {
  const base = doc({ degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
    controlPoints: [[[0, 0, 0], [0, 30, 0]], [[40, 0, 0], [40, 30, 0]]], weights: [[1, 1], [1, 1]] });
  base.features[0].mode = 'exact-planar';
  const original = body(base), top = original.faces.find(face => {
    const geometry = faceGeometry(face);
    return geometry.kind === 'plane' && geometry.n[2] === 1;
  });
  assert.ok(top);
  const result = body(withOffset(base, 2, top.name));
  near(brepMassProperties(result, 1).volume - brepMassProperties(original, 1).volume, 40 * 30 * 2);
});

test('resolved Thicken parameter and reversed V retain original source-relative cap ownership', () => {
  const base = doc(); base.parameters = { T: 2 }; base.features[0].thickness = { parameter: 'T' };
  near(brepMassProperties(body(withOffset(base, 2)), 1).volume, 252 * Math.PI, 1e-7);
  const surface = raw(); surface.controlPoints.forEach(row => row.reverse());
  const reversed = doc(surface), source = body(reversed);
  assert.equal(exactSemicylinderCapOffsetFrame(source, 'h.v-max', sourceOf(reversed)), undefined);
  const frame = exactSemicylinderCapOffsetFrame(source, 'h.v-min', sourceOf(reversed));
  assert.equal(frame.anchor[2], 12); assert.deepEqual(frame.normal, [0, 0, 1]);
  const result = body(withOffset(reversed, -3, 'h.v-min'));
  const cap = faceGeometry(result.faces.find(face => face.name === 'h.v-min'));
  assert.equal(cap.kind, 'plane'); assert.deepEqual(cap.n, [0, 0, 1]); near(cap.o[2], 9);
});
