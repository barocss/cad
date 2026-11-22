import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { curveDomain, surfaceDomain } from '../core/math.js';
import type { SideTags } from '../document/side-names.js';
import { buildProfileLoop, ExtrudedProfileLimits, type ProfileSegment, type ProfileSegmentInput, type XY } from '../features/extruded-profile-solid.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { revolveMassProperties, revolveProfile, revolveSweepProfile, type RevolveInput } from '../features/revolve.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import { checkBrep, type Brep } from './brep-core.js';
import { faceGeometry } from './analytic-boolean.js';
import { glueAtSharedFace } from './brep-glue.js';
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
type SweepAxes = [Point, Point, Point];
const identityAxes: SweepAxes = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
const origin: Point = [0, 0, 0];
const sweepMatrix = ([x, y, z]: SweepAxes) => [x[0], y[0], z[0], x[1], y[1], z[1], x[2], y[2], z[2]] as const;

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

/** Recover the circular carrier of one or two validated quadratic spans. */
function circularPath(path: Curve, refuse: Refuse) {
  const unsupported = () => refuse('CAPABILITY', 'Exact sweep needs one open circular arc from 30° to 120°.');
  const count = path.controlPoints.length;
  if (path.degree !== 2 || (count !== 3 && count !== 5)) return unsupported();
  const [w0, w1, w2] = path.weights;
  if (w0 !== w2 || (count === 5 && (path.knots[3] !== path.knots[4] || w0 !== path.weights[4]))) return unsupported();
  const tolerance = pathTolerance(path, refuse);
  if (count === 5) return joinedCircularSpans(path, tolerance) ?? unsupported();
  const [start, middle, end] = path.controlPoints;
  return circularSpan(start, middle, end, w1 / w0, tolerance) ?? unsupported();
}

function circularSpan(start: Point, middle: Point, end: Point, weight: number, tolerance: number) {
  const halfChord = scale(sub(end, start), 0.5), a = len(halfChord);
  if (a <= tolerance) return;
  const chordDirection = scale(halfChord, 1 / a);
  const fromMidpoint = sub(sub(middle, start), halfChord);
  const alongChord = dot(fromMidpoint, chordDirection);
  const perpendicular = sub(fromMidpoint, scale(chordDirection, alongChord)), h = len(perpendicular);
  if (h <= tolerance) return;
  const minHeight = a * Math.tan(Math.PI / 12);
  const maxHeight = a * Math.sqrt(3);
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
  if (deviation(circularHeight) > tolerance) return;

  const heightDirection = scale(perpendicular, 1 / h);
  const toCentre = sub(halfChord, scale(heightDirection, a * (a / circularHeight)));
  const tangent = unit(add(halfChord, scale(heightDirection, circularHeight)));
  const angle = circularHeight === maxHeight ? 2 * Math.PI / 3 : 2 * Math.atan2(circularHeight, a);
  return { start, toCentre, tangent, radius: len(toCentre), angle, tolerance };
}

