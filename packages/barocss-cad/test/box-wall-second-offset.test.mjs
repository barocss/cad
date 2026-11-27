import test from 'node:test';
import assert from 'node:assert/strict';
import { evaluateCadPart, reevaluate, saveCadPart, loadCadPart, checkBrep, brepMassProperties } from '../dist/index.js';
import { offsetBoxWallIfAdmitted, offsetBoxWallAfterOffsetIfAdmitted, offsetBoxCapIfAdmitted } from '../dist/features/drafted-cap-offset.js';
import { oracle } from '../scripts/rb/fuzz-oracle.mjs';
import { random } from '../scripts/rb/property.mjs';

const roles = [['box.side0', 1, 0], ['box.side1', 0, 1], ['box.side2', 1, 1], ['box.side3', 0, 0]];
const close = (a, b, label, e = 1e-9) => assert.ok(Number.isFinite(a) && Math.abs(a - b) <= e, `${label}: ${a} vs ${b}`);
const typed = error => ['INPUT', 'PARAMETER', 'CAPABILITY', 'REFERENCE', 'GEOMETRY'].includes(error.code);
function fixture(k, reverse = true, distanceScale = 1) {
  const w = 12.5 + 3 * k, d = 10.25 + 2 * k, h = 6 + k / 2, min = [0.1 + 1.3 * k, -2.2 + 0.7 * k], from = -3 + 0.3 * k;
  const [face, axis, end] = roles[k % 4];
  const first = [2, -1, 1.25, -0.75][k % 4] * distanceScale;
  const second = reverse ? -first : [0.5, 0.5, -0.25, 0.25][k % 4] * distanceScale;
  const document = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'profile', kind: 'sketch', profile: 'rectangle', min, max: [min[0] + w, min[1] + d] },
    { id: 'box', kind: 'extrude', sketch: 'profile', height: h, from },
    { id: 'first', kind: 'offset-face', target: 'box', face, distance: first },
    { id: 'second', kind: 'offset-face', target: 'first', face, distance: second },
  ] };
  const bounds = [[min[0], min[0] + w], [min[1], min[1] + d], [from, from + h]];
  bounds[axis][end] += (end === 0 ? -1 : 1) * (first + second);
  return { document, bounds, face, first, second };
}
function verify(spec) {
  const { document, bounds, face, first, second } = spec, inputBefore = structuredClone(document);
  const original = evaluateCadPart({ ...document, features: document.features.slice(0, 2) }).outputs[0].brep;
  const prefix = evaluateCadPart({ ...document, features: document.features.slice(0, 3) }), accepted = saveCadPart(prefix);
  const snapshot = reevaluate(prefix, { document }), output = snapshot.outputs[0], brep = output.brep;
  const report = checkBrep(brep, { strict: true, pcurveSamples: 7 }); assert.ok(report.valid, JSON.stringify(report.issues));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0); assert.ok(brep.coedges.every(use => use.pcurve));
  assert.deepEqual(brep.source, original.source); assert.deepEqual(brep.bodies, original.bodies); assert.deepEqual(brep.shells, original.shells); assert.deepEqual(brep.loops, original.loops);
  assert.deepEqual(brep.vertices.map(v => v.id), original.vertices.map(v => v.id));
  assert.deepEqual(brep.faces.map(f => [f.id, f.name, f.surface.id, f.loops]), original.faces.map(f => [f.id, f.name, f.surface.id, f.loops]));
  assert.deepEqual(brep.edges.map(e => [e.id, e.name, e.curve.id, e.vertices]), original.edges.map(e => [e.id, e.name, e.curve.id, e.vertices]));
  assert.deepEqual(brep.coedges.map(({ pcurve, ...use }) => [use, pcurve.id]), original.coedges.map(({ pcurve, ...use }) => [use, pcurve.id]));
  const expected = first + second === 0 ? original : offsetBoxWallIfAdmitted(original, face, first + second);
  assert.deepEqual(brep, expected);
  assert.deepEqual(offsetBoxWallAfterOffsetIfAdmitted(prefix.outputs[0].brep, original, face, first, second), expected);
  const volume = bounds.reduce((v, [lo, hi]) => v * (hi - lo), 1), center = bounds.map(([lo, hi]) => (lo + hi) / 2), mass = brepMassProperties(brep, 1);
  close(mass.volume, volume, 'independent final cuboid volume', 1e-7); mass.centroid.forEach((v, k) => close(v, center[k], 'independent center'));
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep); assert.deepEqual(evaluateCadPart(document).outputs[0].brep, brep);
  assert.equal(snapshot.document.features.length, 4); assert.deepEqual(snapshot.document.features.slice(2), document.features.slice(2));
  assert.deepEqual(snapshot.outputs.map(o => [o.id, o.feature]), [['second', 'second']]);
  assert.equal(saveCadPart(prefix), accepted); assert.deepEqual(document, inputBefore);
  return { snapshot, original, mass, volume, center };
}

test('eight varied fractional rectangles restore the exact original native B-rep after one same-wall inverse', () => {
  for (let k = 0; k < 8; k++) verify(fixture(k));
});

test('a second signed wall edit replays a nonzero authored sum with stable original owners', () => {
  for (let k = 0; k < 8; k++) verify(fixture(k, false));
});

