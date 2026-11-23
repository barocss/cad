import { CadNumericPolicy, type BrepProjection, type ProjectedEdge } from '@barocss/cad';
import { dot } from '../engine/vec3';
import type { DrawingViews, EdgeRef, NativeTopEdge, Vec3, XY } from './types';

const tolerance = CadNumericPolicy.linearTolerance;
const gap = (a: readonly number[], b: readonly number[]) => Math.hypot(...a.map((value, axis) => value - b[axis]));
const finite = (point: unknown): point is Vec3 => Array.isArray(point) && point.length === 3
  && point.every(value => typeof value === 'number' && Number.isFinite(value));
const inView = (pr: BrepProjection, point: Vec3): XY => [dot(point, pr.right), dot(point, pr.up)];
const fail = (why: string) => ({ ok: false as const, reason: `Reflex angle: ${why}. Restore the linked corner or select both native edges again.` });

/** Every original edge must have its own complete visible straight ink, including the corner. */
function visibleLine(pr: BrepProjection, edge: ProjectedEdge, native: NativeTopEdge): boolean {
  if (edge.kind !== 'line' || edge.circle || !edge.ends || edge.tangent || !edge.pieces.length) return false;
  if (!([false, true].some(reverse => edge.ends!.every((point, index) => finite(point)
    && gap(point, native.ends[reverse ? 1 - index : index]) <= tolerance)))) return false;
  const [a, b] = native.ends.map(point => inView(pr, point)), dx = b[0] - a[0], dy = b[1] - a[1], length = Math.hypot(dx, dy);
  if (!(length > tolerance)) return false;
  const intervals: [number, number][] = [];
  for (const piece of edge.pieces) {
    if (!piece.visible || piece.ink === false || piece.curve.kind !== 'line') return false;
    const stations: number[] = [];
    for (const point of [piece.curve.a, piece.curve.b]) {
      const x = point[0] - a[0], y = point[1] - a[1], station = (x * dx + y * dy) / length;
      if (!Number.isFinite(station) || Math.abs(x * dy - y * dx) / length > tolerance
        || station < -tolerance || station > length + tolerance) return false;
      stations.push(station);
    }
    intervals.push([Math.min(...stations), Math.max(...stations)]);
  }
  intervals.sort((a, b) => a[0] - b[0]);
  let covered = 0;
  for (const [start, end] of intervals) { if (start > covered + tolerance) return false; covered = Math.max(covered, end); }
  return covered >= length - tolerance;
}

/** A long CCW angle between outward rays from one physical vertex. Label placement selects only its radius. */
export function reflexAngle(pr: BrepProjection, nativeTop: DrawingViews['nativeTop'], a: EdgeRef, b: EdgeRef) {
  if (!nativeTop || !nativeTop.edges.length) return fail('one exact solid with native Top identity is required');
  if (pr.toward[0] !== 0 || pr.toward[1] !== 0 || pr.toward[2] !== 1) return fail('only the ordinary Top view is supported');
  if (!a || !b) return fail('two linked edge references are required');
  if (a.was !== undefined || b.was !== undefined) return fail('a linked source edge was rematched');
  const resolve = (ref: EdgeRef) => {
    if (!ref.edge || !finite(ref.near)) return;
    const native = nativeTop.edges.filter(edge => edge.name === ref.edge), projected = pr.edges.filter(edge => edge.name === ref.edge);
    if (native.length !== 1 || projected.length !== 1) return;
    const [edge] = native;
    if (!edge.id || edge.vertices.some(vertex => !vertex) || edge.vertices[0] === edge.vertices[1]
      || edge.ends.some(point => !finite(point)) || !visibleLine(pr, projected[0], edge)) return;
    const midpoint = edge.ends[0].map((value, axis) => (value + edge.ends[1][axis]) / 2);
    if (gap(midpoint, ref.near) > tolerance) return;
    return edge;
  };
  const first = resolve(a), second = resolve(b);
  if (!first || !second || first.id === second.id) return fail('two unique visible straight native edges matching their stored source midpoints are required');
  const shared = first.vertices.filter(id => second.vertices.includes(id));
  if (shared.length !== 1) return fail('the edges no longer share exactly one physical vertex');
  const ai = first.vertices.indexOf(shared[0]), bi = second.vertices.indexOf(shared[0]);
  const vertex3 = first.ends[ai], peer = second.ends[bi];
  if (vertex3.some((value, axis) => value !== peer[axis])) return fail('the native vertex identity disagrees with its endpoints');
  const ends3 = [first.ends[1 - ai], second.ends[1 - bi]];
  if (ends3.some(point => Math.abs(dot(point, pr.toward) - dot(vertex3, pr.toward)) > tolerance))
    return fail('both edges must lie in the Top plane');
  const vertex = inView(pr, vertex3), ends = ends3.map(point => inView(pr, point));
  const rays = ends.map(point => { const dx = point[0] - vertex[0], dy = point[1] - vertex[1], length = Math.hypot(dx, dy); return [dx / length, dy / length] as XY; });
  const [u, v] = rays, cross = u[0] * v[1] - u[1] * v[0], cosine = u[0] * v[0] + u[1] * v[1];
  if (!Number.isFinite(cross) || !Number.isFinite(cosine) || Math.abs(cross) <= 1e-9) return fail('the outward rays are degenerate or parallel');
  const degrees = 360 - Math.atan2(Math.abs(cross), cosine) * 180 / Math.PI;
  return { ok: true as const, vertex, from: cross > 0 ? v : u, to: cross > 0 ? u : v,
    ends: (cross > 0 ? [ends[1], ends[0]] : ends) as [XY, XY], degrees };
}
