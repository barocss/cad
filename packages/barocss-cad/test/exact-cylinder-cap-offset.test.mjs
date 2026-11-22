import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, evaluateCurve, faceGeometry } from '../dist/index.js';
import { exactSemicylinderCapOffsetFrame, exactSemicylinderCapReplacementFrame, offsetExactSemicylinderCapIfAdmitted,
  exactSemicylinderOuterWallOffsetFrame, offsetExactSemicylinderOuterWallIfAdmitted,
  exactSemicylinderWallOffsetFrame, offsetExactSemicylinderWallIfAdmitted,
  exactSemicylinderSecondWallOffsetFrame, offsetExactSemicylinderSecondWallIfAdmitted,
  exactSemicylinderMixedOffsetFrame, offsetExactSemicylinderMixedOffsetIfAdmitted,
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
  for (const face of ['h.u-min', 'h.u-max', 'h.v-max#1', 'h.v-min#1', 'missing']) {
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

for (const skin of ['outer', 'inner']) for (const reverseV of [false, true]) for (const distance of skin === 'outer' ? [1.25, -.75, .3] : [1, -1, .3]) test(`original physical ${skin} wall Offset ${distance}, reverse V ${reverseV}, preserves opposite support and native identity`, () => {
  const surface = raw(); if (reverseV) surface.controlPoints.forEach(row => row.reverse());
  const base = doc(surface), source = freeze(body(base)), input = sourceOf(base), saved = structuredClone(source);
  const outerName = reverseV ? 'h.reverse' : 'h.normal', innerName = reverseV ? 'h.normal' : 'h.reverse';
  const oldOuter = reverseV ? 12 : 10, oldInner = reverseV ? 10 : 8;
  const outerRadius = skin === 'outer' ? oldOuter + distance : oldOuter, innerRadius = skin === 'inner' ? oldInner - distance : oldInner;
  const movingName = skin === 'outer' ? outerName : innerName, fixedName = skin === 'outer' ? innerName : outerName;
  const oldRadius = skin === 'outer' ? oldOuter : oldInner, radius = skin === 'outer' ? outerRadius : innerRadius;
  const frame = { anchor: [20, 20 + oldRadius, 6], normal: [0, skin === 'outer' ? 1 : -1, 0] };
  assert.deepEqual(exactSemicylinderWallOffsetFrame(source, movingName, input), frame);
  if (skin === 'outer') {
    assert.deepEqual(exactSemicylinderOuterWallOffsetFrame(source, movingName, input), frame);
    assert.deepEqual(offsetExactSemicylinderOuterWallIfAdmitted(source, movingName, input, distance),
      offsetExactSemicylinderWallIfAdmitted(source, movingName, input, distance));
  } else assert.equal(exactSemicylinderOuterWallOffsetFrame(source, movingName, input), undefined);
  const result = body(withOffset(base, distance, movingName), 'move'), report = checkBrep(result, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-8 && report.maximumEdgeSurfaceGap < 1e-8);
  const identity = brep => ({ ...incidence(brep), coedges: brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]) });
  assert.deepEqual(identity(result), identity(source));
  const fixed = source.faces.find(face => face.name === fixedName);
  assert.deepEqual(result.faces.find(face => face.id === fixed.id), fixed);
  const fixedUses = source.coedges.filter(use => fixed.loops.includes(use.loop));
  const fixedEdgeIds = new Set(fixedUses.map(use => use.edge));
  const fixedVertexIds = new Set(source.edges.filter(edge => fixedEdgeIds.has(edge.id)).flatMap(edge => edge.vertices));
  for (const edge of source.edges.filter(edge => fixedEdgeIds.has(edge.id))) assert.deepEqual(result.edges.find(value => value.id === edge.id), edge);
  for (const vertex of source.vertices.filter(vertex => fixedVertexIds.has(vertex.id))) assert.deepEqual(result.vertices.find(value => value.id === vertex.id), vertex);
  for (const face of result.faces) {
    const geometry = faceGeometry(face), before = faceGeometry(source.faces.find(value => value.id === face.id));
    assert.equal(geometry.kind, before.kind);
    if (geometry.kind === 'cylinder') {
      near(geometry.r, face.name === outerName ? outerRadius : innerRadius);
      assert.deepEqual(geometry.a, before.a); assert.equal(geometry.out, before.out);
      geometry.c.forEach((value, axis) => near(value, before.c[axis]));
    } else {
      geometry.n.forEach((value, axis) => near(value, before.n[axis]));
      near(geometry.o.reduce((sum, value, axis) => sum + (value - before.o[axis]) * before.n[axis], 0), 0);
    }
  }
  assert.deepEqual([...new Set(result.vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b), [0, 12]);
  const moving = result.faces.find(face => face.name === movingName), movingLoops = new Set(moving.loops);
  const movingEdges = new Set(result.coedges.filter(use => movingLoops.has(use.loop)).map(use => use.edge));
  for (const edge of result.edges.filter(edge => movingEdges.has(edge.id))) for (const t of [0, .17, .5, .83, 1]) {
    const [x, y] = evaluateCurve(edge.curve, t);
    near(Math.hypot(x - 20, y - 20), radius);
  }
  // Independent half-annulus volume and first moments; no production frame supplies the oracle.
  const area = Math.PI * (outerRadius ** 2 - innerRadius ** 2) / 2, mass = brepMassProperties(result, 1);
  const meanY = 4 * (outerRadius ** 3 - innerRadius ** 3) / (3 * Math.PI * (outerRadius ** 2 - innerRadius ** 2));
  near(mass.volume, 12 * area, 1e-7);
  mass.centroid.forEach((value, axis) => near(value, [20, 20 + meanY, 6][axis]));
  assert.deepEqual(source, saved);
});

test('outer wall Offset rejects retained inner skin, stale ownership, contact, range and chained operations', () => {
  const base = doc(), source = body(base), input = sourceOf(base);
  for (const face of ['h.reverse', 'h.u-min', 'h.u-max', 'h.v-min', 'h.v-max', 'h.normal#1', 'missing']) {
    assert.equal(exactSemicylinderOuterWallOffsetFrame(source, face, input), undefined);
    assert.equal(offsetExactSemicylinderOuterWallIfAdmitted(source, face, input, 1), undefined);
  }
  assert.equal(exactSemicylinderOuterWallOffsetFrame(source, 'h.normal', { ...input, thickness: 3 }), undefined);
  for (const distance of [-2, -3, -2 + 1e-8]) assert.throws(() => body(withOffset(base, distance, 'h.normal')), /retained inner wall/);
  assert.throws(() => body(withOffset(base, Number.MIN_VALUE, 'h.normal')), /too small to move/);
  assert.throws(() => body(withOffset(base, 10000, 'h.normal')), /modeling range/);
  const chain = withOffset(base, 1, 'h.normal');
  chain.features.push({ id: 'again', kind: 'offset-face', target: 'move', face: 'h.normal', distance: 1 });
  assert.throws(() => body(chain));
  const axial = withOffset(base, 2, 'h.v-min');
  axial.features.push({ id: 'radial', kind: 'offset-face', target: 'move', face: 'h.normal', distance: 1 });
  assert.throws(() => body(axial));
});

test('inner wall Offset rejects axis contact, retained outer contact, stale source and chained edits', () => {
  for (const reverseV of [false, true]) {
    const surface = raw(); if (reverseV) surface.controlPoints.forEach(row => row.reverse());
    const base = doc(surface), source = body(base), input = sourceOf(base);
    const face = reverseV ? 'h.normal' : 'h.reverse', originalRadius = reverseV ? 10 : 8;
    for (const distance of [originalRadius, originalRadius + 1, originalRadius - 1e-8])
      assert.throws(() => body(withOffset(base, distance, face)), /cylinder axis/);
    for (const distance of [-2, -3, -2 + 1e-8])
      assert.throws(() => body(withOffset(base, distance, face)), /retained outer wall/);
    assert.throws(() => body(withOffset(base, Number.MIN_VALUE, face)), /too small to move/);
    assert.equal(exactSemicylinderWallOffsetFrame(source, face, { ...input, thickness: 3 }), undefined);
    for (const distance of [0, NaN, Infinity, -Infinity, 10001])
      assert.throws(() => offsetExactSemicylinderWallIfAdmitted(source, face, input, distance), /nonzero.*modeling range/);
    for (const wrong of ['h.u-min', 'h.u-max', 'h.v-min', 'h.v-max', `${face}#1`, 'missing']) {
      assert.equal(exactSemicylinderWallOffsetFrame(source, wrong, input), undefined);
      assert.equal(offsetExactSemicylinderWallIfAdmitted(source, wrong, input, 1), undefined);
    }
    const altered = structuredClone(source); altered.vertices[0].point[0] += .01;
    assert.equal(exactSemicylinderWallOffsetFrame(altered, face, input), undefined);
    const sameSkin = withOffset(base, 1, face);
    sameSkin.features.push({ id: 'again', kind: 'offset-face', target: 'move', face, distance: 1 });
    assert.throws(() => body(sameSkin));
  }
});

const withSecondWall = (base, prior, face, distance) => ({ ...base,
  features: [...withOffset(base, prior.distance, prior.face).features,
    { id: 'second', kind: 'offset-face', target: 'move', face, distance }],
});

for (const firstSkin of ['outer', 'inner']) for (const reverseV of [false, true]) for (const [firstDistance, distance] of [[1, 1], [.3, -.5], [-.5, .3]])
  test(`second opposite wall Offset after ${firstSkin} ${firstDistance}, then ${distance}, reverse V ${reverseV}`, () => {
    const surface = raw(); if (reverseV) surface.controlPoints.forEach(row => row.reverse());
    const base = doc(surface), source = freeze(body(base)), input = sourceOf(base);
    const outerName = reverseV ? 'h.reverse' : 'h.normal', innerName = reverseV ? 'h.normal' : 'h.reverse';
    const prior = { face: firstSkin === 'outer' ? outerName : innerName, distance: firstDistance };
    const face = firstSkin === 'outer' ? innerName : outerName;
    const current = freeze(body(withOffset(base, prior.distance, prior.face))), saved = structuredClone(current);
    const movingOriginalRadius = firstSkin === 'outer' ? reverseV ? 10 : 8 : reverseV ? 12 : 10;
    assert.deepEqual(exactSemicylinderSecondWallOffsetFrame(current, face, input, prior), {
      anchor: [20, 20 + movingOriginalRadius, 6], normal: [0, firstSkin === 'outer' ? -1 : 1, 0],
    });
    const result = body(withSecondWall(base, prior, face, distance), 'second');
    assert.deepEqual(offsetExactSemicylinderSecondWallIfAdmitted(current, face, input, prior, distance), result);
    const report = checkBrep(result, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 0);
    const identity = brep => ({ ...incidence(brep), coedges: brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]) });
    assert.deepEqual(identity(result), identity(source));
    const retained = current.faces.find(value => value.name === prior.face);
    assert.deepEqual(result.faces.find(value => value.id === retained.id), retained);
    const edges = new Set(current.coedges.filter(use => retained.loops.includes(use.loop)).map(use => use.edge));
    const vertices = new Set(current.edges.filter(edge => edges.has(edge.id)).flatMap(edge => edge.vertices));
    for (const edge of current.edges.filter(edge => edges.has(edge.id))) assert.deepEqual(result.edges.find(value => value.id === edge.id), edge);
    for (const vertex of current.vertices.filter(vertex => vertices.has(vertex.id))) assert.deepEqual(result.vertices.find(value => value.id === vertex.id), vertex);
    const outerRadius = (reverseV ? 12 : 10) + (firstSkin === 'outer' ? firstDistance : distance);
    const innerRadius = (reverseV ? 10 : 8) - (firstSkin === 'inner' ? firstDistance : distance);
    for (const name of [outerName, innerName]) {
      const support = faceGeometry(result.faces.find(face => face.name === name));
      assert.equal(support.kind, 'cylinder'); near(support.r, name === outerName ? outerRadius : innerRadius);
      assert.deepEqual(support.a, [0, 0, 1]); near(support.c[0], 20); near(support.c[1], 20);
    }
    assert.deepEqual([...new Set(result.vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b), [0, 12]);
    // Independent half-annulus volume and centroid for the two final physical radii.
    const area = Math.PI * (outerRadius ** 2 - innerRadius ** 2) / 2, mass = brepMassProperties(result, 1);
    const meanY = 4 * (outerRadius ** 3 - innerRadius ** 3) / (3 * Math.PI * (outerRadius ** 2 - innerRadius ** 2));
    near(mass.volume, area * 12, 1e-7);
    mass.centroid.forEach((value, axis) => near(value, [20, 20 + meanY, 6][axis]));
    assert.deepEqual(current, saved);
  });

