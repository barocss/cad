import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import { ellipseShape, reellipse } from '@barocss/cad-model/sketch/ellipse';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { switchTool } from '../src/app/sketchControls';
import { createDraftHistory, draftHistoryState, outlineHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const doc = emptyDoc();
const ellipse = (x = 0) => ellipseShape({ center: [x, 10], rx: 10, ry: 5, angle: 0 });
const draft = (patch: Partial<SketchState> = {}): SketchState => ({ plane: xyPlane(), tool: 'ellipse', shape: null, ...patch });
function replay(h: ReturnType<typeof createDraftHistory>, current: SketchState, redo = false) {
  const s = draftHistoryState(doc, current), step = redo ? h.redo(s) : h.undo(s); assert.ok(step);
  return restoreDraftHistory(current, step);
}
function push(h: ReturnType<typeof createDraftHistory>, a: SketchState, b: SketchState) { h.push(draftHistoryState(doc, a), draftHistoryState(doc, b)); }
test('Completed Ellipse is one whole-draft step preserving Clear references', () => {
  const a = draft({ clearedSideIds: ['e1'], positional: { e1: 'side1' } }), b = { ...a, shape: ellipse() }, h = createDraftHistory(); push(h, a, b);
  const u = replay(h, b); assert.equal(u.shape, null); assert.equal(u.clearedSideIds, a.clearedSideIds); assert.equal(u.positional, a.positional);
  assert.equal(replay(h, u, true).shape, b.shape);
});
test('Repeated completed ellipses restore both placements and parked outline references', () => {
  const a = draft(), b = { ...a, shape: ellipse() }, c = { ...b, shape: ellipse(30), done: [b.shape] }, h = createDraftHistory(); push(h, a, b); push(h, b, c);
  const u = replay(h, c); assert.equal(u.shape, b.shape); const empty = replay(h, u); assert.equal(empty.shape, null);
  const r = replay(h, replay(h, empty, true), true); assert.equal(r.shape, c.shape); assert.equal(r.done, c.done);
});
test('Explicit Ellipse reselection preserves nested owners across pending:false parking', () => {
  const a = draft(), b = { ...a, shape: ellipse() }, parked = switchTool(b, 'ellipse');
  const p = parked.done![0]; assert.ok(p.kind === 'polygon'); if (p.kind !== 'polygon') throw new Error('polygon');
  assert.equal(p.points, b.shape.points); assert.equal(p.bulges, b.shape.bulges); assert.equal(p.ellipse, b.shape.ellipse);
  const c = { ...parked, shape: ellipse(30) }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
  const empty = replay(h, replay(h, c)); assert.equal(empty.shape, null); assert.equal(empty.done, a.done);
  const r = replay(h, replay(h, empty, true), true); assert.equal(r.shape, c.shape); assert.equal(r.done![0], p);
});
for (const ellipseFirst of [true, false]) test(`Ellipse/Rectangle mixed placement, ellipse first=${ellipseFirst}`, () => {
  const rectangle: SketchShape = { kind: 'rectangle', a: [0, 0], b: [10, 6] };
  const a = draft({ tool: ellipseFirst ? 'ellipse' : 'rectangle' }), b = { ...a, shape: ellipseFirst ? ellipse() : rectangle };
  const parked = switchTool(b, ellipseFirst ? 'rectangle' : 'ellipse'), c = { ...parked, shape: ellipseFirst ? rectangle : ellipse(30) }, h = createDraftHistory();
  push(h, a, b); push(h, parked, c);
  const empty = replay(h, replay(h, c)); assert.equal(empty.shape, null); assert.equal(empty.done, a.done);
  const r = replay(h, replay(h, empty, true), true); assert.equal(r.shape, c.shape); assert.equal(r.done, c.done);
});
test('Construction ellipse and subsequent Rx edit replay independently', () => {
  const a = draft({ construct: true }), shape = { ...ellipse(), construction: true as const }, b = { ...a, shape };
  const changed = reellipse(shape, { ...shape.ellipse!, rx: 12 }), c = { ...b, shape: changed }, h = createDraftHistory();
  push(h, a, b); h.push(outlineHistoryState(shape), outlineHistoryState(changed));
  const u = replay(h, c); assert.equal(u.shape, shape); assert.equal(u.shape?.construction, true);
  const empty = replay(h, u); assert.equal(empty.shape, null); assert.equal(replay(h, replay(h, empty, true), true).shape, changed);
});
test('Ellipse partition rejects regenerated or changed nested owners, reorder and additions', () => {
  const a = draft(), first = ellipse(), second = ellipse(30), b = { ...a, shape: second, done: [first] };
  for (const replacement of [ellipse(30), { ...second, points: [...second.points] }, { ...second, bulges: [...second.bulges!] }, { ...second, ellipse: { ...second.ellipse! } }, { ...second, construction: true as const }]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, shape: null, done: [first, replacement] })), null);
  }
  for (const done of [[second, first], [first, second, ellipse(60)]]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, shape: null, done })), null);
  }
});
test('Ellipse replay retains document and source identity and refuses Trim/general polygon expansion', () => {
  const a = draft({ clearedSideIds: ['e1'] }), b = { ...a, shape: ellipse() };
  for (const patch of [{ plane: xyPlane() }, { editNode: 2 }, { clearedSideIds: ['e1'] }, { associationDetached: true as const }]) {
    const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState(doc, { ...b, ...patch })), null);
  }
  const h = createDraftHistory(); push(h, a, b); assert.equal(h.undo(draftHistoryState({ ...doc }, b)), null);
  for (const source of [draft({ tool: 'trim', shape: ellipse() }), draft({ shape: { kind: 'polygon', points: [[0, 0], [10, 0], [0, 10]], closed: true } })]) {
    const history = createDraftHistory(); push(history, a, source); const parked = switchTool(source, 'ellipse');
    assert.equal(history.available(draftHistoryState(doc, parked)).undo, false);
  }
});

