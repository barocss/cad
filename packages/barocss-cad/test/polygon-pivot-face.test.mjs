import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, brepMassProperties, faceGeometry, checkBrep, saveCadPart, loadCadPart } from '../dist/index.js';
import { prismCapReplacementFrame, prismWallReplacementFrame, replacePrismWallIfAdmitted, offsetPrismWallIfAdmitted } from '../dist/features/prism-wall-offset.js';

const triangle = { name: 'triangle', points: [[0, 0], [24, 0], [6, 16]], area: [192, -24, 3 / 4],
  section: d => [[3 * d / 8, d], [24 - 9 * d / 8, d], [6, 16]] };
const octagon = { name: 'octagon', points: [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]], area: [288, -12, -1],
  section: d => [[4 - d, d], [16 + d, d], ...octagon.points.slice(2)] };
const angleAt = t => Math.atan(t) * 180 / Math.PI;
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const pointClose = (a, b, label) => a.forEach((value, axis) => close(value, b[axis], `${label} ${axis}`));
const samePoint = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) <= 1e-9);

function document(fixture, { pull = 'z', angle = angleAt(0.2), moves = [], height = 10, from = 0 } = {}) {
  let target = 'n1';
  const placements = moves.map((offset, i) => {
    const id = `m${i}`, feature = { id, kind: 'translate', target, offset }; target = id; return feature;
  });
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: fixture.points },
    { id: 'n1', kind: 'extrude', sketch: 'n0', from, height }, ...placements,
    { id: 'pivot', kind: 'draft', target, faces: ['n1.side0'], hingeEdge: pull === '-z' ? 'n1.side0|n1.top' : 'n1.bottom|n1.side0', pull, angle },
  ] };
}

const records = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: surface.id })),
  edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: curve.id })),
  coedges: brep.coedges.map(({ pcurve, ...use }) => ({ ...use, pcurve: pcurve?.id ?? null })),
  vertices: brep.vertices.map(({ point, ...vertex }) => vertex),
});

// Signed polygon integrals of one independent analytic section, not native output geometry.
function sectionMoments(ring) {
  let area = 0, x = 0, y = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1];
    area += cross / 2; x += (a[0] + b[0]) * cross / 6; y += (a[1] + b[1]) * cross / 6;
  });
  return [area, x, y];
}

