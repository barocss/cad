import test from 'node:test';
import assert from 'node:assert/strict';
import { continuityAngleLabel } from '../src/ui/continuityAngleLabel';

test('equal displayed angles collapse; roundoff near zero does not use scientific notation', () => {
  assert.equal(continuityAngleLabel(8.995967e-15, 2.248992e-14), '0°');
  assert.equal(continuityAngleLabel(90, 90), '90°');
  assert.equal(continuityAngleLabel(53.1301021, 53.1301023), '53.130102°');
});
test('small nonzero angles and ranges above the display resolution remain distinct', () => {
  assert.equal(continuityAngleLabel(0.0000011, 0.0000021), '0.000001 – 0.000002°');
  assert.equal(continuityAngleLabel(0.00000049, 0.00000051), '0 – 0.000001°');
  assert.equal(continuityAngleLabel(53.1301, 126.8699), '53.1301 – 126.8699°');
  assert.equal(continuityAngleLabel(89.999999, 90.000001), '89.999999 – 90.000001°');
});