test('second wall requires exact source, first recipe, current boundary and opposite target', () => {
  const base = doc(), input = sourceOf(base), prior = { face: 'h.normal', distance: 1 };
  const current = body(withOffset(base, prior.distance, prior.face)), next = 'h.reverse';
  for (const wrongPrior of [{ ...prior, distance: .5 }, { ...prior, distance: 0 }, { ...prior, distance: NaN },
    { ...prior, face: 'h.v-max' }, { ...prior, face: next }, { ...prior, other: true }])
    assert.equal(exactSemicylinderSecondWallOffsetFrame(current, next, input, wrongPrior), undefined);
  for (const wrongSource of [{ ...input, thickness: 3 }, { ...input, id: 'other' }])
    assert.equal(exactSemicylinderSecondWallOffsetFrame(current, next, wrongSource, prior), undefined);
  const altered = structuredClone(current); altered.edges[0].curve.controlPoints[0][0] += .01;
  for (const wrongCurrent of [body(base), altered])
    assert.equal(exactSemicylinderSecondWallOffsetFrame(wrongCurrent, next, input, prior), undefined);
  for (const wrongFace of ['h.normal', 'h.v-min', 'h.u-min', 'h.reverse#1', 'missing']) {
    assert.equal(exactSemicylinderSecondWallOffsetFrame(current, wrongFace, input, prior), undefined);
    assert.throws(() => body(withSecondWall(base, prior, wrongFace, 1)), /other original physical wall|missing|name/);
  }
  for (const distance of [8, 8 - 1e-8, 9]) assert.throws(() => body(withSecondWall(base, prior, next, distance)), /cylinder axis/);
  for (const distance of [0, NaN, Infinity, 10001])
    assert.throws(() => offsetExactSemicylinderSecondWallIfAdmitted(current, next, input, prior, distance), /nonzero.*modeling range/);
  for (const firstFace of ['h.normal', 'h.reverse']) {
    const first = { face: firstFace, distance: -1 }, other = firstFace === 'h.normal' ? 'h.reverse' : 'h.normal';
    for (const distance of [-1, -1 + 1e-8])
      assert.throws(() => body(withSecondWall(base, first, other, distance)), /retained (outer|inner) wall/);
    const twice = withSecondWall(base, first, other, 1), twiceBody = body(twice);
    assert.equal(exactSemicylinderSecondWallOffsetFrame(twiceBody, other, input, first), undefined);
    for (const face of ['h.normal', 'h.reverse', 'h.v-max']) {
      const third = { ...twice, features: [...twice.features, { id: 'third', kind: 'offset-face', target: 'second', face, distance: 1 }] };
      assert.throws(() => body(third));
    }
  }
});