/** Recover a circle through both path ends and certify both spans on that one carrier. */
function joinedCircularSpans(path: Curve, tolerance: number) {
  const [start] = path.controlPoints;
  const [, p1, join, p3, end] = path.controlPoints.map(point => sub(point, start));
  const [, w1, , w3] = path.weights.map(weight => weight / path.weights[0]);
  if (dot(sub(join, p1), sub(p3, join)) <= 0) return undefined;
  const origin: Point = [0, 0, 0];
  const halfChord = scale(end, 0.5), a = len(halfChord);
  if (a <= tolerance) return undefined;
  const chordDirection = scale(halfChord, 1 / a);
  const midpoint = (a: Point, b: Point, c: Point, w: number) => scale(add(add(a, c), scale(b, 2 * w)), 0.5 / (1 + w));
  // Use the largest sagitta of the join and two span midpoints to condition the circle recovery.
  let along = 0, height = 0, sagitta = origin;
  for (const point of [join, midpoint(origin, p1, join, w1), midpoint(join, p3, end, w3)]) {
    const fromMid = sub(point, halfChord), x = dot(fromMid, chordDirection);
    const perpendicular = sub(fromMid, scale(chordDirection, x)), y = len(perpendicular);
    if (y > height) { along = x; height = y; sagitta = perpendicular; }
  }
  if (height <= tolerance) return undefined;
  const heightDirection = scale(sagitta, 1 / height), axis = unit(cross(heightDirection, chordDirection));
  const centreHeight = ((along - a) * (along + a) + height * height) / (2 * height);
  const rawAngle = 2 * Math.atan2(a, -centreHeight);

  const fit = (angle: number) => {
    const toCentre = sub(halfChord, scale(heightDirection, a / Math.tan(angle / 2)));
    const radial0 = scale(toCentre, -1), radius = len(radial0), tangent = unit(cross(axis, radial0));
    const relativeJoin = sub(join, toCentre), x = dot(relativeJoin, scale(radial0, 1 / radius)), y = dot(relativeJoin, tangent);
    const joinAngle = Math.atan2(y, x);
    if (!(joinAngle > 0 && joinAngle < angle)) return undefined;
    const radialJoin = scale(add(scale(radial0, x / radius), scale(tangent, y)), radius / Math.hypot(x, y));
    const commonJoin = add(toCentre, radialJoin);
    const joinCorrection = len(sub(join, commonJoin));
    const spanFits = (p0: Point, pole: Point, p2: Point, radialA: Point, radialB: Point, chord: number, turn: number, weight: number) => {
      // For a positive-weight quadratic, the projected radial cross derivative is a positive
      // combination of these three ordered crosses. This rules out a kink that reverses travel.
      const ra = sub(p0, toCentre), rm = sub(pole, toCentre), rb = sub(p2, toCentre);
      if (!(dot(axis, cross(ra, rm)) > 0 && dot(axis, cross(ra, rb)) > 0 && dot(axis, cross(rm, rb)) > 0)) return false;
      const canonicalWeight = Math.cos(turn / 2);
      const canonicalPole = add(toCentre, scale(add(radialA, radialB), 0.5 / (canonicalWeight * canonicalWeight)));
      const poleCorrection = Math.max(joinCorrection, len(sub(pole, canonicalPole)));
      // Rational weights are positive. The pole error is their convex average. B1 is at most 1/2,
      // and the canonical pole's distance to either endpoint is half the chord divided by its weight.
      const diameter = Math.max(chord, 0.5 * chord / canonicalWeight);
      const weightCorrection = 0.5 * Math.abs(weight - canonicalWeight) * diameter / Math.min(1, weight, canonicalWeight);
      return poleCorrection + weightCorrection <= tolerance;
    };
    if (!spanFits(origin, p1, join, radial0, radialJoin, len(commonJoin), joinAngle, w1)
      || !spanFits(join, p3, end, radialJoin, sub(end, toCentre), len(sub(end, commonJoin)), angle - joinAngle, w3)) return undefined;
    return { start, toCentre, tangent, radius, angle, tolerance };
  };
  // Preserve one output span for rounded quarter arcs. Both source spans must pass this fit too.
  return (rawAngle > Math.PI / 2 ? fit(Math.PI / 2) : undefined)
    ?? fit(Math.max(Math.PI / 6, Math.min(2 * Math.PI / 3, rawAngle)));
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

function linearSpan(start: Point, middle: Point, end: Point) {
  const chord = sub(end, start);
  return { length: len(chord), tangent: unit(chord), error: 0.5 * len(sub(sub(middle, start), scale(chord, 0.5))) };
}

function tangentMatches(line: ReturnType<typeof linearSpan>, tangent: Point, handle: Point, extent: number, tolerance: number) {
  const roundoff = 256 * Number.EPSILON * Math.max(1, extent) / Math.min(line.length, len(handle));
  const angleTolerance = Math.min(CadNumericPolicy.relativeComparison, roundoff);
  // Compare the authored and recovered tangents. Place the straight span in the same exact native frame as the bend.
  const directionError = len(sub(line.tangent, tangent));
  return directionError <= angleTolerance && len(sub(line.tangent, unit(handle))) <= angleTolerance
    && line.error + line.length * directionError <= tolerance;
}

function tangentLineArc(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 5 || weights[0] !== weights[1] || weights[1] !== weights[2]) return;
  const unsupported = () => refuse('CAPABILITY', 'Exact line-and-arc sweep needs a straight segment followed by one circular arc from 30° to 120°.');
  if (weights[4] !== weights[0] || knots[0] !== knots[2] || knots[3] !== knots[4] || knots[5] !== knots[7]
    || !(knots[2] < knots[3] && knots[4] < knots[5])) return unsupported();
  const [start, middle, join, arcPole, end] = poles;
  const tolerance = pathTolerance(path, refuse);
  const line = linearSpan(start, middle, join);
  if (line.length < ExtrudedProfileLimits.minimumLengthMM)
    return refuse('PARAMETER', 'Exact line-and-arc sweep needs a straight segment at least 0.0001 mm long.');
  if (line.error > tolerance) return unsupported();
  const arc = circularSpan(join, arcPole, end, weights[3] / weights[2], tolerance);
  if (!arc || joinedCircularSpans(path, tolerance)) return unsupported();
  if (!tangentMatches(line, arc.tangent, sub(arcPole, join), geometryScaleMM(poles), tolerance))
    return refuse('GEOMETRY', 'The exact line-and-arc sweep path must meet with a common forward tangent.');
  return { ...arc, length: line.length };
}

