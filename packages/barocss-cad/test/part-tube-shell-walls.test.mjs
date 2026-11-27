import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry, loadCadPart, massPropertiesOf, reevaluate, saveCadPart } from '../dist/index.js';

const sketch = { id: 'profile', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] };
const extrusion = { id: 'box', kind: 'extrude', sketch: 'profile', height: 20 };
const pairs = [['box.side3', 'box.side1'], ['box.side0', 'box.side2'], ['box.bottom', 'box.top']];
const walls = { 'box.side3': 3, 'box.side1': 5, 'box.side0': 2, 'box.side2': 4 };
const shell = { id: 'wall', kind: 'shell-walls', target: 'box', opening: 'box.top', secondOpening: 'box.bottom', walls };
const doc = (feature = shell, source = sketch, extrude = extrusion) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [source, extrude, feature],
});
const close = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const key = point => JSON.stringify(point);

function verify(snapshot, bounds, kept) {
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
  assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 10, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].genus, 1);
  assert.ok(brep.coedges.every(use => use.pcurve));
  const inner = bounds.map((pair, axis) => pair.map((value, side) => value + (side === 0 ? 1 : -1) * (kept[pairs[axis][side]] ?? 0)));
  const outerV = bounds.reduce((v, [low, high]) => v * (high - low), 1), innerV = inner.reduce((v, [low, high]) => v * (high - low), 1);
  const volume = outerV - innerV, centroid = bounds.map(([low, high], axis) =>
    (outerV * (low + high) / 2 - innerV * (inner[axis][0] + inner[axis][1]) / 2) / volume);
  for (const mass of [massPropertiesOf(output, 1), brepMassProperties(brep, 1)]) {
    close(mass.volume, volume); mass.centroid.forEach((value, axis) => close(value, centroid[axis]));
  }
  const points = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  for (const [axis, names] of pairs.entries()) for (const [side, name] of names.entries()) {
    const outer = brep.faces.filter(face => face.name === name), inside = brep.faces.filter(face => face.name === `wall.in.${name}`);
    assert.equal(outer.length, 1, name); assert.equal(inside.length, axis === 2 ? 0 : 1, name);
    for (const [face, boundary, sign] of [[outer[0], bounds[axis][side], side === 0 ? -1 : 1],
      ...(axis === 2 ? [] : [[inside[0], inner[axis][side], side === 0 ? 1 : -1]])]) {
      const geometry = faceGeometry(face); assert.equal(geometry.kind, 'plane');
      assert.equal(geometry.o[axis], boundary); assert.equal(geometry.n[axis], sign);
      assert.equal(face.loops.length, axis === 2 ? 2 : 1);
      assert.ok(face.surface.controlPoints.every(row => row.every(point => point[axis] === boundary)));
      const faceLoops = face.loops.map(id => loops.get(id));
      for (const loop of faceLoops) assert.equal(loop.coedges.length, 4);
      if (axis === 2) {
        assert.deepEqual(faceLoops.map(loop => loop.kind).sort(), ['inner', 'outer']);
        for (const loop of faceLoops) {
          const r = loop.kind === 'outer' ? bounds : inner;
          const expected = new Set(r[0].flatMap(x => r[1].map(y => key([x, y, boundary]))));
          const actual = new Set(loop.coedges.flatMap(id => edges.get(coedges.get(id).edge).vertices.map(id => key(points.get(id)))));
          assert.deepEqual(actual, expected, `${name} ${loop.kind} exact rectangular trim`);
        }
      }
    }
  }
  const expectedVertices = new Set([bounds, inner].flatMap(r => r[0].flatMap(x => r[1].flatMap(y => r[2].map(z => key([x, y, z]))))));
  assert.deepEqual(new Set(brep.vertices.map(vertex => key(vertex.point))), expectedVertices);
  assert.equal(new Set(brep.faces.map(face => face.name)).size, 10);
  return { brep, volume, centroid };
}