test('Ellipse placement partition refuses incomplete ellipse authoring owners', () => {
  const original = ellipse();
  const shapes: SketchShape[] = [
    { ...original, pending: true }, { ...original, closed: false },
    { ...original, fromEllipse: undefined }, { ...original, ellipse: undefined },
  ];
  for (const shape of shapes) {
    const a = draft(), b = { ...a, shape }, h = createDraftHistory(); push(h, a, b);
    const parked = { ...b, shape: null, done: [shape] };
    assert.equal(h.available(draftHistoryState(doc, parked)).undo, false);
  }
});

for (const tool of ['rectangle', 'circle', 'slot'] as const) for (const ellipseFirst of [true, false]) {
  test(`Restored cross-tool ${tool}/Ellipse owner supports new placement and reselect, ellipse first=${ellipseFirst}`, () => {
    const other: SketchShape = tool === 'rectangle' ? { kind: 'rectangle', a: [0, 0], b: [10, 6] }
      : tool === 'circle' ? { kind: 'circle', c: [0, 0], r: 4 } : { kind: 'slot', a: [0, 0], b: [20, 0], r: 4 };
    const firstTool = ellipseFirst ? 'ellipse' : tool, currentTool = ellipseFirst ? tool : 'ellipse';
    const firstShape = ellipseFirst ? ellipse() : other, nextShape = ellipseFirst ? other : ellipse(30);
    const a = draft({ tool: firstTool }), b = { ...a, shape: firstShape }, parked = switchTool(b, currentTool);
    const c = { ...parked, shape: nextShape }, h = createDraftHistory(); push(h, a, b); push(h, parked, c);
    const empty = replay(h, replay(h, c));
    const cross = replay(h, empty, true);
    assert.equal(cross.tool, currentTool, 'replay intentionally preserves the selected tool');
    assert.equal(cross.shape, firstShape, 'active shape belongs to the prior tool');
    const parkedCross = switchTool(cross, currentTool), next = { ...parkedCross, shape: nextShape };
    // Starting directly from the restored shape captures that cross-tool state as before.
    push(h, cross, next);
    const restored = replay(h, next); assert.equal(restored.shape, firstShape); assert.equal(restored.tool, currentTool);
    const reselected = switchTool(restored, currentTool);
    const redone = replay(h, reselected, true); assert.equal(redone.shape, nextShape); assert.equal(redone.done, next.done);
    const once = replay(h, redone), originalEmpty = replay(h, once);
    assert.equal(originalEmpty.shape, null); assert.equal(originalEmpty.done, a.done);
  });
}