function tangentLineArcLine(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 7 || (weights[0] !== weights[1] && weights[5] !== weights[6])) return;
  const unsupported = () => refuse('CAPABILITY', 'Exact line-arc-line sweep needs a straight segment, one circular arc from 30° to 120°, and a straight segment.');
  const weight = weights[0];
  if (weights.some((value, i) => i !== 3 && value !== weight) || knots[0] !== knots[2] || knots[3] !== knots[4]
    || knots[5] !== knots[6] || knots[7] !== knots[9] || !(knots[2] < knots[3] && knots[4] < knots[5] && knots[6] < knots[7]))
    return unsupported();
  const [start, middle, join, arcPole, arcEnd, tailMiddle, end] = poles;
  const lead = linearSpan(start, middle, join), tail = linearSpan(arcEnd, tailMiddle, end);
  if (Math.min(lead.length, tail.length) < ExtrudedProfileLimits.minimumLengthMM)
    return refuse('PARAMETER', 'Exact line-arc-line sweep needs both straight segments at least 0.0001 mm long.');
  const tolerance = pathTolerance(path, refuse);
  if (lead.error > tolerance || tail.error > tolerance) return unsupported();
  const arc = circularSpan(join, arcPole, arcEnd, weights[3] / weight, tolerance);
  if (!arc) return unsupported();
  const { tangent, toCentre, angle } = arc;
  const inward = unit(sub(toCentre, scale(tangent, dot(toCentre, tangent))));
  const exit = unit(add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle))));
  const extent = geometryScaleMM(poles);
  if (!tangentMatches(lead, tangent, sub(arcPole, join), extent, tolerance)
    || !tangentMatches(tail, exit, sub(arcEnd, arcPole), extent, tolerance))
    return refuse('GEOMETRY', 'The exact line-arc-line sweep path must meet with a common forward tangent at both joins.');
  return { ...arc, length: lead.length, tailLength: tail.length };
}

type RationalBoundary = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;

/** Compare every coefficient of two half sections, including the canonical parameter direction. */
function sectionDirection(edge: Curve, boundary: RationalBoundary, tolerance: number): 1 | -1 | undefined {
  if (edge.degree !== boundary.degree || edge.knots.length !== boundary.knots.length
    || edge.controlPoints.length !== boundary.controlPoints.length || edge.weights.length !== boundary.weights.length) return;
  const [start, end] = curveDomain(edge);
  const same = (reverse: boolean) => edge.knots.every((knot, index) => knot === (reverse
    ? start + end - boundary.knots[boundary.knots.length - 1 - index] : boundary.knots[index]))
    && edge.weights.every((weight, index) => {
      const i = reverse ? edge.weights.length - 1 - index : index;
      return Math.abs(weight - boundary.weights[i]) <= 64 * Number.EPSILON
        && len(sub(edge.controlPoints[index], boundary.controlPoints[i])) <= tolerance;
    });
  const forward = same(false), reversed = same(true);
  if (forward !== reversed) return forward ? 1 : -1;
}

