import assert from 'node:assert/strict';
import test from 'node:test';
import { brepMassProperties, checkBrep, evaluateCadPart, type CadPartDocument, type CadPartOutput } from '@barocss/cad';
import { nativeClosedFilletTorusOf, nativeFilletTorusOf, nativeFilletTorusPairOf } from '../src/engine/nativeFilletTorus';
import { emptyDoc, withNode, type SketchNode } from '../src/engine/doc';
import { evaluateDoc, placeBody } from '../src/engine/evaluate';
import { captureSignatures } from '../src/engine/references';

const targets = ['n1.side1|n1.top', 'n1.bottom|n1.side1'];
const sketch: Extract<SketchNode, { profile: 'loop' }> & { id: string } = { id: 'n0', kind: 'sketch', profile: 'loop', segments: [
  { kind: 'line', start: [0, 0] },
  { kind: 'arc', start: [8, 0], center: [0, 0], direction: 'ccw' },
  { kind: 'line', start: [0, 8] },
] };
type Mutable<T> = T extends ArrayBufferView ? T : { -readonly [K in keyof T]: Mutable<T[K]> };
function fixture(radius = .6, edges = targets): CadPartOutput {
  const doc: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
    sketch, { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10 },
    { id: 'n2', kind: 'fillet', target: 'n1', edges, radius },
  ] };
  return evaluateCadPart(doc).outputs[0];
}
const close = (actual: number, expected: number, tolerance = 1e-8) =>
  assert.ok(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);

test('two separate circular rims carry independent native tori at both accepted radii and in either target order', () => {
  for (const radius of [.6, 1.5]) for (const picked of [targets, [...targets].reverse()]) {
    const output = fixture(radius, picked), before = structuredClone(output), pair = nativeFilletTorusPairOf(output);
    assert.ok(pair);
    assert.deepEqual(pair.targets, picked);
    assert.equal(nativeFilletTorusOf(output), undefined);
    assert.equal(new Set(pair.tori.map(torus => torus.faceId)).size, 2);
    assert.deepEqual(pair.tori.map(torus => torus.face).sort(), ['n2.face#1', 'n2.face#2']);
    const ordered = [...pair.tori].sort((a, b) => a.centre[2] - b.centre[2]);
    ordered.forEach((torus, i) => {
      close(torus.centre[0], 0); close(torus.centre[1], 0);
      close(torus.centre[2], i === 0 ? radius : 10 - radius);
      close(Math.abs(torus.axis[2]), 1); close(torus.axis[0], 0); close(torus.axis[1], 0);
      close(torus.majorRadius, 8 - radius); close(torus.radius, radius);
      assert.equal(output.brep.faces.find(face => face.id === torus.faceId)?.name, torus.face);
    });
    const expected = 160 * Math.PI - Math.PI * (8 * (1 - Math.PI / 4) * radius ** 2 - (5 / 6 - Math.PI / 4) * radius ** 3);
    close(brepMassProperties(output.brep, 1).volume, expected, 2e-6);
    const report = checkBrep(output.brep, { strict: true });
    assert.ok(report.valid);
    assert.equal(report.topology[0].genus, 0);
    const reordered = structuredClone(output) as Mutable<CadPartOutput>;
    reordered.brep.faces.reverse(); reordered.brep.edges.reverse(); reordered.brep.coedges.reverse();
    assert.deepEqual(nativeFilletTorusPairOf(reordered)?.tori.map(torus => torus.faceId).sort(), pair.tori.map(torus => torus.faceId).sort());
    assert.deepEqual(output, before);
  }
});

test('the pair requires its own two distinct targets, closed owner and separate reciprocal native trims', () => {
  const output = fixture(), before = structuredClone(output);
  const reject = (edit: (copy: Mutable<CadPartOutput>) => void) => {
    const copy = structuredClone(output) as Mutable<CadPartOutput>;
    edit(copy);
    assert.equal(nativeFilletTorusPairOf(copy), undefined);
  };
  reject(copy => { copy.feature = 'other'; });
  reject(copy => { copy.filletTargets = [targets[0], targets[0]]; });
  reject(copy => { copy.filletTargets = [targets[0]]; });
  reject(copy => { copy.brep.source.id = 'other'; });
  reject(copy => { copy.brep.source.family = 'step-import'; });
  reject(copy => { copy.brep.shells[0].closed = false; });
  reject(copy => { copy.brep.bodies[0].shells = ['foreign-shell']; });
  reject(copy => { copy.brep.faces.find(face => face.name === 'n2.face#1')!.name = 'n2.face'; });
  reject(copy => {
    const face = copy.brep.faces.find(face => face.name === 'n2.face#1')!;
    const loop = copy.brep.loops.find(loop => loop.id === face.loops[0])!;
    const use = copy.brep.coedges.find(use => use.id === loop.coedges[0])!;
    use.twin = copy.brep.coedges.find(other => other.edge !== use.edge)!.id;
  });
  assert.deepEqual(output, before);
});

