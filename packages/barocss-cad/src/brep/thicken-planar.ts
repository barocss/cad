// Explicit planar Thicken. The legacy sampled route and its persistent facet names stay separate.
import { binary64Dyadic } from '../core/dyadic.js';
import { isFrom, kernelRefusal, type KernelError } from '../core/barocss-error.js';
import { cross, len, scale, sub } from '../core/vec3.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { geometryScaleMM, linearToleranceMM, CadNumericPolicy } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { checkBrep, type Brep } from './brep-core.js';
import { transformBrep } from './brep-transform.js';
import type { ThickenSolidRequest } from './thicken-solid.js';

interface Frame { origin: Point; u: Point; v: Point; normal: Point; tolerance: number }

const fail = (detail: string): never => { throw kernelRefusal('thicken-planar', 'CAPABILITY', `Exact planar Thicken: ${detail}`); };
export const isThickenPlanarError = (error: unknown): error is KernelError => isFrom(error, 'thicken-planar');

/** Test the stored binary64 identity without a rounded subtraction or a planarity tolerance. */
function parallelogram(a: number, b: number, c: number, d: number): boolean {
  const values = [a, b, c, d].map(binary64Dyadic), exponent = Math.max(...values.map(value => value.k));
  const integers = values.map(value => value.m << BigInt(exponent - value.k));
  return integers[0] + integers[3] === integers[1] + integers[2];
}

function frameOf(surface: Surface): Frame | undefined {
  if (surface.degreeU !== 1 || surface.degreeV !== 1 || surface.controlPoints.length !== 2
    || surface.controlPoints.some(row => row.length !== 2)) return undefined;
  const weight = surface.weights[0][0];
  if (surface.weights.some(row => row.some(value => value !== weight))) return undefined;
  const [[origin, p01], [p10, p11]] = surface.controlPoints;
  if (![0, 1, 2].every(axis => parallelogram(origin[axis], p01[axis], p10[axis], p11[axis]))) return undefined;
  const extent = geometryScaleMM(surface.controlPoints.flat());
  const tolerance = linearToleranceMM(extent), u = sub(p10, origin), v = sub(p01, origin), lu = len(u), lv = len(v);
  if (!(Number.isFinite(lu) && Number.isFinite(lv) && lu > tolerance && lv > tolerance)) return undefined;
  // Scale before crossing. Near-parallel directions and sub-tolerance altitudes do not define a stable solid.
  const rawNormal = cross(scale(u, 1 / lu), scale(v, 1 / lv)), sine = len(rawNormal);
  if (!(Number.isFinite(sine) && sine > 64 * Number.EPSILON && Math.min(lu, lv) * sine > tolerance)) return undefined;
  const normal = scale(rawNormal, 1 / sine);
  return normal.every(Number.isFinite) ? { origin, u, v, normal, tolerance } : undefined;
}

/** Six native planar faces from one validated affine, equal-weight, clamped bilinear sheet. */
export function thickenPlanarSolid(req: Pick<ThickenSolidRequest, 'id' | 'surface' | 'thickness' | 'side'>): Brep {
  const frame = frameOf(req.surface);
  if (!frame) return fail('requires a nondegenerate equal-weight clamped bilinear affine sheet.');
  const t = req.thickness;
  if (!(Number.isFinite(t) && t > frame.tolerance))
    return fail('thickness must be finite and exceed the native linear tolerance.');
  if (req.side !== undefined && req.side !== 'normal' && req.side !== 'reverse' && req.side !== 'both')
    return fail('side must be normal, reverse or both.');
  const id = req.id ?? 'thicken', from = req.side === 'reverse' ? -t : req.side === 'both' ? -t / 2 : 0;
  const solid = prismaticFromProfile({
    outer: [[0, 0], [1, 0], [1, 1], [0, 1]].map(start => ({ kind: 'line' as const, start: start as [number, number] })),
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
