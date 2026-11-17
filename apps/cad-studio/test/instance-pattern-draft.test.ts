import test from 'node:test';
import assert from 'node:assert/strict';
import type { InstancePattern } from '@barocss/cad-model/engine/doc';
import { axisOf, draftOf, fullCircleAngle, patternEdit, patternOrigin, patternVector, restorePatternOccurrence } from '../src/ui/InstancePattern';

// Row 10 ③ audit 1 (#9): the pattern panel's Apply sends a direction or an axis only when the choice changed; one a chat
// or a file made (-X, a diagonal) shows as Custom and stays as it is.
const linear = (dir: [number, number, number]): InstancePattern => ({ id: 'pat1', seed: 'p1', kind: 'linear', count: 4, dir, spacing: 20 });

test('axisOf: exactly +X, +Y or +Z is that axis, anything else Custom', () => {
  assert.deepEqual([[1, 0, 0], [0, 1, 0], [0, 0, 1], [-1, 0, 0], [0, 3, 4], [2, 0, 0]].map(v => axisOf(v)), ['X', 'Y', 'Z', 'Custom', 'Custom', 'Custom']);
});

test('Apply: a count change alone sends no dir or axis, so a chat-made direction survives; choosing an axis sends it', () => {
  for (const dir of [[-1, 0, 0], [0, 3, 4]] as [number, number, number][]) {
    const p = linear(dir), draft = { ...draftOf(p), count: '6' };
    assert.deepEqual(patternEdit(p, draft), { id: 'pat1', count: 6, spacing: 20 });
    assert.deepEqual(patternEdit(p, { ...draft, axis: 'Z' }), { id: 'pat1', count: 6, spacing: 20, dir: [0, 0, 1] });
  }
  const x = linear([1, 0, 0]);
  assert.deepEqual(patternEdit(x, { ...draftOf(x), axis: 'Y' }), { id: 'pat1', count: 4, spacing: 20, dir: [0, 1, 0] });
  const c: InstancePattern = { id: 'pat2', seed: 'p1', kind: 'circular', count: 3, angle: 90, axis: [0, 0, 1], origin: [5, 0, 0] };
  assert.deepEqual(patternEdit(c, draftOf(c)), { id: 'pat2', count: 3, angle: 90 }, 'the origin and the axis are left as they are');
  assert.deepEqual(patternEdit(c, { ...draftOf(c), axis: 'X' }), { id: 'pat2', count: 3, angle: 90, axis: [1, 0, 0] });
});

// Origins use existing Model semantics; untouched coordinates/custom axes are not rewritten.
test('circular origins roundtrip exact coordinates and edits preserve the custom axis', () => {
  const p: InstancePattern = { id: 'pat2', seed: 'p1', kind: 'circular', count: 3, angle: 90, axis: [0, 3, 4], origin: [1.23456789012345, -5, 9] };
  const draft = draftOf(p);
  assert.deepEqual(patternOrigin(draft), p.origin);
  assert.deepEqual(patternEdit(p, draft), { id: 'pat2', count: 3, angle: 90 });
  assert.deepEqual(patternEdit(p, { ...draft, originY: '12' }), { id: 'pat2', count: 3, angle: 90, origin: [p.origin[0], 12, 9] });
  assert.deepEqual(patternOrigin(draftOf(undefined)), [0, 0, 0]);
});
test('blank and nonfinite origin drafts do not coerce to world zero', () => {
  for (const originX of ['', ' ', 'Infinity', 'not a number']) {
    assert.equal(Number.isFinite(patternOrigin({ ...draftOf(undefined), originX })[0]), false);
  }
  assert.deepEqual(patternOrigin({ ...draftOf(undefined), originX: '0', originY: '-10', originZ: '1e-3' }), [0, -10, .001]);
  const p = linear([0, 3, 4]);
  assert.equal(p.kind, 'linear');
  assert.deepEqual(patternEdit(p, { ...draftOf(p), originX: '' }), { id: p.id, count: p.count, spacing: p.spacing });
});

test('restoring one occurrence preserves every other skip and the authored source', () => {
  const p: InstancePattern = { ...linear([0, 3, 4]), count: 6, skip: [1, 3, 5] };
  assert.deepEqual(restorePatternOccurrence(p, 3), { id: p.id, skip: [1, 5] });
  assert.deepEqual(restorePatternOccurrence(p, 2), { id: p.id, skip: [1, 3, 5] });
  assert.deepEqual(p.skip, [1, 3, 5]);
  assert.notStrictEqual(restorePatternOccurrence(p, 2).skip, p.skip);
  assert.deepEqual(restorePatternOccurrence({ ...p, skip: [3] }, 3), { id: p.id, skip: [] });
});

test('custom vector authoring and editing sends exact direction while cardinal choices remain explicit', () => {
  const p = linear([0, 3, 4]), d = draftOf(p);
  assert.deepEqual(patternVector(d), [0, 3, 4]);
  assert.deepEqual(patternEdit(p, { ...d, vectorY: '-3' }), { id: p.id, count: 4, spacing: 20, dir: [0, -3, 4] });
  assert.deepEqual(patternVector({ ...d, axis: 'X' }), [1, 0, 0]);
  assert.deepEqual(patternVector({ ...draftOf(undefined), axis: 'Custom', vectorX: '0', vectorY: '3', vectorZ: '4' }), [0, 3, 4]);
  assert.equal(Number.isNaN(patternVector({ ...d, vectorX: '' })[0]), true);
  const c: InstancePattern = { id: 'pat2', seed: 'p1', kind: 'circular', count: 3, angle: 90, axis: [0, 3, 4], origin: [10, 20, 30] };
  assert.deepEqual(patternEdit(c, { ...draftOf(c), vectorZ: '-4' }), { id: c.id, count: 3, angle: 90, axis: [0, 3, -4] });
});


test('full circle is explicit draft spacing including the seed, preserves sign, and rejects invalid counts', () => {
  const d = { ...draftOf(undefined), kind: 'circular' as const, count: '6', angle: '-90' };
  assert.equal(fullCircleAngle(d), '-60');
  assert.equal(d.angle, '-90');
  for (const count of ['2', '3', '7', '64']) {
    assert.equal(Number(fullCircleAngle({ ...d, count, angle: '90' })), 360 / Number(count));
  }
  for (const count of ['', ' ', '1', '65', '3.5', 'Infinity', 'NaN']) assert.equal(fullCircleAngle({ ...d, count }), undefined);
  assert.equal(fullCircleAngle({ ...d, angle: '' }), '60');
  assert.equal(fullCircleAngle({ ...d, angle: '0' }), '60');
});
