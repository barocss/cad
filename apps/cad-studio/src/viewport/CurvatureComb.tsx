import type { Vec3 } from '@barocss/cad-model/engine/vec3';
import type { CurvatureOverlay } from '../app/useEdgeCurvature';

type Pixel = readonly [number, number];
type Segment = readonly [Pixel, Pixel];
const samePixel = (a: Pixel, b: Pixel) => Math.abs(a[0] - b[0]) <= 1e-7 && Math.abs(a[1] - b[1]) <= 1e-7;

export function CurvatureComb({ overlay, projectSegment }: { overlay: CurvatureOverlay; projectSegment(a: Vec3, b: Vec3): Segment | null }) {
  if (overlay.measurement.maximum === 0) return null;
  return <g className="curvature-comb"
    data-edge={overlay.target.kind === 'edge' ? overlay.target.id : undefined}
    data-curve={overlay.target.kind === 'direct' ? overlay.target.id : undefined}>
    {overlay.measurement.spans.map((span, index) => {
      const points = span.map(sample => ({
        start: sample.point,
        end: sample.point.map((value, axis) => value + overlay.scale * sample.vector[axis]) as Vec3,
        parameter: sample.parameter, curved: sample.magnitude > 0,
      }));
      // Clip adjacent tips independently. A rejected segment ends the run: never bridge a gap or a knot span.
      const runs: Pixel[][] = [];
      let run: Pixel[] | null = null;
      for (let i = 1; i < points.length; i++) {
        const segment = projectSegment(points[i - 1].end, points[i].end);
        if (!segment) { run = null; continue; }
        if (run && samePixel(run[run.length - 1], segment[0])) run.push(segment[1]);
        else { run = [segment[0], segment[1]]; runs.push(run); }
      }
      // Density selects measured spokes per span. The tip outline still uses every sample.
      const count = Math.min(points.length, overlay.density);
      const spokes = Array.from({ length: count }, (_, i) => points[Math.floor((i + 0.5) * points.length / count)]);
      return <g key={index}>
        {runs.map((pixels, at) => <polyline key={at} points={pixels.map(point => point.join(',')).join(' ')} />)}
        {spokes.filter(point => point.curved).map(({ start, end, parameter }) => {
          const segment = projectSegment(start, end);
          return segment && <line key={parameter} x1={segment[0][0]} y1={segment[0][1]} x2={segment[1][0]} y2={segment[1][1]} />;
        })}
      </g>;
    })}
  </g>;
}
