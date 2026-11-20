import assert from 'node:assert/strict';
import test from 'node:test';
import { CadPartError, checkBrep, createCylindricalBoreCheck, evaluateCadPart } from '../dist/index.js';
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
const secondBore = doc => append(doc, { id: 'h2', kind: 'hole', target: 'h', center: [27, 20], radius: 2 });
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

test('healing either exact bore of a flat two-bore plate preserves the other bore', () => {
  const doc = secondBore(plate()), source = freeze(output(doc).brep), before = structuredClone(source);
  const uses = new Map(source.coedges.map(use => [use.id, use]));
  for (const [remove, retain, center, diameter] of [
    ['h.side0', 'h2.side0', [27, 20], 4], ['h2.side0', 'h.side0', [11, 9], 6],
  ]) {
    const selected = source.faces.filter(face => face.name.startsWith(remove + '#'));
    const fixed = source.faces.filter(face => face.name.startsWith(retain + '#'));
    assert.equal(selected.length, 2);
    assert.equal(fixed.length, 2);
    const wallLoops = selected.flatMap(face => face.loops);
    const capLoops = source.loops.filter(loop => loop.kind === 'inner' &&
      loop.coedges.every(id => wallLoops.includes(uses.get(uses.get(id).twin).loop)));
    assert.equal(capLoops.length, 2);
    const gone = new Set([...wallLoops, ...capLoops.map(loop => loop.id)]);
    const expectedVolume = 12000 - 10 * Math.PI * (diameter / 2) ** 2;
    for (const member of selected) {
      const healed = healBoredPlateIfAdmitted(source, member.name);
      const report = checkBrep(healed, { strict: true });
      assert.ok(report.valid, report.issues.join('\n'));
      assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 });
      assert.equal(report.topology[0].genus, 1);
      assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
      assert.deepEqual(healed.loops, source.loops.filter(loop => !gone.has(loop.id)));
      assert.deepEqual(healed.faces, source.faces.filter(face => !selected.includes(face))
        .map(face => ({ ...face, loops: face.loops.filter(id => !gone.has(id)) })));
      for (const kind of ['loops', 'coedges', 'edges', 'vertices']) {
        for (const item of healed[kind]) assert.equal(item, source[kind].find(candidate => candidate.id === item.id));
      }
      for (const face of fixed) assert.equal(healed.faces.find(candidate => candidate.id === face.id), face);
      close(createCylindricalBoreCheck(healed)(fixed), diameter);
      const mass = brepMassProperties(healed, 1);
      close(mass.volume, expectedVolume);
      close(mass.centroid[0], (12000 * 20 - (12000 - expectedVolume) * center[0]) / expectedVolume);
      close(mass.centroid[1], (12000 * 15 - (12000 - expectedVolume) * center[1]) / expectedVolume);
      close(mass.centroid[2], 5);
      assert.deepEqual(output(append(doc, deletion(member.name, undefined, 'h2'))).brep, healed);
    }
    assert.deepEqual(healBoredPlateIfAdmitted(source, selected[0].name), healBoredPlateIfAdmitted(source, selected[1].name));
  }
  assert.deepEqual(source, before);
});

test('both successive bore-heal orders restore the same exact outer solid', () => {
  const doc = secondBore(plate()), [, reference] = halves;
  const orders = [[reference, 'h2.side0#1'], ['h2.side0#1', reference]];
  const results = orders.map(([first, second]) => {
    const initial = output(doc).brep;
    const firstHeal = append(doc, deletion(first, undefined, 'h2'));
    const before = output(firstHeal).brep;
    const authored = append(firstHeal, { ...deletion(second, undefined, 'heal'), id: 'finish' });
    const final = healBoredPlateIfAdmitted(before, second);
    assertHealed(before, final);
    assert.deepEqual(output(authored).brep, final);
    for (const face of final.faces) assert.equal(face.surface.id, initial.faces.find(candidate => candidate.id === face.id).surface.id);
    const mass = brepMassProperties(final, 1);
    close(mass.volume, 12000);
    for (const [axis, coordinate] of [20, 15, 5].entries()) close(mass.centroid[axis], coordinate);
    return final;
  });
  assert.deepEqual(results[0], results[1]);
});

