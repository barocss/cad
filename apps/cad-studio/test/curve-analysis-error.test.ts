import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCurvatureError, NativeSecondDerivativeError } from '@barocss/cad';
import { analyzeCurve, importSource } from '@barocss/cad-model/engine/direct';
import { curvesSource } from '@barocss/cad-model/engine/curveSource';
import { curveAnalysisError } from '../src/ui/curveAnalysisError';

test('a circular two-span join retains native refusal with actionable guidance and valid span radii', () => {
  const w = Math.SQRT1_2;
  const direct = importSource({ sources: {}, objects: [] }, curvesSource('rail', [{
    degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
    points: [[20, 0, 0], [20, 20, 0], [0, 20, 0], [-20, 20, 0], [-20, 0, 0]],
    weights: [1, w, 1, w, 1],
  }]), 'Rail');
  const snapshot = JSON.stringify(direct), id = direct.objects[0].id;
  assert.throws(() => analyzeCurve(direct, id, 1), error => {
    assert.ok(error instanceof NativeCurvatureError);
    assert.match(curveAnalysisError(error), /At t value inside either knot span/);
    return true;
  });
  // curvesSource rounds authored weights to nine decimal places.
  for (const t of [0.5, 0.99, 1.01, 1.5]) assert.ok(Math.abs(analyzeCurve(direct, id, t).radius! - 20) < 1e-6);
  assert.equal(JSON.stringify(direct), snapshot);
});

test('unrelated errors and incomplete chains retain their exact messages', () => {
  const errors: unknown[] = [new Error('ordinary failure'), 'string failure', null,
    new NativeSecondDerivativeError('CONTINUITY', 'direct'),
    new NativeCurvatureError('ARITHMETIC', 'other'),
    new NativeCurvatureError('DERIVATIVE', 'without cause')];
  for (const code of ['INPUT', 'ARITHMETIC', 'NATIVE'] as const) {
    errors.push(new NativeCurvatureError('DERIVATIVE', 'other derivative', new NativeSecondDerivativeError(code, 'detail')));
  }
  for (const error of errors) assert.equal(curveAnalysisError(error), error instanceof Error ? error.message : String(error));
});