function prove(fixture, options = {}) {
  const input = document(fixture, options), before = structuredClone(input), prefix = { ...input, features: input.features.slice(0, -1) };
  const source = evaluateCadPart(prefix), original = source.outputs[0].brep, snapshot = evaluateCadPart(input), brep = snapshot.outputs[0].brep;
  const recipe = input.features.at(-1), report = checkBrep(brep, { strict: true }), count = fixture.points.length;
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: count + 2, loops: count + 2, coedges: 6 * count, edges: 3 * count, vertices: 2 * count });
  assert.equal(report.topology[0].genus, 0); assert.equal(brep.shells[0].closed, true);
  assert.ok(report.maximumEdgeSurfaceGap < 1e-9); assert.ok(report.maximumPcurveGap < 1e-9);
  assert.equal(brep.coedges.filter(use => use.pcurve).length, 6 * count);
  assert.deepEqual(records(brep), records(original), 'all original native owners and IDs remain unchanged');
  const hinge = original.edges.find(edge => edge.name === recipe.hingeEdge);
  assert.ok(hinge);
  assert.deepEqual(brep.edges.find(edge => edge.id === hinge.id), hinge);
  for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));
  const fixedCap = original.faces.find(face => face.name === (options.pull === '-z' ? 'n1.top' : 'n1.bottom'));
  assert.deepEqual(brep.faces.find(face => face.id === fixedCap.id), fixedCap);
  const capLoops = original.loops.filter(loop => loop.face === fixedCap.id), capUses = original.coedges.filter(use => capLoops.some(loop => loop.id === use.loop));
  assert.deepEqual(brep.coedges.filter(use => capUses.some(before => before.id === use.id)), capUses);
  for (const use of capUses) assert.deepEqual(brep.edges.find(edge => edge.id === use.edge), original.edges.find(edge => edge.id === use.edge));
  assert.equal(brep.vertices.filter(vertex => JSON.stringify(vertex) === JSON.stringify(original.vertices.find(v => v.id === vertex.id))).length, 2 * count - 2);
  assert.equal(brep.edges.filter(edge => JSON.stringify(edge) === JSON.stringify(original.edges.find(e => e.id === edge.id))).length, 3 * count - 5);
  const vertexById = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) assert.deepEqual(edge.curve.controlPoints, edge.vertices.map(id => vertexById.get(id)));
  const translation = (options.moves ?? []).reduce((sum, move) => sum.map((value, axis) => value + move[axis]), [0, 0, 0]);
  translation[2] += options.from ?? 0;
  const height = options.height ?? 10, t = Math.tan(recipe.angle * Math.PI / 180), sign = options.pull === '-z' ? -1 : 1;
  const expected = [];
  for (const z of [0, height]) {
    const station = sign === 1 ? z : height - z;
    for (const [x, y] of fixture.section(station * t)) expected.push([x + translation[0], y + translation[1], z + translation[2]]);
  }
  for (const point of expected) assert.equal(brep.vertices.filter(vertex => samePoint(vertex.point, point)).length, 1, `${fixture.name}: ${point}`);
  for (const face of original.faces) {
    const support = faceGeometry(face), current = brep.faces.find(candidate => candidate.id === face.id), geometry = faceGeometry(current);
    assert.equal(support.kind, 'plane'); assert.equal(geometry.kind, 'plane');
    if (face.name === 'n1.side0') {
      pointClose(geometry.n, [0, -1 / Math.hypot(1, t), sign * t / Math.hypot(1, t)], 'analytic selected normal');
      const fixedZ = translation[2] + (sign === 1 ? 0 : height);
      for (const point of current.surface.controlPoints.flat()) close(point[1] - translation[1] - sign * t * (point[2] - fixedZ), 0, 'analytic selected plane');
    } else {
      pointClose(geometry.n, support.n, 'kept support normal');
      for (const point of current.surface.controlPoints.flat()) close(point.reduce((sum, value, axis) => sum + (value - support.o[axis]) * support.n[axis], 0), 0, 'kept support plane');
    }
  }
  const [a0, a1, a2] = fixture.area, volume = a0 * height + a1 * t * height ** 2 / 2 + a2 * t ** 2 * height ** 3 / 3;
  const mass = brepMassProperties(brep, 1);
  assert.equal(mass.method, 'planar-exact'); close(mass.volume, volume, 'analytic polygon volume', 1e-7);
  // Section area is quadratic, first moments are cubic: Simpson integrates each exactly.
  const moments = [0, height / 2, height].map(station => {
    const [area, x, y] = sectionMoments(fixture.section(station * t));
    return [area, x, y, (sign === 1 ? station : height - station) * area];
  });
  const integrals = moments[0].map((value, i) => height / 6 * (value + 4 * moments[1][i] + moments[2][i]));
  pointClose(mass.centroid, integrals.slice(1).map((value, axis) => value / integrals[0] + translation[axis]), 'independent polygon centroid');
  assert.deepEqual(input, before); assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
}

for (const fixture of [triangle, octagon]) test(`${fixture.name} Pivot keeps both cap hinges and all native owners at signed analytic angles`, () => {
  for (const pull of ['z', '-z']) for (const sign of [1, -1]) {
    prove(fixture, { pull, angle: sign * angleAt(0.2) });
    prove(fixture, { pull, angle: sign * angleAt(0.2), from: 5, moves: [[11, -7, 13], [3, 9, -4]] });
  }
});

test('polygon Pivot rejects topology changes at either signed octagon bound while accepting the interior', () => {
  for (const pull of ['z', '-z']) {
    for (const t of [0.3999, -0.5999]) prove(octagon, { pull, angle: angleAt(t) });
    for (const angle of [angleAt(0.4), angleAt(-0.6), 24, -32]) {
      const input = document(octagon, { pull, angle }), before = structuredClone(input);
      assert.throws(() => evaluateCadPart(input), error => error.code === 'GEOMETRY' && /collapse or cross a wall/.test(error.message));
      assert.deepEqual(input, before);
    }
    assert.throws(() => evaluateCadPart(document(triangle, { pull, height: 20, angle: 40 })), error => error.code === 'GEOMETRY' && /collapse or cross a wall/.test(error.message));
  }
});

