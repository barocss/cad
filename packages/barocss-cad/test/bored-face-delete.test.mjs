import assert from 'node:assert/strict';
import test from 'node:test';
import { CadPartError, checkBrep, evaluateCadPart } from '../dist/index.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { healBoredPlateIfAdmitted } from '../dist/features/bored-cap-offset.js';
import { faceSignatures } from '../dist/part/part-expect.js';

const halves = ['h.side0#1', 'h.side0#2'];
const plate = ({ min = [0, 0], max = [40, 30], height = 10, from = 0, center = [11, 9], radius = 3, ...hole } = {}) => ({
  format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 's', kind: 'sketch', profile: 'rectangle', min, max },
    { id: 'b', kind: 'extrude', sketch: 's', height, from },
    { id: 'h', kind: 'hole', target: 'b', center, radius, ...hole },
  ],
});
const append = (doc, feature) => ({ ...doc, features: [...doc.features, feature] });
const output = doc => evaluateCadPart(doc).outputs[0];
const deletion = (face, expect, target = 'h') => ({ id: 'heal', kind: 'delete-face', target, face, ...(expect ? { expect } : {}) });
const close = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-8, `${actual} differs from ${expected}`);

function freeze(value) {
  for (const child of Object.values(value)) if (child && typeof child === 'object') freeze(child);
  return Object.freeze(value);
}

function assertHealed(before, after) {
  const report = checkBrep(after, { strict: true });
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-9);
  assert.ok(report.maximumEdgeSurfaceGap < 1e-9);
  assert.equal(after.bodies, before.bodies);
  assert.equal(after.shells[0].id, before.shells[0].id);
  assert.equal(after.source, before.source);
  assert.deepEqual(after.faces.map(face => face.name).sort(), ['b.bottom', 'b.side0', 'b.side1', 'b.side2', 'b.side3', 'b.top']);
  for (const face of after.faces) {
    const original = before.faces.find(candidate => candidate.id === face.id);
    assert.equal(face.surface, original.surface);
    assert.deepEqual(face, { ...original, loops: original.loops.filter(id => before.loops.find(loop => loop.id === id).kind === 'outer') });
  }
  for (const kind of ['loops', 'coedges', 'edges', 'vertices']) {
    for (const item of after[kind]) assert.equal(item, before[kind].find(candidate => candidate.id === item.id));
  }
}

test('either exact cylindrical half heals the same off-centre bore and preserves the stock topology', () => {
  const doc = plate(), before = freeze(output(doc).brep), saved = structuredClone(before);
  const boreArea = Math.PI * 3 ** 2;
  const stockArea = 40 * 30;
  const sourceMass = brepMassProperties(before, 1);
  close(sourceMass.volume, (stockArea - boreArea) * 10);
  close(sourceMass.centroid[0], (stockArea * 20 - boreArea * 11) / (stockArea - boreArea));
  close(sourceMass.centroid[1], (stockArea * 15 - boreArea * 9) / (stockArea - boreArea));

  for (const name of halves) {
    const healed = healBoredPlateIfAdmitted(before, name);
    assertHealed(before, healed);
    const mass = brepMassProperties(healed, 1);
    close(mass.volume, stockArea * 10);
    close(mass.volume - sourceMass.volume, boreArea * 10);
    for (const [axis, coordinate] of [20, 15, 5].entries()) close(mass.centroid[axis], coordinate);

    const authored = output(append(doc, deletion(name)));
    assert.equal(authored.feature, 'heal');
    assert.equal(authored.representation, 'planar');
    assert.deepEqual(authored.brep, healed);
  }
  assert.deepEqual(before, saved);
});

test('healing fills a translated fractional bore through the full current thickness after cap offset', () => {
  const doc = append(plate({ min: [5.25, -8.5], max: [45.25, 21.5], height: 10.5, from: -3.75, center: [16.25, 0.5], radius: 3.125 }),
    { id: 'offset', kind: 'offset-face', target: 'h', face: 'b.bottom', distance: 2.25 });
  const before = output(doc).brep;
  const after = healBoredPlateIfAdmitted(before, halves[1]);
  assertHealed(before, after);
  assert.deepEqual(output(append(doc, deletion(halves[1], undefined, 'offset'))).brep, after);
  const mass = brepMassProperties(after, 1);
  close(mass.volume, 40 * 30 * 12.75);
  for (const [axis, coordinate] of [25.25, 6.5, 0.375].entries()) close(mass.centroid[axis], coordinate);
});

test('the authored operation checks the selected native member signature', () => {
  const doc = plate(), signatures = faceSignatures(output(doc).brep), [name, other] = halves;
  const size = Math.PI * 3 * 10;
  const expect = { [name]: { ...signatures.get(name), size } };
  assert.equal(output(append(doc, deletion(name, expect))).brep.faces.length, 6);
  const swapped = { [name]: { ...signatures.get(other), size } };
  assert.throws(() => output(append(doc, deletion(name, swapped))),
    error => error instanceof CadPartError && error.code === 'REFERENCE_MOVED');
  assert.throws(() => output(append(plate({ radius: 4 }), deletion(name, expect))),
    error => error instanceof CadPartError && error.code === 'REFERENCE_MOVED' && /radius/.test(error.message));
});

test('heal refuses a partial or ambiguous selection and other hole topology', () => {
  const doc = plate(), source = output(doc).brep, [name] = halves;
  const duplicate = structuredClone(source);
  duplicate.faces.find(face => face.name === halves[1]).name = name;
  const malformed = structuredClone(source);
  malformed.coedges[0].pcurve.controlPoints[0][0] += 1e-10;
  const twoBores = output(append(doc, { id: 'h2', kind: 'hole', target: 'h', center: [26, 17], radius: 2 })).brep;
  for (const brep of [
    duplicate, malformed, twoBores,
    output(plate({ depth: 4 })).brep,
    output(plate({ countersink: 10 })).brep,
    output(plate({ center: [1, 9] })).brep,
  ]) {
    assert.ok(brep.faces.some(face => face.name === name), 'control must contain the requested name');
    assert.equal(healBoredPlateIfAdmitted(brep, name), undefined);
  }
  for (const face of ['b.top', 'b.side0', 'missing', 'h.side0', halves.join('+'), '']) {
    assert.equal(healBoredPlateIfAdmitted(source, face), undefined);
  }
  for (const [face, code, message] of [
    ['b.top', 'CAPABILITY', /Select its cylindrical wall/],
    ['b.side0', 'CAPABILITY', /Select its cylindrical wall/],
    ['h.side0', 'REFERENCE', /missing or ambiguous/],
    [halves.join('+'), 'INPUT', /one exact native bore wall name/],
    ['', 'INPUT', /one exact native bore wall name/],
  ]) {
    assert.throws(() => output(append(doc, deletion(face))),
      error => error instanceof CadPartError && error.code === code && message.test(error.message));
  }
});
