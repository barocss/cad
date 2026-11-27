import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, brepMassProperties, faceGeometry, checkBrep, saveCadPart, loadCadPart } from '../dist/index.js';

const triangle = { name: 'triangle', points: [[0, 0], [24, 0], [6, 16]], area: [192, -24, 3 / 4],
  section: d => [[3 * d / 8, d], [24 - 9 * d / 8, d], [6, 16]] };
const octagon = { name: 'octagon', points: [[4, 0], [16, 0], [20, 4], [20, 12], [16, 16], [4, 16], [0, 12], [0, 4]], area: [288, -12, -1],
  section: d => [[4 - d, d], [16 + d, d], ...octagon.points.slice(2)] };
const angleAt = t => Math.atan(t) * 180 / Math.PI;
const close = (a, b, label, tolerance = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= tolerance, `${label}: ${a} vs ${b}`);
const pointClose = (a, b, label) => a.forEach((value, axis) => close(value, b[axis], `${label} ${axis}`));
const samePoint = (a, b) => a.every((value, axis) => Math.abs(value - b[axis]) <= 1e-9);

// Independent right-handed authored coordinates; no kernel transform or output geometry supplies the oracle.
function world(point, placements, direction = false) {
  let [x, y, z] = point;
  for (const feature of placements) {
    if (feature.kind === 'translate') {
      if (!direction) { x += feature.offset[0]; y += feature.offset[1]; z += feature.offset[2]; }
      continue;
    }
    const [px, py, pz] = direction ? [0, 0, 0] : feature.pivot ?? [0, 0, 0];
    x -= px; y -= py; z -= pz;
    const a = feature.angle * Math.PI / 180, c = Math.cos(a), s = Math.sin(a);
    if (feature.axis === 'x') [y, z] = [c * y - s * z, s * y + c * z];
    else if (feature.axis === 'y') [x, z] = [c * x + s * z, -s * x + c * z];
    else [x, y] = [c * x - s * y, s * x + c * y];
    x += px; y += py; z += pz;
  }
  return [x, y, z];
}

function document(fixture, placements, { fixed = 'bottom', angle = angleAt(0.2), from = 5 } = {}) {
  let target = 'n1';
  const transforms = placements.map((feature, i) => {
    const id = `m${i}`, node = { id, ...feature, target }; target = id; return node;
  });
  return { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'polygon', points: fixture.points },
    { id: 'n1', kind: 'extrude', sketch: 'n0', from, height: 10 }, ...transforms,
    { id: 'pivot', kind: 'draft', target, faces: ['n1.side0'], hingeEdge: fixed === 'bottom' ? 'n1.bottom|n1.side0' : 'n1.side0|n1.top', angle },
  ] };
}

const owners = brep => ({
  source: brep.source, bodies: brep.bodies, shells: brep.shells, loops: brep.loops,
  faces: brep.faces.map(({ surface, ...face }) => ({ ...face, surface: surface.id })),
  edges: brep.edges.map(({ curve, ...edge }) => ({ ...edge, curve: curve.id })),
  coedges: brep.coedges.map(({ pcurve, ...use }) => ({ ...use, pcurve: pcurve?.id ?? null })),
  vertices: brep.vertices.map(({ point, ...vertex }) => vertex),
});

function sectionMoments(ring) {
  let area = 0, x = 0, y = 0;
  ring.forEach((a, i) => {
    const b = ring[(i + 1) % ring.length], cross = a[0] * b[1] - b[0] * a[1];
    area += cross / 2; x += (a[0] + b[0]) * cross / 6; y += (a[1] + b[1]) * cross / 6;
  });
  return [area, x, y];
}

