import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, faceGeometry, type CadPartDocument, type CadPartOutput } from '@barocss/cad';
import { nativeBoxTopFilletsOf } from '../src/engine/nativeBoxTopFillets';

type Mutable<T> = T extends ArrayBufferView ? T : { -readonly [K in keyof T]: Mutable<T[K]> };
const close = (a: number, b: number, tolerance = 1e-9) => assert.ok(Math.abs(a - b) <= tolerance, `${a} != ${b}`);
function fixture(radius = 2, order = [1, 0, 3, 2], origin: [number, number] = [0, 0]): CadPartOutput {
  const doc: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    { id: 'n0', kind: 'sketch', profile: 'rectangle', min: origin, max: [origin[0] + 12, origin[1] + 8] },
    { id: 'n1', kind: 'extrude', sketch: 'n0', height: 8 },
    { id: 'n2', kind: 'fillet', target: 'n1', edges: order.map(i => `n1.side${i}|n1.top`), radius },
  ] };
  return evaluateCadPart(doc).outputs[0];
}

test('four upper box rounds bind each original rim by native wall and cap twins in authored order', () => {
  for (const radius of [1, 2]) for (const order of [[1, 0, 3, 2], [0, 1, 2, 3], [3, 2, 1, 0]]) {
    const source = fixture(radius, order), saved = structuredClone(source), rounds = nativeBoxTopFilletsOf(source);
    assert.ok(rounds);
    assert.deepEqual(rounds.map(round => round.edge), order.map(i => `n1.side${i}|n1.top`));
    assert.equal(new Set(rounds.map(round => round.faceId)).size, 4);
    for (const [i, round] of rounds.entries()) {
      const side = order[i], alongX = side === 0 || side === 2;
      close(round.radius, radius);
      close(round.centre[2], 8 - radius);
      close(round.centre[alongX ? 1 : 0], side === 0 ? radius : side === 1 ? 12 - radius : side === 2 ? 8 - radius : radius);
      assert.deepEqual(round.axis.map(Math.abs), alongX ? [1, 0, 0] : [0, 1, 0]);
    }
    assert.ok(checkBrep(source.brep, { strict: true }).valid);
    const volume = 768 - 40 * (1 - Math.PI / 4) * radius ** 2 + 4 * (5 / 3 - Math.PI / 2) * radius ** 3;
    close(brepMassProperties(source.brep, 1).volume, volume, 1e-7);
    const shuffled = structuredClone(source) as Mutable<CadPartOutput>;
    shuffled.brep.faces.reverse(); shuffled.brep.edges.reverse(); shuffled.brep.coedges.reverse();
    assert.deepEqual(nativeBoxTopFilletsOf(shuffled), rounds);
    assert.deepEqual(source, saved);
  }
});

test('four-top proof permits a shifted cardinal box but refuses opposite-round contact and changed topology', () => {
  const shifted = nativeBoxTopFilletsOf(fixture(2, [1, 0, 3, 2], [-10, 3]));
  assert.ok(shifted);
  close(shifted[0].centre[0], 0); close(shifted[0].centre[2], 6);
  for (const radius of [4, 4.01, 8]) {
    const source = fixture(radius);
    assert.ok(checkBrep(source.brep, { strict: true }).valid);
    assert.equal(nativeBoxTopFilletsOf(source), undefined);
  }
});

test('four-top proof refuses borrowed owners, duplicate targets and broken native twin ownership', () => {
  const source = fixture(), saved = structuredClone(source);
  const reject = (edit: (copy: Mutable<CadPartOutput>) => void) => {
    const copy = structuredClone(source) as Mutable<CadPartOutput>;
    edit(copy);
    assert.equal(nativeBoxTopFilletsOf(copy), undefined);
  };
  reject(copy => { copy.feature = 'old'; });
  reject(copy => { copy.brep.source.id = 'old'; });
  reject(copy => { copy.brep.source.family = 'step-import'; });
  reject(copy => { copy.filletTargets![1] = copy.filletTargets![0]; });
  reject(copy => { copy.brep.shells[0].closed = false; });
  reject(copy => { copy.brep.faces.find(face => face.name === 'n1.side1')!.name = 'other.side1'; });
  reject(copy => {
    const blend = copy.brep.faces.find(face => face.name === 'n2.face#4')!;
    const loop = copy.brep.loops.find(loop => loop.id === blend.loops[0])!;
    const use = copy.brep.coedges.find(use => use.id === loop.coedges[0])!;
    use.twin = copy.brep.coedges.find(other => other.edge !== use.edge)!.id;
  });
  assert.deepEqual(source, saved);
});

test('four-top proof checks support poles, knots and weights and both fitted seam radial bounds', () => {
  for (const mutation of ['support-pole', 'support-weight', 'support-knot', 'seam-pole', 'seam-weight', 'seam-knot', 'seam-endpoint']) {
    const copy = structuredClone(fixture()) as Mutable<CadPartOutput>;
    const face = copy.brep.faces.find(face => face.name === 'n2.face#4')!;
    assert.equal(face.surface.kind, 'surface');
    if (face.surface.kind !== 'surface') throw Error('Expected native surface');
    const seam = copy.brep.edges.find(edge => edge.curve.degree === 3)!;
    if (mutation === 'support-pole') face.surface.controlPoints[1][1][2] += 1e-9;
    if (mutation === 'support-weight') face.surface.weights[1][1] += 1e-9;
    if (mutation === 'support-knot') face.surface.knotsV[2] -= 1e-9;
    if (mutation === 'seam-pole') seam.curve.controlPoints[24][2] += 1e-4;
    if (mutation === 'seam-weight') seam.curve.weights[24] += 1e-9;
    if (mutation === 'seam-knot') seam.curve.knots[4] += 1e-6;
    if (mutation === 'seam-endpoint') seam.curve.controlPoints[0][0] += 1e-5;
    if (mutation === 'support-pole') assert.equal(faceGeometry(face).kind, 'cylinder');
    assert.equal(nativeBoxTopFilletsOf(copy), undefined, mutation);
  }
});
