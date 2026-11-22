import { add, dot, len, scale, sub } from '../core/vec3.js';
import { curveDomain, surfaceDomain } from '../core/math.js';
import type { Curve, Point, Surface } from '../types.js';

/** Bind a line inside an affine planar chart by the endpoints of its canonical edge. */
export function affinePlaneBinding(edge: Curve, surface: Surface, tolerance: number): Curve | undefined {
  if (edge.degree !== 1 || edge.controlPoints.length !== 2 || edge.weights[0] !== edge.weights[1]
    || surface.degreeU !== 1 || surface.degreeV !== 1 || surface.controlPoints.length !== 2 || surface.controlPoints[0].length !== 2
    || surface.weights.some(row => row.some(weight => weight !== surface.weights[0][0]))) return;
  const [[o, pv], [pu, puv]] = surface.controlPoints;
  const a = sub(pu, o), b = sub(pv, o);
  if (len(sub(sub(puv, pv), a)) > tolerance) return;
  const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), determinant = aa * bb - ab * ab;
  if (!(determinant > 256 * Number.EPSILON * aa * bb)) return;
  const { u, v } = surfaceDomain(surface), uvTolerance = tolerance / Math.sqrt(Math.min(aa, bb));
  const solve = (point: Point): Point | undefined => {
    const q = sub(point, o), aq = dot(a, q), bq = dot(b, q);
    const s = (bb * aq - ab * bq) / determinant, t = (aa * bq - ab * aq) / determinant;
    if (!(s >= -uvTolerance && s <= 1 + uvTolerance && t >= -uvTolerance && t <= 1 + uvTolerance)) return;
    const x = Math.max(0, Math.min(1, s)), y = Math.max(0, Math.min(1, t));
    if (len(sub(q, add(scale(a, x), scale(b, y)))) <= tolerance)
      return [u[0] + x * (u[1] - u[0]), v[0] + y * (v[1] - v[0]), 0];
  };
  const first = solve(edge.controlPoints[0]), last = solve(edge.controlPoints[1]);
  if (!first || !last || len(sub(first, last)) === 0) return;
  const [start, end] = curveDomain(edge);
  return { kind: 'curve', id: 'pcurve', degree: 1, knots: [start, start, end, end], controlPoints: [first, last], weights: [1, 1] };
}
