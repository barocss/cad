import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, brepMassProperties, faceGeometry, checkBrep, saveCadPart, loadCadPart } from '../dist/index.js';

const footprint = [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]];
const faceName = 'n1.side1', theta = Math.atan(1 / 5) * 180 / Math.PI;
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const pointClose = (a, b, label) => a.forEach((value, axis) => close(value, b[axis], `${label} ${axis}`));
const samePoint = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) <= 1e-9);

function document({ pull = 'z', angle = theta, moves = [], from = 0 } = {}) {
  let target = 'n1';
  const placements = moves.map((offset, i) => {
    const id = `m${i}`, feature = { id, kind: 'translate', target, offset }; target = id; return feature;
  });
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: footprint },
    { id: 'n1', kind: 'extrude', sketch: 'n0', from, height: 10 },
    ...placements,
    { id: 'pivot', kind: 'draft', target, faces: [faceName], hingeEdge: pull === '-z' ? 'n1.side1|n1.top' : 'n1.bottom|n1.side1', pull, angle },
  ] };
}

const records = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: surface.id })),
  edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: curve.id })),
  coedges: brep.coedges.map(({ pcurve, ...use }) => ({ ...use, pcurve: pcurve?.id ?? null })),
  vertices: brep.vertices.map(({ point, ...vertex }) => vertex),
});

function prove(options) {
  const input = document(options), before = structuredClone(input), prefix = { ...input, features: input.features.slice(0, -1) };
  const source = evaluateCadPart(prefix), original = source.outputs[0].brep, recipe = input.features.at(-1);
  const snapshot = evaluateCadPart(input), brep = snapshot.outputs[0].brep, report = checkBrep(brep, { strict: true });
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 });
  assert.equal(report.topology[0].genus, 0); assert.equal(brep.shells[0].closed, true);
  assert.ok(report.maximumEdgeSurfaceGap < 1e-9); assert.ok(report.maximumPcurveGap < 1e-9);
  assert.equal(brep.coedges.filter(use => use.pcurve).length, 36);
  assert.deepEqual(records(brep), records(original), 'all native IDs, tolerances, uses and incidence remain unchanged');
  const hinge = original.edges.find(edge => edge.name === recipe.hingeEdge);
  assert.ok(hinge);
  assert.deepEqual(brep.edges.find(edge => edge.id === hinge.id), hinge, 'the entire native hinge curve is fixed');
  for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));
  const fixedCap = original.faces.find(face => face.name === (options.pull === '-z' ? 'n1.top' : 'n1.bottom'));
  assert.deepEqual(brep.faces.find(face => face.id === fixedCap.id), fixedCap, 'fixed cap keeps its exact surface and face record');
  const capLoops = original.loops.filter(loop => loop.face === fixedCap.id), capUses = original.coedges.filter(use => capLoops.some(loop => loop.id === use.loop));
  assert.deepEqual(brep.coedges.filter(use => capUses.some(original => original.id === use.id)), capUses, 'fixed cap pcurve records remain exact');
  for (const use of capUses) {
    const edge = original.edges.find(edge => edge.id === use.edge);
    assert.deepEqual(brep.edges.find(candidate => candidate.id === edge.id), edge);
  }
  assert.equal(brep.vertices.filter(vertex => JSON.stringify(vertex) === JSON.stringify(original.vertices.find(v => v.id === vertex.id))).length, 10);
  assert.equal(brep.edges.filter(edge => JSON.stringify(edge) === JSON.stringify(original.edges.find(e => e.id === edge.id))).length, 13);
  const vertexById = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) assert.deepEqual(edge.curve.controlPoints, edge.vertices.map(id => vertexById.get(id)));

  const translation = (options.moves ?? []).reduce((sum, move) => sum.map((value, axis) => value + move[axis]), [0, 0, 0]);
  translation[2] += options.from ?? 0;
  const t = Math.tan(recipe.angle * Math.PI / 180), expected = [];
  for (const z of [0, 10]) {
    const station = options.pull === '-z' ? 10 - z : z, d = -station * t;
    // Independent intersections: 4x−3y=72+5d, with y=0 and 4x+3y=120.
    const ring = [footprint[0], [18 + 5 * d / 4, 0], [24 + 5 * d / 8, 8 - 5 * d / 6], ...footprint.slice(3)];
    for (const [x, y] of ring) expected.push([x + translation[0], y + translation[1], z + translation[2]]);
  }
  for (const point of expected) assert.equal(brep.vertices.filter(vertex => samePoint(vertex.point, point)).length, 1, `world vertex ${point}`);
  for (const face of original.faces) {
    const support = faceGeometry(face), current = faceGeometry(brep.faces.find(candidate => candidate.id === face.id));
    assert.equal(support.kind, 'plane'); assert.equal(current.kind, 'plane');
    if (face.name === faceName) {
      const sign = options.pull === '-z' ? -1 : 1, length = Math.hypot(1, t);
      pointClose(current.n, [0.8 / length, -0.6 / length, sign * t / length], 'turned support normal');
      for (const id of hinge.vertices) close(vertexById.get(id).reduce((sum, value, axis) => sum + (value - current.o[axis]) * current.n[axis], 0), 0, 'exact hinge contact');
      continue;
    }
    pointClose(current.n, support.n, 'unchanged outward normal');
    const surface = brep.faces.find(candidate => candidate.id === face.id).surface;
    for (const point of surface.controlPoints.flat()) close(point.reduce((sum, value, axis) => sum + (value - support.o[axis]) * support.n[axis], 0), 0, 'unchanged support plane');
  }
  // Section area A(s)=384−10*s*t−25*s²*t²/48; integrate it over 0..10 independently.
  const volume = 3840 - 500 * t - 25000 * t ** 2 / 144, mass = brepMassProperties(brep, 1);
  close(mass.volume, volume, 'analytic native volume', 1e-7); assert.equal(mass.method, 'planar-exact');
  if (Math.abs(Math.abs(t) - 1 / 5) < 1e-15) {
    const reference = t > 0 ? [1865271 / 215024, 1307299 / 161268, 133065 / 26878]
      : [2106441 / 226544, 1342109 / 169908, 142665 / 28318];
    if (options.pull === '-z') reference[2] = 10 - reference[2];
    pointClose(mass.centroid, reference.map((value, axis) => value + translation[axis]), 'rational centroid');
  }
  assert.deepEqual(input, before); assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
}

