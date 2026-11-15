import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCage } from '../src/app/primitives';
import { redoSession, runOp, select, startSession, undoSession, type CageSession } from '../src/subd/cageEdit';

const base = () => startSession(0, boxCage(30, 20, 16, 2, [0, 0, 0]));
const edge = (s: CageSession, index = 0): [number, number] => [s.cage.faces[0][index], s.cage.faces[0][(index + 1) % 4]];
const picked = (s: CageSession, edges: readonly (readonly [number, number])[]): CageSession =>
  ({ ...s, mode: 'edge', sel: { vertices: [], faces: [], edges } });

test('already-smooth and repeated crease/uncrease return the same session without history', () => {
  const initial = base(), s = picked(initial, [edge(initial)]), before = structuredClone(s);
  assert.equal(runOp(s, 'uncrease'), s);
  const sharp = runOp(s, 'crease');
  assert.equal(sharp.undo.length, 1); assert.equal(sharp.cage.creases?.length, 1);
  assert.equal(runOp(sharp, 'crease'), sharp);
  const smooth = runOp(sharp, 'uncrease');
  assert.equal(smooth.undo.length, 2); assert.equal(smooth.cage.creases?.length ?? 0, 0);
  assert.equal(runOp(smooth, 'uncrease'), smooth);
  assert.deepEqual(undoSession(smooth).cage, sharp.cage);
  assert.deepEqual(undoSession(sharp).cage, s.cage);
  assert.deepEqual(s, before);
});

test('canonical edge direction, ordering and duplicate selection do not manufacture steps', () => {
  const initial = base(), a = edge(initial), b = edge(initial, 1);
  const sharp = runOp(picked(initial, [a, b]), 'crease');
  const reordered = picked(sharp, [[b[1], b[0]], [a[1], a[0]], a]);
  assert.equal(runOp(reordered, 'crease'), reordered);
  assert.equal(reordered.undo.length, 1);
  const emptyList = { ...initial, cage: { ...initial.cage, creases: [] } };
  const smooth = picked(emptyList, [a]);
  assert.equal(runOp(smooth, 'uncrease'), smooth);
});

test('mixed sharp/smooth selections still produce exactly one real step; face selection covers its four sides', () => {
  const initial = base(), a = edge(initial), b = edge(initial, 1);
  const one = runOp(picked(initial, [a]), 'crease');
  const mixed = picked(one, [a, b]);
  const both = runOp(mixed, 'crease');
  assert.equal(both.undo.length, 2); assert.equal(both.cage.creases?.length, 2);
  assert.equal(runOp(both, 'crease'), both);
  const oneOff = runOp(mixed, 'uncrease');
  assert.equal(oneOff.undo.length, 2); assert.equal(oneOff.cage.creases?.length ?? 0, 0);
  const face = select(initial, { kind: 'face', f: 0 }, false);
  const sharpFace = runOp(face, 'crease');
  assert.equal(sharpFace.cage.creases?.length, 4); assert.equal(sharpFace.undo.length, 1);
  assert.equal(runOp(sharpFace, 'crease'), sharpFace);
  const smoothFace = runOp(sharpFace, 'uncrease');
  assert.equal(smoothFace.cage.creases?.length ?? 0, 0);
  assert.equal(runOp(smoothFace, 'uncrease'), smoothFace);
});

test('no-op after Undo preserves the entire redo branch and real steps remain undoable', () => {
  const initial = base(), s = picked(initial, [edge(initial)]);
  const sharp = runOp(s, 'crease'), undone = undoSession(sharp);
  assert.equal(undone.redo.length, 1);
  assert.equal(runOp(undone, 'uncrease'), undone);
  assert.deepEqual(redoSession(undone).cage, sharp.cage);
  const smooth = runOp(sharp, 'uncrease'), undoneSmooth = undoSession(smooth);
  assert.equal(runOp(undoneSmooth, 'crease'), undoneSmooth);
  assert.deepEqual(redoSession(undoneSmooth).cage, smooth.cage);
  assert.equal(undoneSmooth.redo.length, 1);
});

test('native bad-edge and empty-selection refusal are not bypassed by no-op detection', () => {
  const initial = base(), a = edge(initial);
  const sharp = runOp(picked(initial, [a]), 'crease');
  for (const op of ['crease', 'uncrease'] as const) {
    assert.throws(() => runOp(picked(initial, [[9999, 10000]]), op), /not an edge of the cage/);
    assert.throws(() => runOp(picked(sharp, [a, [9999, 10000]]), op), /not an edge of the cage/);
    assert.throws(() => runOp(initial, op), /pick edges/);
  }
  assert.equal(sharp.undo.length, 1); assert.equal(sharp.cage.creases?.length, 1);
});
