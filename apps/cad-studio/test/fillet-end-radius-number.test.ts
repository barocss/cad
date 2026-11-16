import test from 'node:test';
import assert from 'node:assert/strict';
import { commandNumberRule, featureNumberInvalid, featureNumberBounds, featureNumberRange } from '../src/app/featureNumberInput';
test('Fillet end radius has finite nonnegative input guidance without changing the start radius rule', () => {
  const rule = commandNumberRule('fillet', 'endRadius'); assert.equal(rule, 'nonnegative');
  for (const value of [-2, -Number.MIN_VALUE, NaN, Infinity, -Infinity, '-2']) assert.equal(featureNumberInvalid(value, rule!), true);
  for (const value of [0, 1, 2, '0', '2']) assert.equal(featureNumberInvalid(value, rule!), false);
  assert.deepEqual(featureNumberBounds(rule), { min: 0 });
  assert.match(featureNumberRange(rule!), /use 0 for the same radius/);
  assert.equal(commandNumberRule('fillet', 'radius'), 'positive');
});
