import { usesOf, type ModelNode } from '../engine/doc';
import { canonical } from '../util/revision';
import type { EditField } from './editFields';

type Point = [number, number];
export const smoothTurnAngleKey = 'smoothTurnAngle';
export const smoothTurnAngleLimit = (sectionCount: number) => 30 * (sectionCount - 1);

export function rotateTurnCorners(corners: readonly Point[], radians: number): Point[] {
  const cx = (corners[0][0] + corners[2][0]) / 2, cy = (corners[0][1] + corners[2][1]) / 2;
  const c = Math.cos(radians), s = Math.sin(radians);
  return corners.map(([px, py]) => {
    const x = px - cx, y = py - cy;
    return [cx + c * x - s * y, cy + s * x + c * y];
  });
}

function copyGeometry(copy: ModelNode | undefined): { points: Point[]; plane: string } | undefined {
  if (copy?.kind !== 'sketch' || copy.profile !== 'loop' || copy.suppressed || !copy.plane
    || copy.on || copy.association || copy.pocketFloor || copy.outline || copy.regions?.length || copy.holes?.length
    || copy.construction?.length || copy.segments.length !== 4) return;
  const points: Point[] = [];
  for (const segment of copy.segments) {
    const [x, y] = segment.start;
    if (segment.kind !== 'line' || typeof x !== 'number' || typeof y !== 'number'
      || !Number.isFinite(x) || !Number.isFinite(y)) return;
    points.push([x, y]);
  }
  return { points, plane: canonical(copy.plane) };
}

const diagonal = (points: Point[]): Point => [points[2][0] - points[0][0], points[2][1] - points[0][1]];
const phase = ([x, y]: Point, [u, v]: Point) => Math.atan2(x * v - y * u, x * u + y * v);

/** Recognize a saved generated turn by both its owned copies and their whole ordered geometry. */
function savedTurn(nodes: readonly ModelNode[], index: number) {
  const loft = nodes[index];
  if (index !== nodes.length - 1 || loft?.kind !== 'loft' || !loft.smooth || loft.suppressed
    || loft.guide || loft.guides || loft.from?.length !== 1 || loft.sections.length < 7 || loft.sections.length > 16) return;
  const start = index - loft.sections.length, source = nodes[loft.from[0]], last = loft.sections.length - 1;
  const height = loft.sections[last].z;
  if (loft.from[0] >= start || source?.kind !== 'sketch' || source.profile !== 'rectangle'
    || typeof height !== 'number' || !Number.isFinite(height) || height <= 0 || loft.sections[0].z !== 0
    || loft.sections.some((section, i) => section.sketch !== start + i || Object.hasOwn(section, 'frame')
      || typeof section.z !== 'number' || !Number.isFinite(section.z) || Math.abs(section.z / height - i / last) > 1e-9)) return;
  if (nodes.slice(0, index).some(node => usesOf(node, nodes).some(ref => ref >= start && ref < index))) return;
  const base = copyGeometry(nodes[start]);
  if (!base) return;
  const { points: first, plane } = base;
  if (first[1][0] <= first[0][0] || first[2][1] <= first[0][1]
    || first[1][1] !== first[0][1] || first[3][0] !== first[0][0]
    || first[1][0] !== first[2][0] || first[3][1] !== first[2][1]) return;

  const rows: Point[][] = [];
  for (const section of loft.sections) {
    const copy = copyGeometry(nodes[section.sketch]);
    if (!copy || copy.plane !== plane) return;
    rows.push(copy.points);
  }
  const axes = rows.map(diagonal);
  const accumulated = axes.slice(1).reduce((sum, axis, i) => sum + phase(axes[i], axis), 0);
  const principal = phase(axes[0], axes[last]);
  const radians = principal + 2 * Math.PI * Math.round((accumulated - principal) / (2 * Math.PI));
  const angle = Number((radians * 180 / Math.PI).toPrecision(12));
  const limit = smoothTurnAngleLimit(rows.length);
  if (Math.abs(angle) > limit) return;
  const scale = Math.max(1, ...first.flat().map(Math.abs));
  const tolerance = 64 * Number.EPSILON * scale;
  if (rows.some((points, i) => {
    const expected = rotateTurnCorners(first, radians * (i / last));
    return points.some(([x, y], j) => Math.hypot(x - expected[j][0], y - expected[j][1]) > tolerance);
  })) return;
  return { start, last, first, angle, limit };
}

export function smoothLoftTurnAngleField(nodes: readonly ModelNode[], index: number): EditField | undefined {
  if (!savedTurn(nodes, index)) return;
  return {
    kind: 'number', key: smoothTurnAngleKey, label: 'Turn angle', unit: '°',
    get: current => savedTurn(current, index)?.angle ?? NaN,
    set: (current, angle) => {
      const turn = savedTurn(current, index);
      if (!turn || !Number.isFinite(angle) || Math.abs(angle) > turn.limit || angle === turn.angle) return [...current];
      return current.map((node, i) => {
        if (i <= turn.start || i >= index || node.kind !== 'sketch' || node.profile !== 'loop') return node;
        const radians = angle * ((i - turn.start) / turn.last) * (Math.PI / 180);
        const segments = rotateTurnCorners(turn.first, radians).map(start => ({ kind: 'line' as const, start }));
        return { ...node, segments };
      });
    },
  };
}
