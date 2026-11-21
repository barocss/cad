import { evaluateCurveD1 } from '../core/derivatives.js';
import { linearToleranceMM } from '../numeric-policy.js';
import { triangleClearsScrewAxis, triangleScrewAxisTolerance } from '../internal/triangular-screw-axis.js';
import { convexPolygonScrewAxisTolerance } from '../internal/convex-polygon-screw-axis.js';
import type { Curve, Point } from '../types.js';
import { interpolateCurvePlain, type PlainFitCurve } from './fit-plain.js';
import { ExtrudedProfileLimits, type ProfileLoop } from './extruded-profile-solid.js';
import { SectionRationalContext } from '../section-rational-internal.js';

type XY = readonly [number, number];
const maximumStep = Math.PI / 6;
const dot = (a: XY, b: XY) => a[0] * b[0] + a[1] * b[1];
const cross = (a: XY, b: XY) => a[0] * b[1] - a[1] * b[0];
const sub = (a: XY, b: XY): XY => [a[0] - b[0], a[1] - b[1]];
const rotated = ([c, s]: XY, [x, y]: XY): XY => [c * x - s * y, s * x + c * y];
type RationalPiece = { readonly p: readonly XY[]; readonly w: readonly number[] };
type CapPiece = { p: [number, number][]; w: number[] };
type HomogeneousPoint = [number, number, number, number];

function discClearsOrigin(centre: XY, radius: number, tolerance: number): boolean {
  const unavailable = new Error('Circular segment axis clearance arithmetic is unavailable.');
  const q = new SectionRationalContext(() => { throw unavailable; });
  try {
    const x = q.from(centre[0]), y = q.from(centre[1]), reach = q.add(q.from(radius), q.from(tolerance));
    return q.compare(q.add(q.mul(x, x), q.mul(y, y)), q.mul(reach, reach)) > 0;
  } catch (error) {
    if (error === unavailable) return false;
    throw error;
  }
}

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

/** A straight triangle rotating about the external normal through the common sketch origin. */
export function fitTriangularScrew(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
): { knots: number[]; rails: Point[][] } | null {
  const tol = triangleScrewAxisTolerance(rows[0]);
  if (tol === undefined || !triangleClearsScrewAxis(rows[0])) return null;
  const u = sub(rows[0][1], rows[0][0]), width = Math.hypot(...u);
  return fitTurn(rows, heights, stations, [0, 0], u, width, tol);
}

/** Preserve authored corner correspondence for an external-axis strictly convex polygon Screw. */
export function fitConvexPolygonScrew(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
): { knots: number[]; rails: Point[][] } | null {
  if (rows.length < 7 || rows.length > 16 || heights.length !== rows.length || stations.length !== rows.length) return null;
  const first = rows[0], count = first.length, last = rows.length - 1;
  // Triangles and rectangles retain their existing specialized admission paths.
  if (count < 4 || count > ExtrudedProfileLimits.segments || rows.some(row => row.length !== count)
    || (count === 4 && rectangle(first))) return null;
  const base = heights[0], height = heights[last] - base;
  if (!Number.isFinite(height) || height <= 0 || heights.some((z, i) => !Number.isFinite(z) || (i > 0 && z <= heights[i - 1]))
    || stations.some((t, i) => !Number.isFinite(t) || Math.abs(t - i / last) > 1e-9
      || Math.abs((heights[i] - base) / height - t) > 1e-9)) return null;
  let tolerance = 0;
  for (const row of rows) {
    const tol = convexPolygonScrewAxisTolerance(row);
    if (tol === undefined || row.some((point, i) => Math.hypot(point[0] - row[(i + 1) % count][0],
      point[1] - row[(i + 1) % count][1]) < ExtrudedProfileLimits.minimumLengthMM)) return null;
    if (!tolerance) tolerance = tol;
  }
  // Model's section projection rounds coordinates. A short polygon edge amplifies that rounding
  // into the rotation factor; the longest origin radius supplies the same law with a longer lever.
  const reference = first.reduce((best, point, i) => dot(point, point) > dot(first[best], first[best]) ? i : best, 0);
  const u = first[reference], direction = rows[1][reference];
  if (Math.atan2(cross(u, direction), dot(u, direction)) === 0) return null;
  return fitTurn(rows, heights, stations, [0, 0], u, Math.hypot(...u), tolerance, reference);
}

