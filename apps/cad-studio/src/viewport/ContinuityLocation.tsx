import type { EdgeCurvatureMeasurement } from '@barocss/cad-model/engine/edgeCurvature';
import type { Vec3 } from '@barocss/cad-model/engine/vec3';

/** Location samples, not exact edge ink or occlusion-tested selection. */
export function ContinuityLocation({ curve, project }: { curve: EdgeCurvatureMeasurement; project(point: Vec3): readonly [number, number] | null }) {
  return <g data-continuity-location={curve.edgeId} aria-label="Native edge location samples" pointerEvents="none">
    {curve.spans.flatMap((span, s) => span.map((sample, i) => {
      const point = project(sample.point);
      return point && point.every(Number.isFinite) ? <circle key={`${s}:${i}`} cx={point[0]} cy={point[1]} r={3.5} fill="#ffc247" stroke="#191919" strokeWidth={1.5} /> : null;
    }))}
  </g>;
}
