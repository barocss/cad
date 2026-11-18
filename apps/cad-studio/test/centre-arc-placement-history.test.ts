import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { switchTool } from '../src/app/sketchControls';
import { createDraftHistory, draftHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const doc = emptyDoc();
const arc = (x = 0): Extract<SketchShape, { kind: 'polygon' }> => ({ kind: 'polygon', points: [[x + 10, 0], [x, 10]], bulges: [Math.tan(Math.PI / 8), 0], closed: false });
const draft = (patch: Partial<SketchState> = {}): SketchState => ({ plane: xyPlane(), tool: 'carc', shape: null, ...patch });
function replay(h: ReturnType<typeof createDraftHistory>, current: SketchState, redo = false) {
  const s = draftHistoryState(doc, current), step = redo ? h.redo(s) : h.undo(s); assert.ok(step);
  return restoreDraftHistory(current, step);
}
function push(h: ReturnType<typeof createDraftHistory>, a: SketchState, b: SketchState) { h.push(draftHistoryState(doc, a), draftHistoryState(doc, b)); }
test('Completed centre arc restores the empty draft and exact Clear references', () => {
  const a = draft({ clearedSideIds: ['e1'], positional: { e1: 'side1' } }), b = { ...a, shape: arc() }, h = createDraftHistory(); push(h, a, b);
  const u = replay(h, b); assert.equal(u.shape, null); assert.equal(u.clearedSideIds, a.clearedSideIds); assert.equal(u.positional, a.positional);
  assert.equal(replay(h, u, true).shape, b.shape);
});
test('Repeated separated arcs preserve both placement snapshots', () => {
  const a = draft(), b = { ...a, shape: arc() }, c = { ...b, shape: arc(30), done: [b.shape] }, h = createDraftHistory(); push(h, a, b); push(h, b, c);
  const u = replay(h, c); assert.equal(u.shape, b.shape); const empty = replay(h, u); assert.equal(empty.shape, null);
  const r = replay(h, replay(h, empty, true), true); assert.equal(r.shape, c.shape); assert.equal(r.done, c.done);
});
test('Explicit Centre arc reselection permits only pending:false parking of the same nested owner', () => {
  const a = draft(), b = { ...a, shape: arc() }, parked = switchTool(b, 'carc');
  assert.ok(parked.done![0].kind === 'polygon'); const p = parked.done![0]; if (p.kind !== 'polygon') throw new Error('polygon');
  assert.equal(p.points, b.shape.points); assert.equal(p.bulges, b.shape.bulges);
  const c = { ...parked, shape: arc(30) }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
  const empty = replay(h, replay(h, c)); assert.equal(empty.shape, null);
  const r = replay(h, replay(h, empty, true), true); assert.equal(r.shape, c.shape); assert.equal(r.done, c.done);
});
test('Centre arc to Line parking replays line points before the original arc placement', () => {
  const a = draft(), b = { ...a, shape: arc() }, parked = switchTool(b, 'polygon');
  const first: SketchShape = { kind: 'polygon', points: [[0, 10]], bulges: [0], closed: false };
  const second: SketchShape = { kind: 'polygon', points: [[0, 10], [10, 0]], bulges: [0, 0], closed: false };
  const c = { ...parked, shape: first }, d = { ...c, shape: second }, h = createDraftHistory();
  push(h, a, b); push(h, parked, c); push(h, c, d);
  const uc = replay(h, d); assert.equal(uc.shape, first);
  const up = replay(h, uc); assert.equal(up.shape, null); assert.equal(up.done, parked.done);
  const empty = replay(h, up); assert.equal(empty.shape, null); assert.equal(empty.done, a.done);
  const r = replay(h, replay(h, replay(h, empty, true), true), true); assert.equal(r.shape, second); assert.equal(r.done, parked.done);
});
test('Arc placed beside a rectangle removes only the arc and preserves rectangle owner', () => {
  const rectangle: SketchShape = { kind: 'rectangle', a: [-20, -10], b: [-5, 5] };
  const a = draft({ done: [rectangle], clearedSideIds: ['e4'] }), b = { ...a, shape: arc() }, h = createDraftHistory(); push(h, a, b);
  const u = replay(h, b); assert.equal(u.shape, null); assert.equal(u.done, a.done); assert.equal(u.done![0], rectangle);
  assert.equal(replay(h, u, true).shape, b.shape);
});
test('Construction arc records placement without changing the construction flag', () => {
  const a = draft({ construct: true }), b = { ...a, shape: { ...arc(), construction: true as const } }, h = createDraftHistory(); push(h, a, b);
  const r = replay(h, replay(h, b), true); assert.equal(r.shape, b.shape); assert.equal(r.shape?.construction, true);
});
test('Arc parking rejects cloned nested owners, reversed endpoints and merged geometry', () => {
  const a = draft(), shape = arc(), b = { ...a, shape };
  const variants: SketchShape[] = [structuredClone(shape), { ...shape, points: [...shape.points] }, { ...shape, bulges: [...shape.bulges!] },
    { ...shape, points: [...shape.points].reverse(), bulges: [-shape.bulges![0], 0] },
    { ...shape, points: [...shape.points, [-10, 10]], bulges: [...shape.bulges!, 0] }, { ...shape, construction: true }];
  for (const replacement of variants) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, shape: null, done: [replacement] })), null);
  }
});
test('Arc partition refuses incomplete, straight, closed, malformed and Trim owners', () => {
  const s = arc();
  const shapes: SketchShape[] = [{ ...s, pending: true }, { ...s, closed: true }, { ...s, bulges: [0, 0] },
    { ...s, bulges: [NaN, 0] }, { ...s, bulges: [Infinity, 0] }, { ...s, bulges: [s.bulges![0], 1] },
    { ...s, points: [[0, 0], [0, 0]] }, { ...s, points: [[NaN, 0], [0, 10]] },
    { kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]], closed: true }];
  for (const shape of shapes) {
    const a = draft(), b = { ...a, shape }, h = createDraftHistory(); push(h, a, b);
    assert.equal(h.available(draftHistoryState(doc, { ...b, shape: null, done: [shape] })).undo, false);
  }
  const a = draft(), b = draft({ tool: 'trim', shape: s }), h = createDraftHistory(); push(h, a, b);
  assert.equal(h.available(draftHistoryState(doc, { ...b, tool: 'carc', shape: null, done: [s] })).undo, false);
});
test('Arc replay retains document, source and ordered companion ownership', () => {
  const one = arc(30), two = arc(60), a = draft({ done: [one, two], clearedSideIds: ['e1'] }), b = { ...a, shape: arc() };
  for (const patch of [{ plane: xyPlane() }, { editNode: 2 }, { clearedSideIds: ['e1'] }, { associationDetached: true as const }, { done: [two, one] }]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, ...patch })), null);
  }
  const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState({ ...doc }, b)), null);
  const r = createDraftHistory(); push(r, a, b); const u = replay(r, b); assert.equal(r.redo(draftHistoryState({ ...doc }, u)), null);
});

test('Actual joinOpen on tool reselection is not mistaken for unchanged arc ownership', () => {
  const first = arc(), second = { ...arc(), points: [[0, 10], [-10, 0]] as [number, number][] };
  const before = draft({ shape: first }), after = draft({ shape: second, done: [first] }), h = createDraftHistory(); push(h, before, after);
  const joined = switchTool(after, 'polygon'); assert.equal(joined.done!.length, 1);
  assert.ok(joined.done![0].kind === 'polygon'); if (joined.done![0].kind !== 'polygon') throw new Error('polygon');
  assert.equal(joined.done![0].points.length, 3);
  assert.equal(h.available(draftHistoryState(doc, joined)).undo, false);
  assert.equal(h.undo(draftHistoryState(doc, joined)), null);
});
