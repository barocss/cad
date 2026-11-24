import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, faceGeometry, massPropertiesOf } from '../dist/index.js';

const sketch = { id: 'profile', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] };
const extrude = { id: 'box', kind: 'extrude', sketch: 'profile', height: 20 };
const walls = { 'box.side0': 2, 'box.side1': 5, 'box.side2': 4, 'box.side3': 3, 'box.bottom': 4 };
const shell = { id: 'wall', kind: 'shell-walls', target: 'box', opening: 'box.top', walls };
const evaluate = (features = [sketch, extrude, shell]) => evaluateCadPart({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features,
});
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);

test('per-face box Shell preserves native names and the exact asymmetric cavity', () => {
  const [result] = evaluate().outputs, { brep } = result;
  const check = checkBrep(brep, { strict: true, pcurveSamples: 7 });
  assert.ok(check.valid);
  assert.deepEqual(check.counts, { bodies: 1, shells: 1, faces: 11, loops: 12, coedges: 48, edges: 24, vertices: 16 });
  assert.equal(check.topology[0].genus, 0);
  assert.ok(brep.coedges.every(use => use.pcurve));
  const inside = 32 * 24 * 16, volume = 24000 - inside;
  const mass = massPropertiesOf(result, 1);
  near(mass.volume, volume);
  for (const [i, value] of mass.centroid.entries()) near(value, (24000 * [20,15,10][i] - inside * [19,14,12][i]) / volume);
  const ring = brep.faces.find(face => face.name === 'box.top');
  assert.equal(ring.loops.length, 2);
  assert.ok(!brep.faces.some(face => face.name === 'wall.ceiling'));
  for (const [source, axis, sign, boundary] of [
    ['box.side0', 1, 1, 2], ['box.side1', 0, -1, 35], ['box.side2', 1, -1, 26],
    ['box.side3', 0, 1, 3], ['box.bottom', 2, 1, 4],
  ]) {
    const exterior = brep.faces.find(face => face.name === source);
    const interior = brep.faces.find(face => face.name === `wall.in.${source}`);
    assert.ok(exterior && interior);
    const support = faceGeometry(interior);
    assert.equal(support.kind, 'plane');
    near(support.o[axis], boundary);
    near(support.n[axis], sign);
  }
  const thickOneSide = { ...shell, walls: { ...walls, 'box.side3': 25 } };
  near(massPropertiesOf(evaluate([sketch, extrude, thickOneSide]).outputs[0], 1).volume, 24000 - 10 * 24 * 16);
});

test('per-face box Shell refuses ambiguous walls, stale orientation and a closed cavity', () => {
  const reject = (feature, reason, from = sketch) => assert.throws(() => evaluate([from, extrude, feature]), reason);
  reject({ ...shell, opening: 'box.bottom' }, /upper face/);
  reject({ ...shell, walls: { ...walls, 'box.top': 2 } }, /five kept faces/);
  const { 'box.side0': replaced, ...rest } = walls;
  reject({ ...shell, walls: { ...rest, 'unknown.wall': replaced } }, /five kept faces/);
  reject({ ...shell, walls: { ...walls, 'box.bottom': 0 } }, /Wall thickness/);
  reject({ ...shell, walls: { ...walls, 'box.bottom': 20 } }, /no cavity/);
  reject({ ...shell, walls: { ...walls, 'box.side3': 35 } }, /no cavity/);
  reject(shell, /exact cardinal box/, { id: 'profile', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 8 });
  const stock = evaluate([sketch, extrude]).outputs[0].brep;
  const expect = Object.fromEntries(stock.faces.map(face => {
    const g = faceGeometry(face);
    return [face.name, { kind: 'plane', at: g.o, size: 1, dir: g.n }];
  }));
  near(massPropertiesOf(evaluate([sketch, extrude, { ...shell, expect }]).outputs[0], 1).volume, 11712);
  reject({ ...shell, expect: { ...expect, 'box.side3': { ...expect['box.side3'], dir: [1, 0, 0] } } }, /REFERENCE_MOVED/);
  const uniform = { ...shell, kind: 'shell', thickness: 2, open: ['box.top'] };
  delete uniform.walls;
  delete uniform.opening;
  near(massPropertiesOf(evaluate([sketch, extrude, uniform]).outputs[0], 1).volume, 7152);
});
