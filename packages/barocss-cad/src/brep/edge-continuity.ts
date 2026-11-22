import { curveD1Evaluator, surfaceD1Evaluator } from '../core/derivatives.js';
import { curveDomain, surfaceDomain } from '../core/math.js';
import { surfaceD2Evaluator, type SurfaceD2Result } from '../core/second-derivatives.js';
import { add, cross, dist, dot, len, scale, sub, unit } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import type { Brep, BrepCoedge, BrepFace } from './brep-core.js';
import { recoverBoxFilletBindings } from './box-fillet-bindings.js';
import { halfRingMeridianD1 } from './exact-ring-intersect.js';

export type BrepEdgeContinuityRefusal =
  | 'edge-not-found'
  | 'invalid-incidence'
  | 'same-face-seam'
  | 'faceted-geometry'
  | 'missing-pcurve'
  | 'binding-mismatch'
  | 'derivative-unavailable';

interface FaceIdentity {
  readonly id: string;
  readonly name?: string;
}

export interface BrepEdgeContinuityOptions {
  readonly curvature?: boolean;
}

interface BrepEdgeCurvatureSample {
  readonly parameter: number;
  /** Signed normal curvature along the transverse direction, in the order of `faces`. */
  readonly first: number;
  readonly second: number;
  /** Absolute difference between the two signed values. */
  readonly difference: number;
}

export type BrepEdgeCurvatureResult =
  | {
    readonly status: 'measured';
    readonly unit: '1/mm';
    readonly maximumDifference: number;
    readonly samples: readonly BrepEdgeCurvatureSample[];
  }
  | { readonly status: 'unavailable'; readonly reason: 'non-tangent' | 'derivative-unavailable' };

export type BrepEdgeContinuityResult =
  | {
    readonly status: 'measured';
    readonly edgeId: string;
    readonly edgeName?: string;
    readonly faces: readonly [FaceIdentity, FaceIdentity];
    readonly sampleCount: number;
    readonly minimumAngleDegrees: number;
    readonly maximumAngleDegrees: number;
    readonly samples: readonly { readonly parameter: number; readonly angleDegrees: number }[];
    readonly curvature?: BrepEdgeCurvatureResult;
  }
  | { readonly status: 'unsupported'; readonly edgeId: string; readonly reason: BrepEdgeContinuityRefusal };

const SAMPLE_COUNT = 8;
const TANGENCY_THRESHOLD_DEGREES = CadNumericPolicy.relativeComparison * (180 / Math.PI);
// Apply the same conservative metric bound as local surface curvature, using sin² directly.
const CURVATURE_METRIC_FLOOR = 1024 * Number.EPSILON;

type UV = readonly [u: number, v: number];
interface CurvatureFrame {
  parameter: number;
  tangent: Point;
  normals: readonly [Point, Point];
  chart: readonly [UV, UV];
}

function findUnique<T extends { readonly id: string }>(items: readonly T[], id: string): T | undefined {
  let found: T | undefined;
  for (const item of items) {
    if (item.id !== id) continue;
    if (found) return undefined;
    found = item;
  }
  return found;
}

function faceAtUse(brep: Brep, use: BrepCoedge): BrepFace | undefined {
  const loop = findUnique(brep.loops, use.loop);
  if (!loop?.coedges.includes(use.id)) return undefined;
  const face = findUnique(brep.faces, loop.face);
  if (!face?.loops.includes(loop.id)) return undefined;
  return face;
}

function faceIdentity(face: BrepFace): FaceIdentity {
  return face.name === undefined ? { id: face.id } : { id: face.id, name: face.name };
}

function prepareSide(pcurve: Curve, surface: Surface, sense: BrepFace['sense'], surfaceAt = surfaceD1Evaluator(surface)) {
  return {
    uvAt: curveD1Evaluator(pcurve),
    surfaceAt,
    domain: surfaceDomain(surface),
    orientation: sense === 'forward' ? 1 : -1,
  };
}

// Rational evaluation can round an endpoint coordinate just outside its chart.
function chartParameter(parameter: number, [start, end]: readonly [number, number]): number | undefined {
  const rounding = 32 * Number.EPSILON * Math.max(Math.abs(start), Math.abs(end));
  if (parameter < start - rounding || parameter > end + rounding) return undefined;
  return Math.min(end, Math.max(start, parameter));
}

function orientedNormal(du: Point, dv: Point, orientation: number): Point | undefined {
  const uLength = len(du), vLength = len(dv);
  if (!(uLength > 0 && vLength > 0 && Number.isFinite(uLength) && Number.isFinite(vLength))) return undefined;
  const normal = cross(unit(du), unit(dv));
  const normalLength = len(normal);
  if (!(normalLength > CadNumericPolicy.relativeComparison)) return undefined;
  return scale(unit(normal), orientation);
}

