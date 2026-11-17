import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { switchTool } from '../src/app/sketchControls';
import { createDraftHistory, draftHistoryState, outlineHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const doc = emptyDoc();
const slot = (x = 0, construction = false): SketchShape => ({ kind: 'slot', a: [x, 10], b: [x + 20, 10], r: 4, ...(construction ? { construction: true as const } : {}) });
const draft = (patch: Partial<SketchState> = {}): SketchState => ({ plane: xyPlane(), tool: 'slot', shape: null, ...patch });
function replay(h: ReturnType<typeof createDraftHistory>, current: SketchState, redo = false) {
  const s = draftHistoryState(doc, current), step = redo ? h.redo(s) : h.undo(s); assert.ok(step);
  return restoreDraftHistory(current, step);
}
function push(h: ReturnType<typeof createDraftHistory>, a: SketchState, b: SketchState) { h.push(draftHistoryState(doc, a), draftHistoryState(doc, b)); }
test('Atomic completed Slot restores the empty draft and Clear ownership', () => {
  const a = draft({ clearedSideIds: ['e1'], positional: { e1: 'side1' } }), b = { ...a, shape: slot() }, h = createDraftHistory();
  push(h, a, b); const u = replay(h, b); assert.equal(u.shape, null); assert.equal(u.clearedSideIds, a.clearedSideIds); assert.equal(u.positional, a.positional);
  assert.equal(replay(h, u, true).shape, b.shape);
});
test('Repeated completed Slots Undo and Redo exact authored owners', () => {
  const a = draft(), b = { ...a, shape: slot() }, c = { ...b, shape: slot(40), done: [b.shape] }, h = createDraftHistory();
  push(h, a, b); push(h, b, c);
  const ub = replay(h, c); assert.equal(ub.shape, b.shape); assert.equal(ub.done, b.done);
  const ua = replay(h, ub); assert.equal(ua.shape, null);
  const rc = replay(h, replay(h, ua, true), true); assert.equal(rc.shape, c.shape); assert.equal(rc.done, c.done);
});
test('Slot reselection retains exact parked owner and previous placement history', () => {
  const a = draft(), b = { ...a, shape: slot() }, parked = switchTool(b, 'slot');
  assert.equal(parked.done![0], b.shape);
  const c = { ...parked, shape: slot(40) }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
  const u = replay(h, c); assert.equal(u.done![0], b.shape);
  const empty = replay(h, u); assert.equal(empty.shape, null); assert.equal(empty.done, a.done);
  const redone = replay(h, replay(h, empty, true), true); assert.equal(redone.shape, c.shape); assert.equal(redone.done![0], b.shape);
});
for (const other of ['rectangle', 'circle'] as const) for (const slotFirst of [true, false]) test(`Mixed ${other}/Slot exact parking, Slot first=${slotFirst}`, () => {
  const shape: SketchShape = other === 'rectangle' ? { kind: 'rectangle', a: [0, 0], b: [10, 6] } : { kind: 'circle', c: [0, 0], r: 4 };
  const a = draft({ tool: slotFirst ? 'slot' : other }), b = { ...a, shape: slotFirst ? slot() : shape };
  const parked = switchTool(b, slotFirst ? other : 'slot'); assert.equal(parked.done![0], b.shape);
  const c = { ...parked, shape: slotFirst ? shape : slot(40) }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
  const ub = replay(h, c); assert.equal(ub.done![0], b.shape);
  const ua = replay(h, ub); assert.equal(ua.shape, null); assert.equal(ua.done, a.done);
  const rc = replay(h, replay(h, ua, true), true); assert.equal(rc.shape, c.shape); assert.equal(rc.done![0], b.shape);
});
test('Construction Slot retains its authored construction state', () => {
  const a = draft({ construct: true }), b = { ...a, shape: slot(0, true) }, h = createDraftHistory(); push(h, a, b);
  const r = replay(h, replay(h, b), true); assert.equal(r.shape, b.shape); assert.equal(r.shape?.construction, true);
});
test('First and middle previews are not completed placement history entries', () => {
  const a = draft(), b = { ...a, shape: slot() }, h = createDraftHistory(); push(h, a, b);
  for (const shape of [{ kind: 'slot' as const, a: [40, 10] as [number, number], b: [40, 10] as [number, number], r: 0 }, slot(40)]) {
    assert.deepEqual(h.available(draftHistoryState(doc, { ...b, shape, done: [b.shape] })), { undo: false, redo: false });
  }
  // App owns the pending gesture and must not invoke replay against these unmatched snapshots.
  const c = { ...b, shape: slot(40), done: [b.shape] }; push(h, b, c);
  assert.equal(replay(h, replay(h, c)).shape, null);
});
test('Slot replay rejects clone, order changes, extra owners and foreign source metadata', () => {
  const one = slot(), two = slot(40), a = draft({ clearedSideIds: ['e1'] }), b = { ...a, shape: two, done: [one] };
  for (const done of [[one, structuredClone(two)], [two, one], [one, two, slot(80)]]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, shape: null, done })), null);
  }
  for (const patch of [{ plane: xyPlane() }, { editNode: 2 }, { clearedSideIds: ['e1'] }, { associationDetached: true as const }]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, ...patch })), null);
  }
  const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState({ ...doc }, b)), null);
  const r = createDraftHistory(); push(r, a, b); const u = replay(r, b); assert.equal(r.redo(draftHistoryState({ ...doc }, u)), null);
});
test('Slot exception does not admit Trim, Ellipse tool or active polygon partitions', () => {
  const polygon: SketchShape = { kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]], closed: true };
  for (const b of [draft({ tool: 'trim', shape: slot() }), draft({ tool: 'ellipse', shape: slot() }), draft({ shape: polygon })]) {
    const h = createDraftHistory(); push(h, draft(), b);
    assert.equal(h.available(draftHistoryState(doc, { ...b, tool: 'slot', shape: null, done: [b.shape!] })).undo, false);
  }
});
test('Existing Slot panel outline edit replays before the complete placement', () => {
  const a = draft(), b = { ...a, shape: slot() }, edited = { ...b, shape: { ...b.shape, r: 6 } as SketchShape }, h = createDraftHistory();
  push(h, a, b); h.push(outlineHistoryState(b.shape), outlineHistoryState(edited.shape));
  const ub = replay(h, edited); assert.equal(ub.shape, b.shape);
  const ua = replay(h, ub); assert.equal(ua.shape, null);
  const rb = replay(h, ua, true), re = replay(h, rb, true); assert.equal(re.shape, edited.shape);
});
