import { evaluateCurve, NativeCurvatureError, NativeSecondDerivativeError } from '@barocss/cad';

import { analyzeCurve, directJoinTangentAngle, geometryOf, type DirectGeometry } from '@barocss/cad-model/engine/direct';

function isJoinRefusal(error: unknown): error is NativeCurvatureError {
  return error instanceof NativeCurvatureError && error.code === 'DERIVATIVE'
    && error.cause instanceof NativeSecondDerivativeError && error.cause.code === 'CONTINUITY';
}

/** Explain only the curve inspector's native continuity refusal; preserve other diagnostics. */
export function curveAnalysisError(error: unknown): string {
  if (isJoinRefusal(error)) {
    return 'Radius is unavailable at this curve join because a continuous second derivative is not guaranteed. Choose an At t value inside either knot span, or use the curvature comb.';
  }
  return error instanceof Error ? error.message : String(error);
}

/** A point needs no second derivative. Retain it at a native continuity refusal only. */
export function inspectCurvePoint(direct: DirectGeometry, id: string, parameter: number) {
  try { return { ...analyzeCurve(direct, id, parameter), radiusNote: null, tangentAngle: null }; }
  catch (error) {
    if (!isJoinRefusal(error)) throw error;
    const object = direct.objects.find(candidate => candidate.id === id);
    if (!object) throw error;
    const geometry = geometryOf(direct, object);
    if (geometry.kind !== 'curve') throw error;
    return {
      point: evaluateCurve(geometry, parameter), radius: null,
      radiusNote: 'Unavailable at join; inspect inside a span.',
      tangentAngle: directJoinTangentAngle(geometry, parameter),
    };
  }
}