function normalSecondPartial(partial: Point, normal: Point, firstLength: number, secondLength: number): number {
  const component = dot(normal, partial);
  const scaled = component / Math.max(firstLength, secondLength);
  const result = scaled / Math.min(firstLength, secondLength);
  if (!Number.isFinite(result) || (component !== 0 && result === 0)) {
    throw new RangeError('Normal curvature is outside the finite arithmetic range');
  }
  return result;
}

function normalCurvature(surface: SurfaceD2Result, normal: Point, commonDirection: Point): number {
  const uLength = len(surface.du), vLength = len(surface.dv);
  const u = unit(surface.du), v = unit(surface.dv);
  const chartCross = cross(u, v);
  const sine = len(chartCross);
  if (!(sine * sine > CURVATURE_METRIC_FLOOR)) throw new RangeError('Ill-conditioned surface chart');

  // Project the common world direction onto this support, then express it in the normalized UV basis.
  const projected = sub(commonDirection, scale(normal, dot(commonDirection, normal)));
  if (!(len(projected) > CadNumericPolicy.relativeComparison)) throw new RangeError('Degenerate transverse direction');
  const direction = unit(projected);
  const chartNormal = unit(chartCross);
  const a = dot(cross(direction, v), chartNormal) / sine;
  const b = dot(cross(u, direction), chartNormal) / sine;
  if (!(dist(add(scale(u, a), scale(v, b)), direction) <= CadNumericPolicy.relativeComparison)) {
    throw new RangeError('Could not resolve the transverse direction in the surface chart');
  }

  const uu = normalSecondPartial(surface.duu, normal, uLength, uLength);
  const uv = normalSecondPartial(surface.duv, normal, uLength, vLength);
  const vv = normalSecondPartial(surface.dvv, normal, vLength, vLength);
  const curvature = a * (uu * a + uv * b) + b * (uv * a + vv * b);
  if (!Number.isFinite(curvature)) throw new RangeError('Non-finite normal curvature');
  return curvature === 0 ? 0 : curvature;
}

function measureCurvature(
  surfaces: readonly [Surface, Surface], frames: readonly CurvatureFrame[], maximumAngleDegrees: number,
): BrepEdgeCurvatureResult {
  if (maximumAngleDegrees > TANGENCY_THRESHOLD_DEGREES) return { status: 'unavailable', reason: 'non-tangent' };
  try {
    const firstAt = surfaceD2Evaluator(surfaces[0]), secondAt = surfaceD2Evaluator(surfaces[1]);
    const samples: BrepEdgeCurvatureSample[] = [];
    let maximumDifference = 0;
    for (const { parameter, tangent, normals, chart } of frames) {
      const seamNormal = unit(add(normals[0], normals[1]));
      const transverse = cross(seamNormal, tangent);
      if (!(len(transverse) > CadNumericPolicy.relativeComparison)) throw new RangeError('Degenerate seam direction');
      const commonDirection = unit(transverse);
      const first = normalCurvature(firstAt(...chart[0]), normals[0], commonDirection);
      const second = normalCurvature(secondAt(...chart[1]), normals[1], commonDirection);
      const difference = Math.abs(first - second);
      if (!Number.isFinite(difference)) throw new RangeError('Non-finite curvature difference');
      samples.push({ parameter, first, second, difference });
      maximumDifference = Math.max(maximumDifference, difference);
    }
    return { status: 'measured', unit: '1/mm', maximumDifference, samples };
  } catch {
    return { status: 'unavailable', reason: 'derivative-unavailable' };
  }
}

/**
 * Sample the angle between the two oriented native face normals, in degrees.
 * Each sample checks both parameter bindings against the native edge.
 * Optional curvature compares signed normal curvature across the edge, in inverse mm,
 * when all sampled normal angles are at most 1e-7 radians.
 * The values are numerical observations at the sample points.
 */