function prove(fixture, placements, options = {}) {
  const input = document(fixture, placements, options), before = structuredClone(input), prefix = { ...input, features: input.features.slice(0, -1) };
  const source = evaluateCadPart(prefix), original = source.outputs[0].brep, snapshot = evaluateCadPart(input), brep = snapshot.outputs[0].brep;
  const recipe = input.features.at(-1), report = checkBrep(brep, { strict: true }), count = fixture.points.length;
  assert.equal(report.valid, true, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: count + 2, loops: count + 2, coedges: 6 * count, edges: 3 * count, vertices: 2 * count });
  assert.equal(report.topology[0].genus, 0); assert.equal(brep.shells[0].closed, true);
  assert.ok(report.maximumEdgeSurfaceGap < 1e-9); assert.ok(report.maximumPcurveGap < 1e-9);
  assert.equal(brep.coedges.filter(use => use.pcurve).length, 6 * count);
  assert.deepEqual(owners(brep), owners(original), 'placed native owners and pcurve IDs remain unchanged');
  const hinge = original.edges.find(edge => edge.name === recipe.hingeEdge);
  assert.ok(hinge); assert.deepEqual(brep.edges.find(edge => edge.id === hinge.id), hinge);
  for (const id of hinge.vertices) assert.deepEqual(brep.vertices.find(vertex => vertex.id === id), original.vertices.find(vertex => vertex.id === id));
  const capName = options.fixed === 'top' ? 'n1.top' : 'n1.bottom', cap = original.faces.find(face => face.name === capName);
  assert.deepEqual(brep.faces.find(face => face.id === cap.id), cap, 'entire current-world fixed cap chart stays exact');
  const fixedLoops = new Set(cap.loops), capUses = original.coedges.filter(use => fixedLoops.has(use.loop));
  assert.deepEqual(brep.coedges.filter(use => capUses.some(original => original.id === use.id)), capUses, 'fixed world cap pcurves stay exact');
  for (const use of capUses) assert.deepEqual(brep.edges.find(edge => edge.id === use.edge), original.edges.find(edge => edge.id === use.edge));
  assert.equal(brep.vertices.filter(vertex => JSON.stringify(vertex) === JSON.stringify(original.vertices.find(v => v.id === vertex.id))).length, 2 * count - 2);
  assert.equal(brep.edges.filter(edge => JSON.stringify(edge) === JSON.stringify(original.edges.find(e => e.id === edge.id))).length, 3 * count - 5);
  const vertexById = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  for (const edge of brep.edges) assert.deepEqual(edge.curve.controlPoints, edge.vertices.map(id => vertexById.get(id)));
  const from = options.from ?? 5, t = Math.tan(recipe.angle * Math.PI / 180), sign = options.fixed === 'top' ? -1 : 1;
  for (const z of [0, 10]) {
    const station = sign === 1 ? z : 10 - z;
    for (const [x, y] of fixture.section(station * t)) {
      const point = world([x, y, from + z], placements);
      assert.equal(brep.vertices.filter(vertex => samePoint(vertex.point, point)).length, 1, `${fixture.name} world corner ${point}`);
    }
  }
  for (const face of original.faces) {
    const old = faceGeometry(face), current = brep.faces.find(candidate => candidate.id === face.id), geometry = faceGeometry(current);
    assert.equal(old.kind, 'plane'); assert.equal(geometry.kind, 'plane');
    const normal = face.name === 'n1.side0' ? world([0, -1 / Math.hypot(1, t), sign * t / Math.hypot(1, t)], placements, true) : old.n;
    const origin = face.name === 'n1.side0' ? world([fixture.points[0][0], 0, from + (sign === 1 ? 0 : 10)], placements) : old.o;
    pointClose(geometry.n, normal, 'independent world normal');
    for (const point of current.surface.controlPoints.flat()) close(point.reduce((sum, value, axis) => sum + (value - origin[axis]) * normal[axis], 0), 0, 'independent world support');
  }
  const [a0, a1, a2] = fixture.area, volume = 10 * a0 + 50 * a1 * t + 1000 / 3 * a2 * t ** 2;
  const mass = brepMassProperties(brep, 1); assert.equal(mass.method, 'planar-exact'); close(mass.volume, volume, 'rigid analytic volume', 1e-7);
  const moments = [0, 5, 10].map(station => {
    const [area, x, y] = sectionMoments(fixture.section(station * t));
    return [area, x, y, (from + (sign === 1 ? station : 10 - station)) * area];
  });
  const integrals = moments[0].map((value, i) => 10 / 6 * (value + 4 * moments[1][i] + moments[2][i]));
  pointClose(mass.centroid, world(integrals.slice(1).map(value => value / integrals[0]), placements), 'independent rigid centroid');
  assert.deepEqual(input, before); assert.deepEqual(reevaluate(source, { document: input }).outputs[0].brep, brep);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
  return { hinge: brep.edges.find(edge => edge.id === hinge.id), cap: brep.faces.find(face => face.id === cap.id) };
}

