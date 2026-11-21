import { evaluateCurveD1 } from '../core/derivatives.js';
import { linearToleranceMM } from '../numeric-policy.js';
import { SectionRationalContext, type SectionRational } from '../section-rational-internal.js';
import type { Curve, Point } from '../types.js';
import { interpolateCurvePlain, type PlainFitCurve } from './fit-plain.js';

type XY = readonly [number, number];
const maximumStep = Math.PI / 6;
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const rotated = ([c, s]: XY, [x, y]: XY): XY => [c * x - s * y, s * x + c * y];

/** Prove the sign of the angular derivative on each cubic knot interval. */
function followsTurn(fit: PlainFitCurve, sign: number): boolean {
  const curve: Curve = { kind: 'curve', id: 'turn-factor', degree: 3, knots: fit.knots,
    controlPoints: fit.points, weights: fit.weights };
  const cubic = [1, 3, 3, 1], quadratic = [1, 2, 1];
  for (let k = 3; k < fit.points.length; k++) {
    const a = fit.knots[k], b = fit.knots[k + 1], third = (b - a) / 3;
    const { point: p, derivative: dp } = evaluateCurveD1(curve, a);
    const { point: q, derivative: dq } = evaluateCurveD1(curve, b);
    const poles: XY[] = [[p[0], p[1]], [p[0] + third * dp[0], p[1] + third * dp[1]],
      [q[0] - third * dq[0], q[1] - third * dq[1]], [q[0], q[1]]];
    const derivative = poles.slice(1).map((pole, i) => sub(pole, poles[i]));
    // The omitted divisors are positive and do not affect the sign of a product coefficient.
    const product = [0, 0, 0, 0, 0, 0];
    poles.forEach((pole, i) => derivative.forEach((d, j) => {
      product[i + j] += sign * cubic[i] * quadratic[j] * cross(pole, d);
    }));
    if (product.some(value => !(value > 0))) return false;
  }
  return true;
}

function rectangle(first: readonly XY[]) {
  const centre: XY = [(first[0][0] + first[2][0]) / 2, (first[0][1] + first[2][1]) / 2];
  const u = sub(first[1], first[0]), v = sub(first[3], first[0]);
  const width = Math.hypot(...u), depth = Math.hypot(...v);
  const tol = linearToleranceMM(Math.max(width, depth));
  if (Math.min(width, depth) <= tol || Math.abs(dot(u, v)) > tol * Math.max(width, depth)
    || Math.hypot(first[1][0] - centre[0] + (first[3][0] - centre[0]),
      first[1][1] - centre[1] + (first[3][1] - centre[1])) > tol) return null;
  return { centre, u, v, width, depth, tol };
}

/** Use one cubic V basis for all the rails of a constant rectangular turn. */
export function fitRectangularTurn(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
): { knots: number[]; rails: Point[][] } | null {
  const profile = rectangle(rows[0]);
  return profile && fitTurn(rows, heights, stations, profile.centre, profile.u, profile.width, profile.tol);
}

/** A rectangle rotating about the external normal through the common sketch origin. */
export function fitRectangularScrew(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
): { knots: number[]; rails: Point[][] } | null {
  const origin: XY = [0, 0], profile = rectangle(rows[0]);
  if (!profile) return null;
  const { u, v, width, depth, tol } = profile;
  const offset = sub(origin, rows[0][0]);
  const x = dot(offset, u) / width, y = dot(offset, v) / depth;
  const clearance = Math.hypot(Math.max(-x, 0, x - width), Math.max(-y, 0, y - depth));
  if (!(clearance > tol)) return null;
  return fitTurn(rows, heights, stations, origin, u, width, tol);
}

