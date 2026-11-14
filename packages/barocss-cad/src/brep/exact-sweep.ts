import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { ExtrudedProfileLimits, type ProfileSegmentInput, type XY } from '../features/extruded-profile-solid.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { revolveMassProperties, revolveProfile, type RevolveInput } from '../features/revolve.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import type { Brep } from './brep-core.js';
import { transformBrep } from './brep-transform.js';
import { combineMassProperties, prismaticMassProperties, type MassProperties } from './solid-mass.js';

interface ExactSweepInput {
  readonly id: string;
  readonly mode: 'exact' | 'exact-straight';
  readonly outer: readonly ProfileSegmentInput[];
  readonly path: Curve;
  readonly xAxis: Point;
  readonly yAxis: Point;
  readonly sideTags?: readonly string[];
}

type Refuse = (code: 'CAPABILITY' | 'PARAMETER', message: string) => never;
type SweepSolid = { brep: Brep; mass: (density: number) => MassProperties };

function pathTolerance(path: Curve, refuse: Refuse): number {
  const extent = geometryScaleMM(path.controlPoints);
  if (extent > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path coordinates must be within ±10000 mm.');
  return linearToleranceMM(extent);
}

/** Recover the circular carrier of a validated single span within the native linear tolerance. */
function circularSpan(path: Curve, refuse: Refuse) {
  const unsupported = () => refuse('CAPABILITY', 'Exact sweep needs one open circular arc from 30° to 90°.');
  const [w0, w1, w2] = path.weights;
  if (path.degree !== 2 || path.controlPoints.length !== 3 || w0 !== w2) return unsupported();
  const tolerance = pathTolerance(path, refuse);
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

/** Read the two encodings emitted by Studio's Edge as a curve and Make curves. */
function straightSpan(path: Curve, refuse: Refuse) {
  const unsupported = () => refuse('CAPABILITY', 'Exact straight sweep needs one open straight segment.');
  const { degree, controlPoints, weights } = path;
  if (!((degree === 1 && controlPoints.length === 2) || (degree === 2 && controlPoints.length === 3))
    || !weights.every(w => w === weights[0])) return unsupported();
  const tolerance = pathTolerance(path, refuse);
  const start = controlPoints[0], end = controlPoints[degree];
  const chord = sub(end, start), length = len(chord);
  if (length < ExtrudedProfileLimits.minimumLengthMM) return refuse('PARAMETER', 'Exact straight sweep needs a path at least 0.0001 mm long.');
  if (degree === 2) {
    // The path differs from its chord by 2t(1−t) times the middle pole's displacement.
    // Its maximum deviation over the whole span is half that displacement.
    const midpointError = sub(sub(controlPoints[1], start), scale(chord, 0.5));
    if (len(midpointError) > 2 * tolerance) return unsupported();
  }
  return { start, tangent: scale(chord, 1 / length), length };
}

/** Build a native solid by carrying a circular disk along a selected world-space path. */
export function exactSweep(input: ExactSweepInput, refuse: Refuse): SweepSolid {
  const { id, mode, outer, path, xAxis, yAxis, sideTags } = input;
  const disk = outer[0];
  if (outer.length !== 1 || disk.kind !== 'arc') return refuse('CAPABILITY', 'Exact sweep needs one circular profile without holes.');
  const profileRadius = Math.hypot(disk.start[0] - disk.center[0], disk.start[1] - disk.center[1]);
  if (profileRadius < ExtrudedProfileLimits.minimumRadiusMM) return refuse('PARAMETER', `Exact sweep needs a profile radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.`);
  const profile: ProfileSegmentInput[] = [{ kind: 'arc', start: [profileRadius, 0], center: [0, 0], direction: 'ccw' }];
  // The profile's centre moves to the path start. Its sketch axes set the initial seam roll.
  const frame = (tangent: Point): [Point, Point, Point] => {
    const project = (axis: Point) => sub(axis, scale(tangent, dot(axis, tangent)));
    const projectedX = project(xAxis);
    const x = unit(len(projectedX) < 1e-6 ? project(yAxis) : projectedX);
    return [x, cross(tangent, x), tangent];
  };
  const place = (local: SweepSolid, axes: [Point, Point, Point], start: Point): SweepSolid => {
    const [x, y, z] = axes;
    const brep = transformBrep(local.brep, {
      matrix: [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]],
      offset: start,
    });
    return {
      brep: { ...brep, source: { family: 'sweep-curve', id } },
      mass: density => combineMassProperties([{ props: local.mass(density), axes, offset: start }]),
    };
  };
  if (mode === 'exact-straight') {
    const { start, tangent, length } = straightSpan(path, refuse);
    if (profileRadius > ExtrudedProfileLimits.coordinateMM) return refuse('PARAMETER', 'Exact straight sweep needs a profile radius of at most 10000 mm.');
    const prism = prismaticFromProfile({ outer: profile, height: length, tag: id,
      names: { bottom: `${id}.start`, top: `${id}.end` }, ...(sideTags ? { sideTags: { outer: sideTags } } : {}) });
    return place({ brep: brepFromPrismatic(prism, { id }), mass: density => prismaticMassProperties(prism, density) }, frame(tangent), start);
  }

  const { start, toCentre, tangent, radius, angle, tolerance } = circularSpan(path, refuse);
  if (radius > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path radius must be at most 10000 mm.');
  if (radius - profileRadius <= tolerance) return refuse('PARAMETER', 'Exact sweep needs a path radius larger than the profile radius.');
  const axes = frame(tangent), [x, y] = axes;
  const origin: XY = [dot(toCentre, x), dot(toCentre, y)];
  const revolve: RevolveInput = {
    id,
    profile,
    axis: { origin, direction: [-origin[1], origin[0]] },
    angle: angle * 180 / Math.PI,
    ...(sideTags ? { sideTags } : {}),
  };
  // Revolve departs towards local +Z. The directed tangent maps it into the selected arc's direction.
  return place({ brep: revolveProfile(revolve), mass: density => revolveMassProperties(revolve, density) }, axes, start);
}
