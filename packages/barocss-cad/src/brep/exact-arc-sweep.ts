import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { ExtrudedProfileLimits, type ProfileSegmentInput, type XY } from '../features/extruded-profile-solid.js';
import { revolveMassProperties, revolveProfile, type RevolveInput } from '../features/revolve.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import type { Brep } from './brep-core.js';
import { transformBrep } from './brep-transform.js';
import { combineMassProperties, type MassProperties } from './solid-mass.js';

interface ExactArcSweepInput {
  readonly id: string;
  readonly outer: readonly ProfileSegmentInput[];
  readonly path: Curve;
  readonly xAxis: Point;
  readonly yAxis: Point;
  readonly sideTags?: readonly string[];
}

type Refuse = (code: 'CAPABILITY' | 'PARAMETER', message: string) => never;

/** Recover the circular carrier of a validated single span within the native linear tolerance. */
function circularSpan(path: Curve, refuse: Refuse) {
  const unsupported = () => refuse('CAPABILITY', 'Exact sweep needs one open circular arc from 30° to 90°.');
  const [w0, w1, w2] = path.weights;
  if (path.degree !== 2 || path.controlPoints.length !== 3 || w0 !== w2) return unsupported();
  const extent = geometryScaleMM(path.controlPoints);
  if (extent > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path coordinates must be within ±10000 mm.');
  const tolerance = linearToleranceMM(extent);
  const [start, middle, end] = path.controlPoints;
  const halfChord = scale(sub(end, start), 0.5), a = len(halfChord);
  if (a <= tolerance) return unsupported();
  const chordDirection = scale(halfChord, 1 / a);
  const fromMidpoint = sub(sub(middle, start), halfChord);
  const alongChord = dot(fromMidpoint, chordDirection);
  const perpendicular = sub(fromMidpoint, scale(chordDirection, alongChord)), h = len(perpendicular);
  if (h <= tolerance) return unsupported();
  const minHeight = a * Math.tan(Math.PI / 12);
  const circularHeight = Math.max(minHeight, Math.min(a, h));

  const weight = w1 / w0, canonicalWeight = a / Math.hypot(a, circularHeight);
  const diameter = Math.max(2 * a, Math.hypot(a, circularHeight));
  // Project the middle pole onto the chord bisector. Correct height and weight within tolerance so
  // rounding at an angle limit cannot change the number of spans. The middle Bernstein coefficient
  // is at most 1/2 and the positive denominator is at least the minimum weight.
  const poleCorrection = Math.hypot(alongChord, h - circularHeight);
  const deviation = poleCorrection + 0.5 * Math.abs(weight - canonicalWeight) * diameter / Math.min(1, weight, canonicalWeight);
  if (deviation > tolerance) return unsupported();

  const heightDirection = scale(perpendicular, 1 / h);
  const toCentre = sub(halfChord, scale(heightDirection, a * (a / circularHeight)));
  const tangent = unit(add(halfChord, scale(heightDirection, circularHeight)));
  const angle = 2 * Math.atan2(circularHeight, a);
  return { start, toCentre, tangent, radius: len(toCentre), angle, tolerance };
}

/** Build one circular disk swept along its selected world-space arc as a capped toroidal segment. */
export function exactArcSweep(input: ExactArcSweepInput, refuse: Refuse): { brep: Brep; mass: (density: number) => MassProperties } {
  const { id, outer, path, xAxis, yAxis, sideTags } = input;
  const disk = outer[0];
  if (outer.length !== 1 || disk.kind !== 'arc') return refuse('CAPABILITY', 'Exact sweep needs one circular profile without holes.');
  const profileRadius = Math.hypot(disk.start[0] - disk.center[0], disk.start[1] - disk.center[1]);
  if (profileRadius < ExtrudedProfileLimits.minimumRadiusMM) return refuse('PARAMETER', `Exact sweep needs a profile radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.`);
  const { start, toCentre, tangent, radius, angle, tolerance } = circularSpan(path, refuse);
  if (radius > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path radius must be at most 10000 mm.');
  if (radius - profileRadius <= tolerance) return refuse('PARAMETER', 'Exact sweep needs a path radius larger than the profile radius.');

  // The profile's centre moves to the path start. Its sketch axes set the initial seam roll.
  const project = (axis: Point) => sub(axis, scale(tangent, dot(axis, tangent)));
  const projectedX = project(xAxis);
  const x = unit(len(projectedX) < 1e-6 ? project(yAxis) : projectedX), y = cross(tangent, x);
  const origin: XY = [dot(toCentre, x), dot(toCentre, y)];
  const revolve: RevolveInput = {
    id,
    profile: [{ kind: 'arc', start: [profileRadius, 0], center: [0, 0], direction: 'ccw' }],
    axis: { origin, direction: [-origin[1], origin[0]] },
    angle: angle * 180 / Math.PI,
    ...(sideTags ? { sideTags } : {}),
  };
  // Revolve departs towards local +Z. The directed tangent maps it into the selected arc's direction.
  const brep = transformBrep(revolveProfile(revolve), {
    matrix: [x[0], y[0], tangent[0], x[1], y[1], tangent[1], x[2], y[2], tangent[2]],
    offset: start,
  });
  return {
    brep: { ...brep, source: { family: 'sweep-curve', id } },
    mass: density => combineMassProperties([{ props: revolveMassProperties(revolve, density), axes: [x, y, tangent], offset: start }]),
  };
}
