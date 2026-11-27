import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, checkBrep, brepMassProperties, faceGeometry } from '../dist/index.js';
import { transformBrep } from '../dist/brep/brep-transform.js';
import { offsetPrismWall, offsetPrismWallIfAdmitted, prismWallOffsetFrame } from '../dist/features/prism-wall-offset.js';

const triangle = { name: 'triangle', points: [[0, 0], [24, 0], [6, 16]],
  section: d => [[-3 * d / 8, -d], [24 + 9 * d / 8, -d], [6, 16]],
  volume: d => 1920 + 240 * d + 7.5 * d * d,
  centroid: d => [10 + d / 4, 16 / 3 - 2 * d / 3, 5] };
const octagon = { name: 'octagon', points: [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]],
  section: d => [[4 + d, -d], [16 - d, -d], ...octagon.points.slice(2)],
  volume: d => 2880 + 120 * d - 10 * d * d,
  centroid: d => [10, (2304 - 6 * d * d + 2 * d ** 3 / 3) / (288 + 12 * d - d * d), 5] };
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const pointClose = (a, b, label) => a.forEach((v, k) => close(v, b[k], `${label} ${k}`));
const owners = brep => ({ source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...record }) => ({ ...record, surface: surface.id })),
  edges: brep.edges.map(({ curve, ...record }) => ({ ...record, curve: curve.id })),
  coedges: brep.coedges.map(({ pcurve, ...record }) => ({ ...record, pcurve: pcurve?.id ?? null })),
  vertices: brep.vertices.map(({ point: _point, ...record }) => record) });
function document(fixture, distance, { moves = [], from = 0, face = 'n1.side0' } = {}) {
  let target = 'n1';
  const placements = moves.map((offset, i) => { const id = `m${i}`, feature = { id, kind: 'translate', target, offset }; target = id; return feature; });
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: fixture.points },
    { id: 'n1', kind: 'extrude', sketch: 'n0', from, height: 10 }, ...placements,
    { id: 'offset', kind: 'offset-face', target, face, distance },
  ] };
}
function prove(fixture, distance, options = {}) {
  const input = document(fixture, distance, options), originalDoc = structuredClone(input);
  const source = evaluateCadPart({ ...input, features: input.features.slice(0, -1) }), original = source.outputs[0].brep, before = structuredClone(original);
  const snapshot = reevaluate(source, { document: input }), brep = snapshot.outputs[0].brep, report = checkBrep(brep, { strict: true, pcurveSamples: 7 }), n = fixture.points.length;
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: n + 2, loops: n + 2, coedges: 6 * n, edges: 3 * n, vertices: 2 * n });
  assert.equal(report.topology[0].genus, 0); assert.ok(brep.coedges.every(use => use.pcurve));
  assert.deepEqual(owners(brep), owners(original));
  assert.equal(brep.vertices.filter((vertex, i) => vertex === original.vertices[i]).length, 2 * n - 4);
  assert.equal(brep.edges.filter((edge, i) => edge === original.edges[i]).length, 3 * n - 8);
  const translation = (options.moves ?? []).reduce((sum, move) => sum.map((v, k) => v + move[k]), [0, 0, options.from ?? 0]);
  const expected = [0, 10].flatMap(z => fixture.section(distance).map(([x, y]) => [x + translation[0], y + translation[1], z + translation[2]]));
  for (const point of expected) assert.equal(brep.vertices.filter(vertex => vertex.point.every((v, k) => Math.abs(v - point[k]) < 1e-9)).length, 1, `${fixture.name} ${point}`);
  const byVertex = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) assert.deepEqual(edge.curve.controlPoints, edge.vertices.map(id => byVertex.get(id)));
  for (const face of brep.faces) {
    const sourceFace = original.faces.find(candidate => candidate.id === face.id), support = faceGeometry(sourceFace), current = faceGeometry(face);
    assert.equal(current.kind, 'plane'); pointClose(current.n, support.n, 'fixed normal');
    for (const point of face.surface.controlPoints.flat()) close(point.reduce((s, v, k) => s + (v - support.o[k]) * support.n[k], 0), face.name === 'n1.side0' ? distance : 0, 'exact support');
    if (!['n1.side0', 'n1.side1', `n1.side${n - 1}`, 'n1.top', 'n1.bottom'].includes(face.name)) assert.equal(face, sourceFace);
  }
  const mass = brepMassProperties(brep, 1); assert.equal(mass.method, 'planar-exact');
  close(mass.volume, fixture.volume(distance), 'analytic volume', 1e-7);
  pointClose(mass.centroid, fixture.centroid(distance).map((v, k) => v + translation[k]), 'analytic centroid');
  assert.deepEqual(original, before); assert.deepEqual(input, originalDoc);
  assert.deepEqual(evaluateCadPart(input).outputs[0].brep, brep);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  assert.equal(prismWallOffsetFrame(original, 'n1.side0'), undefined);
  assert.equal(offsetPrismWallIfAdmitted(original, 'n1.side0', distance), undefined);
  assert.throws(() => offsetPrismWall(original, 'n1.side0', distance), /convex hexagonal prism/);
  pointClose(prismWallOffsetFrame(original, 'n1.side0', true).normal, [0, -1, 0], 'explicit original polygon frame');
  assert.deepEqual(offsetPrismWall(original, 'n1.side0', distance, true), brep);
}

