import test from 'node:test';
import assert from 'node:assert/strict';
import { clearProfileIdentity, prepareClearedProfile } from '../src/sketch/clearedProfileIdentity';
import { createDraftHistory, draftHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
import { preserveConstruction } from '../src/sketch/preserveConstruction';
import { emptyDoc } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchShape, SketchState } from '@barocss/cad-model/sketch/types';
const triangle = (): SketchShape => ({ kind: 'polygon', closed: true, points: [[0, 0], [30, 0], [0, 20]], ids: ['e1', 'e2', 'e3'] });
const state = (patch: Partial<SketchState> = {}): SketchState => ({ plane: xyPlane(), tool: 'select', shape: triangle(), ...patch });
const ids = (s: SketchState) => [s.shape, ...(s.done ?? [])].flatMap(x => x ? [...(x.ids ?? []), ...(x.kind === 'polygon' ? x.circleIds ?? [] : [])] : []);

test('Ordinary editing without Clear preserves the exact draft and shape references', () => {
  const s = state(); assert.equal(prepareClearedProfile(s), s); assert.equal(prepareClearedProfile(s).shape, s.shape);
});
test('Clear accumulates retired material and attached-circle IDs and removes old source identity', () => {
  const shape = triangle(); assert.ok(shape.kind === 'polygon');
  const s = state({ shape: { ...shape, circles: [{ c: [5, 5], r: 1 }], circleIds: ['e9'] }, clearedSideIds: ['e12'], mainIds: ['e1', 'e2', 'e3'], positional: { side1: 'e1' }, band: { version: 1, id: 'b1', sources: ['e1'], width: 2 }, bandPicks: ['e1'] });
  const before = structuredClone(s), cleared = clearProfileIdentity(s);
  assert.deepEqual(cleared.clearedSideIds, ['e12', 'e1', 'e2', 'e3', 'e9']); assert.equal(cleared.shape, null); assert.deepEqual(cleared.done, []);
  for (const key of ['mainIds', 'positional', 'band', 'bandPicks'] as const) assert.equal(cleared[key], undefined);
  assert.deepEqual(s, before);
});
test('Preallocated IDs from Trim are replaced while unrelated current IDs remain unchanged', () => {
  const kept: SketchShape = { kind: 'rectangle', a: [50, 0], b: [60, 10], ids: ['e20', 'e21', 'e22', 'e23'] };
  const s = state({ clearedSideIds: ['e1', 'e2', 'e3'], done: [kept] }), before = structuredClone(s), out = prepareClearedProfile(s);
  assert.deepEqual(out.shape?.ids, ['e24', 'e25', 'e26']); assert.equal(out.done![0], kept);
  assert.equal(new Set(ids(out)).size, ids(out).length); assert.ok(!ids(out).some(id => s.clearedSideIds!.includes(id))); assert.deepEqual(s, before);
});
test('Missing IDs and attached-circle collisions are allocated above all current and retired identities', () => {
  const shape = triangle(); assert.ok(shape.kind === 'polygon');
  const s = state({ shape: { ...shape, ids: undefined, circles: [{ c: [5, 5], r: 1 }], circleIds: ['e8'] }, clearedSideIds: ['e8', 'e30'] });
  const out = prepareClearedProfile(s); assert.ok(ids(out).every(id => Number(id.slice(1)) > 30)); assert.equal(new Set(ids(out)).size, 4);
});
test('Duplicate, unsupported and exhausted identities refuse without modifying the draft', () => {
  for (const s of [state({ clearedSideIds: ['e1'], done: [triangle()] }), state({ clearedSideIds: ['bad'] }), state({ clearedSideIds: [`e${Number.MAX_SAFE_INTEGER}`] })]) {
    const before = structuredClone(s); assert.throws(() => prepareClearedProfile(s)); assert.deepEqual(s, before);
  }
});
test('Clear Undo and Redo restore exact shapes, main IDs, positional map and reservations', () => {
  const doc = emptyDoc(), history = createDraftHistory(), original = state({ mainIds: ['e1', 'e2', 'e3'], positional: { side1: 'e1' }, clearedSideIds: ['e15'] });
  const cleared = clearProfileIdentity(original); history.push(draftHistoryState(doc, original), draftHistoryState(doc, cleared));
  const undo = history.undo(draftHistoryState(doc, cleared)); assert.ok(undo); const restored = restoreDraftHistory(cleared, undo);
  assert.equal(restored.shape, original.shape); assert.equal(restored.mainIds, original.mainIds); assert.equal(restored.positional, original.positional); assert.equal(restored.clearedSideIds, original.clearedSideIds);
  const redo = history.redo(draftHistoryState(doc, restored)); assert.ok(redo); const removed = restoreDraftHistory(restored, redo);
  assert.equal(removed.shape, null); assert.equal(removed.done, cleared.done); assert.equal(removed.clearedSideIds, cleared.clearedSideIds); assert.equal(removed.mainIds, undefined); assert.equal(removed.positional, undefined);
});
test('Legacy construction cannot resurrect its retired ID after normalization', () => {
  const old: SketchShape = { kind: 'polygon', closed: false, construction: true, points: [[0, 40], [20, 40]], ids: ['e11'] };
  const s = state({ shape: null, done: [{ ...old }], clearedSideIds: ['e11'] }), out = prepareClearedProfile(s), authored = out.done!;
  const final = preserveConstruction([old], authored, authored);
  assert.notEqual(final[0], old); assert.ok(!final[0].ids!.includes('e11')); assert.deepEqual(old.ids, ['e11']);
});
test('Repeated Clear unions newly drawn identities with earlier reservations', () => {
  const first = clearProfileIdentity(state()); const second = clearProfileIdentity({ ...first, shape: { kind: 'circle', c: [4, 4], r: 2, ids: ['e8'] } });
  assert.deepEqual(second.clearedSideIds, ['e1', 'e2', 'e3', 'e8']);
});
test('Overlong retired-ID arrays near the safe-integer bound cannot overflow allocation', () => {
  const high = Number.MAX_SAFE_INTEGER - 12, retired = Array.from({ length: 10 }, (_, i) => `e${high - i}`);
  const s = state({ shape: { kind: 'rectangle', a: [0, 0], b: [10, 10], ids: retired }, clearedSideIds: retired });
  assert.throws(() => prepareClearedProfile(s));
});