/** One closed circular segment rotating about a normal outside its entire supporting disc. */
export function fitLineArcScrew(
  loops: readonly ProfileLoop[], rows: readonly (readonly RationalPiece[])[],
  heights: readonly number[], stations: readonly number[],
): { knots: number[]; nets: HomogeneousPoint[][][]; caps: [CapPiece[], CapPiece[]] } | null {
  const last = loops.length - 1;
  if (last < 6 || last > 15 || rows.length !== loops.length || heights.length !== loops.length || stations.length !== loops.length) return null;
  const first = loops[0], pieces = rows[0];
  if (first.segments.length !== 2 || first.segments.filter(segment => segment.kind === 'line').length !== 1) return null;
  const arcIndex = first.segments.findIndex(segment => segment.kind === 'arc'), arc = first.segments[arcIndex];
  if (arc.kind !== 'arc' || !(arc.sweep > 0 && arc.sweep < 2 * Math.PI)) return null;
  const tolerance = linearToleranceMM(2 * arc.radius), height = heights[last] - heights[0];
  if (!(height > 0) || !Number.isFinite(height) || heights.some((z, i) => !Number.isFinite(z) || (i > 0 && z <= heights[i - 1]))
    || stations.some((t, i) => !Number.isFinite(t) || Math.abs(t - i / last) > 1e-9
      || Math.abs((heights[i] - heights[0]) / height - t) > 1e-9)) return null;
  const weightTolerance = Math.min(1e-9, tolerance / Math.max(1, 4 * arc.radius));
  const arcs = loops.map(loop => loop.segments[arcIndex]);
  if (pieces.filter(piece => piece.p.length === 2).length !== 1 || pieces.length < 2 || pieces.length > 5
    || loops.some((loop, k) => {
      const current = arcs[k], row = rows[k];
      return loop.reversed !== first.reversed || loop.segments.length !== 2
        || loop.segments.some((segment, i) => segment.kind !== first.segments[i].kind)
        || current.kind !== 'arc' || Math.abs(current.radius - arc.radius) > tolerance
        || Math.abs(current.sweep - arc.sweep) * arc.radius > tolerance
        || !discClearsOrigin(current.center, current.radius, tolerance)
        || row.length !== pieces.length || row.some((piece, i) => {
          const base = pieces[i], count = piece.p.length;
          return (count !== 2 && count !== 3) || count !== base.p.length || piece.w.length !== count
            || piece.w[0] !== 1 || piece.w[count - 1] !== 1
            || piece.p.some(point => !point.every(Number.isFinite))
            || piece.w.some((weight, j) => !(weight > 0 && weight <= 1) || Math.abs(weight - base.w[j]) > weightTolerance);
        });
    })) return null;

  // Check the centre as well as every rational U control: all must share the same signed law.
  const controls = rows.map((row, k) => {
    const current = arcs[k];
    return [...row.flatMap(piece => piece.p), current.kind === 'arc' ? current.center : [0, 0] as XY];
  });
  const reference = controls[0].reduce((best, point, i) => dot(point, point) > dot(controls[0][best], controls[0][best]) ? i : best, 0);
  const u = controls[0][reference], direction = controls[1][reference];
  if (Math.atan2(cross(u, direction), dot(u, direction)) === 0) return null;
  const fit = fitTurn(controls, heights, stations, [0, 0], u, Math.hypot(...u), tolerance, reference, false);
  if (!fit) return null;
  let column = 0;
  const nets = pieces.map(piece => piece.p.map((_, j) => {
    const rail = fit.rails[column++], weight = piece.w[j];
    return rail.map(([x, y, z]): HomogeneousPoint => [x * weight, y * weight, z * weight, weight]);
  }));
  // Caps and walls use identical stored controls and weights, including the split-arc seams.
  const cap = (at: number): CapPiece[] => nets.map(net => ({
    p: net.map(col => [col[at][0] / col[at][3], col[at][1] / col[at][3]]),
    w: net.map(col => col[at][3]),
  }));
  return { knots: fit.knots, nets, caps: [cap(0), cap(last)] };
}

function fitTurn(
  rows: readonly (readonly XY[])[], heights: readonly number[], stations: readonly number[],
  centre: XY, u: XY, width: number, tol: number, referenceCorner?: number, preserveEnds = true,
): { knots: number[]; rails: Point[][] } | null {
  const last = rows.length - 1;
  // The compact basis uses one pole per station and stays within the native surface limit.
  if (last < 6 || last > 15 || stations.some((t, i) => Math.abs(t - i / last) > 1e-9)) return null;
  const offsets = rows[0].map(point => sub(point, centre));
  const factors: XY[] = [];
  for (const row of rows) {
    const edge = referenceCorner === undefined ? sub(row[1], row[0]) : sub(row[referenceCorner], centre);
    const length = Math.hypot(...edge);
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
    if (preserveEnds && (index === 0 || index === last)) return [...rows[index][corner], heights[index]];
    const xy = rotated([c, s], offset);
    // Cubic Greville abscissae reproduce linear height over the shared V basis.
    const t = (fit.knots[index + 1] + fit.knots[index + 2] + fit.knots[index + 3]) / 3;
    return [centre[0] + xy[0], centre[1] + xy[1], index === 0 || index === last ? heights[index] : heights[0] + height * t];
  }));
  return { knots: fit.knots, rails };
}
