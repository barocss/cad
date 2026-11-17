import { switchTool } from '../src/app/sketchControls';
import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { createDraftHistory, draftHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const rect = (x = 0, construction = false): SketchShape => ({ kind: 'rectangle', a: [x, 0], b: [x + 10, 6], ...(construction ? { construction: true as const } : {}) });
const draft = (patch: Partial<SketchState> = {}): SketchState => ({ plane: xyPlane(), tool: 'rectangle', shape: null, ...patch });
const doc = emptyDoc();
function applyStep(history: ReturnType<typeof createDraftHistory>, current: SketchState, forward = false) {
  const snapshot = draftHistoryState(doc, current), step = forward ? history.redo(snapshot) : history.undo(snapshot); assert.ok(step);
  return restoreDraftHistory(current, step);
}
test('One complete placement restores the empty draft and all Clear reservation references', () => {
  const before = draft({ clearedSideIds: ['e1', 'e2', 'e3'], positional: undefined, mainIds: undefined }), after = { ...before, shape: rect() }, h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  const undone = applyStep(h, after); assert.equal(undone.shape, null); assert.equal(undone.clearedSideIds, before.clearedSideIds);
  assert.equal(h.available(draftHistoryState(doc, undone)).undo, false);
  const redone = applyStep(h, undone, true); assert.equal(redone.shape, after.shape); assert.equal(redone.clearedSideIds, before.clearedSideIds);
});
test('Repeated placement is one step including parking and restoring the previous rectangle', () => {
  const before = draft(), first = { ...before, shape: rect() }, second = { ...first, shape: rect(20), done: [first.shape] }, h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, first)); h.push(draftHistoryState(doc, first), draftHistoryState(doc, second));
  const one = applyStep(h, second); assert.equal(one.shape, first.shape); assert.equal(one.done, first.done);
  const zero = applyStep(h, one); assert.equal(zero.shape, null);
  const redoOne = applyStep(h, zero, true), redoTwo = applyStep(h, redoOne, true);
  assert.equal(redoTwo.shape, second.shape); assert.equal(redoTwo.done, second.done);
});
test('Completed construction placement and selection-tool replay preserve authored construction state', () => {
  const before = draft({ construct: true, clearedSideIds: ['e9'] }), after = { ...before, shape: rect(0, true) }, h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  const selected = { ...after, tool: 'select' as const, picked: [] }, undone = applyStep(h, selected);
  assert.equal(undone.shape, null); assert.equal(undone.clearedSideIds, before.clearedSideIds);
  const redone = applyStep(h, undone, true); assert.equal(redone.shape, after.shape); assert.equal(redone.shape?.construction, true);
});
test('Pending previews do not form history steps; completion with the same final preview still does', () => {
  const before = draft(), after = { ...before, shape: rect() }, pending = { ...after, shape: { kind: 'rectangle' as const, a: [20, 0] as [number, number], b: [20, 0] as [number, number] }, done: [after.shape] }, h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  assert.deepEqual(h.available(draftHistoryState(doc, pending)), { undo: false, redo: false });
  // App must not call undo/redo while a placement owns this unmatched pending draft.
  const complete = { ...pending, shape: rect(20) };
  h.push(draftHistoryState(doc, after), draftHistoryState(doc, complete));
  const restored = applyStep(h, complete); assert.equal(restored.shape, after.shape);
  assert.equal(applyStep(h, restored).shape, null, 'earlier completed placement remains available');
});