test('seeded wall moves and inverses agree with the independent ray oracle within its fuzz bounds', t => {
  const seed = 2101, sample = random(seed), volumeRatios = [], centroidRatios = [];
  for (let k = 0; k < 8; k++) {
    const distanceScale = 0.5 + sample();
    for (const reverse of [true, false]) {
      const spec = fixture(k, reverse, distanceScale), { mass } = verify(spec), ranges = spec.bounds;
      const [w, d, h] = ranges.map(([lo, hi]) => hi - lo);
      const ray = oracle({ leaf: { kind: 'box', w, d, h, move: ranges.map(([lo]) => lo) } }, 32, 4);
      // Use the bounds from the existing seeded fuzz runner. The closed-form check stays stricter.
      const volumeBound = Math.max(2 * ray.e, 1e-4 * ray.volumeMM3, 1e-9);
      const centroidBound = Math.max(2 * ray.eCentroid, 1e-4 * Math.max(1, w, d, h));
      const volumeRatio = Math.abs(ray.volumeMM3 - mass.volume) / volumeBound;
      const centroidRatio = Math.max(...mass.centroid.map((value, axis) => Math.abs(ray.centroidMM[axis] - value))) / centroidBound;
      assert.ok(volumeRatio <= 1 && centroidRatio <= 1, `ray sample ${k}, inverse ${reverse}: ${volumeRatio}, ${centroidRatio}`);
      volumeRatios.push(volumeRatio); centroidRatios.push(centroidRatio);
    }
  }
  t.diagnostic(JSON.stringify({ seed, samples: volumeRatios.length,
    maxVolumeBoundRatio: Math.max(...volumeRatios), maxCentroidBoundRatio: Math.max(...centroidRatios) }));
});

test('second Offset registers original recipe dependencies before cache capture', () => {
  const spec = fixture(0, false); spec.document.parameters.W = 12.5;
  spec.document.features[0].min = [0, 0]; spec.document.features[0].max = [{ parameter: 'W' }, 10.25];
  const snapshot = evaluateCadPart(spec.document), changed = reevaluate(snapshot, { parameters: { W: 20 } });
  assert.deepEqual(changed.outputs[0].brep, evaluateCadPart({ ...spec.document, parameters: { W: 20 } }).outputs[0].brep);
  close(brepMassProperties(changed.outputs[0].brep, 1).volume, 20 * (10.25 + 2.5) * 6, 'cache width edit', 1e-7);
  const edited = structuredClone(spec.document); edited.features[2].distance = 3;
  const replay = reevaluate(snapshot, { document: edited });
  assert.deepEqual(replay.outputs[0].brep, evaluateCadPart(edited).outputs[0].brep);
  close(brepMassProperties(replay.outputs[0].brep, 1).volume, 12.5 * (10.25 + 3.5) * 6, 'upstream first distance edit', 1e-7);
});

test('both step distances are bounded while their sum may cross 10000 within the native coordinate range', () => {
  const spec = fixture(1, false), d = spec.document;
  d.features[0].min = [-10000, 0]; d.features[0].max = [-9950, 20]; d.features[1].from = 0; d.features[1].height = 10;
  d.features[2].distance = 9000; d.features[3].distance = 9000;
  const snapshot = evaluateCadPart(d), mass = brepMassProperties(snapshot.outputs[0].brep, 1);
  assert.ok(checkBrep(snapshot.outputs[0].brep, { strict: true }).valid);
  close(mass.volume, 18050 * 20 * 10, 'two individually bounded steps', 1e-6);
  assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, snapshot.outputs[0].brep);
});

test('unsupported ancestry, another wall, native drift, nonmoving and collapsed second edits refuse atomically', () => {
  const spec = fixture(0), prefixDoc = { ...spec.document, features: spec.document.features.slice(0, 3) }, prefix = evaluateCadPart(prefixDoc), saved = saveCadPart(prefix);
  for (const [face, distance] of [['box.side1', -2], ['box.side0', -12.25], ['box.side0', -13], ['box.side0', Number.EPSILON]]) {
    const d = structuredClone(spec.document); d.features[3].face = face; d.features[3].distance = distance;
    assert.throws(() => reevaluate(prefix, { document: d }), typed);
  }
  const third = structuredClone(spec.document); third.features.push({ id: 'third', kind: 'offset-face', target: 'second', face: 'box.side0', distance: 1 });
  assert.throws(() => evaluateCadPart(third), typed);
  for (const change of [{ id: 'moved', kind: 'translate', target: 'first', offset: [1, 0, 0] },
    { id: 'moved', kind: 'rotate', target: 'first', axis: 'z', angle: 90 }]) {
    const d = structuredClone(spec.document); d.features.splice(3, 0, change); d.features.at(-1).target = 'moved'; assert.throws(() => evaluateCadPart(d), typed);
  }
  const original = evaluateCadPart({ ...spec.document, features: spec.document.features.slice(0, 2) }).outputs[0].brep;
  const drifted = offsetBoxWallIfAdmitted(original, 'box.side0', spec.first + 1);
  assert.throws(() => offsetBoxWallAfterOffsetIfAdmitted(drifted, original, 'box.side0', spec.first, spec.second), error => error.code === 'GEOMETRY' && /does not match/.test(error.message));
  for (const value of [0, Infinity, 10001]) assert.throws(() => offsetBoxWallAfterOffsetIfAdmitted(prefix.outputs[0].brep, original, 'box.side0', spec.first, value), error => error.code === 'INPUT');
  assert.equal(saveCadPart(prefix), saved);
});

test('repeated same-cap Offset keeps the existing sequential cap producer', () => {
  for (const face of ['box.top', 'box.bottom']) for (const distance of [1, -2]) {
    const spec = fixture(0); spec.document.features[2].face = face; spec.document.features[3].face = face;
    spec.document.features[3].distance = distance;
    const first = evaluateCadPart({ ...spec.document, features: spec.document.features.slice(0, 3) }).outputs[0].brep;
    const result = evaluateCadPart(spec.document).outputs[0].brep;
    assert.deepEqual(result, offsetBoxCapIfAdmitted(first, face, distance));
    assert.equal(checkBrep(result, { strict: true }).valid, true);
  }
});
