import assert from 'node:assert/strict';
import test from 'node:test';
import { CadPartError, checkBrep, evaluateCadPart, faceGeometry } from '../dist/index.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { faceSignatures } from '../dist/part/part-expect.js';

const doc = features => ({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features });
const output = features => evaluateCadPart(doc(features)).outputs[0];
const heal = (face = 'n2.face', target = 'n2', expect) => ({ id: 'heal', kind: 'delete-face', target, face, ...(expect ? { expect } : {}) });
const stock = (points, from = 0) => [{ id: 'n0', kind: 'sketch', profile: 'polygon', points }, { id: 'n1', kind: 'extrude', sketch: 'n0', height: 20, from }];
const unmirrored = stock([[0, 0], [40, 0], [40, 3], [3, 3], [3, 30], [0, 30]]);
const mirrored = stock([[0, 0], [3, 0], [3, 27], [40, 27], [40, 30], [0, 30]], -3.25);
const round = (edge, radius = 2) => ({ id: 'n2', kind: 'fillet', target: 'n1', edges: [edge], radius });

// The reference models sharp material along Y using the union of separate foot and upright solids.
const reference = [
  { id: 'foot', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] },
  { id: 'footSolid', kind: 'extrude', sketch: 'foot', height: 3 },
  { id: 'wall', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [3, 20] },
  { id: 'wallSolid', kind: 'extrude', sketch: 'wall', height: 30 },
  { id: 'original', kind: 'union', target: 'footSolid', tool: 'wallSolid' },
];
const refVolume = 40 * 20 * 3 + 3 * 20 * 30 - 3 * 20 * 3;
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);

for (const [form, source, edge, reflected, from] of [
  ['foot down', unmirrored, 'n1.side2|n1.side3', false, 0],
  ['foot up', mirrored, 'n1.side1|n1.side2', true, -3.25],
]) {
  test(`Delete face heals the full height R2 L-prism corner with ${form}`, () => {
    const rounded = [...source, round(edge)], before = output(rounded).brep;
    const oracle = brepMassProperties(output(reference).brep, 1);
    assert.equal(oracle.volume, refVolume);
    const fillet = before.faces.find(face => face.name === 'n2.face');
    const cylinder = faceGeometry(fillet);
    assert.equal(cylinder.kind, 'cylinder');
    assert.equal(cylinder.out, -1);
    assert.deepEqual(cylinder.a, [0, 0, 1]);
    close(cylinder.r, 2, 1e-9);
    close(brepMassProperties(before, 1).volume - refVolume, 20 * (4 - Math.PI), 1e-8);

    const selectedSignature = { ...faceSignatures(before).get('n2.face'), size: 20 * Math.PI };
    const after = output([...rounded, heal('n2.face', 'n2', { 'n2.face': selectedSignature })]).brep;
    const report = checkBrep(after, { strict: true });
    assert.equal(report.valid, true, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 });
    assert.equal(report.topology[0].genus, 0);
    assert.ok(report.maximumPcurveGap < 1e-9);
    assert.ok(report.maximumEdgeSurfaceGap < 1e-9);
    assert.deepEqual(after.faces.map(face => face.name).sort(), before.faces.filter(face => face !== fillet).map(face => face.name).sort());
    assert.deepEqual(after.edges.map(item => item.name).sort(), [edge, ...before.edges.filter(item => !item.name.split('|').includes('n2.face')).map(item => item.name)].sort());
    assert.ok(after.faces.every(face => !before.faces.some(candidate => face.id === candidate.id)));
    const result = brepMassProperties(after, 1);
    assert.equal(result.method, 'planar-exact');
    close(result.volume, oracle.volume, oracle.volume * 1e-9);
    close(result.centroid[0], oracle.centroid[0], 1e-9);
    close(result.centroid[1], reflected ? 30 - oracle.centroid[2] : oracle.centroid[2], 1e-9);
    close(result.centroid[2], oracle.centroid[1] + from, 1e-9);
  });
}

test('Delete face refuses the chamfer, convex round, multiple rounds and a non-upright finish result', () => {
  const edge = 'n1.side2|n1.side3';
  const cases = [
    [...unmirrored, { id: 'n2', kind: 'chamfer', target: 'n1', edges: [edge], distance: 2 }],
    [...unmirrored, round('n1.side0|n1.side1')],
    [...unmirrored, { ...round(edge), edges: [edge, 'n1.side0|n1.side1'] }],
    [...reference, { id: 'n2', kind: 'fillet', target: 'original', edges: ['footSolid.top|wallSolid.side1'], radius: 2 }],
  ];
  for (const features of cases) {
    const face = output(features).brep.faces.find(candidate => candidate.name.startsWith('n2.face'));
    assert.ok(face, 'control contains a native finish face');
    assert.throws(() => output([...features, heal(face.name)]),
      error => error instanceof CadPartError && error.code === 'CAPABILITY' && /full-height concave circular fillet/.test(error.message));
  }
  const rounded = [...unmirrored, round(edge)];
  assert.throws(() => output([...rounded, heal('n1.top')]),
    error => error instanceof CadPartError && error.code === 'CAPABILITY');
  assert.throws(() => output([...rounded, heal('n2.face#1')]),
    error => error instanceof CadPartError && error.code === 'REFERENCE');
});
