import test from 'node:test';
import assert from 'node:assert/strict';
import type { Active } from '../src/app/commandState';
import { sweepPathFeedback } from '../src/app/sweepPathFeedback';
const refusal = 'the path is closed: a closed sweep is not supported yet (open the path)';
const active = (id = 'sweep-curve', preview = 'error', detail = refusal) => ({ cmd: { id }, preview, error: { detail } }) as Active;
test('only the native Sweep closed-path error gets the path recovery message', () => {
  const input = active(), before = JSON.stringify(input);
  assert.equal(sweepPathFeedback(input), 'Path is closed. Select an open curve.');
  assert.equal(JSON.stringify(input), before);
  for (const state of ['ok', 'working', 'idle']) assert.equal(sweepPathFeedback(active('sweep-curve', state)), undefined);
  for (const id of ['loft', 'extrude']) assert.equal(sweepPathFeedback(active(id)), undefined);
  for (const detail of ['', 'Exact sweep needs one open circular arc from 30° to 120°.', 'arithmetic error']) {
    assert.equal(sweepPathFeedback(active('sweep-curve', 'error', detail)), undefined);
  }
});
