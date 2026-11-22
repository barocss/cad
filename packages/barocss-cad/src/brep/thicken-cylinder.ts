// Explicit cylinder-sector Thicken: algebraic admission, then native annular-sector boundaries.
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
  outward: boolean; forwardV: boolean; tolerance: number; end?: readonly [number, number];
}

const fail = (detail: string, code: 'CAPABILITY' | 'OFFSET_FOLDS' = 'CAPABILITY'): never => {
  throw kernelRefusal('thicken-cylinder', code, `${code === 'OFFSET_FOLDS' ? '[OFFSET_FOLDS] ' : ''}Exact cylinder Thicken: ${detail}`);
};
export const isThickenCylinderError = (error: unknown): error is KernelError => isFrom(error, 'thicken-cylinder');
const integerSub = (a: IntegerPoint, b: IntegerPoint): IntegerPoint => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a: IntegerPoint, b: IntegerPoint) => a.reduce((sum, value, axis) => sum + value * b[axis], 0n);

/** Put the stored binary64 controls on a common exact integer grid. */
function integerControls(points: Point[]): IntegerPoint[] {
  const dyadics = points.map(point => point.map(binary64Dyadic));
  const exponent = Math.max(...dyadics.flat().map(value => value.k));
  return dyadics.map(point => {
    const at = (axis: number) => point[axis].m << BigInt(exponent - point[axis].k);
    return [at(0), at(1), at(2)];
  });
}

/** Positive ratio rounded once to binary64; the conditioned angle ratio is between 1/16 and 15/16. */
function ratio(n: bigint, d: bigint): number {
  let exponent = n.toString(2).length - d.toString(2).length;
  if (exponent >= 0 ? n < (d << BigInt(exponent)) : (n << BigInt(-exponent)) < d) exponent--;
  const shifted = n << BigInt(52 - exponent);
  let quotient = shifted / d;
  const remainder = shifted % d;
  if (2n * remainder > d || 2n * remainder === d && (quotient & 1n) !== 0n) quotient++;
  return Number(quotient) * 2 ** (exponent - 52);
}

/** sqrt(n/d) must round to this exact weight, using exact squares of adjacent binary64 midpoints. */
function canonicalWeight(weight: number, n: bigint, d: bigint): boolean {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, weight);
  const bits = view.getBigUint64(0), even = (bits & 1n) === 0n;
  const compare = (adjacent: bigint) => {
    view.setBigUint64(0, adjacent);
    const a = binary64Dyadic(weight), b = binary64Dyadic(view.getFloat64(0)), exponent = Math.max(a.k, b.k);
    const midpoint = (a.m << BigInt(exponent - a.k)) + (b.m << BigInt(exponent - b.k));
    const difference = (n << BigInt(2 * (exponent + 1))) - d * midpoint * midpoint;
    return difference < 0n ? -1 : difference > 0n ? 1 : 0;
  };
  const lower = compare(bits - 1n), upper = compare(bits + 1n);
  return (lower > 0 || lower === 0 && even) && (upper < 0 || upper === 0 && even);
}

/** Equal tangent legs determine the circle algebraically; the weight certifies its nominal angle. */
function sectorFrame(surface: Surface, a: IntegerPoint, b: IntegerPoint, c: IntegerPoint, translation: IntegerPoint): CylinderFrame {
  const leg0 = integerSub(b, a), leg2 = integerSub(b, c), squaredLeg = dot(leg0, leg0);
  if (squaredLeg === 0n || dot(leg2, leg2) !== squaredLeg)
    return fail('the stored arc tangent legs must be exactly equal and nonzero.');
  const numerator = squaredLeg - dot(leg0, leg2), denominator = 2n * squaredLeg;
  // Both denominators in the center/tangent construction stay >=1/16. This avoids near-straight
  // and near-semicircle amplification: nominal sweep is approximately 28.96 through 151.04 degrees.
  if (16n * numerator < denominator || 16n * numerator > 15n * denominator)
    return fail('the sector angle is outside the conditioned 28.96 to 151.04 degree range.');
  const weight = surface.weights[1][0];
  if (!canonicalWeight(weight, numerator, denominator))
    return fail('the middle weight must be the correctly rounded canonical weight for the stored tangent legs.');
  const lambda = ratio(numerator, denominator), [[p0, q0], [p1], [p2]] = surface.controlPoints;
  const divisor = 1 - lambda;
  const center: Point = [p1[0] + ((p0[0] - p1[0]) / 2 + (p2[0] - p1[0]) / 2) / divisor,
    p1[1] + ((p0[1] - p1[1]) / 2 + (p2[1] - p1[1]) / 2) / divisor, 0];
  const radial = sub(p0, [center[0], center[1], p0[2]]), radius = Math.hypot(radial[0], radial[1]);
  const turn = leg0[0] * (c[1] - a[1]) - leg0[1] * (c[0] - a[0]), direction = turn > 0n ? 1 : -1;
  const first: Point = [radial[0] / radius, radial[1] / radius, 0], last: Point = [-direction * first[1], direction * first[0], 0];
  const end = [2 * lambda - 1, 2 * Math.sqrt(lambda * (1 - lambda))] as const;
  const tangent = Math.sqrt((1 - lambda) / lambda);
  // This is an arithmetic reconstruction envelope, not the much looser native millimetre tolerance.
  // Exact equal legs and the half-ULP weight certificate above remain the admission authority.
  const envelope = 64 * Number.EPSILON * Math.max(radius, ...surface.controlPoints.flat().flat().map(Math.abs), ...center.map(Math.abs));
  const local = [[radius, 0], [radius, radius * tangent], [radius * end[0], radius * end[1]]];
  if (![...center, ...first, ...last, radius, ...end].every(Number.isFinite)
    || local.some(([x, y], index) => len(sub([x * first[0] + y * last[0] + center[0], x * first[1] + y * last[1] + center[1], p0[2]], surface.controlPoints[index][0])) > envelope))
    return fail('the sector frame does not reconstruct its stored controls within the binary64 arithmetic envelope.');
  const tolerance = linearToleranceMM(geometryScaleMM(surface.controlPoints.flat())), z0 = Math.min(p0[2], q0[2]), z1 = Math.max(p0[2], q0[2]);
  if (!(radius > tolerance && z1 - z0 > tolerance)) return fail('the radius and axial span must exceed the native linear tolerance.');
  return { center, first, last, radius, z0, z1, end, tolerance,
    outward: (turn > 0n) === (translation[2] > 0n), forwardV: translation[2] > 0n };
}

