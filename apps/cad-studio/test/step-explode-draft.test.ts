import test from 'node:test';
import assert from 'node:assert/strict';
import { stepExplodeOptions, stepExplodeValue } from '../src/app/stepExplodeDraft';

test('step scale accepts the existing finite inclusive range without rounding', () => {
  for (const s of ['0', '0.125', '0.75', '1.23456789012345', '2', '1e-3']) assert.equal(stepExplodeValue(s), Number(s));
  for (const s of ['', ' ', '-0.1', '2.001', 'Infinity', 'NaN']) assert.equal(stepExplodeValue(s), undefined);
});
test('select options represent exact authored scales alongside unchanged presets', () => {
  assert.deepEqual(stepExplodeOptions(.75), [0, .5, .75, 1, 2]);
  assert.deepEqual(stepExplodeOptions(1), [0, .5, 1, 2]);
  const precise = 1.23456789012345;
  assert.ok(stepExplodeOptions(precise).includes(precise));
});
