import { curveD1Evaluator, surfaceD1Evaluator } from '../core/derivatives.js';
import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { CadNumericPolicy } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';

const QUARTER = Math.PI / 2, HALF_WEIGHT = Math.SQRT1_2;
const QUARTER_PARAMETER = Math.tan(Math.PI / 8);
const FIT_POSITION_LIMIT = CadNumericPolicy.linearTolerance / 20;
const FIT_TANGENT_LIMIT = CadNumericPolicy.relativeComparison * .5;
const CHECK_FRACTIONS = [.2113248654, .5, .7886751346];
const FIT_SPANS = [4, 8, 16, 24, 30];

export interface OffsetRingFrame {
  center: Point;
  axis: Point;
  R: number;
  r: number;
  inward: Point;
  station: number;
}

interface Sample {
  point: Point;
  tangent: Point;
  uv: Point;
  uvTangent: Point;
}

function radialPart(point: Point, frame: OffsetRingFrame) {
  const offset = sub(point, frame.center);
  return sub(offset, scale(frame.axis, dot(offset, frame.axis)));
}

// The parameter and the angle on the original two equal rational quarter spans.
function angularParameter(angle: number, quarter: number) {
  return (quarter + (1 + Math.tan((angle - (quarter + .5) * QUARTER) / 2) / QUARTER_PARAMETER) / 2) / 2;
}

function angleAndSpeed(v: number) {
  const quarter = v <= .5 ? 0 : 1, t = 2 * v - quarter;
  const a = (1 - t) + HALF_WEIGHT * t, b = HALF_WEIGHT * t;
  return { angle: quarter * QUARTER + 2 * Math.atan2(b, a), speed: 4 * HALF_WEIGHT / (a * a + b * b) };
}

/** Analytic intersection with a plane parallel to a ring's axis, on one original chart quarter. */
export function offsetRingTrim(frame: OffsetRingFrame, surface: Surface, side: 1 | -1) {
  const { R, r, center, axis, inward, station } = frame, transverse = scale(cross(axis, inward), side);
  const start = unit(radialPart(surface.controlPoints[0][0], frame)), next = unit(radialPart(surface.controlPoints[2][0], frame));
  const radialSense = Math.sign(len(radialPart(surface.controlPoints[0][0], frame)) - R);
  const axialSense = Math.sign(dot(sub(surface.controlPoints[0][2], center), axis));
  const orbitSense = Math.sign(dot(cross(inward, transverse), cross(start, next)));
  const orbitAngle = (rho: number) => {
    const along = Math.sqrt((rho - station) * (rho + station));
    const ray = add(scale(inward, station), scale(transverse, along));
    return Math.atan2(dot(ray, next), dot(ray, start));
  };
  const a = orbitAngle(R - r), b = orbitAngle(R + r), quarter = a < QUARTER ? 0 : 1;
  const lower = quarter * QUARTER, upper = lower + QUARTER;
  // All intermediate radii give angles between these extremes. Refuse a trim that meets a chart knot or seam.
  const margin = 1024 * Number.EPSILON;
  if (!(Math.min(a, b) > lower + margin && Math.max(a, b) < upper - margin)
    || !radialSense || !axialSense || !orbitSense) return;
  const at = (v: number): Sample => {
    const { angle, speed } = angleAndSpeed(v);
    const cos = Math.cos(angle), sin = Math.sin(angle);
    const rho = R + radialSense * r * cos, z = axialSense * r * sin;
    const along = Math.sqrt((rho - station) * (rho + station));
    const rhoSpeed = -radialSense * r * sin * speed, zSpeed = axialSense * r * cos * speed;
    const alongSpeed = rho * rhoSpeed / along;
    const u = angularParameter(orbitAngle(rho), quarter);
    const uSpeed = orbitSense * station * alongSpeed / (rho * rho * angleAndSpeed(u).speed);
    return {
      point: add(center, add(scale(inward, station), add(scale(transverse, along), scale(axis, z)))),
      tangent: add(scale(transverse, alongSpeed), scale(axis, zSpeed)),
      uv: [u, v, 0],
      uvTangent: [uSpeed, 1, 0],
    };
  };
  const profileParameter = (point: Point, endpoint: boolean, tolerance: number) => {
    if (endpoint) {
      const atStart = len(sub(point, at(0).point)) <= tolerance, atEnd = len(sub(point, at(1).point)) <= tolerance;
      return atStart !== atEnd ? atStart ? 0 : 1 : undefined;
    }
    const rho = len(radialPart(point, frame)), z = dot(sub(point, center), axis);
    const angle = Math.atan2(axialSense * z, radialSense * (rho - R));
    if (!(angle > 0 && angle < Math.PI)) return;
    const v = angularParameter(angle, angle <= QUARTER ? 0 : 1);
    if (len(sub(point, at(v).point)) <= tolerance) return v;
  };
  return { at, profileParameter };
}

