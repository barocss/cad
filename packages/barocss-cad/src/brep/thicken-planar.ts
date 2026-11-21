// Explicit planar Thicken. The legacy sampled route and its persistent facet names stay separate.
import { binary64Dyadic } from '../core/dyadic.js';
import { isFrom, kernelRefusal, type KernelError } from '../core/barocss-error.js';
import { cross, len, scale, sub } from '../core/vec3.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { ExtrudedProfileLimits, type XY } from '../features/extruded-profile-solid.js';
import { geometryScaleMM, linearToleranceMM, CadNumericPolicy } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { checkBrep, type Brep } from './brep-core.js';
import { transformBrep } from './brep-transform.js';
import type { ThickenSolidRequest } from './thicken-solid.js';

interface Frame { origin: Point; u: Point; v: Point; normal: Point; tolerance: number; corner: XY }

const fail = (detail: string): never => { throw kernelRefusal('thicken-planar', 'CAPABILITY', `Exact planar Thicken: ${detail}`); };
export const isThickenPlanarError = (error: unknown): error is KernelError => isFrom(error, 'thicken-planar');

/** Test the stored binary64 identity without a rounded subtraction or a planarity tolerance. */
function parallelogram(a: number, b: number, c: number, d: number): boolean {
  const values = [a, b, c, d].map(binary64Dyadic), exponent = Math.max(...values.map(value => value.k));
  const integers = values.map(value => value.m << BigInt(exponent - value.k));
  return integers[0] + integers[3] === integers[1] + integers[2];
}

type IntegerPoint = readonly [bigint, bigint, bigint];
const integerSub = (a: IntegerPoint, b: IntegerPoint): IntegerPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const integerCross = (a: IntegerPoint, b: IntegerPoint): IntegerPoint => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const magnitude = (value: bigint) => value < 0n ? -value : value;

/** Positive rational to binary64, with one ties-to-even rounding and no intermediate bigint overflow. */
function ratio(numerator: bigint, denominator: bigint): number {
  const n = magnitude(numerator), d = magnitude(denominator);
  let exponent = n.toString(2).length - d.toString(2).length;
  if (exponent >= 0 ? n < (d << BigInt(exponent)) : (n << BigInt(-exponent)) < d) exponent--;
  if (exponent < -1022 || exponent > 1023) return fail('the convex sheet has unrepresentable chart coordinates.');
  const shift = 52 - exponent, a = shift >= 0 ? n << BigInt(shift) : n, b = shift >= 0 ? d : d << BigInt(-shift);
  let quotient = a / b;
  const remainder = a % b;
  if (2n * remainder > b || 2n * remainder === b && (quotient & 1n) !== 0n) quotient++;
  return Number(quotient) * 2 ** (exponent - 52);
}

/** Exact positive bilinear Jacobians at all four UV corners prove an unfurled convex planar sheet. */
function convexCorner(origin: Point, p01: Point, p10: Point, p11: Point, tolerance: number): XY {
  const points = [origin, p10, p11, p01], dyadics = points.map(point => point.map(binary64Dyadic));
  const exponent = Math.max(...dyadics.flat().map(value => value.k));
  const [o, a, b, c] = dyadics.map(point => {
    const at = (axis: number) => point[axis].m << BigInt(exponent - point[axis].k);
    return [at(0), at(1), at(2)] as const;
  });
  const u = integerSub(a, o), v = integerSub(c, o), w = integerSub(b, o), normal = integerCross(u, v);
  if (normal.every(value => value === 0n)) return fail('collinear UV corner controls do not define a plane.');
  if (normal.reduce((sum, value, axis) => sum + value * w[axis], 0n) !== 0n)
    return fail('warped corner controls are not exactly coplanar.');
  let axis = 0;
  for (let i = 1; i < 3; i++) if (magnitude(normal[i]) > magnitude(normal[axis])) axis = i;
  const determinant = normal[axis], alpha = integerCross(w, v)[axis], beta = integerCross(u, w)[axis];
  const positive = (value: bigint) => determinant > 0n ? value > 0n : value < 0n;
  // P11 = O + alpha/D U + beta/D V. Corner Jacobian factors are 1, beta/D, alpha/D, (alpha+beta-D)/D.
  if (alpha === 0n || beta === 0n || alpha + beta === determinant)
    return fail('collinear UV corner controls do not form a strictly convex sheet.');
  if (!positive(alpha) || !positive(beta) || !positive(alpha + beta - determinant))
    return fail('folded UV corner controls do not form a strictly convex sheet.');
  // Exact signs admit topology. Native finite lengths and altitudes must also resolve every corner.
  for (let i = 0; i < 4; i++) {
    const before = sub(points[(i + 3) % 4], points[i]), after = sub(points[(i + 1) % 4], points[i]);
    const lb = len(before), la = len(after);
    if (!(Number.isFinite(lb) && Number.isFinite(la) && lb > tolerance && la > tolerance))
      return fail('the convex sheet has a corner edge below the native linear tolerance.');
    const sine = len(cross(scale(before, 1 / lb), scale(after, 1 / la)));
    if (!(Number.isFinite(sine) && sine > 64 * Number.EPSILON && Math.min(lb, la) * sine > tolerance))
      return fail('the convex sheet has an unresolved corner altitude.');
  }
  const corner: XY = [ratio(alpha, determinant), ratio(beta, determinant)], [x, y] = corner;
  if (!corner.every(value => Number.isFinite(value) && value > 0 && value <= ExtrudedProfileLimits.coordinateMM)
    || !(x + y > 1) || Math.hypot(x - 1, y) < ExtrudedProfileLimits.minimumLengthMM
    || Math.hypot(x, y - 1) < ExtrudedProfileLimits.minimumLengthMM)
    return fail('the convex sheet is outside the native profile chart representation limits.');
  const worldU = sub(p10, origin), worldV = sub(p01, origin);
  const mapped = origin.map((value, axis) => x * worldU[axis] + y * worldV[axis] + value);
  if (!mapped.every(Number.isFinite) || len(sub(mapped, p11)) > tolerance)
    return fail('the convex sheet chart does not retain its stored corner within the native linear tolerance.');
  return corner;
}