function diskBoundary(brep: Brep, name: string, centre: Point, normal: Point, tolerance: number) {
  const face = brep.faces.find(candidate => candidate.name === name);
  if (!face || face.loops.length !== 1 || face.surface.kind !== 'surface'
    || face.surface.controlPoints.flat().some(point => Math.abs(dot(sub(point, centre), normal)) > tolerance)) return;
  const plane = faceGeometry(face);
  // Reconstructing a normal subtracts world chart poles. A small cap at a large bend radius has a shorter lever arm.
  const grid = face.surface.controlPoints, first = grid[0][0];
  const span = Math.min(len(sub(grid[grid.length - 1][0], first)), len(sub(grid[0][grid[0].length - 1], first)));
  const angularRoundoff = Math.min(CadNumericPolicy.relativeComparison, Math.max(256 * Number.EPSILON, 2 * tolerance / span));
  if (plane.kind !== 'plane' || !(span > 0) || len(sub(plane.n, normal)) > angularRoundoff) return;
  const loop = brep.loops.find(candidate => candidate.id === face.loops[0]);
  if (loop?.kind !== 'outer' || loop.coedges.length !== 2) return;
  return loop.coedges.map(id => {
    const use = brep.coedges.find(candidate => candidate.id === id)!;
    return brep.edges.find(edge => edge.id === use.edge)!.curve;
  });
}

function glueDisk(a: Brep, aName: string, b: Brep, bName: string, centre: Point, normal: Point, tolerance: number,
  id: string): Brep | undefined {
  const first = diskBoundary(a, aName, centre, normal, tolerance), second = diskBoundary(b, bName, centre, scale(normal, -1), tolerance);
  if (!first || !second || !first.every(edge => second.filter(peer => sectionDirection(edge, peer, tolerance) !== undefined).length === 1)
    || !second.every(edge => first.filter(peer => sectionDirection(edge, peer, tolerance) !== undefined).length === 1)) return;
  return glueAtSharedFace(a, b, { family: 'sweep-curve', id }) ?? undefined;
}

function sectionBinding(edge: Curve, boundary: RationalBoundary, fixed: number, domain: readonly [number, number],
  varying: 'u' | 'v', tolerance: number): Curve | undefined {
  const direction = sectionDirection(edge, boundary, tolerance);
  if (direction === undefined) return;
  const [start, end] = curveDomain(edge), [first, last] = direction === 1 ? domain : [domain[1], domain[0]];
  const point = (at: number): Point => varying === 'u' ? [at, fixed, 0] : [fixed, at, 0];
  return { kind: 'curve', id: 'pcurve', degree: 1, knots: [start, start, end, end],
    controlPoints: [point(first), point(last)], weights: [1, 1] };
}

