import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry, loadCadPart, massPropertiesOf, saveCadPart } from '../dist/index.js';

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

test('per-face Shell gives each original lateral opening one exact ring and five named inner walls', () => {
  const pairs = [['box.side3', 'box.side1'], ['box.side0', 'box.side2'], ['box.bottom', 'box.top']];
  const extents = [40, 30, 20];
  for (const opening of pairs.slice(0, 2).flat()) {
    const kept = { ...walls, 'box.top': 6 };
    delete kept[opening];
    const feature = { ...shell, opening, walls: kept };
    const snapshot = evaluate([sketch, extrude, feature]);
    const [output] = snapshot.outputs, { brep } = output;
    const report = checkBrep(brep, { strict: true, pcurveSamples: 7 });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 11, loops: 12, coedges: 48, edges: 24, vertices: 16 });
    assert.equal(report.topology[0].genus, 0);
    assert.ok(brep.coedges.every(use => use.pcurve));
    const low = pairs.map(([name]) => kept[name] ?? 0);
    const high = pairs.map(([, name], axis) => extents[axis] - (kept[name] ?? 0));
    for (const [axis, names] of pairs.entries()) {
      for (const [side, name] of names.entries()) {
        const outward = side === 0 ? -1 : 1;
        const outer = brep.faces.find(face => face.name === name);
        const inner = brep.faces.find(face => face.name === `wall.in.${name}`);
        assert.ok(outer);
        const plane = faceGeometry(outer);
        assert.equal(plane.kind, 'plane');
        near(plane.o[axis], side === 0 ? 0 : extents[axis]);
        near(plane.n[axis], outward);
        if (name === opening) {
          assert.equal(outer.loops.length, 2);
          assert.equal(inner, undefined);
        } else {
          assert.equal(outer.loops.length, 1);
          assert.ok(inner);
          const support = faceGeometry(inner);
          assert.equal(support.kind, 'plane');
          near(support.o[axis], side === 0 ? low[axis] : high[axis]);
          near(support.n[axis], -outward);
        }
      }
    }
    const removed = high.reduce((volume, value, i) => volume * (value - low[i]), 1);
    for (const properties of [massPropertiesOf(output, 1), brepMassProperties(brep, 1)]) {
      near(properties.volume, 24000 - removed);
      properties.centroid.forEach((value, axis) =>
        near(value, (12000 * extents[axis] - removed * (high[axis] + low[axis]) / 2) / (24000 - removed)));
    }
    assert.deepEqual(loadCadPart(saveCadPart(snapshot)).outputs[0].brep, brep);
    const collapsed = { ...feature, walls: { ...kept, 'box.top': 16 } };
    assert.throws(() => evaluate([sketch, extrude, collapsed]), /no cavity/);
  }
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
