import assert from 'node:assert/strict';
import test from 'node:test';
import { rectanglePart, withNode, type ModelNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluatePart, type BodyResult } from '@barocss/cad-model/engine/evaluate';
import { heldFinishGroupProblems } from '@barocss/cad-model/engine/heldFinishGroup';
import type { Problem, Sig } from '@barocss/cad-model/engine/references';
import { heldFilletBoxCompanion, replaceFilletBesideBox, filletCompanionPreserved } from '../src/state/heldFilletBoxCompanion';

function fixture() {
  const edges = ['n1.side[retired1]|n1.side1', 'n1.side[retired2]|n1.side3'];
  const signature: Sig = { k: 'line', p: [-10, -8, 5], d: [0.6, 0.8, 0], s: 10 };
  const fillet = withNode(rectanglePart(80, 40, 10), {
    kind: 'fillet', parent: { node: 1, side: 'solid' }, radius: 2, edges, held: 'Missing edges', suppressed: true,
    sigs: Object.fromEntries(edges.map(name => [name, signature])),
  });
  const doc = withNode(withNode(fillet, {
    kind: 'sketch', profile: 'rectangle', min: [90, 0], max: [100, 10],
  }), { kind: 'extrude', sketch: 3, height: 5 });
  const problems: Problem[] = edges.map((name, index) => ({ node: 2, where: 'feature 2', name, index, candidates: [] }));
  const held = evaluatePart(doc, 1);
  assert.ok(held.ok);
  const bodies = [...held.bodies].reverse();
  const scope = heldFilletBoxCompanion(doc, 2, problems, bodies);
  assert.ok(scope);
  return { doc, problems, bodies, scope };
}

test('two missing Fillet edges accept picks on their own solid and preserve the independent extrusion', () => {
  const { doc, scope, problems } = fixture();
  assert.equal(heldFinishGroupProblems(doc, 2, problems), undefined);
  const picks = [0, 80].map(x => scope.fillet.mesh.edges.find(edge => edge.axis === 'z' && edge.a[0] === x && edge.a[1] === x / 2));
  assert.ok(picks.every(pick => pick?.nativeLine));
  assert.equal(replaceFilletBesideBox(scope, [picks[0], scope.companion.mesh.edges[0]]), null);
  assert.equal(replaceFilletBesideBox(scope, [picks[0], picks[0]]), null);
  const next = replaceFilletBesideBox(scope, picks);
  assert.ok(next);
  assert.equal(next.outputs, doc.outputs);
  assert.equal(next.nodes.length, doc.nodes.length);
  assert.ok(doc.nodes.every((node, i) => i === 2 || next.nodes[i] === node));
  assert.equal(next.nodes[2].held, undefined);
  const result = evaluatePart(next, 2, 8, 'refs');
  assert.ok(result.ok);
  assert.ok(filletCompanionPreserved(scope, result.bodies));
  const companionVolume = result.bodies.find(body => body.key === scope.companion.key)?.volume;
  assert.ok(typeof companionVolume === 'number' && Math.abs(companionVolume - 500) < 1e-8);
  const volume = result.bodies.find(body => body.key === scope.fillet.key)?.volume;
  assert.ok(typeof volume === 'number' && Math.abs(volume - (32000 - 20 * (4 - Math.PI))) < 1e-7);
});

test('group availability requires two missing source slots, independent boxes and two distinct output producers', () => {
  const { doc, problems, bodies, scope } = fixture();
  const withFeature = (i: number, node: ModelNode): StudioDoc => ({ ...doc, nodes: doc.nodes.map((old, k) => k === i ? node : old) });
  const [stock, , fillet, sketch, extrude] = doc.nodes;
  assert.ok(stock.kind === 'sketch' && fillet.kind === 'fillet' && sketch.kind === 'sketch' && extrude.kind === 'extrude');
  for (const other of [
    withFeature(3, { ...sketch, on: { node: 2, side: 'solid' } }),
    withFeature(3, { kind: 'sketch', profile: 'circle', center: [90, 0], radius: 4 }),
    withFeature(4, { ...extrude, sketch: 0 }),
    withFeature(4, { ...extrude, cutDepth: 'through' }),
    withFeature(2, { ...fillet, edges: [...fillet.edges, 'third'] }),
    withFeature(2, { kind: 'chamfer', parent: fillet.parent, distance: 2, edges: fillet.edges, sigs: fillet.sigs, held: fillet.held, suppressed: true }),
    { ...doc, outputs: { ...doc.outputs, b4: doc.outputs.b2 } },
  ]) assert.equal(heldFilletBoxCompanion(other, 2, problems, bodies), undefined);
  assert.equal(heldFilletBoxCompanion(doc, 2, problems.slice(0, 1), bodies), undefined);
  assert.equal(heldFilletBoxCompanion(doc, 2, [{ ...problems[0], index: 1 }, problems[1]], bodies), undefined);
  assert.equal(heldFilletBoxCompanion(doc, 2, problems, [scope.fillet, scope.fillet]), undefined);
  assert.equal(heldFilletBoxCompanion(doc, 2, problems, [scope.companion, { ...scope.fillet, ref: scope.companion.ref }]), undefined);
});

test('worker result must preserve the producer and all six named oriented companion faces', () => {
  const { scope } = fixture();
  const other = scope.companion, faces = other.mesh.faces;
  const changed = (body: BodyResult) => filletCompanionPreserved(scope, [body, scope.fillet]);
  assert.equal(changed({ ...other, ref: scope.fillet.ref }), false);
  assert.equal(changed({ ...other, key: scope.fillet.key }), false);
  assert.equal(changed({ ...other, topology: undefined }), false);
  assert.equal(changed({ ...other, mesh: { ...other.mesh, faces: [...faces, faces[0]] } }), false);
  const [face, ...rest] = faces;
  assert.ok(face.exact?.kind === 'plane' && face.nativeAxisPlane && face.nativeAlignFace);
  for (const first of [
    { ...face, area: face.area + 1e-9 },
    { ...face, centroid: [face.centroid[0] + 1e-9, face.centroid[1], face.centroid[2]] as typeof face.centroid },
    { ...face, nativeAxisPlane: { ...face.nativeAxisPlane, at: face.nativeAxisPlane.at + 1e-10 } },
    { ...face, exact: { ...face.exact, n: face.exact.n.map(v => -v) as typeof face.centroid } },
    { ...face, name: rest[0].name, nativePlaneName: rest[0].nativePlaneName },
  ]) assert.equal(changed({ ...other, mesh: { ...other.mesh, faces: [first, ...rest] } }), false);
});
