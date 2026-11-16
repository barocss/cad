import test from 'node:test';
import assert from 'node:assert/strict';
import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import { draftInputs } from '@barocss/cad-model/app/draftInputs';
import { commandNumberRule, featureNumberInvalid, featureNumberBounds, featureNumberRange } from '../src/app/featureNumberInput';
test('Draft and Edit Draft share the native open signed angle range', () => {
  for (const command of ['draft', DRAFT_EDIT]) {
    assert.equal(commandNumberRule(command, 'deg'), 'draft-angle');
    assert.equal(commandNumberRule(command, 'neutral'), undefined);
  }
  for (const value of ['', 0, -0, -45, 45, -46, 46, NaN, Infinity, -Infinity]) assert.equal(featureNumberInvalid(value, 'draft-angle'), true);
  for (const value of [-44.999, -44.5, -44.25, -.001, .001, 44.25, 44.5, 44.999]) assert.equal(featureNumberInvalid(value, 'draft-angle'), false);
  assert.deepEqual(featureNumberBounds('draft-angle'), { min: -45, max: 45 });
  assert.match(featureNumberRange('draft-angle'), /excluding 0°/);
  const field = draftInputs().find(field => field.key === 'deg');
  assert.deepEqual(field?.kind === 'deg' ? [field.min, field.max] : undefined, [-45, 45]);
  assert.equal(commandNumberRule('fillet', 'tension'), 'open-unit');
});