/** A single convex triangle turning about its centroid. */
export function fitTriangularTurn(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
): { knots: number[]; rails: Point[][] } | null {
  const [a, b, c] = rows[0];
  const u = sub(b, a), v = sub(c, a);
  const width = Math.hypot(...u), span = Math.max(width, Math.hypot(...v), Math.hypot(...sub(c, b)));
  const tol = linearToleranceMM(span);
  if (Math.abs(cross(u, v)) <= tol * span) return null;
  const centre: XY = [a[0] + (u[0] + v[0]) / 3, a[1] + (u[1] + v[1]) / 3];
  return fitTurn(rows, heights, stations, centre, u, width, tol);
}

/** Exact outside and closed-segment clearance tests for the represented first triangle. */
function triangleClearsOrigin(first: readonly XY[], tolerance: number): boolean {
  const unavailable = new Error('Triangle axis clearance arithmetic is unavailable.');
  const q = new SectionRationalContext(() => { throw unavailable; });
  type ExactXY = readonly [SectionRational, SectionRational];
  const difference = (a: ExactXY, b: ExactXY): ExactXY => [q.sub(a[0], b[0]), q.sub(a[1], b[1])];
  const product = (a: ExactXY, b: ExactXY) => q.add(q.mul(a[0], b[0]), q.mul(a[1], b[1]));
  const determinant = (a: ExactXY, b: ExactXY) => q.sub(q.mul(a[0], b[1]), q.mul(a[1], b[0]));
  try {
    const points = first.map(([x, y]): ExactXY => [q.from(x), q.from(y)]);
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

/** A straight triangle rotating about the external normal through the common sketch origin. */
export function fitTriangularScrew(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
): { knots: number[]; rails: Point[][] } | null {
  const [a, b, c] = rows[0];
  const u = sub(b, a), v = sub(c, a);
  const width = Math.hypot(...u), span = Math.max(width, Math.hypot(...v), Math.hypot(...sub(c, b)));
  const tol = linearToleranceMM(span);
  if (Math.abs(cross(u, v)) <= tol * span || !triangleClearsOrigin(rows[0], tol)) return null;
  return fitTurn(rows, heights, stations, [0, 0], u, width, tol);
}

function fitTurn(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
  centre: XY, u: XY, width: number, tol: number,
): { knots: number[]; rails: Point[][] } | null {
  const last = rows.length - 1;
  // The compact basis uses one pole per station and stays within the native surface limit.
  if (last < 6 || last > 15 || stations.some((t, i) => Math.abs(t - i / last) > 1e-9)) return null;
  const offsets = rows[0].map(point => sub(point, centre));
  const factors: XY[] = [];
  for (const row of rows) {
    const edge = sub(row[1], row[0]), length = Math.hypot(...edge);
    if (Math.abs(length - width) > tol) return null;
    const factor: XY = [dot(u, edge) / (width * length), cross(u, edge) / (width * length)];
    if (row.some((point, i) => Math.hypot(...sub(sub(point, centre), rotated(factor, offsets[i]))) > tol)) return null;
    factors.push(factor);
  }
  const step = Math.atan2(factors[1][1], factors[1][0]);
  if (Math.abs(step) > maximumStep + 1e-9 || factors.some((factor, i) => Math.hypot(...sub(factor,
    [Math.cos(step * i), Math.sin(step * i)])) > 1e-9)) return null;

  // Interpolate the rotation factors once so each section keeps its proportions.
  const fit = interpolateCurvePlain(factors.map(([c, s]) => [c, s, 0]), 3, stations);
  // A nonzero signed angular derivative also keeps the section away from a point collapse.
  if (step !== 0 && !followsTurn(fit, Math.sign(step))) return null;
  const height = heights[last] - heights[0];
  const rails = offsets.map((offset, corner): Point[] => fit.points.map(([c, s], index) => {
    if (index === 0 || index === last) return [...rows[index][corner], heights[index]];
    const xy = rotated([c, s], offset);
    // Cubic Greville abscissae reproduce linear height over the shared V basis.
    const t = (fit.knots[index + 1] + fit.knots[index + 2] + fit.knots[index + 3]) / 3;
    return [centre[0] + xy[0], centre[1] + xy[1], heights[0] + height * t];
  }));
  return { knots: fit.knots, rails };
}
