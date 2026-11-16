import assert from 'node:assert/strict';
import test from 'node:test';
import { draftDependentHoleFeedback } from '../src/app/draftDependentHoleFeedback';
import { editSavedDraftCommand } from '@barocss/cad-model/app/draftEdit';
import type { Active } from '../src/app/commandState';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
const doc: StudioDoc = { format: 'barocss-cad-model', schema: 3, units: 'mm', parameters: {}, nodes: [
  { id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 10 },
  { id: 'n2', kind: 'draft', parent: { node: 1, side: 'solid' }, faces: ['back', 'top'], pull: '-x', angle: 20 },
  { id: 'n3', kind: 'hole', parent: { node: 2, side: 'solid' }, center: [10, 5], radius: 1, axis: 'x', depth: 2 }], outputs: { b3: { node: 3, side: 'solid' } }, nextId: 4 };
const active = (): Active => ({ cmd: editSavedDraftCommand(doc, 2)!, ctx: { doc } as Active['ctx'], values: { deg: 20, pull: 'x', neutralMode: 'auto' }, preview: 'error', error: { title: 'Hole failure', hint: 'Move its centre', detail: 'kernel detail', feature: 'n3', failedFeature: 'Hole Ø2 (n3)' } });
test('dependent Hole failure names recovery available in Edit Draft and retains diagnostic identity', () => {
  const a = active(), result = draftDependentHoleFeedback(a)!;
  assert.match(result.title, /Draft change.*Hole/); assert.match(result.hint, /Pull or Angle/);
  assert.match(result.hint, /cancel first.*Hole in History/);
  assert.equal(result.failedFeature, a.error!.failedFeature); assert.equal(result.detail, a.error!.detail);
});
test('unchanged, pending, direct Draft, and independent Hole failures keep original diagnostics', () => {
  const a = active();
  for (const patch of [{ preview: 'busy' }, { preview: 'ok' }, { values: { ...a.values, pull: '-x' } }, { error: { ...a.error!, feature: 'n2' } }]) assert.equal(draftDependentHoleFeedback({ ...a, ...patch } as Active), undefined);
  const independent: StudioDoc = { ...doc, nodes: doc.nodes.map(n => n.kind === 'hole' ? { ...n, parent: { node: 1, side: 'solid' } } : n) };
  assert.equal(draftDependentHoleFeedback({ ...a, cmd: editSavedDraftCommand(independent, 2)!, ctx: { doc: independent } as Active['ctx'] }), undefined);
});
