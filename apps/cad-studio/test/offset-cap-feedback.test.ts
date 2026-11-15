import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, rectanglePart, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { offsetFaceCommand } from '@barocss/cad-model/app/profileCommands';
import { refusal } from '@barocss/cad-model/engine/refusal';
import { commandBuildFailure } from '../src/state/commandBuildFailure';
const half = (): StudioDoc => ({ ...emptyDoc(), nodes: [
  { kind: 'sketch', profile: 'loop', segments: [{ kind: 'line', start: [-10, 0] }, { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' }] },
  { kind: 'extrude', sketch: 0, height: 10, draft: 14 },
] });
function context(doc: StudioDoc) {
  const result = evaluateDoc(doc, 1); assert.ok(result.ok, JSON.stringify(!result.ok && result.error));
  const face = result.bodies[0].mesh.faces.find(f => f.kind === 'plane' && f.normal[2] > 0.9)!; assert.ok(face);
  return { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } };
}
test('actual half-disk taper refuses both Offset signs with source-specific recovery and unchanged document', () => {
  const ctx = context(half()), before = structuredClone(ctx.doc);
  for (const d of [2, -1]) assert.throws(() => offsetFaceCommand.build!(ctx, { d }), cause => {
    const error = commandBuildFailure('offset-face', cause, ctx);
    assert.equal(error.title, 'Offset face does not support this tapered cap', String(cause));
    assert.match(error.hint, /Cancel Offset face.*original Extrude.*Distance/); return true;
  });
  assert.deepEqual(ctx.doc, before);
});
test('supported rectangular taper and straight cap remain buildable', () => {
  for (const draft of [undefined, 14]) {
    const base = rectanglePart(40, 30, 10), doc = { ...base, nodes: base.nodes.map(n => n.kind === 'extrude' ? { ...n, ...(draft === undefined ? {} : { draft }) } : n) };
    const ctx = context(doc);
    for (const d of [2, -1]) assert.ok(evaluateDoc(offsetFaceCommand.build!(ctx, { d }), 2).ok);
  }
});
test('wrong refs, stale native picks, other errors and other commands retain original feedback', () => {
  const ctx = context(half()), unsupported = refusal('VALUE', 'Offset face: the other cap is not a congruent native right-prism cap.');
  const wrong = { ...ctx, bodies: ctx.bodies.map(b => ({ ...b, ref: { node: 0, side: 'solid' as const } })) };
  const legacy = (e: unknown) => ({ title: 'Invalid input', hint: String(e), detail: '' });
  assert.deepEqual(commandBuildFailure('offset-face', unsupported, wrong), legacy(unsupported));
  assert.deepEqual(commandBuildFailure('other', unsupported, ctx), legacy(unsupported));
  const distance = refusal('VALUE', 'Offset face needs a nonzero signed distance within ±10000 mm.');
  assert.deepEqual(commandBuildFailure('offset-face', distance, ctx), legacy(distance));
  const stale = { ...ctx, doc: { ...ctx.doc, nodes: ctx.doc.nodes.map(n => n.kind === 'extrude' ? { ...n, height: 8 } : n) } };
  assert.throws(() => offsetFaceCommand.build!(stale, { d: 2 }), cause => {
    assert.deepEqual(commandBuildFailure('offset-face', cause, stale), legacy(cause)); return true;
  });
});
