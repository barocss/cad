import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { newFilletActive } from '../src/app/filletFamily';
import { filletPickFailure } from '../src/app/filletPickFailure';
import type { Active } from '../src/app/commandState';

const original = { title: 'Selection not changed',
  hint: 'Choose an unchanged face or edge of the source body. Generated or ambiguous preview references cannot be selected.',
  detail: 'The accepted selection is unchanged. Apply was not queued.' };
function fixture(): Active {
  const doc = rectanglePart(40, 30, 10), result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const edge = result.bodies[0].mesh.edges.findIndex(e => e.names.includes('n1.side0|n1.top')); assert.ok(edge >= 0);
  return newFilletActive('edge', { doc, bodies: result.bodies, selection: { edges: [{ body: 0, edge }], faces: [], bodies: [] } });
}
test('an existing named edge row offers list removal without inferring the refused hit', () => {
  const active = fixture(), before = structuredClone({ doc: active.ctx.doc, selection: active.ctx.selection, values: active.values });
  const error = filletPickFailure(active);
  assert.equal(error.title, original.title); assert.equal(error.detail, original.detail);
  assert.equal(error.hint, original.hint + ' To remove an already picked edge, open Edit picked edges and choose Remove.');
  assert.deepEqual({ doc: active.ctx.doc, selection: active.ctx.selection, values: active.values }, before);
});
test('Face, Full round, unrelated commands and absent visible rows retain original refusal', () => {
  const active = fixture();
  for (const type of ['face', 'full-round'] as const)
    assert.deepEqual(filletPickFailure({ ...active, fillet: { ...active.fillet!, type } }), original);
  assert.deepEqual(filletPickFailure({ ...active, fillet: undefined }), original);
  assert.deepEqual(filletPickFailure({ ...active, cmd: { ...active.cmd, id: 'edit' } }), original);
  for (const edges of [[], [{ body: 50, edge: 0 }], [{ body: 0, edge: -1 }], [{ body: 0, edge: 0.5 }]])
    assert.deepEqual(filletPickFailure({ ...active, ctx: { ...active.ctx, selection: { ...active.ctx.selection, edges } } }), original);
  const blank = { ...active, ctx: { ...active.ctx, bodies: active.ctx.bodies.map(body => ({ ...body,
    mesh: { ...body.mesh, edges: body.mesh.edges.map(edge => ({ ...edge, names: [] })) } })) } };
  assert.deepEqual(filletPickFailure(blank), original);
});
