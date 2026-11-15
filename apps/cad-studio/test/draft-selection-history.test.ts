import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { createDraftHistory, draftHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
import { activateDraftOutline, sketchCutInputs, switchTool } from '../src/app/sketchControls';
const doc = rectanglePart(30, 20, 3), plane = xyPlane();
const main: SketchShape = { kind: 'polygon', closed: true, points: [[0, 0], [30, 0], [30, 20], [0, 20]], ids: ['e0', 'e1', 'e2', 'e3'], hv: { h: [0, 2], v: [1, 3] } };
const second = (closed: boolean): SketchShape => ({ kind: 'polygon', closed, points: closed ? [[45, 10], [60, 10], [60, 30], [45, 30]] : [[45, 10], [60, 10], [60, 30], [45, 30], [45, 15]], ids: closed ? ['e4', 'e5', 'e6', 'e7'] : ['e4', 'e5', 'e6', 'e7', 'e8'] });
const draft = (other: SketchShape): SketchState => ({ tool: 'extend', shape: null, done: [main, other], plane, editNode: 0, mainIds: main.ids });
const geometry = (state: SketchState) => sketchCutInputs(state).shapes;
function replay(history: ReturnType<typeof createDraftHistory>, state: SketchState, forward = false) {
  const step = forward ? history.redo(draftHistoryState(doc, state)) : history.undo(draftHistoryState(doc, state)); assert.ok(step);
  return restoreDraftHistory(state, step);
}
test('Extend close then Select keeps Undo/Redo for the same second outline and document/workplane', () => {
  const before = draft(second(false)), after = draft(second(true)), history = createDraftHistory(), saved = JSON.stringify(doc);
  history.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  const selecting = switchTool(after, 'select');
  assert.deepEqual(history.available(draftHistoryState(doc, selecting)), { undo: true, redo: false });
  const undone = replay(history, selecting), redone = replay(history, undone, true);
  assert.deepEqual(geometry(undone), geometry(before)); assert.deepEqual(geometry(redone), geometry(after));
  assert.equal(undone.plane, plane); assert.equal(redone.tool, 'select'); assert.equal(JSON.stringify(doc), saved);
});
test('active outline changes preserve two Trim/Extend steps and Offset-added geometry', () => {
  const guide = (x: number): SketchShape => ({ kind: 'polygon', construction: true, closed: false, points: [[40, 5], [x, 5]], ids: ['guide'] });
  const closed = second(true), states = [60, 55, 65].map(x => ({ ...draft(closed), done: [main, closed, guide(x)] }));
  for (const index of [0, 1]) {
    const history = createDraftHistory();
    history.push(draftHistoryState(doc, states[0]), draftHistoryState(doc, states[1])); history.push(draftHistoryState(doc, states[1]), draftHistoryState(doc, states[2]));
    let selected = activateDraftOutline(switchTool(states[2], 'select'), index)!;
    selected = replay(history, selected); assert.deepEqual(geometry(selected), geometry(states[1]));
    selected = replay(history, selected); assert.deepEqual(geometry(selected), geometry(states[0]));
    selected = replay(history, selected, true); selected = replay(history, selected, true); assert.deepEqual(geometry(selected), geometry(states[2]));
  }
  const before = switchTool(draft(closed), 'select'), hole: SketchShape = { kind: 'rectangle', a: [47, 12], b: [58, 28], ids: ['h0', 'h1', 'h2', 'h3'] };
  const after = { ...before, done: [...before.done!, hole] }, history = createDraftHistory();
  history.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  const selecting = activateDraftOutline(after, 0)!;
  const undone = replay(history, selecting); assert.deepEqual(geometry(undone), geometry(before));
  assert.deepEqual(geometry(replay(history, undone, true)), geometry(after));
});
test('selection equivalence rejects reordered or edited geometry and every changed owner boundary', () => {
  const before = draft(second(false)), after = draft(second(true)), selected = switchTool(after, 'select');
  const wrong: SketchState[] = [{ ...selected, plane: xyPlane() }, { ...selected, editNode: 1 }, { ...selected, mainIds: [...main.ids!] },
    { ...selected, shape: { ...selected.shape!, ids: ['different'] } },
    { ...selected, shape: { ...selected.shape!, construction: true } },
    { ...selected, done: [{ ...main, ids: ['new'] }] },
    { ...selected, shape: { ...second(true), points: [[45, 10], [61, 10], [60, 30], [45, 30]] } as SketchShape },
    { ...selected, shape: { ...selected.shape!, rules: [{ kind: 'fix', point: 0, at: [45, 10] }] } as SketchShape }];
  for (const state of wrong) {
    const history = createDraftHistory(); history.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
    assert.equal(history.available(draftHistoryState(doc, state)).undo, false);
  }
  const history = createDraftHistory(); history.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  assert.equal(history.available(draftHistoryState({ ...doc }, selected)).undo, false);
});


test('repartition never reorders independent authored outlines or accepts a cloned nested geometry owner', () => {
  const other: SketchShape = { kind: 'polygon', construction: true, closed: false, points: [[70, 0], [80, 0]], ids: ['guide'] };
  const before = draft(second(false)), closed = second(true), after = { ...draft(closed), done: [main, closed, other] };
  const selected = activateDraftOutline({ ...after, tool: 'select' }, 1)!;
  const history = createDraftHistory(); history.push(draftHistoryState(doc, before), draftHistoryState(doc, after));
  assert.equal(history.available(draftHistoryState(doc, selected)).undo, true);
  assert.equal(history.available(draftHistoryState(doc, { ...selected, activeOutlineIndex: 2 })).undo, false);
  assert.ok(selected.shape?.kind === 'polygon');
  assert.equal(history.available(draftHistoryState(doc, { ...selected, shape: { ...selected.shape, points: selected.shape.points.map(point => [...point]) } })).undo, false);
});