/** Bind the exact section isocurves to the final canonical edge directions after gluing. */
function bindBendSections(glued: Brep, id: string, hasTail: boolean, tolerance: number): Brep | undefined {
  const facesByLoop = new Map(glued.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
  const edges = new Map(glued.edges.map(edge => [edge.id, edge]));
  const uses = new Map(glued.coedges.map(use => [use.id, use]));
  const bindings = new Map<string, Curve>();
  let starts = 0, ends = 0;
  for (const use of glued.coedges) {
    const face = facesByLoop.get(use.loop), twin = use.twin ? uses.get(use.twin) : undefined;
    if (!face?.name?.startsWith(`${id}.bend.`) || !twin) continue;
    const other = facesByLoop.get(twin.loop);
    const atEnd = other?.name?.startsWith(`${id}.tail.`);
    if (!atEnd && !other?.name?.startsWith(`${id}.line.`)) continue;
    const surface = face.surface, edge = edges.get(use.edge);
    if (surface.kind !== 'surface' || !edge) return;
    const { u, v } = surfaceDomain(surface), row = atEnd ? surface.controlPoints.length - 1 : 0;
    const bendBinding = sectionBinding(edge.curve, { degree: surface.degreeV, knots: surface.knotsV,
      controlPoints: surface.controlPoints[row], weights: surface.weights[row] }, u[atEnd ? 1 : 0], v, 'v', tolerance);
    if (!bendBinding) return;
    bindings.set(use.id, bendBinding);
    if (atEnd) {
      const tail = other?.surface;
      if (tail?.kind !== 'surface') return;
      const { u: tailU, v: [tailStart] } = surfaceDomain(tail);
      const tailBinding = sectionBinding(edge.curve, { degree: tail.degreeU, knots: tail.knotsU,
        controlPoints: tail.controlPoints.map(row => row[0]), weights: tail.weights.map(row => row[0]) }, tailStart, tailU, 'u', tolerance);
      if (!tailBinding) return;
      bindings.set(twin.id, tailBinding);
      ends++;
    } else {
      if (!twin.pcurve) return;
      starts++;
    }
  }
  if (starts === 2 && ends === (hasTail ? 2 : 0)) return { ...glued, coedges: glued.coedges.map(use => {
    const pcurve = bindings.get(use.id);
    if (!pcurve) return use;
    const { id, edge, sense, loop, next, prev, twin } = use;
    return { id, edge, sense, loop, next, prev, twin, pcurve };
  }) };
}

/** Rotate the tail's section axes with the bend, retaining the same two rational half-disk seams. */
function bendEndFrame(dx: number, dy: number, radius: number, angle: number) {
  const centre: Point = [dx, dy, 0], radial = scale(centre, -1 / radius), forward: Point = [0, 0, 1];
  const axis = cross(radial, forward), c = Math.cos(angle), s = Math.sin(angle);
  const exitRadial = add(scale(radial, c), scale(forward, s));
  const exitTangent = add(scale(radial, -s), scale(forward, c));
  const rotate = (v: Point) => add(add(scale(exitRadial, dot(v, radial)), scale(axis, dot(v, axis))), scale(exitTangent, v[2]));
  const axes: SweepAxes = [rotate(identityAxes[0]), rotate(identityAxes[1]), exitTangent];
  return { axes, offset: add(centre, scale(exitRadial, radius)) };
}

type JoinedRail = NonNullable<ReturnType<typeof tangentLineArc>> & { tailLength?: number };
const sweepStyle = (rail: JoinedRail) => rail.tailLength === undefined ? 'line-and-arc' : 'line-arc-line';

function lineAndArcDisk(id: string, rail: JoinedRail, profileRadius: number,
  axes: SweepAxes, sideTags: SideTags | undefined, refuse: Refuse): SweepSolid {
  const { length, toCentre, radius, angle, tailLength, tolerance } = rail, [x, y] = axes;
  const style = sweepStyle(rail), hasTail = tailLength !== undefined;
  if (radius > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path radius must be at most 10000 mm.');
  const [dx, dy] = [dot(toCentre, x), dot(toCentre, y)];
  const localRadius = Math.hypot(dx, dy);
  const bendClearance = () => refuse('PARAMETER', `Exact ${hasTail ? 'line-arc-line ' : ''}sweep needs a path radius larger than the profile radius.`);
  if (!(localRadius - profileRadius > tolerance)) return bendClearance();
  const profile = [originDisk(profileRadius)];
  const prism = prismaticFromProfile({ outer: profile, from: -length, height: length, tag: `${id}.line`,
    names: { bottom: `${id}.start`, top: `${id}.junction` }, ...(sideTags ? { sideTags } : {}) });
  const straight = brepFromPrismatic(prism, { id: `${id}_line` });
  const revolve: RevolveInput = { id, profile, axis: { origin: [dx, dy], direction: [-dy, dx] },
    angle: angle * 180 / Math.PI, ...(sideTags ? { sideTags: sideTags.outer } : {}) };
  const arc = revolveSweepProfile(revolve, { minimum: tolerance, refuse: bendClearance });
  const renameSide = <T extends { name?: string }>(element: T): T => element.name === undefined ? element
    : { ...element, name: element.name.replaceAll(`${id}.side`, `${id}.bend.side`) };
  const bend = { ...arc, faces: arc.faces.map(renameSide), edges: arc.edges.map(renameSide) };

  // At the join both pieces use the same centred disk in z = 0. For the bend, z = ρ sin θ
  // is positive away from the join because ρ ≥ R − r > 0 and 0 < θ ≤ 120°. The straight piece stays at z ≤ 0.
  const roundoff = 128 * Number.EPSILON * Math.max(1, localRadius, profileRadius);
  const badJoint = () => refuse('GEOMETRY', `The exact ${style} sweep sections do not share the same disk.`);
  const firstJoin = glueDisk(straight, `${id}.junction`, bend, `${id}.start`, origin, identityAxes[2], roundoff, id);
  if (!firstJoin) return badJoint();
  let glued = firstJoin;
  let tailMass: ((density: number) => { props: MassProperties; axes: SweepAxes; offset: Point }) | undefined;
  if (hasTail) {
    const tailFrame = bendEndFrame(dx, dy, localRadius, revolve.angle * Math.PI / 180);
    const tailPrism = prismaticFromProfile({ outer: profile, height: tailLength, tag: `${id}.tail`,
      names: { bottom: `${id}.tail.junction`, top: `${id}.end` }, ...(sideTags ? { sideTags } : {}) });
    const tail = transformBrep(brepFromPrismatic(tailPrism, { id: `${id}_tail` }),
      { matrix: sweepMatrix(tailFrame.axes), offset: tailFrame.offset });
    // At the exit the bend lies behind the terminal tangent plane and the tail lies ahead.
    // For the lead versus the tail, the mid-angle tangent through the bend centre gives projections
    // −ρ sin(θ/2) − leadStation cos(θ/2) < 0 and ρ sin(θ/2) + tailStation cos(θ/2) > 0.
    // This also covers a long tail that crosses the lead's tangent plane when θ > 90°.
    const secondJoin = glueDisk(glued, `${id}.end`, tail, `${id}.tail.junction`,
      tailFrame.offset, tailFrame.axes[2], roundoff, id);
    if (!secondJoin) return badJoint();
    glued = secondJoin;
    tailMass = density => ({ props: prismaticMassProperties(tailPrism, density), ...tailFrame });
  }
  const brep = bindBendSections(glued, id, hasTail, roundoff);
  if (!brep || brep.faces.length !== (hasTail ? 8 : 6) || brep.faces.filter(face => face.name === `${id}.start`).length !== 1
    || brep.faces.filter(face => face.name === `${id}.end`).length !== 1)
    return refuse('GEOMETRY', `The exact ${style} sweep could not preserve the end caps and the tangent joins.`);
  return { brep, mass: density => {
    const parts = [
      { props: prismaticMassProperties(prism, density), axes: identityAxes, offset: origin },
      { props: revolveMassProperties(revolve, density), axes: identityAxes, offset: origin },
    ];
    if (tailMass) parts.push(tailMass(density));
    return combineMassProperties(parts);
  } };
}

/** Build a native solid by carrying a profile along a selected world-space path. */
export function exactSweep(input: ExactSweepInput, refuse: Refuse): SweepSolid {
  const { id, mode, outer, holes = [], path, xAxis, yAxis, sideTags } = input;
  const disk = circleOf(outer), profileRadius = disk && circleRadius(disk);
  if (profileRadius !== undefined && profileRadius < ExtrudedProfileLimits.minimumRadiusMM)
    return refuse('PARAMETER', `Exact sweep needs a profile radius of at least ${ExtrudedProfileLimits.minimumRadiusMM} mm.`);
  // The sketch axes set the profile's roll, independent of its location in the sketch plane.
  const frame = (tangent: Point): SweepAxes => {
    const project = (axis: Point) => sub(axis, scale(tangent, dot(axis, tangent)));
    const projectedX = project(xAxis);
    const x = unit(len(projectedX) < 1e-6 ? project(yAxis) : projectedX);
    return [x, cross(tangent, x), tangent];
  };
  const place = (local: SweepSolid, axes: SweepAxes, start: Point): SweepSolid => {
    const brep = transformBrep(local.brep, { matrix: sweepMatrix(axes), offset: start });
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

  const lineArc = tangentLineArcLine(path, refuse) ?? tangentLineArc(path, refuse);
  if (lineArc) {
    const style = sweepStyle(lineArc);
    if (profileRadius === undefined || holes.length)
      return refuse('CAPABILITY', `Exact ${style} sweep needs one circular disk section without holes.`);
    const axes = frame(lineArc.tangent);
    const result = place(lineAndArcDisk(id, lineArc, profileRadius, axes, sideTags, refuse), axes, lineArc.start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid) return refuse('GEOMETRY', `The exact ${style} sweep is not a valid closed solid: ${report.issues[0]}`);
    return result;
  }

  const hole = circularHole(holes, 'circular-arc', refuse);
  const { start, toCentre, tangent, radius, angle, tolerance } = circularPath(path, refuse);
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
