import test from 'node:test';
import assert from 'node:assert/strict';
import type { Active } from '../src/app/commandState';
import { loftTwoGuideFeedback } from '../src/app/loftTwoGuideFeedback';
const state = (detail: string, guide = 'a', guideB = 'b') => ({ cmd: { id: 'loft' }, preview: 'error', values: { guide, guideB }, error: { detail } }) as unknown as Active;
test('two-guide refusals identify the field and repair without changing input', () => {
  assert.equal(loftTwoGuideFeedback(state('Choose two different quadratic Bézier guides.', ''))?.field, 'guide');
  assert.equal(loftTwoGuideFeedback(state('Choose two different quadratic Bézier guides.', 'b'))?.field, 'guideB');
  for (const index of [1, 2]) {
    const key = index === 1 ? 'guide' : 'guideB', side = index === 1 ? 'min X' : 'max X';
    const input = state(`loft: two guides require guide ${index} endpoints to exactly match the ${side}, min Y corners of both sections`), before = JSON.stringify(input);
    assert.equal(loftTwoGuideFeedback(input)?.field, key);
    assert.match(loftTwoGuideFeedback(input)!.text, /lower and upper/);
    assert.equal(JSON.stringify(input), before);
    assert.equal(loftTwoGuideFeedback(state(`loft: two guides require the middle control of guide ${index} to lie on the section midplane`))?.field, key);
  }
});
test('unrelated errors and inactive preview states keep their original path', () => {
  for (const detail of ['unrelated kernel error', 'loft: two guides require guide 2 to stay to the right of guide 1 by a positive control gap', 'Both guides must be quadratic Bézier curves.']) assert.equal(loftTwoGuideFeedback(state(detail)), undefined);
  const input = state('Choose two different quadratic Bézier guides.', '');
  assert.equal(loftTwoGuideFeedback({ ...input, error: { title: 'Invalid input', hint: 'BarocssError: [DIRECT_PICK] Choose two different quadratic Bézier guides.', detail: '' } })?.field, 'guide');
  for (const preview of ['ok', 'busy', 'input'] as Active['preview'][]) assert.equal(loftTwoGuideFeedback({ ...input, preview }), undefined);
  assert.equal(loftTwoGuideFeedback({ ...input, cmd: { ...input.cmd, id: 'sweep' } }), undefined);
  assert.equal(loftTwoGuideFeedback(state(input.error!.detail, 'a', '')), undefined);
});