export function measureBrepEdgeContinuity(
  brep: Brep, edgeId: string, options?: BrepEdgeContinuityOptions,
): BrepEdgeContinuityResult {
  const refuse = (reason: BrepEdgeContinuityRefusal): BrepEdgeContinuityResult => ({ status: 'unsupported', edgeId, reason });
  const edge = findUnique(brep.edges, edgeId);
  if (!edge) return refuse('edge-not-found');

  const uses = brep.coedges.filter(use => use.edge === edge.id);
  if (uses.length !== 2) return refuse('invalid-incidence');
  const [first, second] = uses;
  if (first.id === second.id || first.twin !== second.id || second.twin !== first.id || first.sense === second.sense) {
    return refuse('invalid-incidence');
  }

  const firstFace = faceAtUse(brep, first), secondFace = faceAtUse(brep, second);
  if (!firstFace || !secondFace || firstFace.shell !== secondFace.shell) return refuse('invalid-incidence');
  const shell = findUnique(brep.shells, firstFace.shell);
  if (!shell?.faces.includes(firstFace.id) || !shell.faces.includes(secondFace.id)) return refuse('invalid-incidence');
  if (firstFace.id === secondFace.id) return refuse('same-face-seam');
  if (brep.source.family === 'mesh' || firstFace.surface.kind === 'facets' || secondFace.surface.kind === 'facets') {
    return refuse('faceted-geometry');
  }
  let firstBinding = first.pcurve, secondBinding = second.pcurve;
  if (!firstBinding || !secondBinding) {
    const recovered = recoverBoxFilletBindings(brep, edge, firstFace, secondFace);
    if (!recovered) return refuse('missing-pcurve');
    firstBinding ??= recovered[0];
    secondBinding ??= recovered[1];
  }
  if (!Number.isFinite(edge.tolerance) || edge.tolerance < 0) return refuse('binding-mismatch');

  try {
    const [start, end] = curveDomain(edge.curve);
    for (const pcurve of [firstBinding, secondBinding]) {
      const [pStart, pEnd] = curveDomain(pcurve);
      if (pStart !== start || pEnd !== end || pcurve.controlPoints.some(point => point[2] !== 0)) {
        return refuse('binding-mismatch');
      }
    }
    const edgeAt = curveD1Evaluator(edge.curve);
    const sides = [
      prepareSide(firstBinding, firstFace.surface, firstFace.sense, halfRingMeridianD1(brep, edge, firstFace, secondFace, firstBinding)),
      prepareSide(secondBinding, secondFace.surface, secondFace.sense, halfRingMeridianD1(brep, edge, secondFace, firstFace, secondBinding)),
    ];
    const tolerance = Math.min(edge.tolerance, linearToleranceMM(geometryScaleMM(edge.curve.controlPoints)));
    const samples: { parameter: number; angleDegrees: number }[] = [];
    const curvatureFrames: CurvatureFrame[] | undefined = options?.curvature ? [] : undefined;
    let previous = start, minimumAngleDegrees = Infinity, maximumAngleDegrees = 0;

    for (let i = 0; i < SAMPLE_COUNT; i++) {
      const fraction = (i + 0.5) / SAMPLE_COUNT;
      const parameter = (1 - fraction) * start + fraction * end;
      if (!(previous < parameter && parameter < end)) return refuse('derivative-unavailable');
      previous = parameter;
      const world = edgeAt(parameter), speed = len(world.derivative);
      if (!(speed > 0 && Number.isFinite(speed))) return refuse('derivative-unavailable');

      const normals: Point[] = [], supportPoints: Point[] = [];
      const chart: UV[] | undefined = curvatureFrames && [];
      for (const side of sides) {
        // Both pcurves use the edge's canonical parameter, even for a reversed coedge.
        const uv = side.uvAt(parameter);
        const u = chartParameter(uv.point[0], side.domain.u), v = chartParameter(uv.point[1], side.domain.v);
        if (u === undefined || v === undefined) return refuse('binding-mismatch');
        const support = side.surfaceAt(u, v);
        const chain = add(scale(support.du, uv.derivative[0]), scale(support.dv, uv.derivative[1]));
        const tangentError = dist(chain, world.derivative) / speed;
        if (!(dist(support.point, world.point) <= tolerance && tangentError <= CadNumericPolicy.relativeComparison)) {
          return refuse('binding-mismatch');
        }
        const normal = orientedNormal(support.du, support.dv, side.orientation);
        if (!normal) return refuse('derivative-unavailable');
        normals.push(normal);
        supportPoints.push(support.point);
        chart?.push([u, v]);
      }
      if (dist(supportPoints[0], supportPoints[1]) > tolerance) return refuse('binding-mismatch');
      const angleDegrees = Math.atan2(len(cross(normals[0], normals[1])), dot(normals[0], normals[1])) * (180 / Math.PI);
      samples.push({ parameter, angleDegrees });
      minimumAngleDegrees = Math.min(minimumAngleDegrees, angleDegrees);
      maximumAngleDegrees = Math.max(maximumAngleDegrees, angleDegrees);
      if (chart && curvatureFrames) {
        curvatureFrames.push({ parameter, tangent: unit(world.derivative), normals: [normals[0], normals[1]], chart: [chart[0], chart[1]] });
      }
    }

    const curvature = curvatureFrames && measureCurvature([firstFace.surface, secondFace.surface], curvatureFrames, maximumAngleDegrees);
    return {
      status: 'measured',
      edgeId,
      ...(edge.name === undefined ? {} : { edgeName: edge.name }),
      faces: [faceIdentity(firstFace), faceIdentity(secondFace)],
      sampleCount: samples.length,
      minimumAngleDegrees,
      maximumAngleDegrees,
      samples,
      ...(curvature === undefined ? {} : { curvature }),
    };
  } catch {
    return refuse('derivative-unavailable');
  }
}