for (const fixture of [triangle, octagon]) test(`${fixture.name} original wall has signed analytic Offset with complete native ownership`, () => {
  for (const distance of [1, -1]) {
    prove(fixture, distance);
    prove(fixture, distance, { moves: [[11, -7, 13], [3, 9, -4]], from: 5 });
  }
});

test('the oblique triangle wall offsets a true millimeter along its unit normal', () => {
  for (const distance of [1, -1]) {
    const input = document(triangle, distance, { face: 'n1.side1' }), source = evaluateCadPart({ ...input, features: input.features.slice(0, -1) }).outputs[0].brep;
    const brep = evaluateCadPart(input).outputs[0].brep, s = Math.sqrt(145) * distance;
    const section = [[0, 0], [24 + s / 8, 0], [6 + s / 32, 16 + s / 12]];
    assert.equal(checkBrep(brep, { strict: true, pcurveSamples: 7 }).valid, true); assert.deepEqual(owners(brep), owners(source));
    pointClose(prismWallOffsetFrame(source, 'n1.side1', true).normal, [8 / Math.sqrt(145), 9 / Math.sqrt(145), 0], 'analytic oblique normal');
    for (const z of [0, 10]) for (const [x, y] of section)
      assert.equal(brep.vertices.filter(vertex => vertex.point.every((v, k) => Math.abs(v - [x, y, z][k]) < 1e-9)).length, 1);
    close(brepMassProperties(brep, 1).volume, 1920 + 20 * s + 5 * s * s / 96, 'oblique analytic volume', 1e-7);
  }
});

test('polygon edge disappearance refuses before volume vanishes and keeps the accepted document', () => {
  for (const distance of [5.999, -3.999]) prove(octagon, distance);
  prove(triangle, -15.999);
  const accepted = evaluateCadPart(document(octagon, 1)), saved = saveCadPart(accepted);
  for (const distance of [6, -4, 7, -5]) {
    assert.ok(octagon.volume(distance) > 0);
    assert.throws(() => reevaluate(accepted, { document: document(octagon, distance) }), error => error.code === 'GEOMETRY' && /collapse or cross a wall/.test(error.message));
  }
  assert.throws(() => evaluateCadPart(document(triangle, -16)), error => error.code === 'GEOMETRY');
  assert.equal(saveCadPart(accepted), saved);
});

test('the polygon source proof participates in parameter reevaluation before cache capture', () => {
  const input = document(triangle, 1); input.parameters.Width = 24; input.features[0].points = [[0, 0], [{ parameter: 'Width' }, 0], [6, 16]];
  const base = evaluateCadPart(input), changed = reevaluate(base, { parameters: { Width: 30 } });
  const fresh = evaluateCadPart({ ...input, parameters: { Width: 30 } });
  assert.deepEqual(changed.outputs[0].brep, fresh.outputs[0].brep);
  close(brepMassProperties(changed.outputs[0].brep, 1).volume, 30 * 10 * 17 ** 2 / 32, 'independent edited width', 1e-7);
  close(brepMassProperties(base.outputs[0].brep, 1).volume, 2167.5, 'unchanged old snapshot', 1e-7);
});

