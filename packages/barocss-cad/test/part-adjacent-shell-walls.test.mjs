import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry, loadCadPart, massPropertiesOf, reevaluate, saveCadPart } from '../dist/index.js';

const sketch = { id: 'profile', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] };
const extrusion = { id: 'box', kind: 'extrude', sketch: 'profile', height: 20 };
const pairs = [['box.side3', 'box.side1'], ['box.side0', 'box.side2'], ['box.bottom', 'box.top']];
const walls = { 'box.side3': 3, 'box.side1': 5, 'box.side2': 4, 'box.bottom': 2 };
const shell = { id: 'wall', kind: 'shell-walls', target: 'box', opening: 'box.top', secondOpening: 'box.side0', walls };
const doc = (feature = shell, source = sketch, extrude = extrusion) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [source, extrude, feature],
});
const close = (a, b) => assert.ok(Number.isFinite(a) && Math.abs(a - b) < 1e-8, `${a} != ${b}`);
const reject = (feature, code, source = sketch, extrude = extrusion) => assert.throws(() => evaluateCadPart(doc(feature, source, extrude)), error => error.code === code);

function verify(snapshot, bounds, feature) {
  const output = snapshot.outputs[0], brep = output.brep, report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
  assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 12, loops: 12, coedges: 56, edges: 28, vertices: 18 });
  assert.equal(report.topology.length, 1); assert.equal(report.topology[0].genus, 0);
  assert.ok(brep.coedges.every(use => use.pcurve));
  const cavity = bounds.map((pair, axis) => pair.map((v, side) => v + (side === 0 ? 1 : -1) * (feature.walls[pairs[axis][side]] ?? 0)));
  const V = bounds.reduce((v, [low, high]) => v * (high - low), 1), removed = cavity.reduce((v, [low, high]) => v * (high - low), 1);
  const volume = V - removed, centroid = bounds.map(([low, high], axis) =>
    (V * (low + high) / 2 - removed * (cavity[axis][0] + cavity[axis][1]) / 2) / volume);
  for (const mass of [massPropertiesOf(output, 1), brepMassProperties(brep, 1)]) {
    close(mass.volume, volume); mass.centroid.forEach((value, axis) => close(value, centroid[axis]));
  }
  const open = [feature.opening, feature.secondOpening], vertical = open.find(name => name !== 'box.top');
  for (const [axis, names] of pairs.entries()) for (const [side, name] of names.entries()) {
    const outer = brep.faces.filter(face => face.name?.replace(/#\d+$/, '') === name);
    assert.equal(outer.length, name === vertical ? 3 : 1, name);
    for (const face of outer) {
      const geometry = faceGeometry(face);
      assert.equal(geometry.kind, 'plane'); assert.equal(geometry.o[axis], bounds[axis][side]);
      assert.equal(geometry.n[axis], side === 0 ? -1 : 1); assert.equal(face.loops.length, 1);
    }
    const inner = brep.faces.filter(face => face.name === `wall.in.${name}`);
    assert.equal(inner.length, open.includes(name) ? 0 : 1, name);
    for (const face of inner) {
      const geometry = faceGeometry(face);
      assert.equal(geometry.kind, 'plane'); assert.equal(geometry.o[axis], cavity[axis][side]);
      assert.equal(geometry.n[axis], side === 0 ? 1 : -1);
      assert.equal(brep.loops.find(loop => loop.id === face.loops[0]).coedges.length, 4);
    }
  }
  assert.equal(brep.loops.find(loop => loop.id === brep.faces.find(face => face.name === 'box.top').loops[0]).coedges.length, 8);
  const outerCorners = []; // Build the eight corners without a geometry helper.
  for (const x of bounds[0]) for (const y of bounds[1]) for (const z of bounds[2]) outerCorners.push([x, y, z]);
  for (const point of outerCorners) assert.equal(brep.vertices.filter(vertex => vertex.point.every((v, k) => v === point[k])).length, 1);
  for (const vertex of brep.vertices) vertex.point.forEach((value, axis) => assert.ok([...bounds[axis], ...cavity[axis]].includes(value)));
  return { brep, volume, centroid };
}

test('top and front opening have four independent exact walls and an analytic edit oracle', () => {
  const snapshot = evaluateCadPart(doc()), first = verify(snapshot, [[0, 40], [0, 30], [0, 20]], shell);
  close(first.volume, 9024); first.centroid.forEach((value, axis) => close(value, [21.659574468085108, 18.319148936170212, 8.340425531914894][axis]));
  const text = saveCadPart(snapshot); assert.equal(JSON.parse(text).features[2].secondOpening, 'box.side0');
  assert.deepEqual(verify(loadCadPart(text), [[0, 40], [0, 30], [0, 20]], shell).brep, first.brep);
  const changedShell = { ...shell, walls: { ...walls, 'box.bottom': 6 } }, changed = reevaluate(snapshot, { document: doc(changedShell) });
  const second = verify(changed, [[0, 40], [0, 30], [0, 20]], changedShell);
  close(second.volume, 12352); second.centroid.forEach((value, axis) => close(value, [20.94300518134715, 16.8860103626943, 7.170984455958549][axis]));
  assert.equal(saveCadPart(snapshot), text);
  const invalid = { ...changedShell, walls: { ...changedShell.walls, 'box.side3': 35 } };
  assert.throws(() => reevaluate(changed, { document: doc(invalid) }), error => error.code === 'PARAMETER');
  assert.deepEqual(loadCadPart(saveCadPart(changed)).outputs[0].brep, second.brep);
});

test('all four original vertical openings and either input order share the exact native path', () => {
  for (const vertical of pairs.slice(0, 2).flat()) {
    const kept = Object.fromEntries(pairs.slice(0, 2).flat().filter(name => name !== vertical).map((name, i) => [name, [3, 5, 4][i]]));
    kept['box.bottom'] = 2;
    const feature = { ...shell, secondOpening: vertical, walls: kept };
    const result = verify(evaluateCadPart(doc(feature)), [[0, 40], [0, 30], [0, 20]], feature);
    const reversed = { ...feature, opening: vertical, secondOpening: 'box.top' };
    assert.deepEqual(verify(evaluateCadPart(doc(reversed)), [[0, 40], [0, 30], [0, 20]], reversed).brep, result.brep);
    const shiftedSketch = { ...sketch, min: [-7, 11], max: [33, 41] }, shiftedExtrude = { ...extrusion, from: -5 };
    verify(evaluateCadPart(doc(feature, shiftedSketch, shiftedExtrude)), [[-7, 33], [11, 41], [-5, 15]], feature);
  }
});

test('two explicit openings require exactly four finite kept walls and refuse collapsed cavities', () => {
  const { 'box.bottom': removed, ...missing } = walls;
  reject({ ...shell, walls: missing }, 'REFERENCE');
  reject({ ...shell, walls: { ...missing, 'wrong.wall': removed } }, 'REFERENCE');
  reject({ ...shell, walls: { ...walls, 'box.top': 2 } }, 'REFERENCE');
  for (const secondOpening of ['', null, ['box.side0'], 'box.top']) reject({ ...shell, secondOpening }, 'INPUT');
  reject({ ...shell, secondOpening: 'absent' }, 'SELECTION');
  for (const value of [0, -1, 0.00001, NaN, Infinity, '2']) reject({ ...shell, walls: { ...walls, 'box.bottom': value } }, 'PARAMETER');
  for (const [name, value] of [['box.bottom', 20], ['box.side3', 35], ['box.side2', 30], ['box.side3', 35 - 0.00005]])
    reject({ ...shell, walls: { ...walls, [name]: value } }, 'PARAMETER');
  reject({ ...shell, secondOpening: undefined }, 'REFERENCE'); // A missing wall never implies an opening.
  reject(shell, 'CAPABILITY', { ...sketch, profile: 'polygon', points: [[0, 0], [40, 0], [40, 30], [0, 30]] });
  reject(shell, 'CAPABILITY', sketch, { ...extrusion, draft: 3 });
});

test('expect owns both opening roles and all four kept wall names', () => {
  const source = evaluateCadPart({ ...doc(), features: [sketch, extrusion] }).outputs[0].brep;
  const expect = Object.fromEntries(source.faces.map(face => { const g = faceGeometry(face); return [face.name, { kind: 'plane', at: g.o, dir: g.n, size: 1 }]; }));
  verify(evaluateCadPart(doc({ ...shell, expect })), [[0, 40], [0, 30], [0, 20]], shell);
  reject({ ...shell, expect: { ...expect, 'box.side0': { ...expect['box.side0'], dir: [1, 0, 0] } } }, 'REFERENCE_MOVED');
  const { 'box.side0': discarded, ...missing } = expect;
  assert.ok(discarded); reject({ ...shell, expect: missing }, 'REFERENCE');
  reject({ ...shell, expect: { ...expect, 'wrong.role': expect['box.top'] } }, 'INPUT');
});

test('all previous single-opening and uniform Shell native bytes stay unchanged', () => {
  // Native JSON hashes captured on f815833c0 before implementing the new two-opening branch.
  const hashes = {
    'box.side0': 'e39de611a50c7169238f273e1e58257504ad5e910f210c1c21d129af24ac4eba',
    'box.side1': 'f1dbeb2765805a39e953e67e7ba0138af9240ac8d6726817899ec58d9f02084b',
    'box.side2': '0ef6f67b29969c30fbe25e3facc960c330895c53d011f459e67f7a5c08793c69',
    'box.side3': 'c21c6047f492165036512826ce8065d17b38c193f8f894693e59c013fd8922c9',
    'box.bottom': 'b306737c0d8ee98d2f06a63563d9bf9798d0855964fe0c1496bab9c8d134f829',
    'box.top': '0eed3d7c72948d3b0e381983393185ea82510b71d3dc3fe64d6548e7ba0a511e',
  };
  const all = { 'box.side0': 2, 'box.side1': 5, 'box.side2': 4, 'box.side3': 3, 'box.bottom': 4, 'box.top': 6 };
  const hash = feature => createHash('sha256').update(JSON.stringify(evaluateCadPart(doc(feature)).outputs[0].brep)).digest('hex');
  for (const [opening, expected] of Object.entries(hashes)) {
    const kept = { ...all }; delete kept[opening];
    assert.equal(hash({ id: 'wall', kind: 'shell-walls', target: 'box', opening, walls: kept }), expected);
  }
  assert.equal(hash({ id: 'wall', kind: 'shell', target: 'box', open: ['box.top'], thickness: 2 }), '5c41c5aac35c45be01a5d1b7ad90c312c118df2cb3e739d487f201afb4ca8375');
  assert.equal(hash({ id: 'wall', kind: 'shell', target: 'box', open: ['box.top', 'box.side0'], thickness: 2 }), 'b0f16cf786f3aff035b1c253f619d77f89292563a6a196ac8ce68afe45ff0c03');
});
