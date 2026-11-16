import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { createCommandReferencePicking } from '../src/app/commandReferencePicking';
import { createValueStore } from '../src/state/valueStore';
import type { Active } from '../src/app/commandState';
import type { StudioNotice } from '../src/app/studioNotice';

function fixture(id = 'extrude') {
  const doc = rectanglePart(30, 20, 10);
  const active = { cmd: { id, label: id }, ctx: { doc, bodies: [], selection: { faces: [], edges: [] } },
    values: { depth: 'to-face', offsetMode: 'to-plane' }, preview: 'ok' } as unknown as Active;
  const activeStore = createValueStore<Active | null>(active), notices = createValueStore<StudioNotice | null>(null);
  let current = true, retired = 0, cleared = 0;
  const controller = createCommandReferencePicking({
    model: { doc, commandDoc: doc, isCurrent: () => current, ownsEvaluatedSource: () => current },
    command: { activeStore, scope: { current: { bodies: [], hidden: new Set(), preview: false } },
      previewFor: { current: null }, retire: () => { retired++; }, clearQueuedApply: () => { cleared++; } },
    selection: { setSelection: () => assert.fail('Unexpected selection change'), setDirectSel: () => assert.fail('Unexpected direct selection change') },
    onNotice: notices.set,
  });
  return { controller, active, activeStore, notices, stale: () => { current = false; },
    counts: () => ({ retired, cleared }) };
}
test('unrelated commands leave reference picks untouched', () => {
  const f = fixture('box');
  assert.equal(f.controller.pickCommandReferenceFace({ face: null, edge: null }, false), false);
  assert.equal(f.controller.pickRevolveAxis({ edge: null }, false), false);
  assert.equal(f.controller.pickTransformFace({ face: null, edge: null }, false), false);
  assert.equal(f.controller.retargetActiveSweep({ profile: 0 }), false);
  assert.equal(f.activeStore.get(), f.active); assert.deepEqual(f.counts(), { retired: 0, cleared: 0 });
});
test('reference picks retire stale commands and queued Apply without publishing a target', () => {
  for (const id of ['extrude', 'offset-face']) {
    const f = fixture(id); f.stale();
    assert.equal(f.controller.pickCommandReferenceFace({ face: null, edge: null }, false), true);
    assert.equal(f.activeStore.get(), null); assert.equal(f.notices.get(), null);
    assert.deepEqual(f.counts(), { retired: 1, cleared: 1 });
  }
});
test('invalid offset target owns row-local refusal while extrude keeps its command', () => {
  const offset = fixture('offset-face'); offset.controller.pickCommandReferenceFace({ face: null, edge: null }, true);
  assert.equal(offset.activeStore.get()?.preview, 'input');
  assert.ok(offset.activeStore.get()?.offsetPlanePickIssue); assert.equal(offset.notices.get(), null);
  const extrude = fixture(); extrude.controller.pickCommandReferenceFace({ face: null, edge: null }, true);
  assert.equal(extrude.activeStore.get(), extrude.active);
  assert.equal(extrude.notices.get()?.title, 'End face not selected');
});
