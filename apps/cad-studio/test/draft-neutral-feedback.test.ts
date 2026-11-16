import assert from 'node:assert/strict';
import test from 'node:test';
import { draftNeutralFeedback } from '../src/app/draftNeutralFeedback';
import { editSavedDraftCommand } from '@barocss/cad-model/app/draftEdit';
import type { Active } from '../src/app/commandState';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  { id: 'n2', kind: 'draft', parent: { node: 1, side: 'solid' }, faces: ['back', 'top'], pull: '-x', angle: 10 }], outputs: { b1: { node: 2, side: 'solid' } }, nextId: 3 };
const active = (): Active => ({ cmd: editSavedDraftCommand(doc, 2)!, ctx: { doc } as Active['ctx'], values: { deg: 10, pull: '-x', neutralMode: 'fixed', neutral: 21 }, preview: 'error', error: { title: 'Kernel failure', hint: 'Generic', code: 'CAPABILITY', feature: 'n2', detail: 'Draft on adjacent box sides needs the neutral plane at the start of the pull' } });
test('owned neutral refusal names Body end without imposing a new kernel limit', () => {
  const a = active(), result = draftNeutralFeedback(a);
  assert.equal(result?.historyField, 'neutral'); assert.match(result!.hint, /Body end/); assert.equal(result?.detail, a.error?.detail);
});
test('unrelated, downstream, pending and successful previews keep their original feedback', () => {
  for (const patch of [{ preview: 'busy' }, { preview: 'ok' }, { values: { ...active().values, neutralMode: 'auto' } }]) assert.equal(draftNeutralFeedback({ ...active(), ...patch } as Active), undefined);
  for (const patch of [{ feature: 'n3' }, { code: 'GEOMETRY' }, { detail: 'Another capability refusal' }]) { const a = active(); a.error = { ...a.error!, ...patch }; assert.equal(draftNeutralFeedback(a), undefined); }
});
