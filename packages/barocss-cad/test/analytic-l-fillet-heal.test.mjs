import assert from 'node:assert/strict';
import test from 'node:test';
import { CadPartError, checkBrep, evaluateCadPart, faceGeometry } from '../dist/index.js';
import { lineCurve } from '../dist/brep/brep-core.js';
import { brepMassProperties } from '../dist/brep/solid-mass.js';
import { faceSignatures } from '../dist/part/part-expect.js';
import { healAnalyticLFilletIfAdmitted } from '../dist/features/heal-analytic-l-fillet.js';

const corner = 'n1.top|n3.side1', selected = 'n5.face';
const sharp = [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] },
  { id: 'n1', kind: 'extrude', sketch: 'n0', height: 3 },
  { id: 'n2', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [3, 20] },
  { id: 'n3', kind: 'extrude', sketch: 'n2', height: 30 },
  { id: 'n4', kind: 'union', target: 'n1', tool: 'n3' },
];
const fillet = { id: 'n5', kind: 'fillet', target: 'n4', edges: [corner], radius: 2 };
const remove = { id: 'heal', kind: 'delete-face', target: 'n5', face: selected };
const output = features => evaluateCadPart({ format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features }).outputs[0];
const close = (actual, expected, tolerance) => assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} differs from ${expected}`);
const compareNames = items => items.map(item => [item.id, item.name]).sort((a, b) => a[0].localeCompare(b[0]));

function deepFreeze(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) deepFreeze(child);
    Object.freeze(value);
  }
  return value;
}

test('Delete face heals the analytic R2 union bracket and retains the surviving native topology IDs', () => {
  const input = [...sharp, fillet], before = deepFreeze(output(input).brep), snapshot = structuredClone(before);
  const beforeReport = checkBrep(before, { strict: true });
  assert.equal(beforeReport.valid, true);
  assert.deepEqual(beforeReport.counts, { bodies: 1, shells: 1, faces: 9, loops: 9, coedges: 46, edges: 23, vertices: 16 });
  const sourceFace = before.faces.find(face => face.name === selected), geometry = faceGeometry(sourceFace);
  assert.equal(geometry.kind, 'cylinder');
  assert.equal(geometry.out, -1);
  assert.deepEqual(geometry.a, [0, 1, 0]);
  close(geometry.r, 2, 1e-9);
  const expectedVolume = 40 * 20 * 3 + 3 * 20 * 30 - 3 * 20 * 3;
  const independent = brepMassProperties(output(sharp).brep, 1);
  assert.equal(independent.volume, expectedVolume);
  close(brepMassProperties(before, 1).volume - expectedVolume, 20 * (4 - Math.PI), 1e-8);

  const signature = { ...faceSignatures(before).get(selected), size: 20 * Math.PI };
  const healed = output([...input, { ...remove, expect: { [selected]: signature } }]);
  assert.equal(healed.feature, 'heal');
  assert.equal(healed.representation, 'planar');
  const after = healed.brep;
  assert.deepEqual(after, healAnalyticLFilletIfAdmitted(before, selected, corner, 'heal'));
  assert.deepEqual(before, snapshot);
  const report = checkBrep(after, { strict: true });
  assert.equal(report.valid, true, report.issues.join('\n'));
  assert.deepEqual(report.counts, { bodies: 1, shells: 1, faces: 8, loops: 8, coedges: 40, edges: 20, vertices: 14 });
  assert.equal(report.topology[0].genus, 0);
  assert.ok(report.maximumEdgeSurfaceGap < 1e-9);
  assert.ok(after.coedges.every(use => use.pcurve === null));
  assert.deepEqual(after.bodies, before.bodies);
  assert.equal(after.shells[0].id, before.shells[0].id);
  assert.deepEqual(compareNames(after.faces), compareNames(before.faces.filter(face => face !== sourceFace)));
  assert.deepEqual(after.loops.map(loop => loop.id), before.loops.filter(loop => loop.face !== sourceFace.id).map(loop => loop.id));
  const oldEdges = before.edges.filter(edge => !edge.name.split('|').includes(selected));
  assert.equal(oldEdges.length, 19);
  assert.deepEqual(compareNames(after.edges.filter(edge => edge.name !== corner)), compareNames(oldEdges));
  const oldEdgeIds = new Set(oldEdges.map(edge => edge.id));
  assert.deepEqual(after.coedges.filter(use => oldEdgeIds.has(use.edge)).map(use => use.id).sort(), before.coedges.filter(use => oldEdgeIds.has(use.edge)).map(use => use.id).sort());
  const ridge = after.edges.find(edge => edge.name === corner);
  assert.deepEqual(ridge.curve.controlPoints, [[3, 0, 3], [3, 20, 3]]);
  assert.deepEqual(after.faces.filter(face => !assertSameSurface(face, before)).map(face => face.name).sort(), ['n1.top', 'n3.side1']);
  const result = brepMassProperties(after, 1);
  assert.equal(result.method, 'planar-exact');
  close(result.volume, independent.volume, 1e-9 * independent.volume);
  result.centroid.forEach((value, axis) => close(value, independent.centroid[axis], 1e-9));
});

function assertSameSurface(face, source) {
  const old = source.faces.find(other => other.id === face.id);
  assert.equal(face.surface.id, old.surface.id);
  return JSON.stringify(face.surface) === JSON.stringify(old.surface);
}

test('Delete face refuses a chamfer, convex fillet, wrong face and stale native signature', () => {
  const refuses = (features, pattern, category = 'CAPABILITY') => assert.throws(() => output(features),
    error => error instanceof CadPartError && error.details.category === category && pattern.test(error.message));
  const chamfer = { id: 'n5', kind: 'chamfer', target: 'n4', edges: [corner], distance: 2 };
  const convex = { ...fillet, edges: ['n1.side1|n1.top'] };
  for (const finish of [chamfer, convex]) {
    assert.ok(output([...sharp, finish]).brep.faces.some(face => face.name === selected));
    refuses([...sharp, finish, remove], /two-plate L bracket/);
  }
  const source = [...sharp, fillet];
  refuses([...source, { ...remove, face: 'n1.top' }], /two-plate L bracket/);
  refuses([...source, { ...remove, face: `${selected}#1` }], /missing or ambiguous/, 'REFERENCE');
  const signature = { ...faceSignatures(output(source).brep).get(selected), size: 20 * Math.PI, radius: 3 };
  refuses([...source, { ...remove, expect: { [selected]: signature } }], /REFERENCE_MOVED/, 'REFERENCE');
});

test('Analytic L fillet admission requires the current wall adjacency and the exact chart family', () => {
  const source = output([...sharp, fillet]).brep;
  assert.equal(healAnalyticLFilletIfAdmitted(source, selected, 'wrong ridge', 'heal'), undefined);
  assert.equal(healAnalyticLFilletIfAdmitted(source, 'n1.top', corner, 'heal'), undefined);
  const altered = structuredClone(source);
  altered.coedges[0].pcurve = lineCurve('foreign_trim', [0, 0, 0], [1, 0, 0]);
  assert.equal(healAnalyticLFilletIfAdmitted(altered, selected, corner, 'heal'), undefined);
  const rationalLine = structuredClone(source);
  rationalLine.edges[0].curve.weights = [1, 2];
  assert.equal(checkBrep(rationalLine, { strict: true }).valid, true);
  assert.equal(healAnalyticLFilletIfAdmitted(rationalLine, selected, corner, 'heal'), undefined);
  assert.equal(healAnalyticLFilletIfAdmitted({ ...source, source: { ...source.source, family: 'imported' } }, selected, corner, 'heal'), undefined);
});