test('both native patches must have supported toroidal surfaces, not borrowed names or damaged controls', () => {
  const source = fixture();
  for (const mutation of ['plane', 'pole', 'weight'] as const) {
    const copy = structuredClone(source) as Mutable<CadPartOutput>;
    const face = copy.brep.faces.find(face => face.name === 'n2.face#2')!;
    assert.equal(face.surface.kind, 'surface');
    if (face.surface.kind !== 'surface') throw Error('Expected native surface');
    if (mutation === 'plane') face.surface = structuredClone(copy.brep.faces.find(peer => peer.name === 'n1.top')!.surface);
    else if (mutation === 'pole') face.surface.controlPoints[1][1][2] += .01;
    else face.surface.weights[1][1] += .01;
    assert.equal(nativeFilletTorusPairOf(copy), undefined, mutation);
  }
});

test('a single toroidal finish keeps its original contract', () => {
  const output = fixture(.6, [targets[0]]), torus = nativeFilletTorusOf(output);
  assert.ok(torus);
  assert.deepEqual(Object.keys(torus).sort(), ['axis', 'centre', 'edge', 'face', 'majorRadius', 'radius']);
  assert.equal(torus.edge, targets[0]);
  assert.equal(torus.face, 'n2.face');
  close(torus.radius, .6); close(torus.majorRadius, 7.4); close(torus.centre[2], 9.4);
  assert.equal(nativeFilletTorusPairOf(output), undefined);
});

test('Model carries paired curved-target proof only with exact authored ownership and removes it on placement', () => {
  const stock = withNode(withNode(emptyDoc(), sketch), { kind: 'extrude', sketch: 0, height: 10 });
  const before = evaluateDoc(stock, 1); assert.ok(before.ok);
  const doc = captureSignatures(withNode(stock, { kind: 'fillet', parent: { node: 1, side: 'solid' }, edges: targets, radius: .6 }), before.bodies);
  const result = evaluateDoc(doc, 2); assert.ok(result.ok);
  const [body] = result.bodies;
  assert.ok(body.nativeFilletTorusPair);
  assert.deepEqual(body.nativeFilletTorusPair.targets, targets);
  assert.equal(body.nativeFilletTorus, undefined);
  assert.equal(body.nativeFilletPair, undefined);
  assert.equal(placeBody(body, [1, 0, 0, 0, 1, 0, 0, 0, 1], [2, 0, 0]).nativeFilletTorusPair, undefined);
  assert.ok(body.nativeFilletTorusPair, 'placement leaves the source result intact');
  const finish = doc.nodes[2]; assert.equal(finish.kind, 'fillet');
  if (finish.kind !== 'fillet' || !finish.sigs) throw Error('Expected signed Fillet');
  for (const sigs of [undefined, { ...finish.sigs, [targets[1]]: { ...finish.sigs[targets[1]], k: 'line' as const } },
    { ...finish.sigs, [targets[1]]: { ...finish.sigs[targets[1]], n: 2 } }]) {
    const changed = { ...doc, nodes: [...doc.nodes.slice(0, 2), { ...finish, sigs }] };
    const evaluated = evaluateDoc(changed, 3);
    assert.equal(evaluated.ok ? evaluated.bodies[0].nativeFilletTorusPair : undefined, undefined);
  }
});


test('two native half patches certify one complete closed top blend only when the actual trims fill both charts', () => {
  const rims = ['n1.side0#1|n1.top', 'n1.side0#2|n1.top'];
  for (const radius of [.6, 1.5]) for (const edges of [rims, [...rims].reverse()]) {
    const doc: CadPartDocument = { format: 'barocss-cad-part', version: 1, units: 'mm', parameters: {}, features: [
      { id: 'n0', kind: 'sketch', profile: 'circle', center: [0, 0], radius: 8 },
      { id: 'n1', kind: 'extrude', sketch: 'n0', height: 10 },
      { id: 'n2', kind: 'fillet', target: 'n1', edges, radius },
    ] };
    const [output] = evaluateCadPart(doc).outputs, before = structuredClone(output);
    const verified = nativeClosedFilletTorusOf(output);
    assert.ok(verified);
    assert.deepEqual([...verified.targets].sort(), rims);
    assert.deepEqual(verified.faces.map(member => member.face).sort(), ['n2.face#1', 'n2.face#2']);
    close(verified.majorRadius, 8 - radius); close(verified.radius, radius); close(verified.centre[2], 10 - radius);
    assert.equal(nativeFilletTorusOf(output), undefined);
    assert.equal(nativeFilletTorusPairOf(output), undefined);
    const reject = (edit: (copy: Mutable<CadPartOutput>) => void) => {
      const copy = structuredClone(output) as Mutable<CadPartOutput>;
      edit(copy);
      assert.equal(nativeClosedFilletTorusOf(copy), undefined);
    };
    reject(copy => { copy.filletTargets = [rims[0], rims[0]]; });
    reject(copy => { copy.brep.faces.find(face => face.name === 'n1.top')!.name = 'borrowed.top'; });
    reject(copy => {
      const trim = copy.brep.edges.find(edge => edge.name?.startsWith('n2.face#1|n2.face#2'))!;
      // Change only an interior seam pole, leaving the endpoints and display-face names in place.
      trim.curve.controlPoints[1][2] += .01;
    });
    reject(copy => {
      const patch = copy.brep.faces.find(face => face.name === 'n2.face#2')!.surface;
      assert.equal(patch.kind, 'surface');
      if (patch.kind === 'surface') patch.weights[2][1] += .01;
    });
    assert.deepEqual(output, before);
  }
  assert.equal(nativeClosedFilletTorusOf(fixture()), undefined);
});
