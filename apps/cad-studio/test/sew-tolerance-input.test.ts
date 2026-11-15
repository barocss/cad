import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSewToleranceInput } from '../src/ui/sewToleranceInput';
test('blank and invalid Sew text cannot silently reuse an old tolerance', () => {
  for (const text of ['', ' ', '-', 'NaN', 'Infinity', '-0.019', '1e999']) assert.equal(parseSewToleranceInput(text), null);
  for (const text of ['0', '0.0', '0.019', '0.021', '2e-2']) assert.equal(parseSewToleranceInput(text), Number(text));
  assert.deepEqual(['0.019', '', '0', '0.021'].map(parseSewToleranceInput), [0.019, null, 0, 0.021]);
});