test('Pivot alone admits an oblique rectangular polygon without widening prism Offset or Replace admission', () => {
  const points = [[0, 0], [24, 18], [12, 34], [-12, 16]], fixture = { points };
  for (const pull of ['z', '-z']) for (const sign of [1, -1]) {
    const angle = sign * angleAt(0.2), input = document(fixture, { pull, angle });
    const original = evaluateCadPart({ ...input, features: input.features.slice(0, -1) }).outputs[0].brep;
    assert.equal(prismWallReplacementFrame(original, 'n1.side0'), undefined);
    assert.equal(prismCapReplacementFrame(original, 'n1.top'), undefined);
    assert.equal(replacePrismWallIfAdmitted(original, 'n1.side0', { origin: [0, 0, 0], normal: [0.6, -0.8, 0.2] }), undefined);
    assert.equal(offsetPrismWallIfAdmitted(original, 'n1.side0', 1), undefined);
    const brep = evaluateCadPart(input).outputs[0].brep, report = checkBrep(brep, { strict: true });
    assert.equal(report.valid, true, JSON.stringify(report.issues)); assert.deepEqual(records(brep), records(original));
    const hinge = original.edges.find(edge => edge.name === input.features.at(-1).hingeEdge);
    assert.deepEqual(brep.edges.find(edge => edge.id === hinge.id), hinge);
    for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));
    for (const z of [0, 10]) for (const [i, point] of points.entries()) {
      const station = pull === 'z' ? z : 10 - z, d = station * sign / 5;
      const expected = [point[0] - (i < 2 ? 0.6 * d : 0), point[1] + (i < 2 ? 0.8 * d : 0), z];
      assert.equal(brep.vertices.filter(vertex => samePoint(vertex.point, expected)).length, 1);
    }
    close(brepMassProperties(brep, 1).volume, 6000 - 300 * sign, 'oblique rectangular polygon volume', 1e-7);
  }
  const cardinal = document({ points: [[0, 0], [30, 0], [30, 20], [0, 20]] });
  assert.equal(evaluateCadPart(cardinal).outputs[0].brep.source.family, 'draft', 'legacy cardinal box route remains first');
});

test('polygon Pivot retains original convex upright source, exact count and cap-edge restrictions', () => {
  const reject = (input, code) => {
    const before = structuredClone(input); assert.throws(() => evaluateCadPart(input), error => error.code === code); assert.deepEqual(input, before);
  };
  const concave = document(octagon); concave.features[0] = { ...concave.features[0], points: [[4, 0], [16, 0], [10, 8], ...octagon.points.slice(3)] }; reject(concave, 'CAPABILITY');
  const redundant = document(octagon); redundant.features[0] = { ...redundant.features[0], points: [[4, 0], [10, 0], ...octagon.points.slice(1)] }; reject(redundant, 'CAPABILITY');
  const drafted = document(triangle); drafted.features[1].draft = 2; reject(drafted, 'CAPABILITY');
  const rotated = document(triangle); rotated.features.splice(2, 0, { id: 'rotated', kind: 'rotate', target: 'n1', axis: 'z', angle: 0 }); rotated.features.at(-1).target = 'rotated'; reject(rotated, 'CAPABILITY');
  const implicit = document(octagon); delete implicit.features.at(-1).pull; reject(implicit, 'INPUT');
  const wrongAxis = document(octagon); wrongAxis.features.at(-1).pull = 'x'; reject(wrongAxis, 'SELECTION');
  const vertical = document(triangle); vertical.features.at(-1).hingeEdge = 'n1.side0|n1.side1'; reject(vertical, 'SELECTION');
  const opposite = document(octagon); opposite.features.at(-1).hingeEdge = 'n1.side0|n1.top'; reject(opposite, 'SELECTION');
});
