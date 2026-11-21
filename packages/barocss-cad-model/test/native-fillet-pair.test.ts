import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry, type CadPartDocument, type CadPartOutput } from '@barocss/cad';
import { nativeFilletPairOf } from '../src/engine/nativeFilletPair';
import { rectanglePart, withNode } from '../src/engine/doc';
import { evaluateDoc, placeBody } from '../src/engine/evaluate';
import { captureSignatures } from '../src/engine/references';

const adjacent = ['n1.side0|n1.top', 'n1.side1|n1.top'];
const opposite = ['n1.side0|n1.top', 'n1.side2|n1.top'];
type Mutable<T> = T extends ArrayBufferView ? T : { -readonly [K in keyof T]: Mutable<T[K]> };
function fixture(radius = 2, edges = adjacent): CadPartOutput {
  const doc: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] },
    { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10 },
    { id: 'n2', kind: 'fillet', target: 'n1', edges, radius },
  ] };
  return evaluateCadPart(doc).outputs[0];
}
const close = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);

for (const radius of [2, 3.5]) {
  test(`adjacent native top rounds at R${radius} have certified supports and shared seams in either order`, () => {
    for (const targets of [adjacent, [...adjacent].reverse()]) {
      const output = fixture(radius, targets), saved = structuredClone(output), pair = nativeFilletPairOf(output);
      assert.equal(pair?.adjacentTop, true);
      assert.deepEqual(pair.targets, targets);
      const alongX = pair.cylinders.find(cylinder => Math.abs(cylinder.a[0]) === 1);
      const alongY = pair.cylinders.find(cylinder => Math.abs(cylinder.a[1]) === 1);
      assert.ok(alongX && alongY);
      close(alongX.c[1], radius); close(alongX.c[2], 10 - radius);
      close(alongY.c[0], 40 - radius); close(alongY.c[2], 10 - radius);
      close(alongX.r, radius); close(alongY.r, radius);
      assert.ok(checkBrep(output.brep, { strict: true }).valid);
      // Stock minus two rounded edge strips, with their genuine adjacent intersection restored once.
      const expected = 12000 - 70 * (1 - Math.PI / 4) * radius ** 2 + (5 / 3 - Math.PI / 2) * radius ** 3;
      close(brepMassProperties(output.brep, 1).volume, expected, 1e-7);
      const reordered = structuredClone(output) as Mutable<CadPartOutput>;
      reordered.brep.faces.reverse(); reordered.brep.edges.reverse(); reordered.brep.coedges.reverse();
      reordered.filletTargets!.reverse();
      assert.equal(nativeFilletPairOf(reordered)?.adjacentTop, true);
      assert.deepEqual(output, saved);
    }
  });
}

test('opposite native pair evidence is preserved without the adjacent-top qualification', () => {
  const pair = nativeFilletPairOf(fixture(2, opposite));
  assert.ok(pair);
  assert.deepEqual(pair.targets, opposite);
  assert.equal(pair.adjacentTop, undefined);
  assert.ok(pair.cylinders.every(cylinder => Math.abs(cylinder.a[0]) === 1));
});

test('adjacent qualification rejects borrowed identity, unsupported targets and broken native ownership', () => {
  const source = fixture(), saved = structuredClone(source);
  const reject = (edit: (copy: Mutable<CadPartOutput>) => void) => {
    const copy = structuredClone(source) as Mutable<CadPartOutput>;
    edit(copy);
    assert.notEqual(nativeFilletPairOf(copy)?.adjacentTop, true);
  };
  reject(copy => { copy.feature = 'other'; });
  reject(copy => { copy.filletTargets = [...opposite]; });
  reject(copy => { copy.filletTargets = [adjacent[0], adjacent[0]]; });
  reject(copy => { copy.brep.source.family = 'step-import'; });
  reject(copy => { copy.brep.source.id = 'old'; });
  reject(copy => { copy.brep.shells[0].closed = false; });
  reject(copy => { copy.brep.faces.find(face => face.name === 'n1.side0')!.name = 'other.side0'; });
  reject(copy => {
    const selected = copy.brep.faces.find(face => face.name === 'n2.face#1')!;
    const loop = copy.brep.loops.find(loop => loop.id === selected.loops[0])!;
    const use = copy.brep.coedges.find(use => use.id === loop.coedges[0])!;
    use.twin = copy.brep.coedges.find(other => other.edge !== use.edge)!.id;
  });
  assert.deepEqual(source, saved);
});