type Trim = NonNullable<ReturnType<typeof offsetRingTrim>>;

/** The knot at each C1 Hermite join has multiplicity two. Inserting it once recovers the endpoint pole. */
function hermite(id: string, parameters: readonly number[], samples: readonly { point: Point; tangent: Point }[]): Curve {
  const controlPoints = [samples[0].point], knots = [0, 0, 0, 0];
  for (let i = 0; i + 1 < samples.length; i++) {
    const a = samples[i], b = samples[i + 1], reach = (parameters[i + 1] - parameters[i]) / 3;
    controlPoints.push(add(a.point, scale(a.tangent, reach)), sub(b.point, scale(b.tangent, reach)));
    if (i + 2 < samples.length) knots.push(parameters[i + 1], parameters[i + 1]);
  }
  controlPoints.push(samples[samples.length - 1].point);
  knots.push(1, 1, 1, 1);
  return { kind: 'curve', id, degree: 3, knots, controlPoints, weights: controlPoints.map(() => 1) };
}

function validateFit(edge: Curve, uv: Curve, surface: Surface, sample: (t: number) => Sample, parameters: readonly number[]) {
  const edgeAt = curveD1Evaluator(edge), uvAt = curveD1Evaluator(uv), surfaceAt = surfaceD1Evaluator(surface);
  const matches = (t: number) => {
    const expected = sample(t), actual = edgeAt(t), binding = uvAt(t);
    const [u, v] = binding.point;
    if (!(u >= 0 && u <= 1 && u !== .5 && v >= 0 && v <= 1 && v !== .5)) return false;
    const world = surfaceAt(u, v), tangent = add(scale(world.du, binding.derivative[0]), scale(world.dv, binding.derivative[1]));
    return len(sub(actual.point, expected.point)) <= FIT_POSITION_LIMIT && len(sub(world.point, actual.point)) <= FIT_POSITION_LIMIT
      && len(sub(tangent, actual.derivative)) <= FIT_TANGENT_LIMIT * len(expected.tangent)
      && len(sub(actual.derivative, expected.tangent)) <= FIT_TANGENT_LIMIT * len(expected.tangent);
  };
  for (let i = 0; i + 1 < parameters.length; i++) {
    const a = parameters[i], length = parameters[i + 1] - a;
    if (!CHECK_FRACTIONS.every(fraction => matches(a + length * fraction))) return false;
  }
  // The ordinary native continuity reader uses these same interior fractions.
  for (let i = 0; i < 8; i++) if (!matches((i + .5) / 8)) return false;
  return true;
}

/** Fit space and torus parameter curves together, with affine profile V and one canonical edge parameter. */
export function fitOffsetRingTrim(trim: Trim, surface: Surface, id: string, first: number, last: number) {
  const delta = last - first;
  if (!(Math.abs(delta) > 1e-7)) return;
  const sample = (t: number): Sample => {
    const exact = trim.at(t === 0 ? first : t === 1 ? last : first + delta * t);
    return { point: exact.point, tangent: scale(exact.tangent, delta), uv: exact.uv, uvTangent: scale(exact.uvTangent, delta) };
  };
  const join = (.5 - first) / delta;
  for (const count of FIT_SPANS) {
    const parameters = Array.from({ length: count + 1 }, (_, i) => i / count);
    if (join > 0 && join < 1 && !parameters.includes(join)) {
      if (parameters.some(t => Math.abs(t - join) < 1e-8)) continue;
      parameters.push(join);
      parameters.sort((a, b) => a - b);
    }
    const samples = parameters.map(sample);
    const edge = hermite(id, parameters, samples);
    const uv = hermite('pcurve', parameters, samples.map(({ uv, uvTangent }) => ({ point: uv, tangent: uvTangent })));
    if (validateFit(edge, uv, surface, sample, parameters)) return { edge, uv };
  }
}
