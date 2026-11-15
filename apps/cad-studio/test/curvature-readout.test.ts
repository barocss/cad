import test from 'node:test';
import assert from 'node:assert/strict';
import { curvatureReadout } from '../src/ui/curvatureReadout';
test('constant and numerically equal displayed samples use one value', () => {
  assert.equal(curvatureReadout(0, 0), '0');
  assert.equal(curvatureReadout(.25, .25), '0.25');
  assert.equal(curvatureReadout(.25 - Number.EPSILON, .25 + Number.EPSILON), '0.25');
});
test('real varying G2 and rational curvature keep their established precision and range', () => {
  assert.equal(curvatureReadout(.09090197, .9918771), '0.09090197 – 0.9918771');
  assert.equal(curvatureReadout(.0224231, .8964867), '0.0224231 – 0.8964867');
  assert.equal(curvatureReadout(0, .25), '0 – 0.25');
});
