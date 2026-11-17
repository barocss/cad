import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { switchTool } from '../src/app/sketchControls';
import { createDraftHistory, draftHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const doc = emptyDoc();
const circle = (x = 0, construction = false): SketchShape => ({ kind: 'circle', c: [x, 10], r: 4, ...(construction ? { construction: true as const } : {}) });
const draft = (patch: Partial<SketchState> = {}): SketchState => ({ plane: xyPlane(), tool: 'circle', shape: null, ...patch });
function replay(h: ReturnType<typeof createDraftHistory>, current: SketchState, redo = false) {
  const s = draftHistoryState(doc, current), step = redo ? h.redo(s) : h.undo(s); assert.ok(step);
  return restoreDraftHistory(current, step);
}
function push(h: ReturnType<typeof createDraftHistory>, a: SketchState, b: SketchState) { h.push(draftHistoryState(doc, a), draftHistoryState(doc, b)); }
test('Atomic Circle placement replays empty draft and exact reservations', () => {
  const a = draft({ clearedSideIds: ['e1'], positional: { e1: 'side1' } }), b = { ...a, shape: circle() }, h = createDraftHistory();
  push(h, a, b); const u = replay(h, b); assert.equal(u.shape, null); assert.equal(u.clearedSideIds, a.clearedSideIds); assert.equal(u.positional, a.positional);
  assert.equal(replay(h, u, true).shape, b.shape);
});
test('Repeated circles replay both complete placements with exact parked owners', () => {
  const a = draft(), b = { ...a, shape: circle() }, c = { ...b, shape: circle(20), done: [b.shape] }, h = createDraftHistory();
  push(h, a, b); push(h, b, c);
  const ub = replay(h, c); assert.equal(ub.shape, b.shape); assert.equal(ub.done, b.done);
  const ua = replay(h, ub); assert.equal(ua.shape, null);
  const rc = replay(h, replay(h, ua, true), true); assert.equal(rc.shape, c.shape); assert.equal(rc.done, c.done);
});
test('Explicit Circle reselection parks the same object and preserves the earlier Undo chain', () => {
  const a = draft(), b = { ...a, shape: circle() }, parked = switchTool(b, 'circle');
  assert.equal(parked.shape, null); assert.equal(parked.done![0], b.shape);
  const c = { ...parked, shape: circle(20) }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
  const u = replay(h, c); assert.equal(u.done![0], b.shape);
  const empty = replay(h, u); assert.equal(empty.shape, null); assert.equal(empty.done, a.done);
  const redone = replay(h, replay(h, empty, true), true); assert.equal(redone.shape, c.shape); assert.equal(redone.done![0], b.shape);
});
test('Mixed Circle then Rectangle placement preserves both authored outlines', () => {
  const a = draft(), b = { ...a, shape: circle() }, parked = switchTool(b, 'rectangle');
  assert.equal(parked.done![0], b.shape);
  const r: SketchShape = { kind: 'rectangle', a: [20, 0], b: [30, 6] }, c = { ...parked, shape: r }, h = createDraftHistory();
  push(h, a, b); push(h, parked, c);
  const ub = replay(h, c); assert.equal(ub.done![0], b.shape);
  const ua = replay(h, ub); assert.equal(ua.shape, null); assert.equal(ua.done, a.done);
  const rc = replay(h, replay(h, ua, true), true); assert.equal(rc.shape, r); assert.equal(rc.done![0], b.shape);
});
test('Construction Circle placement preserves construction and Clear identities', () => {
  const a = draft({ construct: true, clearedSideIds: ['e7'] }), b = { ...a, shape: circle(0, true) }, h = createDraftHistory();
  push(h, a, b); const u = replay(h, b), r = replay(h, u, true);
  assert.equal(u.clearedSideIds, a.clearedSideIds); assert.equal(r.shape, b.shape); assert.equal(r.shape?.construction, true);
});
test('Circle replay refuses cloned, reordered or extra shape owners', () => {
  const c1 = circle(), c2 = circle(20), a = draft(), b = draft({ shape: c2, done: [c1] });
  for (const done of [[c1, structuredClone(c2)], [c2, c1], [c1, c2, circle(40)]]) {
    const h = createDraftHistory(); push(h, a, b);
    const foreign = { ...b, shape: null, done };
    assert.equal(h.available(draftHistoryState(doc, foreign)).undo, false); assert.equal(h.undo(draftHistoryState(doc, foreign)), null);
  }
});
test('Circle replay retains document, plane, source and Clear reservation ownership guards', () => {
  const a = draft({ clearedSideIds: ['e1'] }), b = { ...a, shape: circle() };
  for (const patch of [{ plane: xyPlane() }, { editNode: 2 }, { clearedSideIds: ['e1'] }, { associationDetached: true as const }]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, ...patch })), null);
  }
  const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState({ ...doc }, b)), null);
  const r = createDraftHistory(); push(r, a, b); const u = replay(r, b); assert.equal(r.redo(draftHistoryState({ ...doc }, u)), null);
});
test('Circle parking admission does not make Trim or polygon owners equivalent', () => {
  const polygon: SketchShape = { kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]], closed: true };
  for (const b of [draft({ tool: 'trim', shape: circle() }), draft({ shape: polygon })]) {
    const h = createDraftHistory(); push(h, draft(), b);
    const parked = { ...b, tool: 'circle' as const, shape: null, done: [b.shape!] };
    assert.equal(h.available(draftHistoryState(doc, parked)).undo, false);
  }
});

test('Mixed Rectangle then Circle placement replays across the exact-object tool partition', () => {
  const rectangle: SketchShape = { kind: 'rectangle', a: [0, 0], b: [10, 6] };
  const a = draft({ tool: 'rectangle' }), b = { ...a, shape: rectangle }, parked = switchTool(b, 'circle');
  assert.equal(parked.done![0], rectangle);
  const c = { ...parked, shape: circle(20) }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
  const ub = replay(h, c); assert.equal(ub.done![0], rectangle);
  const ua = replay(h, ub); assert.equal(ua.shape, null); assert.equal(ua.done, a.done);
  const rc = replay(h, replay(h, ua, true), true); assert.equal(rc.shape, c.shape); assert.equal(rc.done![0], rectangle);
});
