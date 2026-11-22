// Explicit quarter-cylinder Thicken: algebraic admission, then native annular-sector boundaries.
import { binary64Dyadic } from '../core/dyadic.js';
import { isFrom, kernelRefusal, type KernelError } from '../core/barocss-error.js';
import { len, sub } from '../core/vec3.js';
import { ExtrudedProfileLimits, type ProfileSegmentInput } from '../features/extruded-profile-solid.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { checkBrep, type Brep } from './brep-core.js';
import { transformBrep } from './brep-transform.js';
import type { ThickenSolidRequest } from './thicken-solid.js';

type IntegerPoint = readonly [bigint, bigint, bigint];
interface CylinderFrame {
  center: Point; first: Point; last: Point; radius: number; z0: number; z1: number;
  outward: boolean; forwardV: boolean; tolerance: number;
}

const fail = (detail: string, code: 'CAPABILITY' | 'OFFSET_FOLDS' = 'CAPABILITY'): never => {
  throw kernelRefusal('thicken-cylinder', code, `${code === 'OFFSET_FOLDS' ? '[OFFSET_FOLDS] ' : ''}Exact cylinder Thicken: ${detail}`);
};
export const isThickenCylinderError = (error: unknown): error is KernelError => isFrom(error, 'thicken-cylinder');
const integerSub = (a: IntegerPoint, b: IntegerPoint): IntegerPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: IntegerPoint, b: IntegerPoint) => a.reduce((sum, value, axis) => sum + value * b[axis], 0n);

/** The caller validates the native surface. No circle fit or sampled circularity is used. */
function frameOf(surface: Surface): CylinderFrame {
  if (surface.degreeU !== 2 || surface.degreeV !== 1 || surface.controlPoints.length !== 3
    || surface.controlPoints.some(row => row.length !== 2)
    || surface.weights.some((row, index) => row.some(weight => weight !== (index === 1 ? Math.SQRT1_2 : 1))))
    return fail('requires one canonical rational quadratic quarter arc and one linear axial span.');
  const points = surface.controlPoints.flat(), dyadics = points.map(point => point.map(binary64Dyadic));
  const exponent = Math.max(...dyadics.flat().map(value => value.k));
  const integers = dyadics.map(point => {
    const at = (axis: number) => point[axis].m << BigInt(exponent - point[axis].k);
    return [at(0), at(1), at(2)] as const;
  });
  const [a, a1, b, b1, c, c1] = integers, translation = integerSub(a1, a);
  if (translation[0] !== 0n || translation[1] !== 0n || translation[2] === 0n
    || [integerSub(b1, b), integerSub(c1, c)].some(delta => delta.some((value, axis) => value !== translation[axis]))
    || a[2] !== b[2] || b[2] !== c[2])
    return fail('requires one exact common nonzero Z translation of a planar XY quarter arc.');
  // C = P0 + P2 - P1, R0 = P1 - P2, R2 = P1 - P0.
  const r0 = integerSub(b, c), r2 = integerSub(b, a), squaredRadius = dot(r0, r0);
  if (squaredRadius === 0n || dot(r0, r2) !== 0n || dot(r2, r2) !== squaredRadius)
    return fail('the stored radial vectors must be exactly perpendicular, equal and nonzero.');
  const turn = r0[0] * r2[1] - r0[1] * r2[0];
  const [[p0, q0], [p1], [p2]] = surface.controlPoints;
  const first = sub(p1, p2), last = sub(p1, p0), radius = Math.hypot(first[0], first[1]);
  const center: Point = [p0[0] - first[0], p0[1] - first[1], 0];
  const tolerance = linearToleranceMM(geometryScaleMM(points)), z0 = Math.min(p0[2], q0[2]), z1 = Math.max(p0[2], q0[2]);
  if (!(Number.isFinite(radius) && radius > tolerance && z1 - z0 > tolerance))
    return fail('the radius and axial span must exceed the native linear tolerance.');
  const firstAxis: Point = [first[0] / radius, first[1] / radius, 0], lastAxis: Point = [last[0] / radius, last[1] / radius, 0];
  const represented = [first, [first[0] + last[0], first[1] + last[1], 0], last];
  if (![...center, ...firstAxis, ...lastAxis].every(Number.isFinite)
    || represented.some((radial, index) => len(sub([center[0] + radial[0], center[1] + radial[1], p0[2]], surface.controlPoints[index][0])) > tolerance))
    return fail('the native cylinder frame cannot retain the stored quarter-arc controls.');
  return { center, first: firstAxis, last: lastAxis, radius, z0, z1,
    outward: (turn > 0n) === (translation[2] > 0n), forwardV: translation[2] > 0n, tolerance };
}

