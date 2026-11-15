import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { offsetFaceCommand } from '@barocss/cad-model/app/profileCommands';
import { refusal } from '@barocss/cad-model/engine/refusal';
import { commandBuildFailure } from '../src/state/commandBuildFailure';
function context(name = 'n1.side0') {
  const doc = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon', points: [[0,0],[18,0],[24,8],[18,16],[0,16],[-6,8]] }), { kind: 'extrude', sketch: 0, height: 10 });
  const result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(f => f.name === name)!; assert.ok(face);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } };
}
test('native cardinal hex side failures explain a different face, not a distance correction', () => {
  const ctx = context(), before = structuredClone(ctx.doc);
  for (const d of [2,-2]) assert.throws(() => offsetFaceCommand.build!(ctx, { d }), cause => {
    const error = commandBuildFailure('offset-face', cause, ctx);
    assert.equal(error.title, 'Offset face does not support this prism side', String(cause));
    assert.match(error.hint, /Cancel.*select an oblique side face/); return true;
  });
  assert.deepEqual(ctx.doc, before);
});
test('oblique +/-9.599 and both cap offsets still build successfully', () => {
  for (const name of ['n1.side1','n1.top']) {
    const ctx = context(name), before = structuredClone(ctx.doc);
    for (const d of name.endsWith('top') ? [2,-2] : [9.599,-9.599]) {
      const result = evaluateDoc(offsetFaceCommand.build!(ctx, { d }), 2);
      assert.ok(result.ok, JSON.stringify(!result.ok && result.error)); assert.ok(result.bodies[0].volume! > 0);
    }
    assert.deepEqual(ctx.doc, before);
  }
});
test('wrong face/reference, stale display and unrelated failure retain legacy feedback', () => {
  const ctx = context(), error = refusal('VALUE', 'Offset face: the current native topology is outside the unpartitioned cap profile.');
  const legacy = (e: unknown) => ({ title: 'Invalid input', hint: String(e), detail: '' });
  for (const other of [context('n1.top'), context('n1.side1'), { ...ctx, bodies: ctx.bodies.map(b => ({ ...b, ref: { node: 0, side: 'solid' as const } })) }])
    assert.deepEqual(commandBuildFailure('offset-face', error, other), legacy(error));
  const otherError = refusal('VALUE', 'Offset face needs a nonzero signed distance within ±10000 mm.');
  assert.deepEqual(commandBuildFailure('offset-face', otherError, ctx), legacy(otherError));
  const stale = { ...ctx, doc: { ...ctx.doc, nodes: ctx.doc.nodes.map(n => n.kind === 'extrude' ? { ...n, height: 12 } : n) } };
  assert.throws(() => offsetFaceCommand.build!(stale, { d: 2 }), cause => { assert.deepEqual(commandBuildFailure('offset-face', cause, stale), legacy(cause)); return true; });
});
