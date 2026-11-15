import test from 'node:test';
import assert from 'node:assert/strict';
import { buildDraft } from '@barocss/cad-model/app/commands';
import { editSavedDraftCommand } from '@barocss/cad-model/app/draftEdit';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import { refusal } from '@barocss/cad-model/engine/refusal';
import { commandBuildFailure } from '../src/state/commandBuildFailure';

test('actual creation and Edit Draft build exceptions use the same angle recovery in the preview catch', () => {
  const doc = rectanglePart(40, 30, 10), result = evaluateDoc(doc, 1); assert.ok(result.ok);
  const face = result.bodies[0].mesh.faces.find(f => f.kind === 'plane' && f.normal[1] < -0.9)!;
  const ctx = { doc, bodies: result.bodies, selection: { faces: [{ body: 0, face: face.index }], edges: [], bodies: [] } };
  const saved = buildDraft(ctx, { deg: 5, pull: 'z' }), edit = editSavedDraftCommand(saved, saved.nodes.length - 1)!;
  for (const deg of [0, -45, 45]) {
    for (const [id, run] of [
      ['draft', () => buildDraft(ctx, { deg, pull: 'z' })],
      [edit.id, () => edit.build!({ ...ctx, doc: saved }, { deg, pull: 'z', neutralMode: 'auto' })],
    ] as const) assert.throws(run, cause => {
      const error = commandBuildFailure(id, cause);
      assert.equal(error.title, 'Draft needs a nonzero angle below 45°');
      assert.match(error.hint, /finite.*−45°.*45°.*excluding 0°/);
      assert.equal(error.code, 'DRAFT_ANGLE'); return true;
    });
  }
});

test('other commands, untyped lookalikes and other Draft failures retain legacy preview text', () => {
  for (const [id, error] of [
    ['box', refusal('DRAFT_ANGLE', 'same code outside Draft')],
    ['draft', new Error('[DRAFT_ANGLE] untyped')],
    ['draft-history-edit', refusal('BAD_REFERENCE', 'Open the current Draft in History again.')],
    ['draft', refusal('DRAFT_PICK', 'Pick side faces.')],
  ] as const) assert.deepEqual(commandBuildFailure(id, error), { title: 'Invalid input', hint: String(error), detail: '' });
});
