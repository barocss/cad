import test from 'node:test';
import assert from 'node:assert/strict';
import { NativeCurvatureError, NativeSecondDerivativeError } from '@barocss/cad';
import { analyzeCurve, directOps, importSource } from '@barocss/cad-model/engine/direct';
import { curvesSource } from '@barocss/cad-model/engine/curveSource';
import { curveAnalysisError, inspectCurvePoint } from '../src/ui/curveAnalysisError';

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
  const join = inspectCurvePoint(direct, id, 1);
  assert.deepEqual(join.point, [0, 20, 0]);
  assert.match(join.radiusNote!, /Unavailable at join/);
  assert.equal(join.tangentAngle, null);
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

test('issue 498: joined line Point survives radius refusal without altering the document', () => {
  const direct = importSource({ sources: {}, objects: [] }, curvesSource('joined', [{
    degree: 2, knots: [0, 0, 0, 1, 1, 2, 2, 2],
    points: [[10, 10, 0], [17.5, 10, 0], [25, 10, 0], [32.5, 10, 0], [40, 10, 0]],
    weights: [1, 1, 1, 1, 1],
  }]), 'Joined line');
  const before = JSON.stringify(direct), id = direct.objects[0].id;
  for (const t of [1, 0.5, 1.5, 1]) {
    const result = inspectCurvePoint(direct, id, t);
    assert.deepEqual(result.point, [10 + 15 * t, 10, 0]);
    assert.equal(result.radius, null);
    if (t === 1) assert.match(result.radiusNote!, /Unavailable at join/);
    else assert.equal(result.radiusNote, null);
    assert.equal(result.tangentAngle, t === 1 ? 0 : null);
  }
  assert.throws(() => inspectCurvePoint(direct, id, NaN));
  assert.equal(JSON.stringify(direct), before);
});

test('the exact cubic Join reports the 3D tangent angle and keeps the existing radius refusal', () => {
  const line = [[19, 1, -18], [25, 10, 0]] as [number, number, number][];
  const direct = importSource({ sources: {}, objects: [] }, curvesSource('cubic-join-input', [
    { degree: 1, knots: [2, 2, 4, 4], points: line, weights: [1, 1] },
    { degree: 3, knots: [10, 10, 10, 10, 14, 14, 14, 14],
      points: [line[1], [43, -2, 6], [47, 7, 5], [55, 21, 0]], weights: [1, 1, 1, 1] },
  ]), 'Join source');
  const joined = directOps.joinCurves(direct, direct.objects[0].id, direct.objects[1].id);
  const id = joined.objects.at(-1)!.id, before = structuredClone(joined);
  const atJoin = inspectCurvePoint(joined, id, 4);
  assert.deepEqual(atJoin.point, line[1]);
  assert.equal(atJoin.radius, null);
  assert.match(atJoin.radiusNote!, /Unavailable at join/);
  assert.ok(Math.abs(atJoin.tangentAngle! - 76.7570237801765) < 1e-12);
  const inside = inspectCurvePoint(joined, id, 5);
  assert.equal(inside.tangentAngle, null);
  assert.ok(inside.radius! > 0);
  assert.deepEqual(joined, before);
});
