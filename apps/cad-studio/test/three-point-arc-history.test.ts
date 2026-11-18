import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { switchTool } from '../src/app/sketchControls';
import { createDraftHistory, draftHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const doc = emptyDoc();
const line = (): SketchShape => ({ kind: 'polygon', points: [[10, 10], [30, 10]], closed: false, bulges: [0, 0] });
const draft = (shape: SketchShape | null): SketchState => ({ plane: xyPlane(), tool: 'polygon', shape });
const push = (h: ReturnType<typeof createDraftHistory>, a: SketchState, b: SketchState) => h.push(draftHistoryState(doc, a), draftHistoryState(doc, b));
function replay(h: ReturnType<typeof createDraftHistory>, current: SketchState, forward = false) {
  const step = forward ? h.redo(draftHistoryState(doc, current)) : h.undo(draftHistoryState(doc, current));
  assert.ok(step); return restoreDraftHistory(current, step);
}
test('Line to Arc and back retains exact completed open-chain owner and history', () => {
  const a = draft(null), b = { ...a, shape: line() }, h = createDraftHistory(); push(h, a, b);
  const arc = switchTool(b, 'arc'); assert.equal(arc.shape, b.shape);
  assert.equal(h.available(draftHistoryState(doc, arc)).undo, true);
  const back = switchTool(arc, 'polygon'); assert.equal(back.shape, b.shape);
  const u = replay(h, back); assert.equal(u.shape, null); assert.equal(replay(h, u, true).shape, b.shape);
});
test('Completed connected arc is one snapshot over its exact earlier Line', () => {
  const a = draft(null), b = { ...a, shape: line() }, before = switchTool(b, 'arc');
  const after: SketchState = { ...before, shape: { kind: 'polygon', points: [[10, 10], [30, 10], [30, 30]], closed: false, bulges: [0, 1, 0], pending: false } };
  const h = createDraftHistory(); push(h, a, b); push(h, before, after);
  const u = replay(h, switchTool(after, 'polygon')); assert.equal(u.shape, b.shape);
  const empty = replay(h, u); assert.equal(empty.shape, null);
  const restored = replay(h, replay(h, empty, true), true); assert.equal(restored.shape, after.shape);
});
test('Pending Arc tool switch retains existing preview settlement rather than restoring an earlier owner', () => {
  const pending: SketchShape = { kind: 'polygon', points: [[10, 10], [30, 10], [30, 30]], closed: false, bulges: [0, 0.5, 0], pending: true };
  const switched = switchTool({ ...draft(pending), tool: 'arc' }, 'polygon');
  assert.notEqual(switched.shape, pending); assert.deepEqual(switched.shape, { ...pending, pending: false });
});
test('Arc replay rejects cloned geometry, a different document and unrelated draft mutation', () => {
  const a = draft(null), b = { ...a, shape: line() };
  for (const patch of [{ shape: structuredClone(b.shape) }, { plane: xyPlane() }, { editNode: 3 }, { associationDetached: true as const }]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, ...patch })), null);
  }
  const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState({ ...doc }, b)), null);
});