test('new polygon admission refuses concavity, thin sections, incomplete trims and changed ancestry', () => {
  const base = document(octagon, 1), original = evaluateCadPart({ ...base, features: base.features.slice(0, -1) }).outputs[0].brep;
  const malformed = structuredClone(original); malformed.loops[0].coedges.pop();
  const thin = transformBrep(evaluateCadPart({ ...document(triangle, 1), features: document(triangle, 1).features.slice(0, -1) }).outputs[0].brep,
    { matrix: [1, 0, 0, 0, 1e-9, 0, 0, 0, 1] });
  const concave = { ...octagon, points: [[4, 0], [16, 0], [20, 4], [10, 8], [16, 16], [4, 16], [0, 12], [0, 4]] };
  const concaveDoc = document(concave, 1), concaveBrep = evaluateCadPart({ ...concaveDoc, features: concaveDoc.features.slice(0, -1) }).outputs[0].brep;
  for (const brep of [malformed, thin, concaveBrep]) {
    assert.equal(prismWallOffsetFrame(brep, 'n1.side0', true), undefined);
    assert.equal(offsetPrismWallIfAdmitted(brep, 'n1.side0', 1, true), undefined);
  }
  assert.throws(() => evaluateCadPart(concaveDoc));
  for (const feature of [
    { id: 'change', kind: 'rotate', target: 'n1', axis: 'z', angle: 30 },
    { id: 'change', kind: 'offset-face', target: 'n1', face: 'n1.side0', distance: 1 },
    { id: 'change', kind: 'replace-face', target: 'n1', face: 'n1.top', plane: { origin: [0, 0, 12], normal: [0.1, 0, 1] } },
    { id: 'change', kind: 'hole', target: 'n1', center: [10, 8], radius: 1 },
  ]) {
    const input = document(octagon, 1); input.features.splice(2, 0, feature); input.features.at(-1).target = 'change';
    assert.doesNotThrow(() => evaluateCadPart({ ...input, features: input.features.slice(0, -1) }));
    assert.throws(() => evaluateCadPart(input), error => ['CAPABILITY', 'GEOMETRY'].includes(error.code));
  }
  const rectangle = { ...triangle, points: [[0, 0], [24, 18], [12, 34], [-12, 16]] };
  const rectangleDoc = document(rectangle, 1), rectangleBrep = evaluateCadPart({ ...rectangleDoc, features: rectangleDoc.features.slice(0, -1) }).outputs[0].brep;
  assert.equal(prismWallOffsetFrame(rectangleBrep, 'n1.side0', true), undefined);
  assert.equal(offsetPrismWallIfAdmitted(rectangleBrep, 'n1.side0', 1, true), undefined);
});

test('default hex Offset native bytes are unchanged for both signed axis and oblique walls', () => {
  // Native JSON captured at 12f2abf08 before the opt-in path was added.
  const hashes = ['b1d69cb332e7be4448e1d0098ba7ef1b5ee2ca2b84713787f75d12c1d85d84de', '5b16b2bac11fc7ed20a07dad633ec12d9397aa18000ef6d17e48c43b939c85dd',
    '6feec65303f2ca4270c09b87f1c4e21759bdbc19f7d92c40fc9f779a37e43884', '1d055ee2436fdd98c83aaeb250d1508bd56b45dc8b4d06493c51db38cb2639bc'];
  let index = 0;
  for (const face of ['n1.side0', 'n1.side1']) for (const distance of [1, -1]) {
    const input = document({ points: [[0, 0], [18, 0], [24, 8], [18, 16], [0, 16], [-6, 8]] }, distance, { face });
    assert.equal(createHash('sha256').update(JSON.stringify(evaluateCadPart(input).outputs[0].brep)).digest('hex'), hashes[index++]);
  }
});
