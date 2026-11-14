import { curveDomain, evaluateCurveCurvature, type Curve } from '@barocss/cad';
import type { Vec3 } from './vec3';

export interface EdgeCurvatureSample {
  parameter: number;
  point: Vec3;
  magnitude: number;
  vector: Vec3;
}

export interface EdgeCurvatureMeasurement {
  edgeId: string;
  edgeName: string;
  unit: '1/mm';
  minimum: number;
  maximum: number;
  spans: EdgeCurvatureSample[][];
}

const MAX_SPANS = 64;
const SAMPLES_PER_SPAN = 8;

/** Sample only inside the original positive knot spans. Do not join a comb across knots. */
export function sampleEdgeCurvature(curve: Curve): EdgeCurvatureSample[][] {
  const [start, end] = curveDomain(curve);
  const spans: EdgeCurvatureSample[][] = [];
  let left = start;
  for (const right of curve.knots) {
    if (right <= left || right > end) continue;
    if (spans.length === MAX_SPANS) throw new Error('This edge exceeds the curvature sampling limit.');
    const samples: EdgeCurvatureSample[] = [];
    for (let i = 0; i < SAMPLES_PER_SPAN; i++) {
      const parameter = left + (right - left) * (i + 0.5) / SAMPLES_PER_SPAN;
      if (!(left < parameter && parameter < right)) throw new Error('A native knot span is too narrow to sample.');
      const sample = evaluateCurveCurvature(curve, parameter);
      samples.push({ parameter, point: sample.derivatives.point, magnitude: sample.curvaturePer, vector: sample.curvatureVectorPer });
    }
    spans.push(samples);
    left = right;
  }
  if (!spans.length || left !== end) throw new Error('The native edge has no sampleable knot domain.');
  return spans;
}