test('original top and bottom form an asymmetric exact rectangular tube, with independent wall edit oracles', () => {
  const snapshot = evaluateCadPart(doc()), base = verify(snapshot, [[0, 40], [0, 30], [0, 20]], walls), saved = saveCadPart(snapshot);
  close(base.volume, 8640); base.centroid.forEach((value, axis) => close(value, [196 / 9, 151 / 9, 10][axis]));
  assert.equal(JSON.parse(saved).features[2].secondOpening, 'box.bottom');
  assert.deepEqual(verify(loadCadPart(saved), [[0, 40], [0, 30], [0, 20]], walls).brep, base.brep);
  for (const [name, volume, centroid] of [
    ['box.side1', 9600, [23, 16.5, 10]],
    ['box.side3', 10560, [206 / 11, 179 / 11, 10]],
  ]) {
    const kept = { ...walls, [name]: 7 }, feature = { ...shell, walls: kept };
    const changed = reevaluate(snapshot, { document: doc(feature) }), result = verify(changed, [[0, 40], [0, 30], [0, 20]], kept);
    close(result.volume, volume); result.centroid.forEach((value, axis) => close(value, centroid[axis]));
    assert.deepEqual(loadCadPart(saveCadPart(changed)).outputs[0].brep, result.brep);
  }
  assert.equal(saveCadPart(snapshot), saved);
});

test('cap role order and shifted original stock preserve exact tube rings', () => {
  const base = evaluateCadPart(doc()).outputs[0].brep;
  const reversed = { ...shell, opening: 'box.bottom', secondOpening: 'box.top' };
  assert.deepEqual(verify(evaluateCadPart(doc(reversed)), [[0, 40], [0, 30], [0, 20]], walls).brep, base);
  const source = { ...sketch, min: [-7, 11], max: [33, 41] }, extrude = { ...extrusion, from: -5 };
  verify(evaluateCadPart(doc(reversed, source, extrude)), [[-7, 33], [11, 41], [-5, 15]], walls);
});

test('tube thickness collapse and other opposite opening pairs refuse without changing accepted output', () => {
  const snapshot = evaluateCadPart(doc()), accepted = saveCadPart(snapshot);
  const reject = (feature, code) => assert.throws(() => reevaluate(snapshot, { document: doc(feature) }), error => error.code === code);
  for (const [name, value] of [['box.side3', 35], ['box.side1', 37], ['box.side0', 26], ['box.side2', 28], ['box.side3', 35 - 0.00005]])
    reject({ ...shell, walls: { ...walls, [name]: value } }, 'PARAMETER');
  for (const [opening, secondOpening] of [['box.side3', 'box.side1'], ['box.side0', 'box.side2']])
    reject({ ...shell, opening, secondOpening }, 'CAPABILITY');
  const { 'box.side0': omitted, ...missing } = walls; assert.equal(omitted, 2);
  reject({ ...shell, walls: missing }, 'REFERENCE');
  reject({ ...shell, walls: { ...walls, 'box.bottom': 2 } }, 'REFERENCE');
  reject({ ...shell, secondOpening: 'box.top' }, 'INPUT');
  assert.equal(saveCadPart(snapshot), accepted);
});

test('D2095 top-side and previous uniform tube native bytes are unchanged', () => {
  // Native JSON captured on 33c064386 before adding the explicit top-bottom branch.
  const hashes = {
    'box.side3': '42b6ecf3e82e702b10f1563d92029d5e1e389b0d32efab5bdad1c5c05bab5caa',
    'box.side1': '37dad84caf78b18518caf0fdecd41feb265f02b8fe44c375d25beadf50acabb3',
    'box.side0': '24a0c3e2d02c1f506a3b01bf4e656bdf7ae008e3fef7a515fa442b5de96f9639',
    'box.side2': 'cfe40ddda8014584c6edc40ac78fa5c8c56ed8a4d4d99095215da40b19ed7f2a',
  };
  const hash = feature => createHash('sha256').update(JSON.stringify(evaluateCadPart(doc(feature)).outputs[0].brep)).digest('hex');
  for (const [vertical, expected] of Object.entries(hashes)) {
    const kept = Object.fromEntries(pairs.slice(0, 2).flat().filter(name => name !== vertical).map((name, i) => [name, [3, 5, 4][i]]));
    kept['box.bottom'] = 2;
    assert.equal(hash({ ...shell, secondOpening: vertical, walls: kept }), expected);
  }
  assert.equal(hash({ id: 'wall', kind: 'shell', target: 'box', open: ['box.top', 'box.bottom'], thickness: 2 }), 'd86a78c2dfa3e66080eb19e34d393213e428ebee1c01de7df878bd88066bfe9d');
});