/** Two exact quarter spans form one open semicircle; unequal positive span widths affect speed only. */
function semicircleFrame(surface: Surface): CylinderFrame {
  const knot = surface.knotsU[3], start = surface.knotsU[2], end = surface.knotsU[5];
  if (surface.controlPoints.some(row => row.length !== 2)
    || surface.knotsU.length !== 8 || surface.knotsU[4] !== knot || !(start < knot && knot < end)
    || surface.weights.some((row, index) => row.some(weight => weight !== (index % 2 ? Math.SQRT1_2 : 1))))
    return fail('a semicircle requires two canonical quarter spans with one exact double internal knot.');
  const points = surface.controlPoints.flat(), integers = integerControls(points);
  const [a, a1, b, , c, , d, , e] = integers, translation = integerSub(a1, a);
  if (translation[0] !== 0n || translation[1] !== 0n || translation[2] === 0n
    || [0, 1, 2, 3, 4].some(index => integers[2 * index][2] !== a[2]
      || integerSub(integers[2 * index + 1], integers[2 * index]).some((value, axis) => value !== translation[axis])))
    return fail('the semicircle requires one exact common nonzero Z translation of all five XY controls.');
  const firstRadial = integerSub(b, c), seamRadial = integerSub(b, a);
  const secondSeamRadial = integerSub(d, e), terminalRadial = integerSub(d, c), squaredRadius = dot(firstRadial, firstRadial);
  if (squaredRadius === 0n || dot(firstRadial, seamRadial) !== 0n || dot(seamRadial, seamRadial) !== squaredRadius
    || dot(secondSeamRadial, terminalRadial) !== 0n || dot(secondSeamRadial, secondSeamRadial) !== squaredRadius
    || dot(terminalRadial, terminalRadial) !== squaredRadius)
    return fail('both semicircle spans must have exact perpendicular equal nonzero radial vectors.');
  const firstCenter = integerSub(a, firstRadial), secondCenter = integerSub(c, secondSeamRadial);
  if (firstCenter.some((value, axis) => value !== secondCenter[axis]))
    return fail('the two semicircle spans must retain one exact center and seam.');
  if (terminalRadial.some((value, axis) => value !== -firstRadial[axis]))
    return fail('the semicircle terminal must be exactly opposite its first endpoint.');
  const firstTurn = firstRadial[0] * seamRadial[1] - firstRadial[1] * seamRadial[0];
  const secondTurn = secondSeamRadial[0] * terminalRadial[1] - secondSeamRadial[1] * terminalRadial[0];
  if (firstTurn === 0n || secondTurn === 0n || (firstTurn > 0n) !== (secondTurn > 0n))
    return fail('the semicircle spans must traverse the shared seam without folding.');
  const [[p0, q0], [p1], [p2]] = surface.controlPoints;
  const first = sub(p1, p2), last = sub(p1, p0), radius = Math.hypot(first[0], first[1]);
  const center: Point = [p0[0] - first[0], p0[1] - first[1], 0];
  const tolerance = linearToleranceMM(geometryScaleMM(points)), z0 = Math.min(p0[2], q0[2]), z1 = Math.max(p0[2], q0[2]);
  if (!(Number.isFinite(radius) && radius > tolerance && z1 - z0 > tolerance))
    return fail('the radius and axial span must exceed the native linear tolerance.');
  const firstAxis: Point = [first[0] / radius, first[1] / radius, 0], lastAxis: Point = [last[0] / radius, last[1] / radius, 0];
  const represented = [first, [first[0] + last[0], first[1] + last[1], 0], last,
    [last[0] - first[0], last[1] - first[1], 0], [-first[0], -first[1], 0]];
  const envelope = 64 * Number.EPSILON * Math.max(radius, ...points.flat().map(Math.abs), ...center.map(Math.abs));
  if (![...center, ...firstAxis, ...lastAxis].every(Number.isFinite)
    || represented.some((radial, index) => len(sub([center[0] + radial[0], center[1] + radial[1], p0[2]], surface.controlPoints[index][0])) > envelope))
    return fail('the semicircle frame does not reconstruct its stored controls within the binary64 arithmetic envelope.');
  // The two radial walls remain separate native faces; the seam within each cylinder skin is not a face boundary.
  return { center, first: firstAxis, last: lastAxis, radius, z0, z1, tolerance, end: [-1, 0],
    outward: (firstTurn > 0n) === (translation[2] > 0n), forwardV: translation[2] > 0n };
}