test('hexagonal Pivot fixes either original cap edge with positive and negative signed turns', () => {
  for (const pull of ['z', '-z']) for (const angle of [theta, -theta, 10, -10]) prove({ pull, angle });
});

test('translated hexagonal Pivot keeps exact world records and follows the original cap station', () => {
  for (const pull of ['z', '-z']) for (const angle of [theta, -theta])
    prove({ pull, angle, from: 6, moves: [[-9, 11, 7], [80, -23, 14]] });
});

test('hexagonal Pivot refuses wrong native ownership, pull, collapse and coordinate overflow atomically', () => {
  const check = (input, code, message) => {
    const before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), error => error.code === code && message.test(error.message));
    assert.deepEqual(input, before);
  };
  for (const edge of ['n1.side1|n1.side2', 'n1.bottom|n1.side0', 'n1.side1|n1.top']) {
    const input = document(); input.features.at(-1).hingeEdge = edge;
    check(input, 'SELECTION', /start cap/);
  }
  const missing = document(); missing.features.at(-1).hingeEdge = 'missing'; check(missing, 'REFERENCE', /missing or ambiguous/);
  for (const pull of ['x', '-x', 'y', '-y']) check(document({ pull }), 'SELECTION', /signed world Z/);
  const implicit = document(); delete implicit.features.at(-1).pull; check(implicit, 'INPUT', /explicit pull/);
  const neutral = document(); neutral.features.at(-1).neutral = 0; check(neutral, 'INPUT', /explicit pull/);
  const cap = document(); cap.features.at(-1).faces = ['n1.bottom']; check(cap, 'CAPABILITY', /upright wall/);
  const many = document(); many.features.at(-1).faces = [faceName, 'n1.side0']; check(many, 'INPUT', /explicit pull/);
  for (const angle of [0, 45, -45]) check(document({ angle }), 'INPUT', /angle must/);
  for (const pull of ['z', '-z']) for (const angle of [44, -44]) check(document({ pull, angle }), 'GEOMETRY', /collapse or cross a wall/);
  check(document({ angle: -theta, moves: [[9975, 0, 0]] }), 'GEOMETRY', /modeling coordinate range/);
});

test('hexagonal Pivot admits only an original six-point convex straight stock and Move wrappers', () => {
  const check = input => {
    const before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), error => error.code === 'CAPABILITY'); assert.deepEqual(input, before);
  };
  const drafted = document(); drafted.features[1].draft = 2; check(drafted);
  const concave = document(); concave.features[0] = { ...concave.features[0], points: [[0, 0], [18, 0], [10, 7], [18, 16], [0, 16], [-6, 8]] }; check(concave);
  const pentagon = document(); pentagon.features[0] = { ...pentagon.features[0], points: footprint.slice(0, 5) }; check(pentagon);
  const holed = document(); holed.features[0] = { ...holed.features[0], holes: [[{ kind: 'arc', start: [5, 4], center: [4, 4], direction: 'ccw' }]] }; check(holed);
  for (const feature of [
    { kind: 'rotate', axis: 'z', angle: 0 }, { kind: 'scale', factor: 1 },
    { kind: 'mirror', plane: 'yz', keep: false },
    { kind: 'offset-face', face: faceName, distance: 1 },
  ]) {
    const input = document(); input.features.splice(2, 0, { id: 'changed', target: 'n1', ...feature });
    input.features.at(-1).target = 'changed'; check(input);
  }
});