function frameOf(surface: Surface): Frame | undefined {
  if (surface.degreeU !== 1 || surface.degreeV !== 1 || surface.controlPoints.length !== 2
    || surface.controlPoints.some(row => row.length !== 2)) return undefined;
  const weight = surface.weights[0][0];
  if (surface.weights.some(row => row.some(value => value !== weight))) return undefined;
  const [[origin, p01], [p10, p11]] = surface.controlPoints;
  const extent = geometryScaleMM(surface.controlPoints.flat());
  const tolerance = linearToleranceMM(extent);
  // Preserve every old affine construction bit, including the literal [1,1] profile corner.
  const affine = [0, 1, 2].every(axis => parallelogram(origin[axis], p01[axis], p10[axis], p11[axis]));
  const corner: XY = affine ? [1, 1] : convexCorner(origin, p01, p10, p11, tolerance);
  const u = sub(p10, origin), v = sub(p01, origin), lu = len(u), lv = len(v);
  if (!(Number.isFinite(lu) && Number.isFinite(lv) && lu > tolerance && lv > tolerance))
    return fail('the sheet has a corner edge below the native linear tolerance.');
  // Scale before crossing. Near-parallel directions and sub-tolerance altitudes do not define a stable solid.
  const rawNormal = cross(scale(u, 1 / lu), scale(v, 1 / lv)), sine = len(rawNormal);
  if (!(Number.isFinite(sine) && sine > 64 * Number.EPSILON && Math.min(lu, lv) * sine > tolerance))
    return fail('the sheet has a collinear or unresolved corner altitude.');
  const normal = scale(rawNormal, 1 / sine);
  return normal.every(Number.isFinite) ? { origin, u, v, normal, tolerance, corner } : undefined;
}

/** Six native planar faces from one validated convex planar, equal-weight, clamped bilinear sheet. */
export function thickenPlanarSolid(req: Pick<ThickenSolidRequest, 'id' | 'surface' | 'thickness' | 'side'>): Brep {
  const frame = frameOf(req.surface);
  if (!frame) return fail('requires a nondegenerate equal-weight clamped bilinear planar sheet.');
  const t = req.thickness;
  if (!(Number.isFinite(t) && t > frame.tolerance))
    return fail('thickness must be finite and exceed the native linear tolerance.');
  if (req.side !== undefined && req.side !== 'normal' && req.side !== 'reverse' && req.side !== 'both')
    return fail('side must be normal, reverse or both.');
  const id = req.id ?? 'thicken', from = req.side === 'reverse' ? -t : req.side === 'both' ? -t / 2 : 0;
  const solid = prismaticFromProfile({
    outer: [[0, 0], [1, 0], frame.corner, [0, 1]].map(start => ({ kind: 'line' as const, start: start as XY })),
    from, height: t,
    names: { outer: [`${id}.v-min`, `${id}.u-max`, `${id}.v-max`, `${id}.u-min`], bottom: `${id}.reverse`, top: `${id}.normal` },
  });
  const { origin, u, v, normal: n } = frame;
  const result = transformBrep(brepFromPrismatic(solid, { id }), {
    matrix: [u[0], v[0], n[0], u[1], v[1], n[1], u[2], v[2], n[2]], offset: origin,
  });
  if (result.vertices.some(vertex => vertex.point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.geometryCoordinateAbs)))
    return fail('the thickened sheet leaves the native ±1000000 mm geometry range.');
  const report = checkBrep(result, { strict: true });
  if (!report.valid) return fail(`the native planar solid is not representable: ${report.issues[0]}`);
  return result;
}
