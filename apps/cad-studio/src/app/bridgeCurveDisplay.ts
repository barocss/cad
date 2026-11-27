import { sampleCurve, type Point } from '@barocss/cad';
import type { buildBridgeCurve } from '@barocss/cad-model/engine/bridgeCurve';
import type { DirectDisplay } from '@barocss/cad-model/engine/direct';

const offset = (point: Point, direction: Point, distance: number): Point =>
  [point[0] + direction[0] * distance, point[1] + direction[1] * distance, point[2] + direction[2] * distance];

export function bridgeCurveDisplay({ curve, ends, tangents }: ReturnType<typeof buildBridgeCurve>): DirectDisplay {
  const points = sampleCurve(curve, 64).map(({ point }) => point);
  const lines = points.slice(1).flatMap((b, index) => [...points[index], ...b]);
  const size = Math.hypot(ends[1][0] - ends[0][0], ends[1][1] - ends[0][1], ends[1][2] - ends[0][2]) * 0.11;
  const axes: Point[] = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (const [index, point] of ends.entries()) {
    for (const axis of axes) lines.push(...offset(point, axis, -size * 0.16), ...offset(point, axis, size * 0.16));
    if (curve.degree === 1) continue;
    const [x, y, z] = tangents[index];
    const side: Point = Math.abs(z) < 0.8 ? [-y, x, 0] : [0, -z, y];
    const length = Math.hypot(...side), across: Point = [side[0] / length, side[1] / length, side[2] / length];
    const head = offset(point, tangents[index], size), base = offset(head, tangents[index], -size * 0.34);
    lines.push(...point, ...head, ...head, ...offset(base, across, size * 0.2), ...head, ...offset(base, across, -size * 0.2));
  }
  return { id: 'bridge-preview', name: 'Bridge curve preview', kind: 'curve', preview: true,
    positions: new Float32Array(lines), controls: new Float32Array(0) };
}
