import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry } from '../dist/index.js';
import { healCylindricalBossIfAdmitted } from '../dist/features/bored-cap-offset.js';

const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const box = [
  { id: 'stock-plan', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
  { id: 'stock', kind: 'extrude', sketch: 'stock-plan', height: 10 },
];
const stock = evaluateCadPart(doc(box)).outputs[0].brep;
const solid = features => evaluateCadPart(doc(features)).outputs[0].brep;
const cap = 'boss.top';

function boss(center = [11, 9], radius = 3, z = 16) {
  return [...box, { id: 'boss-plan', kind: 'sketch', profile: 'circle', center, radius },
    { id: 'boss', kind: 'extrude', sketch: 'boss-plan', from: 8, height: z - 8 },
    { id: 'join', kind: 'union', target: 'stock', tool: 'boss' }];
}

function near(actual, expected) {
  assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);
}

for (const [center, radius, z] of [[[11, 9], 3, 16], [[25, 20], 2, 13]]) {
  test(`delete the original planar cap of an exact Ø${2 * radius} cylindrical boss`, () => {
    const features = boss(center, radius, z), source = solid(features), saved = structuredClone(source);
    const before = checkBrep(source, { strict: true });
    assert.equal(before.valid, true, before.issues.join(', '));
    assert.deepEqual(before.counts, { bodies: 1, shells: 1, faces: 9, loops: 10, coedges: 36, edges: 18, vertices: 12 });
    near(brepMassProperties(source, 1).volume, 12000 + (z - 10) * Math.PI * radius ** 2);
    const healed = healCylindricalBossIfAdmitted(source, cap);
    const report = checkBrep(healed, { strict: true });
    assert.equal(report.valid, true, report.issues.join(', '));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 0);
    assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
    const mass = brepMassProperties(healed, 1), independent = brepMassProperties(stock, 1);
    near(mass.volume, 12000);
    mass.centroid.forEach((value, k) => near(value, independent.centroid[k]));
    const retained = new Set(healed.loops.map(loop => loop.id));
    for (const face of healed.faces) {
      const original = source.faces.find(item => item.id === face.id);
      assert.deepEqual(face, { ...original, loops: original.loops.filter(id => retained.has(id)) });
      assert.deepEqual(faceGeometry(face), faceGeometry(stock.faces.find(item => item.name === face.name)));
    }
    for (const key of ['vertices', 'edges', 'loops', 'coedges']) {
      for (const item of healed[key]) assert.deepEqual(item, source[key].find(candidate => candidate.id === item.id));
    }
    assert.deepEqual(solid([...features, { id: 'heal', kind: 'delete-face', target: 'join', face: cap }]), healed);
    assert.equal(healCylindricalBossIfAdmitted(source, 'stock.top'), undefined);
    assert.equal(healCylindricalBossIfAdmitted(source, 'boss.side0#1'), undefined);
    assert.deepEqual(source, saved);
  });
}

test('boss healing refuses a through bore, a plain cap and a boss that breaks the stock boundary', () => {
  const through = solid([...box, { id: 'hole', kind: 'hole', target: 'stock', face: 'stock.top', center: [11, 9], radius: 3 }]);
  assert.equal(healCylindricalBossIfAdmitted(through, 'stock.top'), undefined);
  assert.equal(healCylindricalBossIfAdmitted(stock, 'stock.top'), undefined);
  const clipped = solid(boss([2, 9]));
  assert.equal(healCylindricalBossIfAdmitted(clipped, cap), undefined);
});