for (const skin of ['outer', 'inner']) for (const reverseV of [false, true]) for (const [radialDistance, axialDistance] of [[2, 3], [-.5, -2], [.3, .7]])
  test(`one ${skin} radial ${radialDistance} and upper axial ${axialDistance} commute exactly, reverse V ${reverseV}`, () => {
    const surface = raw(); if (reverseV) surface.controlPoints.forEach(row => row.reverse());
    const base = doc(surface), input = sourceOf(base), original = freeze(body(base));
    const upper = reverseV ? 'h.v-min' : 'h.v-max', lower = reverseV ? 'h.v-max' : 'h.v-min';
    const outerName = reverseV ? 'h.reverse' : 'h.normal', innerName = reverseV ? 'h.normal' : 'h.reverse';
    const radialFace = skin === 'outer' ? outerName : innerName, opposite = skin === 'outer' ? innerName : outerName;
    const oldOuter = reverseV ? 12 : 10, oldInner = reverseV ? 10 : 8;
    const outerRadius = skin === 'outer' ? oldOuter + radialDistance : oldOuter;
    const innerRadius = skin === 'inner' ? oldInner - radialDistance : oldInner, height = 12 + axialDistance;
    const results = [];
    const boundary = (brep, name) => {
      const face = brep.faces.find(face => face.name === name);
      const edges = new Set(brep.coedges.filter(use => face.loops.includes(use.loop)).map(use => use.edge));
      const vertices = new Set(brep.edges.filter(edge => edges.has(edge.id)).flatMap(edge => edge.vertices));
      return { face, edges: brep.edges.filter(edge => edges.has(edge.id)), vertices: brep.vertices.filter(vertex => vertices.has(vertex.id)) };
    };
    for (const radialFirst of [true, false]) {
      const prior = { face: radialFirst ? radialFace : upper, distance: radialFirst ? radialDistance : axialDistance };
      const next = radialFirst ? upper : radialFace, distance = radialFirst ? axialDistance : radialDistance;
      const current = freeze(body(withOffset(base, prior.distance, prior.face))), saved = structuredClone(current);
      const frame = radialFirst
        ? { anchor: [20, 20 + (outerRadius + innerRadius) / 2, 12], normal: [0, 0, 1] }
        : { anchor: [20, 20 + (skin === 'outer' ? oldOuter : oldInner), height / 2], normal: [0, skin === 'outer' ? 1 : -1, 0] };
      const actualFrame = exactSemicylinderMixedOffsetFrame(current, next, input, prior);
      assert.ok(actualFrame); actualFrame.anchor.forEach((value, axis) => near(value, frame.anchor[axis]));
      assert.deepEqual(actualFrame.normal, frame.normal);
      const result = body(withSecondWall(base, prior, next, distance), 'second'), report = checkBrep(result, { strict: true });
      assert.deepEqual(offsetExactSemicylinderMixedOffsetIfAdmitted(current, next, input, prior, distance), result);
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
      assert.equal(report.topology[0].genus, 0);
      assert.ok(report.maximumPcurveGap < 1e-8 && report.maximumEdgeSurfaceGap < 1e-8);
      const identity = brep => ({ ...incidence(brep), coedges: brep.coedges.map(({ pcurve, ...use }) => [use, pcurve?.id]) });
      assert.deepEqual(identity(result), identity(original));
      if (radialFirst) {
        assert.deepEqual(boundary(result, lower), boundary(current, lower));
        const moveZ = point => [point[0], point[1], point[2] === 12 ? height : point[2]];
        for (const edge of result.edges) {
          const before = current.edges.find(value => value.id === edge.id);
          assert.deepEqual(edge.curve, { ...before.curve, controlPoints: before.curve.controlPoints.map(moveZ) });
        }
        for (const face of result.faces) {
          const before = current.faces.find(value => value.id === face.id);
          assert.deepEqual(face.surface, { ...before.surface, controlPoints: before.surface.controlPoints.map(row => row.map(moveZ)) });
        }
      } else {
        assert.deepEqual(boundary(result, opposite), boundary(current, opposite));
        for (const edge of result.edges) assert.deepEqual(edge.curve.controlPoints.map(point => point[2]),
          current.edges.find(value => value.id === edge.id).curve.controlPoints.map(point => point[2]));
      }
      for (const [name, radius, out] of [[outerName, outerRadius, 1], [innerName, innerRadius, -1]]) {
        const support = faceGeometry(result.faces.find(face => face.name === name));
        assert.equal(support.kind, 'cylinder'); near(support.r, radius); assert.equal(support.out, out);
        assert.deepEqual(support.a, [0, 0, 1]); near(support.c[0], 20); near(support.c[1], 20);
      }
      for (const [name, z, sign] of [[lower, 0, -1], [upper, height, 1]]) {
        const plane = faceGeometry(result.faces.find(face => face.name === name));
        assert.equal(plane.kind, 'plane'); assert.deepEqual(plane.n, [0, 0, sign]); near(plane.o[2], z);
      }
      assert.deepEqual([...new Set(result.vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b), [0, height]);
      // Independent final section and height, not measurements from either replay helper.
      const area = Math.PI * (outerRadius ** 2 - innerRadius ** 2) / 2, mass = brepMassProperties(result, 1);
      const meanY = 4 * (outerRadius ** 3 - innerRadius ** 3) / (3 * Math.PI * (outerRadius ** 2 - innerRadius ** 2));
      near(mass.volume, area * height, 1e-7);
      mass.centroid.forEach((value, axis) => near(value, [20, 20 + meanY, height / 2][axis]));
      if (skin === 'outer' && !reverseV && radialDistance === 2 && axialDistance === 3) near(mass.volume, 1884.9555921538758, 1e-7);
      assert.deepEqual(current, saved); results.push(result);
    }
    assert.equal(JSON.stringify(results[0]), JSON.stringify(results[1]), 'both history orders have the same complete native representation');
  });

test('mixed Offset refuses wrong source/current/recipe, raw linked recipes, lower/same and third operations', () => {
  const base = doc(), input = sourceOf(base), prior = { face: 'h.normal', distance: 2 };
  const current = body(withOffset(base, prior.distance, prior.face)), next = 'h.v-max';
  for (const wrongPrior of [{ ...prior, distance: 1 }, { ...prior, distance: 0 }, { ...prior, distance: NaN },
    { ...prior, face: next }, { ...prior, target: { feature: 'reference' } }])
    assert.equal(exactSemicylinderMixedOffsetFrame(current, next, input, wrongPrior), undefined);
  for (const wrongSource of [{ ...input, thickness: 3 }, { ...input, id: 'other' }])
    assert.equal(exactSemicylinderMixedOffsetFrame(current, next, wrongSource, prior), undefined);
  const altered = structuredClone(current); altered.faces[0].surface.controlPoints[0][0][0] += .01;
  for (const wrongCurrent of [body(base), altered]) assert.equal(exactSemicylinderMixedOffsetFrame(wrongCurrent, next, input, prior), undefined);
  for (const face of ['h.normal', 'h.reverse', 'h.u-min', 'h.v-min', 'missing'])
    assert.equal(exactSemicylinderMixedOffsetFrame(current, face, input, prior), undefined);
  for (const distance of [-12, -13, -12 + 1e-8]) assert.throws(() => body(withSecondWall(base, prior, next, distance)), /opposite cap/);
  for (const distance of [0, NaN, Infinity, 10001])
    assert.throws(() => offsetExactSemicylinderMixedOffsetIfAdmitted(current, next, input, prior, distance), /nonzero.*modeling range/);
  const capPrior = { face: next, distance: 3 }, capCurrent = body(withOffset(base, capPrior.distance, capPrior.face));
  for (const distance of [8, 8 - 1e-8]) assert.throws(() => body(withSecondWall(base, capPrior, 'h.reverse', distance)), /cylinder axis/);
  for (const distance of [-2, -2 + 1e-8]) assert.throws(() => body(withSecondWall(base, capPrior, 'h.normal', distance)), /retained inner wall/);
  assert.equal(exactSemicylinderMixedOffsetFrame(capCurrent, 'h.v-min', input, capPrior), undefined);
  const lowerPrior = { face: 'h.v-min', distance: 1 };
  assert.throws(() => body(withSecondWall(base, lowerPrior, 'h.normal', 1)), /other original physical wall/);
  const twice = withSecondWall(base, prior, next, 3), twiceBody = body(twice);
  assert.equal(exactSemicylinderMixedOffsetFrame(twiceBody, next, input, prior), undefined);
  for (const face of ['h.normal', 'h.reverse', 'h.v-min', 'h.v-max']) {
    const third = { ...twice, features: [...twice.features, { id: 'third', kind: 'offset-face', target: 'second', face, distance: 1 }] };
    assert.throws(() => body(third));
  }
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
