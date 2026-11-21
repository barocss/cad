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

const verticalEdges = [
  ['n1.side0|n1.side3', 0, 0], ['n1.side0|n1.side1', 40, 0],
  ['n1.side1|n1.side2', 40, 30], ['n1.side2|n1.side3', 0, 30],
].map(([edge, x, y]) => [edge, [x, y, 0], [x, y, 10], 2]);
const capEdges = ['top', 'bottom'].flatMap(cap => [
  ['n1.side0', [0, 0], [40, 0], 0], ['n1.side1', [40, 0], [40, 30], 1],
  ['n1.side2', [0, 30], [40, 30], 0], ['n1.side3', [0, 0], [0, 30], 1],
].map(([wall, a, b, axis]) => {
  const z = cap === 'top' ? 10 : 0;
  return [[wall, 'n1.' + cap].sort().join('|'), [...a, z], [...b, z], axis];
}));
for (const [edge, a, b, axis] of [...verticalEdges, ...capEdges]) test(`Delete face restores the outside R2 round at ${edge}`, () => {
  const stock = [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10 },
  ];
  const rounded = [...stock, round(edge)], before = output(rounded).brep, copy = structuredClone(before);
  const face = before.faces.find(item => item.name === 'n2.face');
  const cylinder = faceGeometry(face);
  assert.equal(cylinder.kind, 'cylinder');
  assert.equal(cylinder.out, 1);
  assert.equal(Math.abs(cylinder.a[axis]), 1);
  close(cylinder.r, 2, 1e-9);
  const span = b[axis] - a[axis];
  close(brepMassProperties(before, 1).volume, 12000 - span * (4 - Math.PI), 1e-7);
  const signature = { ...faceSignatures(before).get('n2.face'), size: span * Math.PI };
  const after = output([...rounded, heal('n2.face', 'n2', { 'n2.face': signature })]).brep;
  const report = checkBrep(after, { strict: true });
  assert.ok(report.valid, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 6, loops: 6, coedges: 24, edges: 12, vertices: 8 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
  const mass = brepMassProperties(after, 1);
  close(mass.volume, 12000, 1e-7);
  mass.centroid.forEach((value, i) => close(value, [20, 15, 5][i], 1e-9));
  assert.deepEqual(after.faces.map(item => [item.name, item.id]).sort(),
    before.faces.filter(item => item !== face).map(item => [item.name, item.id]).sort());
  const unrounded = after.edges.find(item => item.name === edge);
  assert.deepEqual(unrounded.curve.controlPoints.toSorted((p, q) => p[axis] - q[axis]), [a, b]);
  const uses = before.coedges.filter(item => face.loops.includes(item.loop));
  const tangentVertices = new Set(before.edges.filter(item => uses.some(use => use.edge === item.id)).flatMap(item => item.vertices));
  const unaffected = before.edges.filter(item => !item.vertices.some(vertex => tangentVertices.has(vertex)));
  assert.ok(unaffected.length > 0);
  for (const item of unaffected) assert.deepEqual(after.edges.find(candidate => candidate.id === item.id), item);
  assert.throws(() => output([...rounded, heal('n1.top')]),
    error => error instanceof CadPartError && error.code === 'CAPABILITY');
  assert.throws(() => output([...rounded, heal('n2.face', 'n2', { 'n2.face': { ...signature, radius: 20 } })]),
    error => error instanceof CadPartError && error.code === 'REFERENCE_MOVED');
  assert.deepEqual(before, copy);
});

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

for (const [form, source, edge, reflected, from] of [
  ['foot down', unmirrored, 'n1.side0|n1.side1', false, 0],
  ['foot up', mirrored, 'n1.side0|n1.side1', true, -3.25],
]) {
  test(`Delete face restores the full-height outside R2 L corner with ${form}`, () => {
    const rounded = [...source, round(edge)], before = output(rounded).brep, saved = structuredClone(before);
    const face = before.faces.find(item => item.name === 'n2.face'), cylinder = faceGeometry(face);
    assert.equal(cylinder.kind, 'cylinder');
    assert.equal(cylinder.out, 1);
    assert.deepEqual(cylinder.a, [0, 0, 1]);
    close(cylinder.r, 2, 1e-9);
    // The sharp L is two rectangles minus their 3 by 3 overlap. An outside R2 removes a square minus a quarter disc.
    const sharpVolume = (40 * 3 + 3 * 30 - 3 * 3) * 20;
    close(brepMassProperties(before, 1).volume, sharpVolume - 20 * (4 - Math.PI), 1e-8);
    const selectedSignature = { ...faceSignatures(before).get('n2.face'), size: 20 * Math.PI };
    const after = output([...rounded, heal('n2.face', 'n2', { 'n2.face': selectedSignature })]).brep;
    const report = checkBrep(after, { strict: true });
    assert.ok(report.valid, report.issues.join('\n'));
    assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 36, edges: 18, vertices: 12 });
    assert.equal(report.topology[0].genus, 0);
    assert.ok(report.maximumPcurveGap < 1e-9 && report.maximumEdgeSurfaceGap < 1e-9);
    assert.deepEqual(after.faces.map(item => item.name).sort(), before.faces.filter(item => item !== face).map(item => item.name).sort());
    assert.deepEqual(after.edges.map(item => item.name).sort(), [edge,
      ...before.edges.filter(item => !item.name.split('|').includes('n2.face')).map(item => item.name)].sort());
    assert.ok(after.faces.every(item => !before.faces.some(original => original.id === item.id)), 'the L reconstruction creates new B-rep IDs');

    const sharp = output(source).brep;
    const geometryByName = items => items.map(item => [item.name, item.curve.controlPoints]).sort(([a], [b]) => a.localeCompare(b));
    assert.deepEqual(geometryByName(after.edges), geometryByName(sharp.edges));
    const uses = before.coedges.filter(use => face.loops.includes(use.loop));
    const tangentVertices = new Set(before.edges.filter(item => uses.some(use => use.edge === item.id)).flatMap(item => item.vertices));
    const untouched = before.edges.filter(item => !item.vertices.some(vertex => tangentVertices.has(vertex)));
    assert.ok(untouched.length > 0);
    for (const item of untouched) {
      const retained = after.edges.find(candidate => candidate.name === item.name);
      assert.deepEqual(retained.curve.controlPoints, item.curve.controlPoints);
      assert.deepEqual(retained.curve.weights, item.curve.weights);
      assert.deepEqual(retained.curve.knots, item.curve.knots);
    }
    const mass = brepMassProperties(after, 1);
    assert.equal(mass.method, 'planar-exact');
    close(mass.volume, sharpVolume, 1e-8);
    const centroidY = 1516.5 / 201;
    [2521.5 / 201, reflected ? 30 - centroidY : centroidY, from + 10].forEach((value, i) => close(mass.centroid[i], value, 1e-9));
    assert.throws(() => output([...rounded, heal('n2.face', 'n2', { 'n2.face': { ...selectedSignature, radius: 3 } })]),
      error => error instanceof CadPartError && error.code === 'REFERENCE_MOVED');
    assert.deepEqual(before, saved);
  });
}

test('Delete face refuses an upright chamfer, non-L outside round and multiple rounds', () => {
  const edge = 'n1.side2|n1.side3';
  const cases = [
    [...unmirrored, { id: 'n2', kind: 'chamfer', target: 'n1', edges: [edge], distance: 2 }],
    [...stock([[0, 0], [40, 0], [40, 10], [30, 20], [0, 20], [-10, 10]]), round('n1.side0|n1.side1')],
    [...unmirrored, { ...round(edge), edges: [edge, 'n1.side0|n1.side1'] }],
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