test('Actual Rectangle tool reselection preserves the prior owner through repeated placement Undo and Redo', () => {
  const before = draft({ clearedSideIds: ['e1'] }), first = { ...before, shape: rect() }, parked = switchTool(first, 'rectangle');
  assert.equal(parked.shape, null); assert.equal(parked.done![0], first.shape);
  const second = { ...parked, shape: rect(20) }, h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, first)); h.push(draftHistoryState(doc, parked), draftHistoryState(doc, second));
  const undoneSecond = applyStep(h, second); assert.equal(undoneSecond.shape, null); assert.equal(undoneSecond.done![0], first.shape);
  const undoneFirst = applyStep(h, undoneSecond); assert.equal(undoneFirst.shape, null); assert.equal(undoneFirst.done, before.done);
  assert.equal(undoneFirst.clearedSideIds, before.clearedSideIds);
  const redoFirst = applyStep(h, undoneFirst, true), redoSecond = applyStep(h, redoFirst, true);
  assert.equal(redoSecond.shape, second.shape); assert.equal(redoSecond.done![0], first.shape);
});
test('Numerically identical cloned rectangles cannot stand in for the authored parked owner', () => {
  const before = draft(), after = { ...before, shape: rect() }, h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  const replaced = { ...switchTool(after, 'rectangle'), done: [structuredClone(after.shape)] };
  assert.deepEqual(h.available(draftHistoryState(doc, replaced)), { undo: false, redo: false });
  assert.equal(h.undo(draftHistoryState(doc, replaced)), null);
});
test('Rectangle reselection does not make reordered or extra parked owners equivalent', () => {
  const a = rect(), b = rect(20), before = draft(), after = draft({ shape: b, done: [a] }), h = createDraftHistory();
  h.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  const parked = switchTool(after, 'rectangle'); assert.equal(parked.done![0], a); assert.equal(parked.done![1], b);
  for (const done of [[b, a], [a, b, rect(40)]]) assert.equal(h.available(draftHistoryState(doc, { ...parked, done })).undo, false);
  assert.equal(h.available(draftHistoryState(doc, parked)).undo, true);
});

test('Completed zero-area placement remains a draft step between valid rectangles', () => {
  for (const b of [[20, 0], [20, 6], [30, 0]] as [number, number][]) {
    const before = draft({ clearedSideIds: ['e1', 'e2'], positional: { e1: 'side1' } }), first = { ...before, shape: rect() };
    const invalid = { ...first, shape: { kind: 'rectangle' as const, a: [20, 0] as [number, number], b }, done: [first.shape] };
    // A nonconstruction zero-area rectangle is replaced, not parked, by the next fresh placement.
    const second = { ...invalid, shape: rect(40) }, h = createDraftHistory();
    for (const [from, to] of [[before, first], [first, invalid], [invalid, second]]) {
      h.push(draftHistoryState(doc, from), draftHistoryState(doc, to));
    }
    const undoB = applyStep(h, second); assert.equal(undoB.shape, invalid.shape); assert.equal(undoB.done, invalid.done);
    const undoInvalid = applyStep(h, undoB); assert.equal(undoInvalid.shape, first.shape); assert.equal(undoInvalid.done, first.done);
    const undoA = applyStep(h, undoInvalid); assert.equal(undoA.shape, null); assert.equal(undoA.done, before.done);
    assert.equal(undoA.clearedSideIds, before.clearedSideIds); assert.equal(undoA.positional, before.positional);
    const redoA = applyStep(h, undoA, true), redoInvalid = applyStep(h, redoA, true), redoB = applyStep(h, redoInvalid, true);
    assert.equal(redoInvalid.shape, invalid.shape); assert.equal(redoInvalid.done, invalid.done);
    assert.equal(redoB.shape, second.shape); assert.equal(redoB.done, second.done);
    assert.equal(redoB.clearedSideIds, before.clearedSideIds);
  }
});

test('Rectangle draft history refuses a different document owner for Undo and Redo', () => {
  const before = draft(), first = { ...before, shape: rect() }, foreignDoc = { ...doc };
  const undoHistory = createDraftHistory();
  undoHistory.push(draftHistoryState(doc, before), draftHistoryState(doc, first));
  assert.deepEqual(undoHistory.available(draftHistoryState(foreignDoc, first)), { undo: false, redo: false });
  assert.equal(undoHistory.undo(draftHistoryState(foreignDoc, first)), null);
  const redoHistory = createDraftHistory();
  redoHistory.push(draftHistoryState(doc, before), draftHistoryState(doc, first));
  const undone = applyStep(redoHistory, first);
  assert.deepEqual(redoHistory.available(draftHistoryState(foreignDoc, undone)), { undo: false, redo: false });
  assert.equal(redoHistory.redo(draftHistoryState(foreignDoc, undone)), null);
});
