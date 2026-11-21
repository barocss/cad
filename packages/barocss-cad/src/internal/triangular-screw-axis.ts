import { linearToleranceMM } from '../numeric-policy.js';
import { SectionRationalContext, type SectionRational } from '../section-rational-internal.js';

type XY = readonly [number, number];

/** The native triangle tolerance; invalid or near-collinear local corners are refused. */
export function triangleScrewAxisTolerance(local: readonly XY[]): number | undefined {
  if (!Array.isArray(local) || local.length !== 3
    || local.some(point => !Array.isArray(point) || point.length !== 2 || !point.every(Number.isFinite))) return;
  const [a, b, c] = local;
  const ux = b[0] - a[0], uy = b[1] - a[1], vx = c[0] - a[0], vy = c[1] - a[1];
  const span = Math.max(Math.hypot(ux, uy), Math.hypot(vx, vy), Math.hypot(c[0] - b[0], c[1] - b[1]));
  const tolerance = linearToleranceMM(span), area = ux * vy - uy * vx;
  if (!Number.isFinite(span) || !Number.isFinite(area) || Math.abs(area) <= tolerance * span) return;
  return tolerance;
}

/** Exact outside and closed-segment clearance tests for the represented local origin-axis triangle. */
export function triangleClearsScrewAxis(local: readonly XY[]): boolean {
  const tolerance = triangleScrewAxisTolerance(local);
  if (tolerance === undefined) return false;
  const unavailable = new Error('Triangle axis clearance arithmetic is unavailable.');
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
    // A convex triangle contains the origin iff every signed edge half-space contains it.
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