/** The caller validates the native surface. No circle fit or sampled circularity is used. */
function frameOf(surface: Surface): CylinderFrame {
  if (surface.degreeU === 2 && surface.degreeV === 1 && surface.controlPoints.length === 5) return semicircleFrame(surface);
  if (surface.degreeU !== 2 || surface.degreeV !== 1 || surface.controlPoints.length !== 3
    || surface.controlPoints.some(row => row.length !== 2)
    || surface.weights[0].some(weight => weight !== 1) || surface.weights[2].some(weight => weight !== 1)
    || !(surface.weights[1][0] > 0 && surface.weights[1][0] < 1) || surface.weights[1][0] !== surface.weights[1][1])
    return fail('requires one rational quadratic circular sector with unit end weights and one linear axial span.');
  const points = surface.controlPoints.flat(), integers = integerControls(points);
  const [a, a1, b, b1, c, c1] = integers, translation = integerSub(a1, a);
  if (translation[0] !== 0n || translation[1] !== 0n || translation[2] === 0n
    || [integerSub(b1, b), integerSub(c1, c)].some(delta => delta.some((value, axis) => value !== translation[axis]))
    || a[2] !== b[2] || b[2] !== c[2])
    return fail('requires one exact common nonzero Z translation of a planar XY circular arc.');
  // C = P0 + P2 - P1, R0 = P1 - P2, R2 = P1 - P0.
  const r0 = integerSub(b, c), r2 = integerSub(b, a), squaredRadius = dot(r0, r0);
  if (surface.weights[1][0] !== Math.SQRT1_2 || squaredRadius === 0n || dot(r0, r2) !== 0n || dot(r2, r2) !== squaredRadius)
    return sectorFrame(surface, a, b, c, translation);
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
  return cylinderSolid(req, 0);
}

/** @internal Signed physical skin moves; the optional opposite distance belongs to a certified first recipe. */
export function thickenCylinderWallOffsetSolid(req: Pick<ThickenSolidRequest, 'id' | 'surface' | 'thickness' | 'side'>, skin: 'outer' | 'inner', distance: number, oppositeDistance = 0): Brep {
  if (!Number.isFinite(distance) || !Number.isFinite(oppositeDistance) || (skin !== 'outer' && skin !== 'inner')) return fail('the skin and its radius offset must be valid and finite.');
  return cylinderSolid(req, skin === 'outer' ? distance : oppositeDistance, skin === 'inner' ? -distance : -oppositeDistance);
}

function cylinderSolid(req: Pick<ThickenSolidRequest, 'id' | 'surface' | 'thickness' | 'side'>, outerOffset: number, innerOffset = 0): Brep {
  const frame = frameOf(req.surface), t = req.thickness;
  if (!(Number.isFinite(t) && t > frame.tolerance)) return fail('thickness must be finite and exceed the native linear tolerance.');
  if (req.side !== undefined && req.side !== 'normal' && req.side !== 'reverse' && req.side !== 'both')
    return fail('side must be normal, reverse or both.');
  const [lo, hi] = req.side === 'reverse' ? [-t, 0] : req.side === 'both' ? [-t / 2, t / 2] : [0, t];
  const sign = frame.outward ? 1 : -1, reverseRadius = frame.radius + sign * lo, normalRadius = frame.radius + sign * hi;
  const innerRadius = Math.min(reverseRadius, normalRadius) + innerOffset, outerRadius = Math.max(reverseRadius, normalRadius) + outerOffset;
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
    { kind: 'line', start: frame.end ? [outer * frame.end[0], outer * frame.end[1]] : [0, outer] },
    { kind: 'arc', start: frame.end ? [inner * frame.end[0], inner * frame.end[1]] : [0, inner], center: [0, 0], direction: 'cw' },
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
