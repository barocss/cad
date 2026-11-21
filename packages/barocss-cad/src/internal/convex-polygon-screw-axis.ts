import { orient2dExactBinary64V1 } from '../exact-proof/exact-binary64-orientation-v1.js';
import { linearToleranceMM } from '../numeric-policy.js';
import { SectionRationalContext, type SectionRational } from '../section-rational-internal.js';

type XY = readonly [number, number];

/** Requires a nondegenerate, ordered convex loop; compares represented segment distances exactly. */
export function convexPolygonClearsOrigin(local: readonly XY[], tolerance: number): boolean {
  const unavailable = new Error('Polygon axis clearance arithmetic is unavailable.');
  const q = new SectionRationalContext(() => { throw unavailable; });
  type ExactXY = readonly [SectionRational, SectionRational];
  const difference = (a: ExactXY, b: ExactXY): ExactXY => [q.sub(a[0], b[0]), q.sub(a[1], b[1])];
  const product = (a: ExactXY, b: ExactXY) => q.add(q.mul(a[0], b[0]), q.mul(a[1], b[1]));
  const determinant = (a: ExactXY, b: ExactXY) => q.sub(q.mul(a[0], b[1]), q.mul(a[1], b[0]));
  try {
    const points = local.map(([x, y]): ExactXY => [q.from(x), q.from(y)]);
    const zero = q.rat(0n);
    const winding = q.compare(determinant(difference(points[1], points[0]), difference(points[2], points[0])), zero);
    if (!winding) return false;
    const edges = points.map((a, i) => {
      const b = points[(i + 1) % points.length], edge = difference(b, a);
      const offset: ExactXY = [q.neg(a[0]), q.neg(a[1])];
      return { a, b, edge, offset, side: determinant(edge, offset) };
    });
    // A convex loop contains the origin iff every signed edge half-space contains it.
    if (!edges.some(({ side }) => q.compare(side, zero) * winding < 0)) return false;
    const tol = q.from(tolerance), squaredTolerance = q.mul(tol, tol);
    return edges.every(({ a, b, edge, offset, side }) => {
      const squaredLength = product(edge, edge), projection = product(offset, edge);
      if (q.compare(projection, zero) <= 0) return q.compare(product(a, a), squaredTolerance) > 0;
      if (q.compare(projection, squaredLength) >= 0) return q.compare(product(b, b), squaredTolerance) > 0;
      return q.compare(q.mul(side, side), q.mul(squaredTolerance, squaredLength)) > 0;
    });
  } catch (error) {
    if (error === unavailable) return false;
    throw error;
  }
}

/** Exact strict convexity and simplicity, native corner margin, and external-origin clearance. */
export function convexPolygonScrewAxisTolerance(local: readonly XY[]): number | undefined {
  if (!Array.isArray(local) || local.length < 3
    || local.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return;
  let span = 0;
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length];
    span = Math.max(span, Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  if (!Number.isFinite(span)) return;
  const tolerance = linearToleranceMM(span), points = local.map(([x, y]) => ({ x, y }));
  let winding: 'positive' | 'negative' | undefined;
  for (let i = 0; i < local.length; i++) {
    const a = local[i], b = local[(i + 1) % local.length], c = local[(i + 2) % local.length];
    const ux = b[0] - a[0], uy = b[1] - a[1];
    if (Math.hypot(ux, uy) <= tolerance
      || Math.abs(ux * (c[1] - a[1]) - uy * (c[0] - a[0])) <= tolerance * span) return;
    // Adjacent turn signs alone also admit stars. Every other vertex must share the same half-space.
    for (let j = 0; j < local.length; j++) {
      if (j === i || j === (i + 1) % local.length) continue;
      const orientation = orient2dExactBinary64V1(points[i], points[(i + 1) % local.length], points[j]);
      if (orientation.status !== 'exact' || orientation.sign === 'zero') return;
      if (winding !== undefined && orientation.sign !== winding) return;
      winding = orientation.sign;
    }
  }
  return convexPolygonClearsOrigin(local, tolerance) ? tolerance : undefined;
}
