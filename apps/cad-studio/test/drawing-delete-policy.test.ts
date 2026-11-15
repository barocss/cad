import test from 'node:test';
import assert from 'node:assert/strict';
import { drawingCanDeleteSelection, type DrawingDeleteState } from '../src/ui/drawing/drawingDeletePolicy';
const selected: DrawingDeleteState = { tool: 'select', hasSelection: true, pending: false, drag: false, reattach: false, rimChoice: false, targetChoices: 0, reselectTarget: false };
test('only explicit idle Select with an existing annotation admits keyboard deletion', () => {
  assert.equal(drawingCanDeleteSelection(selected), true);
  assert.equal(drawingCanDeleteSelection({ ...selected, hasSelection: false }), false);
  for (const tool of ['linear', 'diameter', 'radius', 'angle', 'note', 'detail', 'datum-target', 'unknown'])
    for (const pending of [false, true])
      assert.equal(drawingCanDeleteSelection({ ...selected, tool, pending }), false, tool);
});
test('all pending selection-mode creation, movement and reference choices protect prior annotations', () => {
  for (const flag of ['pending', 'drag', 'reattach', 'rimChoice', 'reselectTarget'] as const)
    assert.equal(drawingCanDeleteSelection({ ...selected, [flag]: true }), false, flag);
  for (const targetChoices of [1, 2, -1, NaN, Infinity])
    assert.equal(drawingCanDeleteSelection({ ...selected, targetChoices }), false);
  assert.equal(drawingCanDeleteSelection({ ...selected, pending: true, drag: true, reattach: true }), false);
});
test('query is immutable; cancelling placement then explicitly selecting re-enables deletion', () => {
  const draft = Object.freeze({ ...selected, tool: 'note', pending: true });
  const before = { ...draft };
  for (let i = 0; i < 3; i++) assert.equal(drawingCanDeleteSelection(draft), false);
  assert.deepEqual(draft, before);
  assert.equal(drawingCanDeleteSelection({ ...draft, tool: 'select', pending: false }), true);
  assert.equal(drawingCanDeleteSelection({ ...draft, tool: 'select' }), false);
});
