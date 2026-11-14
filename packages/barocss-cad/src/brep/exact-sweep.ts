import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import type { SideTags } from '../document/side-names.js';
import { buildProfileLoop, ExtrudedProfileLimits, type ProfileSegment, type ProfileSegmentInput, type XY } from '../features/extruded-profile-solid.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { revolveMassProperties, revolveProfile, revolveSweepProfile, type RevolveInput } from '../features/revolve.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import type { Brep } from './brep-core.js';
import { transformBrep } from './brep-transform.js';
import { curveTolerance, intersectSegments, locateInRegion, segDistance, type CurveSegment2 } from './curved-arrangement.js';
import { combineMassProperties, prismaticMassProperties, type MassProperties } from './solid-mass.js';

interface ExactSweepInput {
  readonly id: string;
  readonly mode: 'exact' | 'exact-straight';
  readonly outer: readonly ProfileSegmentInput[];
  readonly holes?: readonly (readonly ProfileSegmentInput[])[];
  readonly path: Curve;
  readonly xAxis: Point;
  readonly yAxis: Point;
  readonly sideTags?: SideTags;
}

type Refuse = (code: 'CAPABILITY' | 'GEOMETRY' | 'PARAMETER', message: string) => never;
type SweepSolid = { brep: Brep; mass: (density: number) => MassProperties };
type Circle = Extract<ProfileSegmentInput, { kind: 'arc' }>;

const circleOf = (loop: readonly ProfileSegmentInput[]): Circle | undefined =>
  loop.length === 1 && loop[0].kind === 'arc' ? loop[0] : undefined;
const circleRadius = ({ start, center }: Circle) => Math.hypot(start[0] - center[0], start[1] - center[1]);
const originDisk = (radius: number): Circle => ({ kind: 'arc', start: [radius, 0], center: [0, 0], direction: 'ccw' });
const sectionRing = (segments: readonly ProfileSegment[]): CurveSegment2[] => segments.map(s => s.kind === 'line'
  ? { kind: 'line', a: s.start, b: s.end }
  : { kind: 'arc', c: s.center, r: s.radius, t0: s.startAngle, sweep: s.sweep });

const holeError = (style: string, refuse: Refuse) => () =>
  refuse('GEOMETRY', `The exact ${style} sweep hole must lie strictly inside the outer profile, with clearance.`);

function circularHole(holes: NonNullable<ExactSweepInput['holes']>, style: string, refuse: Refuse): Circle | undefined {
  const hole = holes.length === 1 ? circleOf(holes[0]) : undefined;
  if (holes.length > 1 || (holes.length === 1 && !hole))
    return refuse('CAPABILITY', `Exact ${style} sweep accepts at most one circular hole.`);
  if (hole && circleRadius(hole) < ExtrudedProfileLimits.minimumRadiusMM)
    return refuse('PARAMETER', `Exact ${style} sweep needs a hole radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.`);
  return hole;
}

function checkHoleClearance(ring: readonly CurveSegment2[], tolerance: number, hole: Circle, noClearance: () => never): void {
  const radius = circleRadius(hole);
  // An inside centre with clearance greater than the radius keeps the whole disk inside.
  if (locateInRegion(hole.center, { outer: ring, holes: [] }, tolerance) !== 'in'
    || ring.some(s => segDistance(s, hole.center) <= radius + tolerance)) noClearance();
}

function centredHole(disk: Circle, hole: Circle, noClearance: () => never): Circle {
  // Keep the existing disk's seam on local +X. Translate the hole by the same centre.
  const shift = (p: XY): XY => [p[0] - disk.center[0], p[1] - disk.center[1]];
  const radius = circleRadius(disk), center = shift(hole.center);
  if (Math.hypot(...center) + circleRadius(hole) + linearToleranceMM(radius) >= radius) return noClearance();
  return { ...hole, start: shift(hole.start), center };
}

function straightSection(outer: ExactSweepInput['outer'], holes: NonNullable<ExactSweepInput['holes']>,
  disk: Circle | undefined, refuse: Refuse): { outer: ExactSweepInput['outer']; holes: NonNullable<ExactSweepInput['holes']>; anchor: XY } {
  const hole = circularHole(holes, 'straight', refuse);
  if (disk) {
    const inner = hole ? [[centredHole(disk, hole, holeError('straight', refuse))]] : [];
    return { outer: [originDisk(circleRadius(disk))], holes: inner, anchor: [0, 0] };
  }

  const { centroid, segments } = buildProfileLoop(outer, { maximumSegments: 1024 });
  if (hole) {
    const ring = sectionRing(segments);
    checkHoleClearance(ring, curveTolerance([ring]), hole, holeError('straight', refuse));
  }
  return { outer, holes, anchor: centroid };
}

function arcSectionAnchor(outer: ExactSweepInput['outer'], hole: Circle | undefined, refuse: Refuse): XY {
  const { centroid, segments } = buildProfileLoop(outer, { maximumSegments: 1024 });
  const ring = sectionRing(segments), tolerance = curveTolerance([ring]);
  // Only the authored join of adjacent segments may meet. The native intersection also checks arcs between chord samples.
  for (let i = 0; i < ring.length; i++) for (let j = i + 1; j < ring.length; j++) {
    const atJoin = (p: XY, q: XY) => Math.hypot(p[0] - q[0], p[1] - q[1]) <= tolerance;
    const meets = intersectSegments(ring[i], ring[j], tolerance);
    if (meets.some(p => !(j === i + 1 && atJoin(p, segments[j].start))
      && !(i === 0 && j === ring.length - 1 && atJoin(p, segments[0].start))))
      return refuse('GEOMETRY', 'The exact circular-arc sweep needs a simple outer profile.');
  }
  if (hole) checkHoleClearance(ring, tolerance, hole, holeError('circular-arc', refuse));
  return centroid;
}