for (const sign of [1, -1]) {
  const cap = sign === 1 ? 'b.top' : 'b.bottom', opposite = sign === 1 ? 0 : 10;
  test(`healing preserves the exact tilted ${cap} and the five other supports`, () => {
    const doc = plate(), plane = { origin: [0, 0, opposite + sign * 8], normal: [-1, -2, 10 * sign] };
    const tilted = append(doc, { id: 'tilt', kind: 'replace-face', target: 'h', face: cap, plane });
    const before = freeze(output(tilted).brep), source = structuredClone(before);
    assert.ok(Math.abs(brepMassProperties(before, 1).volume - (15600 - 98.1 * Math.PI)) < 1e-7);
    const results = halves.map(name => {
      const healed = healBoredPlateIfAdmitted(before, name);
      assertHealed(before, healed);
      const { volume, centroid } = brepMassProperties(healed, 1);
      close(volume, 15600);
      for (const [axis, coordinate] of [820 / 39, 210 / 13, sign === 1 ? 20 / 3 : 10 / 3].entries()) close(centroid[axis], coordinate);
      assert.deepEqual(output(append(tilted, deletion(name, undefined, 'tilt'))).brep, healed);
      return healed;
    });
    assert.deepEqual(results[0], results[1]);
    assert.deepEqual(before, source);
  });

  test(`healing either one of two bores preserves the other bore and the exact ${cap} plane`, () => {
    const plane = { origin: [0, 0, opposite + sign * 8], normal: [-1, -2, 10 * sign] };
    const tilted = append(secondBore(plate()), { id: 'tilt', kind: 'replace-face', target: 'h2', face: cap, plane });
    const before = freeze(output(tilted).brep), source = structuredClone(before);
    assert.ok(Math.abs(brepMassProperties(before, 1).volume - (15600 - 156.9 * Math.PI)) < 1e-7);
    const completed = [];
    for (const [removed, survivor, diameter, excluded] of [
      ['h.side0#', 'h2.side0#', 4, 58.8], ['h2.side0#', 'h.side0#', 6, 98.1],
    ]) {
      const deleted = before.faces.filter(face => face.name.startsWith(removed));
      const walls = before.faces.filter(face => face.name.startsWith(survivor));
      assert.equal(deleted.length, 2);
      assert.equal(walls.length, 2);
      const results = deleted.map(member => {
        const healed = healBoredPlateIfAdmitted(before, member.name);
        const report = checkBrep(healed, { strict: true });
        assert.ok(report.valid, report.issues.join('\n'));
        assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 10, coedges: 36, edges: 18, vertices: 12 });
        assert.equal(report.topology[0].genus, 1);
        assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
        close(createCylindricalBoreCheck(healed)(walls), diameter);
        assert.ok(Math.abs(brepMassProperties(healed, 1).volume - (15600 - excluded * Math.PI)) < 1e-7);
        const loops = new Set(healed.loops.map(loop => loop.id));
        assert.deepEqual(healed.faces, before.faces.filter(face => !deleted.includes(face))
          .map(face => ({ ...face, loops: face.loops.filter(id => loops.has(id)) })));
        for (const kind of ['loops', 'coedges', 'edges', 'vertices']) {
          for (const item of healed[kind]) assert.equal(item, before[kind].find(candidate => candidate.id === item.id));
        }
        assert.deepEqual(output(append(tilted, deletion(member.name, undefined, 'tilt'))).brep, healed);
        return healed;
      });
      assert.deepEqual(results[0], results[1]);

      const final = healBoredPlateIfAdmitted(results[0], walls[0].name);
      assertHealed(results[0], final);
      const { volume, centroid } = brepMassProperties(final, 1);
      close(volume, 15600);
      for (const [axis, coordinate] of [820 / 39, 210 / 13, sign === 1 ? 20 / 3 : 10 / 3].entries()) close(centroid[axis], coordinate);
      const firstHeal = append(tilted, deletion(deleted[0].name, undefined, 'tilt'));
      const replay = append(firstHeal, { ...deletion(walls[0].name, undefined, 'heal'), id: 'finish' });
      assert.deepEqual(output(replay).brep, final);
      completed.push(final);
    }
    assert.deepEqual(completed[0], completed[1]);
    assert.deepEqual(before, source);
  });
}

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
  const threeBores = output(append(secondBore(doc), { id: 'h3', kind: 'hole', target: 'h2', center: [8, 23], radius: 2 })).brep;
  for (const brep of [
    duplicate, malformed, threeBores,
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
    [halves.join('+'), 'INPUT', /one exact native face name/],
    ['', 'INPUT', /one exact native face name/],
  ]) {
    assert.throws(() => output(append(doc, deletion(face))),
      error => error instanceof CadPartError && error.code === code && message.test(error.message));
  }
});