test('rotated polygon cap hinges preserve exact world records for X/Y/Z and both signed turns', () => {
  for (const fixture of [triangle, octagon]) for (const axis of ['x', 'y', 'z']) for (const fixed of ['bottom', 'top']) for (const sign of [1, -1]) {
    const placements = [{ kind: 'translate', offset: [-4, 7, 3] },
      { kind: 'rotate', axis, angle: 37, pivot: [10, 20, 30] }, { kind: 'translate', offset: [7, -11, 13] }];
    prove(fixture, placements, { fixed, angle: sign * angleAt(0.2) });
  }
});

test('upstream oblique Rotate edits keep hinge IDs while matching each fresh world prefix', () => {
  const placements = angle => [{ kind: 'rotate', axis: 'y', angle, pivot: [10, 20, 30] }, { kind: 'translate', offset: [7, -11, 13] }];
  const a = prove(octagon, placements(31)), b = prove(octagon, placements(43));
  assert.deepEqual([a.hinge.id, a.hinge.curve.id, a.hinge.vertices], [b.hinge.id, b.hinge.curve.id, b.hinge.vertices]);
  assert.notDeepEqual(a.hinge.curve.controlPoints, b.hinge.curve.controlPoints, 'upstream edit moves the original world edge');
  assert.equal(a.cap.id, b.cap.id);
  for (const angle of [0, 90, 180]) prove(octagon, placements(angle));
});

test('multiple authored rotations preserve native polygon charts and original cap ownership', () => {
  const placements = [{ kind: 'rotate', axis: 'z', angle: 23, pivot: [2, 3, -5] },
    { kind: 'translate', offset: [19, -11, 7] }, { kind: 'rotate', axis: 'x', angle: -37, pivot: [-8, 5, 11] },
    { kind: 'rotate', axis: 'y', angle: 41, pivot: [9, -13, 17] }];
  for (const fixed of ['bottom', 'top']) prove(octagon, placements, { fixed });
});

test('rotated polygon Pivot preserves explicit world-pull refusal and rejects changed source or topology atomically', () => {
  const placements = [{ kind: 'rotate', axis: 'y', angle: 37, pivot: [10, 20, 30] }];
  const reject = (input, code, message) => {
    const before = structuredClone(input);
    assert.throws(() => evaluateCadPart(input), error => error.code === code && message.test(error.message)); assert.deepEqual(input, before);
  };
  for (const fixed of ['bottom', 'top']) for (const angle of [24, -32]) reject(document(octagon, placements, { fixed, angle }), 'GEOMETRY', /collapse or cross/);
  for (const pull of ['z', '-z']) {
    const explicit = document(octagon, placements); explicit.features.at(-1).pull = pull; reject(explicit, 'CAPABILITY', /original rectangular extrusion/);
  }
  const vertical = document(octagon, placements); vertical.features.at(-1).hingeEdge = 'n1.side0|n1.side1'; reject(vertical, 'SELECTION', /original cap/);
  const other = document(octagon, placements); other.features.at(-1).hingeEdge = 'n1.bottom|n1.side2'; reject(other, 'SELECTION', /start cap/);
  const cap = document(octagon, placements); cap.features.at(-1).faces = ['n1.bottom']; reject(cap, 'CAPABILITY', /upright wall/);
  const neutral = document(octagon, placements); neutral.features.at(-1).neutral = 5; reject(neutral, 'INPUT', /explicit pull/);
  const unplaced = document(octagon, []); reject(unplaced, 'INPUT', /explicit pull/);
  const concave = document(octagon, placements); concave.features[0] = { ...concave.features[0], points: [[4, 0], [16, 0], [10, 8], ...octagon.points.slice(3)] }; reject(concave, 'CAPABILITY', /convex polygon/);
  const drafted = document(octagon, placements); drafted.features[1].draft = 2; reject(drafted, 'INPUT', /explicit pull/);
  const scaled = document(octagon, placements); scaled.features.splice(2, 0, { id: 'scaled', kind: 'scale', target: 'n1', factor: 1 }); scaled.features[3].target = 'scaled'; reject(scaled, 'INPUT', /explicit pull/);
  const overflow = document(octagon, [{ kind: 'rotate', axis: 'z', angle: 0 }, { kind: 'translate', offset: [0, -9999, 0] }], { from: 0, angle: -angleAt(0.2) }); reject(overflow, 'PARAMETER', /modeling coordinate range/);
});