test('adjacent qualification checks every native support pole, weight and knot rather than only cylinder labels', () => {
  const source = fixture();
  for (const mutation of ['pole', 'weight', 'knot'] as const) {
    const copy = structuredClone(source) as Mutable<CadPartOutput>;
    const face = copy.brep.faces.find(face => face.name === 'n2.face#1')!;
    assert.equal(face.surface.kind, 'surface');
    if (face.surface.kind !== 'surface') throw Error('Expected native surface');
    if (mutation === 'pole') face.surface.controlPoints[1][1][2] += 1e-9;
    if (mutation === 'weight') face.surface.weights[1][1] += 1e-9;
    if (mutation === 'knot') face.surface.knotsV[2] = 1 - 1e-9;
    if (mutation === 'pole') assert.equal(faceGeometry(face).kind, 'cylinder', 'the broad analytic label alone is insufficient');
    assert.notEqual(nativeFilletPairOf(copy)?.adjacentTop, true, mutation);
  }
});

test('adjacent qualification rejects changed fitted seam controls, weights, knots and foreign trim endpoints', () => {
  const source = fixture();
  for (const mutation of ['pole', 'weight', 'knot', 'endpoint'] as const) {
    const copy = structuredClone(source) as Mutable<CadPartOutput>;
    const seam = copy.brep.edges.find(edge => edge.curve.degree === 3)!;
    assert.ok(seam);
    if (mutation === 'pole') seam.curve.controlPoints[24][2] += 0.01;
    if (mutation === 'weight') seam.curve.weights[24] += 1e-9;
    if (mutation === 'knot') seam.curve.knots[4] += 1e-6;
    if (mutation === 'endpoint') seam.curve.controlPoints[0][0] += 1e-5;
    assert.notEqual(nativeFilletPairOf(copy)?.adjacentTop, true, mutation);
  }
});

test('a monotone seam mutation within the same diagonal plane still needs both cylindrical radial bounds', () => {
  const copy = structuredClone(fixture()) as Mutable<CadPartOutput>;
  assert.equal(nativeFilletPairOf(copy)?.adjacentTop, true);
  const seam = copy.brep.edges.find(edge => edge.curve.degree === 3)!, poles = seam.curve.controlPoints;
  const before = structuredClone(poles), endpoints = [structuredClone(poles[0]), structuredClone(poles.at(-1))];
  poles[24][2] += 1e-4;
  assert.deepEqual([poles[0], poles.at(-1)], endpoints);
  poles.forEach((point, i) => {
    assert.deepEqual(point.slice(0, 2), before[i].slice(0, 2), 'the diagonal coordinates stay unchanged');
    if (i) assert.ok(point[2] >= poles[i - 1][2] - 1e-7);
  });
  assert.ok(checkBrep(copy.brep, { strict: true }).valid, 'null-pcurve topology checks do not prove the fitted seam radial error');
  assert.notEqual(nativeFilletPairOf(copy)?.adjacentTop, true);
});

test('accepted Model evaluation carries adjacent native evidence and placement removes it', () => {
  const stock = rectanglePart(40, 30, 10), before = evaluateDoc(stock, 1);
  assert.ok(before.ok);
  const doc = captureSignatures(withNode(stock, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: adjacent, radius: 2 }), before.bodies);
  const result = evaluateDoc(doc, 2);
  assert.ok(result.ok);
  const body = result.bodies[0];
  assert.equal(body.nativeFilletPair?.adjacentTop, true);
  const placed = placeBody(structuredClone(body), [1, 0, 0, 0, 1, 0, 0, 0, 1], [2, 0, 0]);
  assert.equal(placed.nativeFilletPair, undefined);
});
