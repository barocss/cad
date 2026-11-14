import type { Vec3 } from '@barocss/cad-model/engine/vec3';
import type { CurvatureOverlay } from '../app/useEdgeCurvature';

export function CurvatureComb({ overlay, project }: { overlay: CurvatureOverlay; project(point: Vec3): Vec3 }) {
  if (overlay.measurement.maximum === 0) return null;
  return <g className="curvature-comb" data-edge={overlay.measurement.edgeId}>
    {overlay.measurement.spans.map((span, index) => {
      const points = span.map(sample => {
        const tip = sample.point.map((value, axis) => value + overlay.scale * sample.vector[axis]) as Vec3;
        return { start: project(sample.point), end: project(tip), parameter: sample.parameter, curved: sample.magnitude > 0 };
      });
      if (points.some(({ start, end }) => !start.every(Number.isFinite) || !end.every(Number.isFinite) ||
          start[2] < -1 || start[2] > 1 || end[2] < -1 || end[2] > 1)) return null;
      return <g key={index}>
        <polyline points={points.map(({ end }) => end[0] + ',' + end[1]).join(' ')} />
        {points.filter(point => point.curved).map(({ start, end, parameter }) =>
          <line key={parameter} x1={start[0]} y1={start[1]} x2={end[0]} y2={end[1]} />)}
      </g>;
    })}
  </g>;
}