function pathTolerance(path: Curve, refuse: Refuse): number {
  const extent = geometryScaleMM(path.controlPoints);
  if (extent > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path coordinates must be within ±10000 mm.');
  return linearToleranceMM(extent);
}

/** Recover the circular carrier of a validated single span within the native linear tolerance. */
function circularSpan(path: Curve, refuse: Refuse) {
  const unsupported = () => refuse('CAPABILITY', 'Exact sweep needs one open circular arc from 30° to 120°.');
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
  const maxHeight = a * Math.sqrt(3);
  const weight = w1 / w0;
  // Bound the displacement over the whole span when projecting the pole and correcting the weight.
  // The middle Bernstein coefficient is at most 1/2 and the denominator is at least the minimum weight.
  const deviation = (height: number) => {
    const poleDistance = Math.hypot(a, height), canonicalWeight = a / poleDistance;
    const diameter = Math.max(2 * a, poleDistance);
    const poleCorrection = Math.hypot(alongChord, h - height);
    return poleCorrection + 0.5 * Math.abs(weight - canonicalWeight) * diameter / Math.min(1, weight, canonicalWeight);
  };
  // Keep a rounded quarter arc that previously fitted 90° in one output span.
  const circularHeight = h > a && deviation(a) <= tolerance ? a : Math.max(minHeight, Math.min(maxHeight, h));
  if (deviation(circularHeight) > tolerance) return unsupported();

  const heightDirection = scale(perpendicular, 1 / h);
  const toCentre = sub(halfChord, scale(heightDirection, a * (a / circularHeight)));
  const tangent = unit(add(halfChord, scale(heightDirection, circularHeight)));
  const angle = circularHeight === maxHeight ? 2 * Math.PI / 3 : 2 * Math.atan2(circularHeight, a);
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

/** Build a native solid by carrying a profile along a selected world-space path. */
export function exactSweep(input: ExactSweepInput, refuse: Refuse): SweepSolid {
  const { id, mode, outer, holes = [], path, xAxis, yAxis, sideTags } = input;
  const disk = circleOf(outer), profileRadius = disk && circleRadius(disk);
  if (profileRadius !== undefined && profileRadius < ExtrudedProfileLimits.minimumRadiusMM)
    return refuse('PARAMETER', `Exact sweep needs a profile radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.`);
  // The sketch axes set the profile's roll, independent of its location in the sketch plane.
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
    if (profileRadius !== undefined && profileRadius > ExtrudedProfileLimits.coordinateMM)
      return refuse('PARAMETER', 'Exact straight sweep needs a profile radius of at most 10000 mm.');
    const section = straightSection(outer, holes, disk, refuse);
    const prism = prismaticFromProfile({ outer: section.outer, holes: section.holes, height: length, tag: id,
      names: { bottom: `${id}.start`, top: `${id}.end` }, ...(sideTags ? { sideTags } : {}) });
    const regions = prism.slabs[0]?.regions;
    if (regions?.length !== 1 || regions[0].holes.length !== holes.length)
      return refuse('GEOMETRY', 'Exact straight sweep could not preserve the profile boundary and its hole.');
    const axes = frame(tangent), [x, y] = axes;
    // Carry the outer area centroid at the path start, without changing the hole's offset from it.
    const offset = sub(start, add(scale(x, section.anchor[0]), scale(y, section.anchor[1])));
    return place({ brep: brepFromPrismatic(prism, { id }), mass: density => prismaticMassProperties(prism, density) }, axes, offset);
  }

  const hole = circularHole(holes, 'circular-arc', refuse);
  const { start, toCentre, tangent, radius, angle, tolerance } = circularSpan(path, refuse);
  if (radius > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path radius must be at most 10000 mm.');
  if (profileRadius !== undefined && radius - profileRadius <= tolerance)
    return refuse('PARAMETER', 'Exact sweep needs a path radius larger than the profile radius.');
  const axes = frame(tangent), [x, y] = axes;
  const [dx, dy] = [dot(toCentre, x), dot(toCentre, y)];
  const [cx, cy] = profileRadius === undefined ? arcSectionAnchor(outer, hole, refuse) : [0, 0];
  const inner = hole && disk ? centredHole(disk, hole, holeError('circular-arc', refuse)) : hole;
  const revolve: RevolveInput = {
    id,
    profile: profileRadius === undefined ? outer : [originDisk(profileRadius)],
    axis: { origin: profileRadius === undefined ? [cx + dx, cy + dy] : [dx, dy], direction: [-dy, dx] },
    angle: angle * 180 / Math.PI,
    ...(sideTags ? { sideTags: sideTags.outer } : {}),
    ...(inner ? { holes: [[inner]], holeTags: sideTags?.holes } : {}),
  };
  // Revolve departs towards local +Z. The directed tangent maps it into the selected arc's direction.
  const brep = profileRadius === undefined || inner ? revolveSweepProfile(revolve, {
    minimum: tolerance,
    refuse: () => refuse('PARAMETER', 'The exact circular-arc sweep profile must stay clear of the bend axis.'),
  }) : revolveProfile(revolve);
  const offset = profileRadius === undefined ? sub(start, add(scale(x, cx), scale(y, cy))) : start;
  return place({ brep, mass: density => revolveMassProperties(revolve, density) }, axes, offset);
}
