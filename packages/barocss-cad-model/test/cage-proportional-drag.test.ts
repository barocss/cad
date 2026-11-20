import test from 'node:test';
import assert from 'node:assert/strict';
import {
  commitCageProportionalDrag, planCageProportionalDrag, previewCageProportionalDrag,
  redoSession, startSession, transformCageSelection, undoSession, type CageSession, type StudioCage,
} from '../src/subd/cageEdit';

const strip: StudioCage = {
  positions: [
    0, 0, 0,  2, 0, 0,  4, 0, 0,  6, 0, 0,
    0, 3, 0,  2, 3, 0,  4, 3, 0,  6, 3, 0,
  ],
  faces: [[0, 1, 5, 4], [1, 2, 6, 5], [2, 3, 7, 6]],
  creases: [[0, 1]],
};
const selected = (cage = strip): CageSession => ({
  ...startSession(7, cage),
  sel: { vertices: [0], edges: [], faces: [] },
});
const finalDelta = [8, -4, 16] as const;
const movedPositions = [
  8, -4, 16,  8.75, -3.375, 13.5,  8, -2, 8,  7.25, -.625, 2.5,
  5.46875, .265625, 10.9375,  4.53125, 1.734375, 5.0625,  4.34375, 2.828125, .6875,  6, 3, 0,
];

test('proportional drag uses baseline cage distances and all three displacement axes', () => {
  const base = selected();
  const before = structuredClone(base);
  const plan = planCageProportionalDrag(base, 8);

  assert.equal(plan.base, base);
  assert.equal(plan.radius, 8);
  // Bottom distances are 0, 2, 4, 6 mm. Top distances are 3, 5, 7, 9 mm.
  assert.deepEqual(plan.weights, [1, 27 / 32, .5, 5 / 32, 175 / 256, 81 / 256, 11 / 256, 0]);

  const preview = previewCageProportionalDrag(plan, finalDelta);
  assert.deepEqual(preview.cage.positions, movedPositions);
  assert.deepEqual(preview.cage.faces, base.cage.faces);
  assert.deepEqual(preview.cage.creases, base.cage.creases);
  assert.equal(preview.sel, base.sel);
  assert.equal(preview.start, base.start);
  assert.equal(preview.node, base.node);
  assert.equal(preview.mode, base.mode);
  assert.equal(preview.undo, base.undo);
  assert.equal(preview.redo, base.redo);
  assert.deepEqual(base, before);
});

test('100 previews leave the plan unchanged and commit one step from its baseline', () => {
  const base = selected();
  const plan = planCageProportionalDrag(base, 8);
  const before = structuredClone(plan);
  let last = base;
  for (let frame = 1; frame <= 100; frame++) {
    const t = frame / 100;
    last = previewCageProportionalDrag(plan, [t * 8, t * -4, t * 16]);
    assert.equal(last.undo, base.undo);
    assert.equal(last.redo, base.redo);
  }
  assert.deepEqual(last.cage.positions, movedPositions);
  assert.deepEqual(plan, before);
  assert.equal(previewCageProportionalDrag(plan, [0, 0, 0]), base);
  const shorterRadius = previewCageProportionalDrag(planCageProportionalDrag(base, 2), finalDelta);
  assert.deepEqual(shorterRadius.cage.positions, [8, -4, 16, ...strip.positions.slice(3)]);

  const committed = commitCageProportionalDrag(plan, finalDelta);
  assert.deepEqual(committed.cage, last.cage);
  assert.equal(committed.undo.length, 1);
  const undone = undoSession(committed);
  assert.deepEqual(undone.cage, base.cage);
  assert.deepEqual(undone.sel, base.sel);
  assert.deepEqual(redoSession(undone), committed);
  const newPlan = planCageProportionalDrag(undone, 8);
  assert.equal(commitCageProportionalDrag(newPlan, [0, -0, 0]), undone);
  const replacement = commitCageProportionalDrag(newPlan, [-1, 0, 0]);
  assert.equal(replacement.undo.length, 1);
  assert.equal(replacement.redo.length, 0);
});

test('numeric proportional edits and one-axis pointer commits produce the same session', () => {
  const base = selected();
  const plan = planCageProportionalDrag(base, 8);
  for (const axis of [0, 1, 2] as const) {
    const delta = [0, 0, 0];
    delta[axis] = -4;
    const pointer = commitCageProportionalDrag(plan, delta);
    const numeric = transformCageSelection(base, { kind: 'move-proportional', axis, distance: -4, radius: 8 });
    assert.deepEqual(pointer, numeric);
  }
});

test('mirror seam locks normal displacement but keeps the tangent and off-seam motion', () => {
  const base = { ...selected(), mirror: 'x' as const };
  const broadPlan = planCageProportionalDrag(base, 8);
  const preview = previewCageProportionalDrag(broadPlan, finalDelta);
  assert.deepEqual(preview.cage.positions, [
    0, -4, 16,  8.75, -3.375, 13.5,  8, -2, 8,  7.25, -.625, 2.5,
    0, .265625, 10.9375,  4.53125, 1.734375, 5.0625,  4.34375, 2.828125, .6875,  6, 3, 0,
  ]);
  assert.equal(preview.mirror, 'x');

  const undone = undoSession(commitCageProportionalDrag(broadPlan, finalDelta));
  const seamOnly = planCageProportionalDrag(undone, 2);
  assert.equal(previewCageProportionalDrag(seamOnly, [3, 0, 0]), undone);
  assert.equal(commitCageProportionalDrag(seamOnly, [3, 0, 0]), undone);
  const tangent = commitCageProportionalDrag(seamOnly, [3, -2, 1]);
  assert.deepEqual(tangent.cage.positions, [0, -2, 1, ...strip.positions.slice(3)]);
  assert.equal(tangent.undo.length, 1);
  assert.equal(tangent.redo.length, 0);
});

test('invalid endpoints and overflow leave the plan and its history intact', () => {
  const base = selected();
  const undone = undoSession(commitCageProportionalDrag(planCageProportionalDrag(base, 8), finalDelta));
  const plan = planCageProportionalDrag(undone, 8);
  const before = structuredClone(plan);
  for (const delta of [[1], [1, 2], [1, 2, 3, 4], [NaN, 0, 0], [0, Infinity, 0], [0, 0, -Infinity]]) {
    assert.throws(() => previewCageProportionalDrag(plan, delta));
    assert.throws(() => commitCageProportionalDrag(plan, delta));
    assert.deepEqual(plan, before);
  }
  for (const radius of [0, -1, NaN, Infinity]) assert.throws(() => planCageProportionalDrag(undone, radius));
  const stale = { ...undone, sel: { ...undone.sel, vertices: [99] } };
  assert.throws(() => planCageProportionalDrag(stale, 8));

  // Edge lengths are finite. Adding the finite normal displacement overflows Z after finite Y motion.
  const huge = selected({ ...strip, positions: strip.positions.map((n, i) => i % 3 === 2 ? Number.MAX_VALUE : n) });
  const hugePlan = planCageProportionalDrag(huge, 8);
  const hugeBefore = structuredClone(hugePlan);
  assert.throws(() => previewCageProportionalDrag(hugePlan, [0, 1, Number.MAX_VALUE]), /overflow/);
  assert.throws(() => commitCageProportionalDrag(hugePlan, [0, 1, Number.MAX_VALUE]), /overflow/);
  assert.equal(commitCageProportionalDrag(hugePlan, [0, 0, 1]), huge);
  assert.deepEqual(hugePlan, hugeBefore);
});
