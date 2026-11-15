import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCage } from '../src/app/primitives';
import { redoSession, runOp, select, selectedCageEdges, startSession, undoSession, type CageSession } from '../src/subd/cageEdit';
const base = () => startSession(0, boxCage(30, 20, 16, 2, [0, 0, 0]));
const picked = (s: CageSession, edges: readonly (readonly [number, number])[]): CageSession => ({ ...s, sel: { vertices: [], faces: [], edges } });

test('individual edge details use canonical IDs, midpoint coordinates and sharp state without mutation', () => {
  const s = base(), [a, b, c] = s.cage.faces[0];
  const sharp = runOp(picked(s, [[b, a]]), 'crease');
  const mixed = picked(sharp, [[c, b], [b, a], [a, b]]), before = structuredClone(mixed);
  const details = selectedCageEdges(mixed);
  assert.equal(details.length, 2); assert.deepEqual(details.map(d => d.sharp), [false, true]);
  assert.deepEqual(details.map(d => d.edge), [[Math.min(b, c), Math.max(b, c)], [Math.min(a, b), Math.max(a, b)]]);
  for (const d of details) assert.deepEqual(d.centre, [0, 1, 2].map(axis => (s.cage.positions[3 * d.edge[0] + axis] + s.cage.positions[3 * d.edge[1] + axis]) / 2));
  assert.deepEqual(mixed, before);
  assert.notEqual(details[0].edge, mixed.sel.edges[0]);
});

test('face sides deduplicate shared edges and direct edges keep native operation precedence', () => {
  const s = base(), f0 = s.cage.faces[0];
  const other = s.cage.faces.findIndex((f, i) => i !== 0 && f.includes(f0[0]) && f.includes(f0[1]));
  assert.ok(other >= 0);
  const faces = { ...s, sel: { vertices: [], edges: [], faces: [0, other, 0] } };
  assert.equal(selectedCageEdges(select(s, { kind: 'face', f: 0 }, false)).length, 4);
  assert.equal(selectedCageEdges(faces).length, 7);
  const sharp = runOp(faces, 'crease');
  assert.ok(selectedCageEdges(sharp).every(e => e.sharp));
  assert.equal(selectedCageEdges({ ...faces, sel: { ...faces.sel, edges: [[f0[0], f0[1]]] } }).length, 1);
});

test('details update after crease, smooth and Undo/Redo while preserving selected IDs', () => {
  const s = base(), [a, b] = s.cage.faces[0], selected = picked(s, [[a, b]]);
  const sharp = runOp(selected, 'crease'), smooth = runOp(sharp, 'uncrease');
  for (const [state, expected] of [[selected, false], [sharp, true], [smooth, false], [undoSession(smooth), true], [redoSession(undoSession(smooth)), false]] as const) {
    assert.deepEqual(selectedCageEdges(state).map(e => e.sharp), [expected]);
    assert.deepEqual(state.sel, selected.sel);
  }
});

test('empty, vertex-only and invalid references or coordinates produce no misleading partial details', () => {
  const s = base(), [a, b] = s.cage.faces[0];
  assert.deepEqual(selectedCageEdges(s), []);
  assert.deepEqual(selectedCageEdges(select(s, { kind: 'vertex', v: a }, false)), []);
  for (const bad of [[a, 9999], [-1, b], [0.5, b], [a, a]] as [number, number][]) assert.deepEqual(selectedCageEdges(picked(s, [[a, b], bad])), []);
  assert.deepEqual(selectedCageEdges({ ...s, sel: { vertices: [], edges: [], faces: [0, 9999] } }), []);
  const positions = [...s.cage.positions]; positions[3 * a] = NaN;
  assert.deepEqual(selectedCageEdges(picked({ ...s, cage: { ...s.cage, positions } }, [[a, b]])), []);
  assert.deepEqual(selectedCageEdges(picked({ ...s, cage: { ...s.cage, faces: [...s.cage.faces, [a, b, 9999]] } }, [[a, b]])), []);
  assert.deepEqual(selectedCageEdges(picked({ ...s, cage: { ...s.cage, faces: [...s.cage.faces, [...s.cage.faces[0]]] } }, [[a, b]])), []);
});
