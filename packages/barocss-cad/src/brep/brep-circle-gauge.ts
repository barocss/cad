// Additional circle recognition for one positive global homogeneous weight gauge.
// Original poles, knots and native parameterization remain caller-owned and unchanged.
import type { Curve, Point } from '../types.js';
import { add, cross, dot, scale, sub } from '../core/vec3.js';

interface CircleFrame {
  c: Point; r: number; e1: Point; e2: Point;
  spans: { k0: number; k1: number; phi: number }[];
  a0: number; sign: number;
}
const distance = (a: Point, b: Point) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
const finitePoint = (p: Point) => p.length === 3 && p.every(Number.isFinite);

function normalizedCircleWeights(curve: Curve): number[] | null {
  const p = curve.controlPoints, w = curve.weights, k = curve.knots, n = (p.length - 1) / 2;
  if (curve.degree !== 2 || !Number.isInteger(n) || n < 1 || k.length !== 2 * n + 4 || w.length !== p.length
    || !p.every(finitePoint) || !w.every(x => Number.isFinite(x) && x > 0) || !k.every(Number.isFinite)) return null;
  const g = w[0], lo = k[2], hi = k[p.length];
  if (!(hi > lo)) return null;
  for (let i = 0; i < 3; i++) if (k[i] !== lo || k[k.length - 1 - i] !== hi) return null;
  // Only complete quadratic Bezier spans: no gap, single knot or reparameterization.
  for (let s = 0; s < n; s++) {
    if (!(k[2 * s + 3] > k[2 * s + 2]) || (s + 1 < n && k[2 * s + 3] !== k[2 * s + 4])) return null;
  }
  let legacyWeights = true;
  for (let i = 0; i < w.length; i++) {
    if (i % 2 === 0) {
      if (w[i] !== g) return null;
      if (Math.abs(w[i] - 1) > 1e-12) legacyWeights = false;
    } else {
      if (!(w[i] < g)) return null;
      if (!(w[i] < 1)) legacyWeights = false;
    }
  }
  // A failed legacy geometry check must not receive a second, altered unit path.
  if (legacyWeights) return null;
  const weights = w.map(value => value / g);
  return weights.every((value, i) => Number.isFinite(value) && value > 0 && (i % 2 === 0 ? value === 1 : value < 1)) ? weights : null;
}

function coefficientsMatchCircle(curve: Curve, circle: CircleFrame): boolean {
  if (!(Number.isFinite(circle.r) && circle.r > 0) || !finitePoint(circle.c) || !finitePoint(circle.e1) || !finitePoint(circle.e2)) return false;
  const normal = cross(circle.e1, circle.e2), p = curve.controlPoints;
  if (!(dot(normal, normal) > 0)) return false;
  // Same coefficient-distance criterion as the owning legacy circle radius check.
  const tolerance = 1e-9 * Math.max(1, circle.r);
  for (let s = 0; s < circle.spans.length; s++) {
    const radial = sub(p[2 * s], circle.c), tangent = scale(cross(normal, radial), circle.sign), phi = circle.spans[s].phi;
    const middle = add(circle.c, add(radial, scale(tangent, Math.tan(phi / 2))));
    const end = add(circle.c, add(scale(radial, Math.cos(phi)), scale(tangent, Math.sin(phi))));
    if (!finitePoint(middle) || !finitePoint(end) || Math.abs(dot(radial, normal)) > tolerance
      || distance(middle, p[2 * s + 1]) > tolerance || distance(end, p[2 * s + 2]) > tolerance) return false;
  }
  return true;
}

/** Called only after legacy recognition declines; no public protocol or visibility permission. */
export function circleFromCommonWeightGauge(curve: Curve, recognizeUnit: (curve: Curve) => CircleFrame | null): CircleFrame | null {
  const weights = normalizedCircleWeights(curve);
  if (!weights) return null;
  const circle = recognizeUnit({ ...curve, weights });
  return circle && coefficientsMatchCircle(curve, circle) ? circle : null;
}