/** Six analytic faces; normal is the original du×dv, including reversed arc and axial directions. */
export function thickenCylinderSolid(req: Pick<ThickenSolidRequest, 'id' | 'surface' | 'thickness' | 'side'>): Brep {
  const frame = frameOf(req.surface), t = req.thickness;
  if (!(Number.isFinite(t) && t > frame.tolerance)) return fail('thickness must be finite and exceed the native linear tolerance.');
  if (req.side !== undefined && req.side !== 'normal' && req.side !== 'reverse' && req.side !== 'both')
    return fail('side must be normal, reverse or both.');
  const [lo, hi] = req.side === 'reverse' ? [-t, 0] : req.side === 'both' ? [-t / 2, t / 2] : [0, t];
  const sign = frame.outward ? 1 : -1, reverseRadius = frame.radius + sign * lo, normalRadius = frame.radius + sign * hi;
  const innerRadius = Math.min(reverseRadius, normalRadius), outerRadius = Math.max(reverseRadius, normalRadius);
  if (!(innerRadius > 0)) return fail('the inward offset reaches or crosses the cylinder axis.', 'OFFSET_FOLDS');
  if (!(innerRadius > frame.tolerance && outerRadius - innerRadius > frame.tolerance))
    return fail('the annular wall cannot be resolved within the native linear tolerance.');
  // Preserve ordinary millimetre profiles; scale only radii outside the native profile chart range.
  const chartScale = Math.max(Math.min(1, frame.radius), outerRadius / ExtrudedProfileLimits.coordinateMM);
  const inner = innerRadius / chartScale, outer = outerRadius / chartScale;
  if (![inner, outer, chartScale].every(Number.isFinite) || inner < ExtrudedProfileLimits.minimumRadiusMM
    || outer - inner < ExtrudedProfileLimits.minimumLengthMM)
    return fail('the annular wall is outside the native profile chart representation limits.');
  const id = req.id ?? 'thicken', profile: ProfileSegmentInput[] = [
    { kind: 'arc', start: [outer, 0], center: [0, 0], direction: 'ccw' },
    { kind: 'line', start: [0, outer] },
    { kind: 'arc', start: [0, inner], center: [0, 0], direction: 'cw' },
    { kind: 'line', start: [inner, 0] },
  ];
  const solid = prismaticFromProfile({ outer: profile, from: frame.z0, height: frame.z1 - frame.z0,
    names: { outer: [`${id}.${frame.outward ? 'normal' : 'reverse'}`, `${id}.u-max`, `${id}.${frame.outward ? 'reverse' : 'normal'}`, `${id}.u-min`],
      bottom: `${id}.${frame.forwardV ? 'v-min' : 'v-max'}`, top: `${id}.${frame.forwardV ? 'v-max' : 'v-min'}` } });
  const { first: x, last: y, center } = frame;
  const result = transformBrep(brepFromPrismatic(solid, { id }), {
    matrix: [chartScale * x[0], chartScale * y[0], 0, chartScale * x[1], chartScale * y[1], 0, 0, 0, 1], offset: center,
  });
  const controls = [...result.vertices.map(vertex => vertex.point), ...result.edges.flatMap(edge => edge.curve.controlPoints),
    ...result.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])];
  if (controls.some(point => point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.geometryCoordinateAbs)))
    return fail('the thickened cylinder leaves the native geometry coordinate range.');
  const report = checkBrep(result, { strict: true });
  if (!report.valid || result.faces.length !== 6) return fail(`the native cylinder solid is not representable: ${report.issues[0] ?? 'six faces required'}`);
  return result;
}
