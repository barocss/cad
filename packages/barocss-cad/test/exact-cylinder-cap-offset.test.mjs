import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, evaluateCurve, faceGeometry } from '../dist/index.js';
import { exactSemicylinderCapOffsetFrame, exactSemicylinderCapReplacementFrame, offsetExactSemicylinderCapIfAdmitted,
  replaceExactSemicylinderCapIfAdmitted } from '../dist/features/exact-cylinder-cap-offset.js';

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
const withReplacement = (base, plane, face = 'h.v-max', target = 'h') => ({ ...base,
  features: [...base.features, { id: 'replace', kind: 'replace-face', target, face, plane }],
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

for (const sign of [1, -1]) for (const distance of [2, -3]) test(`original Exact semicylinder ${sign === 1 ? 'upper' : 'lower'} Offset ${distance} preserves native supports and topology`, () => {
  const base = doc(), source = freeze(body(base, 'h')), saved = structuredClone(source), recipe = structuredClone(base);
  const movingFace = sign === 1 ? 'h.v-max' : 'h.v-min', fixedFace = sign === 1 ? 'h.v-min' : 'h.v-max';
  const station = sign === 1 ? 12 : 0, next = station + sign * distance;
  assert.deepEqual(exactSemicylinderCapOffsetFrame(source, movingFace, sourceOf(base)), { anchor: [20, 29, station], normal: [0, 0, sign] });
  const result = body(withOffset(base, distance, movingFace), 'move'), height = 12 + distance;
  const lo = sign === 1 ? 0 : next, hi = sign === 1 ? next : 12;
  const report = checkBrep(result, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
  assert.deepEqual(incidence(result), incidence(source));
  assert.deepEqual(result.faces.find(face => face.name === fixedFace), source.faces.find(face => face.name === fixedFace));
  assert.deepEqual(result.coedges, source.coedges);
  const expectedPoint = point => [point[0], point[1], point[2] === station ? next : point[2]];
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
  const top = result.faces.find(face => face.name === movingFace), plane = faceGeometry(top);
  assert.equal(plane.kind, 'plane'); assert.deepEqual(plane.n, [0, 0, sign]); near(plane.o[2], next);
  const loop = result.loops.find(loop => loop.id === top.loops[0]);
  const rims = loop.coedges.map(id => result.edges.find(edge => edge.id === result.coedges.find(use => use.id === id).edge));
  assert.deepEqual(rims.map(edge => edge.curve.degree).sort(), [1, 1, 2, 2]);
  for (const edge of rims) for (const t of [0, .17, .5, .83, 1]) {
    const point = evaluateCurve(edge.curve, t);
    near(point[2], next);
    if (edge.curve.degree === 2) {
      const radius = Math.round(Math.hypot(edge.curve.controlPoints[0][0] - 20, edge.curve.controlPoints[0][1] - 20));
      near(Math.hypot(point[0] - 20, point[1] - 20), radius); assert.ok(point[1] >= 20 - 1e-9);
    } else near(point[1], 20);
  }
  // Independent semicircular-annulus area and first moment, without a production geometry predicate.
  const area = Math.PI * (10 ** 2 - 8 ** 2) / 2, mass = brepMassProperties(result, 1);
  near(mass.volume, area * height, 1e-7);
  near(mass.volume - brepMassProperties(source, 1).volume, area * distance, 1e-7);
  mass.centroid.forEach((value, axis) => near(value, [20, 20 + 488 / (27 * Math.PI), (lo + hi) / 2][axis]));
  assert.deepEqual(source, saved); assert.deepEqual(base, recipe);
});

test('axial-cap admission rejects side faces, a stale source, changed geometry and a quarter source', () => {
  const base = doc(), source = body(base), input = sourceOf(base);
  for (const face of ['h.normal', 'h.reverse', 'h.u-min', 'h.u-max', 'h.v-max#1', 'h.v-min#1', 'missing']) {
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
  assert.throws(() => body(withOffset(quarterDoc, 2)), /original axial cap/);
});

test('signed axial Offset refuses collapse, an unchanged station, range overflow, transforms and chains', () => {
  const base = doc(), original = structuredClone(base), native = body(base), source = sourceOf(base);
  for (const face of ['h.v-max', 'h.v-min']) for (const distance of [-12, -13, -12 + 1e-8])
    assert.throws(() => body(withOffset(base, distance, face)), /reach or cross the opposite cap/);
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
  assert.deepEqual(exactSemicylinderCapOffsetFrame(source, 'h.v-max', sourceOf(reversed)), { anchor: [20, 31, 0], normal: [0, 0, -1] });
  const frame = exactSemicylinderCapOffsetFrame(source, 'h.v-min', sourceOf(reversed));
  assert.equal(frame.anchor[2], 12); assert.deepEqual(frame.normal, [0, 0, 1]);
  const result = body(withOffset(reversed, -3, 'h.v-min'));
  const cap = faceGeometry(result.faces.find(face => face.name === 'h.v-min'));
  assert.equal(cap.kind, 'plane'); assert.deepEqual(cap.n, [0, 0, 1]); near(cap.o[2], 9);
  for (const distance of [2, -3]) {
    const lower = body(withOffset(reversed, distance, 'h.v-max'));
    const lowerCap = faceGeometry(lower.faces.find(face => face.name === 'h.v-max'));
    assert.equal(lowerCap.kind, 'plane'); assert.deepEqual(lowerCap.n, [0, 0, -1]); near(lowerCap.o[2], -distance);
    near(Math.max(...lower.vertices.map(vertex => vertex.point[2])), 12);
    near(brepMassProperties(lower, 1).volume, Math.PI * (12 ** 2 - 10 ** 2) / 2 * (12 + distance), 1e-7);
  }
});

for (const [k, height] of [[.5, 12], [-.25, 14]]) test(`original upper cap Replace face follows z=${k}(x-20)+${height} with native supports`, () => {
  const base = doc(), source = freeze(body(base)), before = structuredClone(source);
  const plane = { origin: [20, 20, height], normal: [-k, 0, 1] };
  assert.deepEqual(exactSemicylinderCapReplacementFrame(source, 'h.v-max', sourceOf(base)), { anchor: [20, 29, 12], normal: [0, 0, 1] });
  const result = body(withReplacement(base, plane), 'replace'), report = checkBrep(result, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-8 && report.maximumEdgeSurfaceGap < 1e-8);
  const identity = brep => ({ ...incidence(brep), coedges: brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]) });
  assert.deepEqual(identity(result), identity(source));
  assert.deepEqual(result.faces.find(face => face.name === 'h.v-min'), source.faces.find(face => face.name === 'h.v-min'));
  for (const vertex of result.vertices) {
    const original = source.vertices.find(value => value.id === vertex.id).point;
    assert.deepEqual(vertex.point, [original[0], original[1], original[2] === 12 ? k * (original[0] - 20) + height : 0]);
  }
  for (const face of result.faces) {
    const original = source.faces.find(value => value.id === face.id), geometry = faceGeometry(face), old = faceGeometry(original);
    if (face.name === 'h.v-max') {
      assert.equal(geometry.kind, 'plane');
      geometry.n.forEach((value, axis) => near(value, plane.normal[axis] / Math.hypot(...plane.normal)));
      continue;
    }
    assert.equal(geometry.kind, old.kind);
    if (geometry.kind === 'cylinder') {
      near(geometry.r, old.r); assert.deepEqual(geometry.a, old.a); assert.equal(geometry.out, old.out);
      geometry.c.forEach((value, axis) => near(value, old.c[axis]));
    } else if (geometry.kind === 'plane') {
      geometry.n.forEach((value, axis) => near(value, old.n[axis]));
      near(geometry.o.reduce((sum, value, axis) => sum + (value - old.o[axis]) * old.n[axis], 0), 0);
    }
  }
  const cap = result.faces.find(face => face.name === 'h.v-max');
  const loop = result.loops.find(loop => loop.id === cap.loops[0]);
  for (const id of loop.coedges) {
    const use = result.coedges.find(use => use.id === id), edge = result.edges.find(edge => edge.id === use.edge);
    for (const t of [0, .13, .5, .81, 1]) {
      const point = evaluateCurve(edge.curve, t);
      near(point[2], k * (point[0] - 20) + height);
    }
  }
  const mass = brepMassProperties(result, 1);
  near(mass.volume, 18 * Math.PI * height, 1e-7);
  near(mass.centroid[0], 20 + 41 * k / height);
  near(mass.centroid[1], 20 + 488 / (27 * Math.PI));
  near(mass.centroid[2], height / 2 + 41 * k ** 2 / (2 * height));
  assert.deepEqual(source, before);
});

test('upper Replace face admits both tilt components and proves extrema on the actual outer half disk', () => {
  const base = doc(), plane = { origin: [20, 20, 2], normal: [-.1, -1, 1] };
  // Full-circle extrema would wrongly reject this half-disk: its actual minimum is 2 - .1*10 = 1.
  const result = body(withReplacement(base, plane)), mass = brepMassProperties(result, 1);
  near(mass.volume, 18 * Math.PI * 2 + 976 / 3, 1e-7);
  assert.ok(checkBrep(result, { strict: true }).valid);
  const reversed = raw(); reversed.controlPoints.forEach(row => row.reverse());
  const reverseDoc = doc(reversed), source = body(reverseDoc), input = sourceOf(reverseDoc);
  assert.equal(exactSemicylinderCapReplacementFrame(source, 'h.v-max', input), undefined);
  assert.ok(exactSemicylinderCapReplacementFrame(source, 'h.v-min', input));
  const reverseResult = body(withReplacement(reverseDoc, { origin: [20, 20, 12], normal: [-.25, 0, 1] }, 'h.v-min'));
  near(brepMassProperties(reverseResult, 1).volume, 22 * Math.PI * 12, 1e-7);
});

test('upper Replace face refuses lower/side caps, stale sources, collapse, parallel and perpendicular planes', () => {
  const base = doc(), source = body(base), input = sourceOf(base), plane = { origin: [20, 20, 12], normal: [-.5, 0, 1] };
  for (const face of ['h.v-min', 'h.u-min', 'h.normal']) {
    assert.equal(exactSemicylinderCapReplacementFrame(source, face, input), undefined);
    assert.throws(() => body(withReplacement(base, plane, face)), /original upper cap/);
  }
  assert.equal(replaceExactSemicylinderCapIfAdmitted(source, 'h.v-max', { ...input, thickness: 3 }, plane), undefined);
  for (const [targetPlane, pattern] of [
    [{ origin: [20, 20, 5], normal: [-1, 0, 1] }, /opposite cap/],
    [{ origin: [20, 20, 12], normal: [0, 0, 1] }, /tilt is too small/],
    [{ origin: [20, 20, 15], normal: [0, 0, -1] }, /tilt is too small/],
    [{ origin: [20, 20, 12], normal: [1, 0, 0] }, /perpendicular/],
    [{ origin: [20, 20, 9999], normal: [-1, 0, 1] }, /coordinate range/],
  ]) assert.throws(() => body(withReplacement(base, targetPlane)), pattern);
  const placed = { ...base, features: [...base.features, { id: 'placed', kind: 'translate', target: 'h', offset: [0, 0, 0] }] };
  assert.throws(() => body(withReplacement(placed, plane, 'h.v-max', 'placed')));
  const afterOffset = withOffset(base, 2);
  assert.throws(() => body(withReplacement(afterOffset, plane, 'h.v-max', 'move')));
});
