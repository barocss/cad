import { NativeCurvatureError, NativeSecondDerivativeError } from '@barocss/cad';

/** Explain only the curve inspector's native continuity refusal; preserve other diagnostics. */
export function curveAnalysisError(error: unknown): string {
  if (error instanceof NativeCurvatureError && error.code === 'DERIVATIVE'
    && error.cause instanceof NativeSecondDerivativeError && error.cause.code === 'CONTINUITY') {
    return 'Radius is unavailable at this curve join because a continuous second derivative is not guaranteed. Choose an At t value inside either knot span, or use the curvature comb.';
  }
  return error instanceof Error ? error.message : String(error);
}
