import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry } from '../dist/index.js';
import { healPrismaticChamferIfAdmitted } from '../dist/features/heal-prismatic-chamfer.js';

const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const evaluate = features => evaluateCadPart(doc(features)).outputs[0].brep;
const stock = [
  { id: 's', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
  { id: 'b', kind: 'extrude', sketch: 's', height: 10 },
];
const sharp = evaluate(stock);
const corners = ['b.side0|b.side3', 'b.side0|b.side1', 'b.side1|b.side2', 'b.side2|b.side3'];
const bevel = (edges, distance = 2) => ({ id: 'chamfer', kind: 'chamfer', target: 'b', edges, distance });
const faceName = 'chamfer.face';
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-7, `${actual} != ${expected}`);

for (const [index, edge] of corners.entries()) {
  test(`Delete face heals the single full-height bevel at ${edge}`, () => {
    const distance = index + 1, features = [...stock, bevel([edge], distance)];
    const source = evaluate(features), saved = structuredClone(source);
    const before = checkBrep(source, { strict: true });
    assert.ok(before.valid, before.issues.join(', '));
    assert.deepEqual(before.counts, { bodies: 1, shells: 1, faces: 7, loops: 7, coedges: 30, edges: 15, vertices: 10 });
    near(brepMassProperties(source, 1).volume, 12000 - 5 * distance ** 2);
    const healed = healPrismaticChamferIfAdmitted(source, faceName, edge);
    const report = checkBrep(healed, { strict: true });
    assert.ok(report.valid, report.issues.join(', '));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
    assert.equal(report.topology[0].genus, 0);
    assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
    const mass = brepMassProperties(healed, 1);
    near(mass.volume, 12000);
    mass.centroid.forEach((value, i) => near(value, [20, 15, 5][i]));
    assert.deepEqual(healed.faces.map(face => [face.id, face.name]).sort(),
      source.faces.filter(face => face.name !== faceName).map(face => [face.id, face.name]).sort());
    for (const face of healed.faces) {
      const actual = faceGeometry(face), independent = faceGeometry(sharp.faces.find(candidate => candidate.name === face.name));
      assert.equal(actual.kind, 'plane');
      actual.n.forEach((value, k) => near(value, independent.n[k]));
      const support = ({ o, n }) => n.reduce((sum, value, k) => sum + value * o[k], 0);
      near(support(actual), support(independent));
    }
    assert.ok(healed.edges.some(candidate => candidate.name === edge));
    assert.deepEqual(evaluate([...features, { id: 'heal', kind: 'delete-face', target: 'chamfer', face: faceName }]), healed);
    assert.equal(healPrismaticChamferIfAdmitted(source, 'b.top', edge), undefined);
    assert.equal(healPrismaticChamferIfAdmitted(source, faceName, corners[(index + 1) % 4]), undefined);
    assert.deepEqual(source, saved);
  });
}

test('the full-height heal refuses plain stock, a cap edge chamfer and two chamfers', () => {
  assert.equal(healPrismaticChamferIfAdmitted(sharp, 'b.top', corners[0]), undefined);
  const top = 'b.side0|b.top';
  assert.equal(healPrismaticChamferIfAdmitted(evaluate([...stock, bevel([top])]), faceName, top), undefined);
  assert.equal(healPrismaticChamferIfAdmitted(evaluate([...stock, bevel([corners[0], corners[2]])]), faceName, corners[0]), undefined);
});
