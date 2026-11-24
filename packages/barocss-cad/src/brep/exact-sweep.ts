import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { curveDomain, surfaceDomain, validateCurve } from '../core/math.js';
import type { SideTags } from '../document/side-names.js';
import { buildProfileLoop, ExtrudedProfileLimits, type ProfileSegment, type ProfileSegmentInput, type XY } from '../features/extruded-profile-solid.js';
import { brepFromPrismatic, prismaticFromProfile } from '../features/prismatic-solid.js';
import { revolveMassProperties, revolveProfile, revolveSweepProfile, type RevolveInput } from '../features/revolve.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import { BrepError, checkBrep, type Brep, type BrepCoedge } from './brep-core.js';
import { faceGeometry } from './analytic-boolean.js';
import { affinePlaneBinding } from './affine-plane-binding.js';
import { trimExactSweepOutlet } from './exact-sweep-outlet-trim.js';
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

/** Certify the ordered rational quadrants of a full circle without fitting or sampling the curve. */
function closedCircularPath(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 9) return;
  const unsupported = () => refuse('CAPABILITY', 'Exact closed-circle sweep needs one full circular path with four rational quarter spans.');
  const [first, second, third, fourth, last] = [knots[2], knots[3], knots[5], knots[7], knots[9]];
  if (knots[0] !== first || knots[4] !== second || knots[6] !== third || knots[8] !== fourth || knots[11] !== last
    || !(first < second && second < third && third < fourth && fourth < last)
    || weights.some((weight, index) => index % 2 === 0 && weight !== weights[0])) return unsupported();
  const tolerance = pathTolerance(path, refuse), [start] = poles;
  const relative = poles.map(pole => sub(pole, start));
  // A Sketch-derived Direct curve writes nine decimal places, including the final sin(2π) pole.
  const closureTolerance = Math.min(tolerance, 2e-9 + 128 * Number.EPSILON * Math.max(1, geometryScaleMM(poles)));
  const open = () => refuse('GEOMETRY', 'The exact closed-circle sweep path must close with a common forward tangent.');
  if (len(relative[8]) > closureTolerance) return open();

  // The first and third quadrant vertices are opposite on the diameter. Work relative to the first pole.
  const toCentre = scale(relative[4], 0.5), radial = scale(toCentre, -1), radius = len(radial);
  if (!(radius > tolerance)) return unsupported();
  const e0 = scale(radial, 1 / radius), side = sub(relative[2], toCentre);
  const transverse = sub(side, scale(e0, dot(side, e0)));
  if (!(len(transverse) > tolerance)) return unsupported();
  const tangent = unit(transverse), nextRadial = scale(tangent, radius);
  const quadrants = [radial, nextRadial, scale(radial, -1), scale(nextRadial, -1), radial];
  const angularTolerance = 4 * closureTolerance / radius;
  for (let turn = 0; turn < 4; turn++) {
    const i = 2 * turn, a = quadrants[turn], b = quadrants[turn + 1], weight = weights[i + 1] / weights[0];
    if (!(weight > 0 && weight < 1)) return unsupported();
    const poleError = Math.max(len(sub(sub(relative[i], toCentre), a)), len(sub(sub(relative[i + 1], toCentre), add(a, b))),
      len(sub(sub(relative[i + 2], toCentre), b)));
    // A positive rational span moves by at most the largest pole correction. For the weight correction,
    // B1(1−B1) ≤ 1/4, the denominators are ≥ (1+w)/2, and the tangent pole is within R of the chord.
    const weightError = radius * Math.abs(weight - Math.SQRT1_2) / ((1 + weight) * (1 + Math.SQRT1_2));
    if (poleError + weightError > tolerance) return unsupported();
    const departure = unit(sub(relative[i + 1], relative[i])), arrival = unit(sub(relative[i + 2], relative[i + 1]));
    // The canonical arrival is −a/R, also the next canonical departure, including at the closed seam.
    if (len(sub(departure, scale(b, 1 / radius))) > angularTolerance
      || len(add(arrival, scale(a, 1 / radius))) > angularTolerance) return open();
  }
  return { start, tangent, toCentre, radius, tolerance };
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

/** Reuse the certified line-and-arc rail with exact NURBS parameter reversal. */
function tangentArcLine(path: Curve, refuse: Refuse) {
  const { degree, controlPoints, weights, knots } = path;
  if (degree !== 2 || controlPoints.length !== 5 || weights[0] === weights[1]
    || weights[2] !== weights[3] || weights[3] !== weights[4]) return;
  const sum = knots[0] + knots[knots.length - 1];
  return tangentLineArc({ ...path, controlPoints: [...controlPoints].reverse(), weights: [...weights].reverse(),
    knots: [...knots].reverse().map(knot => sum - knot) }, refuse);
}

/** Keep the existing producer's diagnostics, but identify the authored rail order. */
function arcLineRefusal(refuse: Refuse): Refuse {
  return (code, message) => refuse(code, message.replaceAll('line-and-arc', 'arc-and-line')
    .replace('a straight segment followed by one circular arc from 30° to 120°',
      'one circular arc from 30° to 120° followed by one straight segment')
    .replace('Exact sweep needs a path radius larger', 'Exact arc-and-line sweep needs a path radius larger'));
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

type JoinedEdgeCount = 2 | 4 | 8 | 12;
type SharedSection = readonly [outerEdges: 2 | 4, innerEdges: 0 | 2 | 4, secondInnerEdges?: 4];

function sectionBoundary(brep: Brep, name: string, centre: Point, normal: Point, tolerance: number,
  [outerEdges, innerEdges, secondInnerEdges]: SharedSection) {
  const hasOpening = innerEdges > 0;
  const face = brep.faces.find(candidate => candidate.name === name);
  if (!face || face.loops.length !== (secondInnerEdges ? 3 : hasOpening ? 2 : 1) || face.surface.kind !== 'surface'
    || face.surface.controlPoints.flat().some(point => Math.abs(dot(sub(point, centre), normal)) > tolerance)) return;
  const plane = faceGeometry(face);
  // Reconstructing a normal subtracts world chart poles. A small cap at a large bend radius has a shorter lever arm.
  const grid = face.surface.controlPoints, first = grid[0][0];
  const span = Math.min(len(sub(grid[grid.length - 1][0], first)), len(sub(grid[0][grid[0].length - 1], first)));
  const angularRoundoff = Math.min(CadNumericPolicy.relativeComparison, Math.max(256 * Number.EPSILON, 2 * tolerance / span));
  if (plane.kind !== 'plane' || !(span > 0) || len(sub(plane.n, normal)) > angularRoundoff) return;
  const loops = face.loops.map(id => brep.loops.find(candidate => candidate.id === id));
  const outer = loops.find(loop => loop?.kind === 'outer'), inner = loops.filter(loop => loop?.kind === 'inner');
  if (outer?.coedges.length !== outerEdges || inner.length !== (secondInnerEdges ? 2 : hasOpening ? 1 : 0)
    || inner.some((loop, index) => loop?.coedges.length !== (index ? secondInnerEdges : innerEdges))) return;
  const curves = (coedges: readonly string[]) => coedges.map(id => {
    const use = brep.coedges.find(candidate => candidate.id === id)!;
    return brep.edges.find(edge => edge.id === use.edge)!.curve;
  });
  return { outer: curves(outer.coedges), inner: inner.map(loop => curves(loop!.coedges)) };
}

function glueSection(a: Brep, aName: string, b: Brep, bName: string, centre: Point, normal: Point, tolerance: number,
  section: SharedSection, id: string): Brep | undefined {
  const first = sectionBoundary(a, aName, centre, normal, tolerance, section);
  const second = sectionBoundary(b, bName, centre, scale(normal, -1), tolerance, section);
  const uniqueMatches = (from: readonly Curve[], to: readonly Curve[]) =>
    from.every(edge => to.filter(peer => sectionDirection(edge, peer, tolerance) !== undefined).length === 1);
  const innerMatches = (from: readonly Curve[][], to: readonly Curve[][]) => from.every(loop =>
    to.filter(peer => uniqueMatches(loop, peer) && uniqueMatches(peer, loop)).length === 1);
  if (!first || !second || !uniqueMatches(first.outer, second.outer) || !uniqueMatches(second.outer, first.outer)
    || !innerMatches(first.inner, second.inner) || !innerMatches(second.inner, first.inner)) return;
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

function ringChartEdge(edge: Curve, surface: Surface, tolerance: number) {
  const { u, v } = surfaceDomain(surface), grid = surface.controlPoints;
  const matches: { side: string; pcurve: Curve }[] = [];
  for (const end of [0, 1]) {
    const row = end ? grid.length - 1 : 0, col = end ? grid[0].length - 1 : 0;
    const vBinding = sectionBinding(edge, { degree: surface.degreeV, knots: surface.knotsV,
      controlPoints: grid[row], weights: surface.weights[row] }, u[end], v, 'v', tolerance);
    if (vBinding) matches.push({ side: `u${end}`, pcurve: vBinding });
    const uBinding = sectionBinding(edge, { degree: surface.degreeU, knots: surface.knotsU,
      controlPoints: grid.map(row => row[col]), weights: surface.weights.map(row => row[col]) }, v[end], u, 'u', tolerance);
    if (uBinding) matches.push({ side: `v${end}`, pcurve: uBinding });
  }
  if (matches.length === 1) return matches[0];
}

/** Attach each ring coedge to exactly one isocurve of its own revolved patch. */
function bindClosedRing(brep: Brep, tolerance: number, shellCount: 1 | 2): Brep | undefined {
  if (brep.bodies.length !== 1 || brep.shells.length !== shellCount
    || brep.shells.some(shell => !shell.closed || shell.faces.length !== 4)
    || brep.faces.length !== 4 * shellCount || brep.coedges.length !== 16 * shellCount) return;
  const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const bound = new Set<string>(), coedges: BrepCoedge[] = [];
  for (const { id, edge, sense, loop, next, prev, twin } of brep.coedges) {
    const face = facesByLoop.get(loop), curve = edges.get(edge)?.curve;
    if (!face || face.surface.kind !== 'surface' || !curve) return;
    const match = ringChartEdge(curve, face.surface, tolerance);
    if (!match || bound.has(`${face.id}/${match.side}`)) return;
    bound.add(`${face.id}/${match.side}`);
    coedges.push({ id, edge, sense, loop, next, prev, twin, pcurve: match.pcurve });
  }
  return { ...brep, coedges };
}

/** Map a trimmed line or rational circle into the rectangle ring's affine planar wall chart. */
function closedRectanglePlaneBinding(edge: Curve, surface: Surface, tolerance: number): Curve | undefined {
  if (surface.degreeU !== 1 || surface.degreeV !== 1 || surface.controlPoints.length !== 2
    || surface.controlPoints[0].length !== 2 || surface.weights.some(row => row.some(weight => weight !== surface.weights[0][0]))) return;
  const [[o, pv], [pu, puv]] = surface.controlPoints, a = sub(pu, o), b = sub(pv, o);
  if (len(sub(sub(puv, pv), a)) > tolerance) return;
  const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), determinant = aa * bb - ab * ab;
  if (!(determinant > 256 * Number.EPSILON * aa * bb)) return;
  const { u, v } = surfaceDomain(surface), controlPoints: Point[] = [];
  const uvTolerance = tolerance / Math.sqrt(Math.min(aa, bb));
  for (const point of edge.controlPoints) {
    const q = sub(point, o), aq = dot(a, q), bq = dot(b, q);
    const x = (bb * aq - ab * bq) / determinant, y = (aa * bq - ab * aq) / determinant;
    if (!(x >= -uvTolerance && x <= 1 + uvTolerance && y >= -uvTolerance && y <= 1 + uvTolerance)
      || len(sub(q, add(scale(a, x), scale(b, y)))) > tolerance) return;
    controlPoints.push([u[0] + x * (u[1] - u[0]), v[0] + y * (v[1] - v[0]), 0]);
  }
  return { ...edge, id: 'pcurve', controlPoints };
}

/** Preserve both canonical edge charts on the four annular half-walls and four cylinder half-walls. */
function bindClosedRectangle(brep: Brep, tolerance: number, shellCount: 1 | 2 | 3): Brep | undefined {
  if (brep.bodies.length !== 1 || brep.shells.length !== shellCount
    || brep.shells.some(shell => !shell.closed || shell.faces.length !== 8)
    || brep.faces.length !== 8 * shellCount || brep.coedges.length !== 32 * shellCount) return;
  const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge])), bound = new Set<string>(), coedges: BrepCoedge[] = [];
  for (const { id, edge, sense, loop, next, prev, twin } of brep.coedges) {
    const face = facesByLoop.get(loop), curve = edges.get(edge)?.curve;
    if (!face || face.surface.kind !== 'surface' || !curve) return;
    const planar = faceGeometry(face).kind === 'plane';
    const match = planar ? undefined : ringChartEdge(curve, face.surface, tolerance);
    const pcurve = planar ? closedRectanglePlaneBinding(curve, face.surface, tolerance) : match?.pcurve;
    if (!pcurve || match && bound.has(`${face.id}/${match.side}`)) return;
    if (match) bound.add(`${face.id}/${match.side}`);
    coedges.push({ id, edge, sense, loop, next, prev, twin, pcurve });
  }
  return { ...brep, coedges };
}

/** Bind the exact section isocurves to the final canonical edge directions after gluing. */
function bindBendSections(glued: Brep, id: string, hasTail: boolean, edgeCount: number, tolerance: number, hasBore = false): Brep | undefined {
  const facesByLoop = new Map(glued.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
  const edges = new Map(glued.edges.map(edge => [edge.id, edge]));
  const uses = new Map(glued.coedges.map(use => [use.id, use]));
  const bindings = new Map<string, Curve>();
  const starts = edgeCount === 12 ? [0, 0, 0] : [0, 0], ends = [...starts];
  for (const use of glued.coedges) {
    const face = facesByLoop.get(use.loop), twin = use.twin ? uses.get(use.twin) : undefined;
    if (!face?.name?.startsWith(`${id}.bend.`) || !twin) continue;
    const other = facesByLoop.get(twin.loop);
    const atCap = !hasTail && edgeCount !== 2 && other?.name === `${id}.end`;
    const atEnd = atCap || other?.name?.startsWith(`${id}.tail.`);
    if (!atEnd && !other?.name?.startsWith(`${id}.line.`)) continue;
    const surface = face.surface, edge = edges.get(use.edge);
    if (surface.kind !== 'surface' || !edge) return;
    const bore = surface.id.startsWith(`${id}_hole`);
    const peer = other?.surface;
    const peerPrefix = `${id}_${atEnd ? 'tail' : 'line'}_w0_0_`;
    const peerInner = peer?.id.startsWith(peerPrefix) && !peer.id.startsWith(`${peerPrefix}0_`);
    if (peer?.kind !== 'surface' || (!atCap && bore !== peerInner)) return;
    const group = edgeCount === 12 ? surface.id.startsWith(`${id}_hole0_`) ? 1
      : surface.id.startsWith(`${id}_hole1_`) ? 2 : 0 : bore ? 1 : 0;
    if (edgeCount === 12 && !atCap && !peer.id.startsWith(`${peerPrefix}${group}_`)) return;
    const { u, v } = surfaceDomain(surface), row = atEnd ? surface.controlPoints.length - 1 : 0;
    const bendBinding = edgeCount !== 2 && surface.degreeU === 1 ? affinePlaneBinding(edge.curve, surface, tolerance)
      : sectionBinding(edge.curve, { degree: surface.degreeV, knots: surface.knotsV,
        controlPoints: surface.controlPoints[row], weights: surface.weights[row] }, u[atEnd ? 1 : 0], v, 'v', tolerance);
    if (!bendBinding) return;
    bindings.set(use.id, bendBinding);
    // Without a tail the terminal rectangle trims one affine cap chart, including its opening.
    if (atCap) {
      const capBinding = affinePlaneBinding(edge.curve, peer, tolerance);
      if (!capBinding) return;
      bindings.set(twin.id, capBinding);
    } else {
      const peerBinding = ringChartEdge(edge.curve, peer, tolerance);
      if (peerBinding?.side !== (atEnd ? 'v0' : 'v1')) return;
      bindings.set(twin.id, peerBinding.pcurve);
    }
    (atEnd ? ends : starts)[group]++;
  }
  const outerCount = edgeCount >= 8 ? 4 : edgeCount, innerCount = hasBore ? 2 : edgeCount >= 8 ? edgeCount - 4 : 0;
  const bindEnd = hasTail || edgeCount !== 2;
  const matched = edgeCount === 12 ? starts.every(count => count === 4) && ends.every(count => count === 4)
    : starts[0] === outerCount && starts[1] === innerCount
      && ends[0] === (bindEnd ? outerCount : 0) && ends[1] === (bindEnd ? innerCount : 0);
  if (matched) return { ...glued, coedges: glued.coedges.map(use => {
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
const joinedStyle = (rail: JoinedRail, edgeCount: JoinedEdgeCount) =>
  edgeCount >= 8 ? 'rectangular duct' : edgeCount === 4 ? 'rectangular elbow' : sweepStyle(rail);

interface RectangularOpening {
  profile: readonly ProfileSegmentInput[];
  clearance: number;
}

interface JoinedSection {
  profile: readonly ProfileSegmentInput[];
  opening?: RectangularOpening;
  apertures?: { profiles: PairedRectangularProfiles; clearance: number };
  bendCentre: XY;
  radialReach: number;
  extent: number;
  edgeCount: JoinedEdgeCount;
}

/** Read the canonical CCW rectangle in sketch coordinates and centre it on the rail. */
function rectangleSection(outer: ExactSweepInput['outer']) {
  if (outer.length !== 4 || outer.some(segment => segment.kind !== 'line')) return;
  const [[x0, y0], [x1, low], [right, y1], [left, high]] = outer.map(({ start }) => start);
  if (!(x0 < x1 && y0 < y1 && low === y0 && right === x1 && left === x0 && high === y1)) return;
  const halfX = (x1 - x0) / 2, halfY = (y1 - y0) / 2;
  const corners: XY[] = [[-halfX, -halfY], [halfX, -halfY], [halfX, halfY], [-halfX, halfY]];
  const profile: ProfileSegmentInput[] = corners.map(start => ({ kind: 'line', start }));
  return { profile, halfX, halfY, min: [x0, y0] as XY, max: [x1, y1] as XY };
}

const ductWallError = (refuse: Refuse) =>
  refuse('GEOMETRY', 'Exact rectangular duct sweep needs strictly positive wall clearance around the opening.');

/** Keep the authored order and winding so the two producers agree on the opening's side tags. */
function rectangularOpening(rectangle: NonNullable<ReturnType<typeof rectangleSection>>,
  holes: NonNullable<ExactSweepInput['holes']>, tolerance: number, refuse: Refuse): RectangularOpening {
  const unsupported = () => refuse('CAPABILITY', 'Exact rectangular duct sweep needs one centered rectangular opening aligned with the outer rectangle.');
  const hole = holes[0];
  if (holes.length !== 1 || hole.length !== 4 || hole.some(segment => segment.kind !== 'line')) return unsupported();
  const points = hole.map(segment => segment.start);
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = points;
  const minX = Math.min(x0, x1, x2, x3), maxX = Math.max(x0, x1, x2, x3);
  const minY = Math.min(y0, y1, y2, y3), maxY = Math.max(y0, y1, y2, y3);
  if (maxX - minX < ExtrudedProfileLimits.minimumLengthMM || maxY - minY < ExtrudedProfileLimits.minimumLengthMM) return unsupported();
  const corners = points.map(([x, y]): XY => [
    x === minX ? -1 : x === maxX ? 1 : 0,
    y === minY ? -1 : y === maxY ? 1 : 0,
  ]);
  if (new Set(corners.map(([x, y]) => 2 * x + y)).size !== 4 || corners.some(([x, y], i) => {
    const [nextX, nextY] = corners[(i + 1) % 4];
    return !x || !y || (x === nextX) === (y === nextY);
  })) return unsupported();
  const { min, max } = rectangle;
  const clearance = Math.min(minX - min[0], max[0] - maxX, minY - min[1], max[1] - maxY);
  if (!(clearance > 10 * tolerance)) return ductWallError(refuse);
  const roundoff = 8 * Number.EPSILON * Math.max(1, geometryScaleMM([min, max], points));
  if (Math.abs((minX + maxX) - (min[0] + max[0])) > roundoff
    || Math.abs((minY + maxY) - (min[1] + max[1])) > roundoff) return unsupported();
  const halfX = (maxX - minX) / 2, halfY = (maxY - minY) / 2;
  return {
    profile: corners.map(([x, y]) => ({ kind: 'line', start: [x * halfX, y * halfY] })),
    clearance: Math.min(clearance, rectangle.halfX - halfX, rectangle.halfY - halfY),
  };
}

type PairedRectangularProfiles = readonly [readonly ProfileSegmentInput[], readonly ProfileSegmentInput[]];

/** Two bores share the radial centre and retain their separate authored axial offsets. */
function pairedRectangularApertures(rectangle: NonNullable<ReturnType<typeof rectangleSection>>,
  holes: NonNullable<ExactSweepInput['holes']>, section: JoinedSection, tolerance: number, refuse: Refuse,
  style = 'closed-circle rectangular'): { profiles: PairedRectangularProfiles; clearance: number } {
  const unsupported = () => refuse('CAPABILITY', `Exact ${style} sweep needs two axis-aligned rectangular cavities.`);
  if (holes.length !== 2) return unsupported();
  const radial = section.bendCentre[0] !== 0 ? 0 : 1, axial = 1 - radial;
  const { min, max, halfX, halfY } = rectangle, center: XY = [(min[0] + max[0]) / 2, (min[1] + max[1]) / 2];
  const profiles: ProfileSegmentInput[][] = [], intervals: [number, number][] = [];
  let roundoff = 0, clearance = Infinity;
  for (const hole of holes) {
    if (hole.length !== 4 || hole.some(segment => segment.kind !== 'line')) return unsupported();
    const points = hole.map(segment => segment.start), [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = points;
    const low: XY = [Math.min(x0, x1, x2, x3), Math.min(y0, y1, y2, y3)];
    const high: XY = [Math.max(x0, x1, x2, x3), Math.max(y0, y1, y2, y3)];
    if (high[0] - low[0] < ExtrudedProfileLimits.minimumLengthMM || high[1] - low[1] < ExtrudedProfileLimits.minimumLengthMM) return unsupported();
    const corners = points.map(([x, y]): XY => [x === low[0] ? -1 : x === high[0] ? 1 : 0, y === low[1] ? -1 : y === high[1] ? 1 : 0]);
    if (new Set(corners.map(([x, y]) => 2 * x + y)).size !== 4 || corners.some(([x, y], i) => {
      const next = corners[(i + 1) % 4]; return !x || !y || (x === next[0]) === (y === next[1]);
    })) return unsupported();
    const margin = 8 * Number.EPSILON * Math.max(1, geometryScaleMM([min, max], points));
    roundoff = Math.max(roundoff, margin);
    if (Math.abs((low[radial] + high[radial]) - (min[radial] + max[radial])) > margin)
      return refuse('GEOMETRY', `Exact ${style} sweep needs both cavities centered on the radial axis.`);
    const profile: ProfileSegmentInput[] = points.map(([x, y]) => ({ kind: 'line', start: [x - center[0], y - center[1]] }));
    const cover = Math.min(low[0] - min[0], max[0] - high[0], low[1] - min[1], max[1] - high[1],
      low[0] - center[0] + halfX, halfX - (high[0] - center[0]), low[1] - center[1] + halfY, halfY - (high[1] - center[1]));
    if (!(cover > 10 * tolerance + 2 * margin))
      return refuse('GEOMETRY', `Exact ${style} sweep needs strictly positive cover around each cavity.`);
    clearance = Math.min(clearance, cover);
    profiles.push(profile);
    intervals.push([low[axial] - center[axial], high[axial] - center[axial]]);
  }
  const [first, second] = intervals[0][0] <= intervals[1][0] ? intervals : [intervals[1], intervals[0]];
  const web = second[0] - first[1];
  if (!(web > 10 * tolerance + 2 * roundoff))
    return refuse('GEOMETRY', `Exact ${style} sweep needs strictly positive axial web clearance between the cavities.`);
  return { profiles: [profiles[0], profiles[1]], clearance: Math.min(clearance, web) };
}

/** A canonical bend frame can keep the section's roll only along the radial and binormal directions. */
function rectangularElbowSection(rectangle: NonNullable<ReturnType<typeof rectangleSection>>,
  holes: NonNullable<ExactSweepInput['holes']>, axes: SweepAxes,
  rail: Pick<JoinedRail, 'toCentre' | 'radius' | 'tolerance'>, refuse: Refuse,
  style = holes.length ? 'rectangular duct' : 'rectangular elbow'): { section: JoinedSection; axes: SweepAxes } {
  const [x, y, tangent] = axes, { toCentre, radius, tolerance } = rail, { halfX, halfY, profile } = rectangle;
  const inward = unit(sub(toCentre, scale(tangent, dot(toCentre, tangent))));
  const signX = Math.sign(dot(inward, x)), signY = Math.sign(dot(inward, y));
  const radialX = scale(inward, signX), radialY = scale(inward, signY);
  const alignment = Math.min(CadNumericPolicy.relativeComparison, tolerance / Math.hypot(halfX, halfY));
  const opening = holes.length ? rectangularOpening(rectangle, holes, tolerance, refuse) : undefined;
  const common = { profile, opening, extent: Math.max(halfX, halfY), edgeCount: opening ? 8 as const : 4 as const };
  if (len(sub(x, radialX)) <= alignment) return {
    axes: [radialX, unit(cross(tangent, radialX)), tangent],
    section: { ...common, bendCentre: [signX * radius, 0], radialReach: halfX },
  };
  if (len(sub(y, radialY)) <= alignment) return {
    axes: [unit(cross(radialY, tangent)), radialY, tangent],
    section: { ...common, bendCentre: [0, signY * radius], radialReach: halfY },
  };
  return refuse('CAPABILITY', `Exact ${style} sweep needs the rectangle's original axes aligned to the bend radial and binormal.`);
}

function closedRectangularRing(id: string, section: JoinedSection, tolerance: number, sideTags: SideTags | undefined, refuse: Refuse,
  cavities?: PairedRectangularProfiles): SweepSolid {
  const { profile, opening, bendCentre: [dx, dy], radialReach, extent } = section, radius = Math.hypot(dx, dy);
  const clearance = () => refuse('PARAMETER', 'Exact closed-circle rectangular sweep needs radial half-width smaller than the path radius.');
  if (!(radius - radialReach > tolerance)) return clearance();
  const holes = cavities ?? (opening ? [opening.profile] : undefined);
  const revolve: RevolveInput = { id, profile, axis: { origin: [dx, dy], direction: [-dy, dx] }, angle: 360, sideTags: sideTags?.outer,
    ...(holes ? { holes, holeTags: sideTags?.holes } : {}) };
  const ring = revolveSweepProfile(revolve, { minimum: tolerance, refuse: clearance });
  const brep = bindClosedRectangle(ring, 128 * Number.EPSILON * Math.max(1, radius + extent), cavities ? 3 : opening ? 2 : 1);
  if (!brep) return refuse('GEOMETRY', 'The exact closed-circle rectangular sweep could not bind the native ring seams.');
  return { brep, mass: density => revolveMassProperties(revolve, density) };
}

/** Carry the authored roll to the reversed producer, rather than projecting it at the last tangent. */
function rectangularArcLineSection(rectangle: NonNullable<ReturnType<typeof rectangleSection>>,
  holes: NonNullable<ExactSweepInput['holes']>, rail: JoinedRail, frame: (tangent: Point) => SweepAxes,
  sideTags: SideTags | undefined, refuse: Refuse) {
  const { tangent, toCentre, radius, angle } = rail, c = Math.cos(angle), s = Math.sin(angle);
  const inward = unit(sub(toCentre, scale(tangent, dot(toCentre, tangent))));
  const firstTangent = scale(add(scale(tangent, c), scale(inward, s)), -1);
  const firstInward = sub(scale(inward, c), scale(tangent, s));
  const paired = holes.length > 1;
  const authored = rectangularElbowSection(rectangle, paired ? [] : holes, frame(firstTangent),
    { ...rail, toCentre: scale(firstInward, radius) }, refuse, 'rectangular arc-and-line');
  if (paired) authored.section = { ...authored.section, edgeCount: 12,
    apertures: pairedRectangularApertures(rectangle, holes, authored.section, rail.tolerance, refuse, 'arc-and-line rectangular') };
  const axis = unit(cross(firstTangent, firstInward));
  const rotate = (v: Point) => add(add(scale(v, c), scale(cross(axis, v), s)), scale(axis, dot(axis, v) * (1 - c)));
  const axes: SweepAxes = [rotate(authored.axes[0]), scale(rotate(authored.axes[1]), -1), tangent];
  // A y reflection restores a right-handed frame. Reverse the edges too, keeping each loop's winding.
  const reflect = (loop: readonly ProfileSegmentInput[]): ProfileSegmentInput[] =>
    [loop[0], loop[3], loop[2], loop[1]].map(({ start: [x, y] }) => ({ kind: 'line', start: [x, -y] }));
  const apertures = authored.section.apertures;
  const section: JoinedSection = { ...authored.section, profile: reflect(authored.section.profile),
    bendCentre: [authored.section.bendCentre[0], -authored.section.bendCentre[1]],
    ...(authored.section.opening ? { opening: { profile: reflect(authored.section.opening.profile), clearance: authored.section.opening.clearance } } : {}),
    ...(apertures ? { apertures: { profiles: [reflect(apertures.profiles[0]), reflect(apertures.profiles[1])] as const,
      clearance: apertures.clearance } } : {}) };
  // Private producer tags also preserve positional side names when the document has no authored tags.
  const outerTags = ['arcLineOuter0', 'arcLineOuter1', 'arcLineOuter2', 'arcLineOuter3'];
  const holeTags = ['arcLineHole0', 'arcLineHole1', 'arcLineHole2', 'arcLineHole3'];
  const secondHoleTags = ['arcLineHole1_0', 'arcLineHole1_1', 'arcLineHole1_2', 'arcLineHole1_3'];
  const names = new Map<string, string>();
  for (let i = 0; i < 4; i++) {
    names.set(`.side[${outerTags[i]}]`, sideTags ? `.side[${sideTags.outer[i]}]` : `.side${i}`);
    const own = sideTags?.holes?.[0];
    names.set(`.side[${holeTags[i]}]`, own ? `.side[${own[i]}]` : `.hole0.side${i}`);
    if (paired) {
      const secondOwn = sideTags?.holes?.[1];
      names.set(`.side[${secondHoleTags[i]}]`, secondOwn ? `.side[${secondOwn[i]}]` : `.hole1.side${i}`);
    }
  }
  const tags: SideTags = { outer: [...outerTags].reverse(), ...(apertures
    ? { holes: [[...holeTags].reverse(), [...secondHoleTags].reverse()] } : section.opening ? { holes: [[...holeTags].reverse()] } : {}) };
  return { axes, section, tags, names };
}

/** The generic gluer matches all loops together. Keep those loops apart at its native matching tolerance. */
function jointWallClear(a: Brep, b: Brep, wall: number, roundoff: number): boolean {
  let vertexTolerance = 0;
  for (const piece of [a, b]) for (const vertex of piece.vertices) vertexTolerance = Math.max(vertexTolerance, vertex.tolerance);
  return wall > 10 * vertexTolerance + 2 * roundoff;
}

function lineAndArcSweep(id: string, rail: JoinedRail, section: JoinedSection,
  bore: Circle | undefined, sideTags: SideTags | undefined, refuse: Refuse): SweepSolid {
  const { length, radius, angle, tailLength, tolerance } = rail;
  const { profile, opening, apertures, edgeCount, radialReach, extent, bendCentre: [dx, dy] } = section;
  const rectangle = edgeCount !== 2, style = joinedStyle(rail, edgeCount), hasTail = tailLength !== undefined;
  if (radius > CadNumericPolicy.coordinateAbs) return refuse('PARAMETER', 'Exact sweep path radius must be at most 10000 mm.');
  const localRadius = Math.hypot(dx, dy);
  const bendClearance = () => refuse('PARAMETER', rectangle ? `Exact ${style} sweep needs radial half-width smaller than the path radius.`
    : `Exact ${hasTail ? 'line-arc-line ' : ''}sweep needs a path radius larger than the profile radius.`);
  if (!(localRadius - radialReach > tolerance)) return bendClearance();
  const wall = apertures?.clearance ?? opening?.clearance ?? (bore ? radialReach - circleRadius(bore) : undefined);
  const wallError = () => apertures ? refuse('GEOMETRY', `Exact ${sweepStyle(rail)} rectangular sweep needs strictly positive cover and axial web clearance between its apertures.`) : opening ? ductWallError(refuse)
    : refuse('GEOMETRY', `Exact ${style} sweep needs strictly positive wall clearance around the bore.`);
  if (wall !== undefined && !(wall > 10 * tolerance)) return wallError();
  const holes = apertures?.profiles ?? (opening ? [opening.profile] : bore ? [[bore]] : undefined);
  const prismSection = { outer: profile, holes, sideTags };
  const prism = prismaticFromProfile({ ...prismSection, from: -length, height: length, tag: `${id}.line`,
    names: { bottom: `${id}.start`, top: `${id}.junction` } });
  const straight = brepFromPrismatic(prism, { id: `${id}_line` });
  const revolve: RevolveInput = { id, profile, axis: { origin: [dx, dy], direction: [-dy, dx] },
    angle: angle * 180 / Math.PI, holes, sideTags: sideTags?.outer, holeTags: sideTags?.holes };
  const arc = revolveSweepProfile(revolve, { minimum: tolerance, refuse: bendClearance });
  const renameSide = <T extends { name?: string }>(element: T): T => element.name === undefined ? element
    : { ...element, name: element.name.replaceAll(`${id}.side`, `${id}.bend.side`)
      .replaceAll(`${id}_hole0.side`, `${id}.bend.hole0.side`).replaceAll(`${id}_hole1.side`, `${id}.bend.hole1.side`) };
  const bend = { ...arc, faces: arc.faces.map(renameSide), edges: arc.edges.map(renameSide) };

  // Both join sections lie in z = 0. The bend has z = ρ sin θ, positive away from the join because the entire
  // section has ρ > 0 and 0 < θ ≤ 120°. The straight piece stays at z ≤ 0.
  const roundoff = 128 * Number.EPSILON * Math.max(1, localRadius, extent);
  const boundary = apertures ? 'outer rectangle and both apertures' : opening ? 'outer rectangle and opening' : rectangle ? 'rectangle' : bore ? 'annulus' : 'disk';
  const badJoint = () => refuse('GEOMETRY', `The exact ${style} sweep sections do not share the same ${boundary}.`);
  const sharedSection: SharedSection = edgeCount === 12 ? [4, 4, 4] : edgeCount === 8 ? [4, 4] : [edgeCount, bore ? 2 : 0];
  if (wall !== undefined && !jointWallClear(straight, bend, wall, roundoff)) return wallError();
  const firstJoin = glueSection(straight, `${id}.junction`, bend, `${id}.start`, origin, identityAxes[2], roundoff, sharedSection, id);
  if (!firstJoin) return badJoint();
  let glued = firstJoin;
  let tailMass: ((density: number) => { props: MassProperties; axes: SweepAxes; offset: Point }) | undefined;
  if (hasTail) {
    const tailFrame = bendEndFrame(dx, dy, localRadius, revolve.angle * Math.PI / 180);
    const tailPrism = prismaticFromProfile({ ...prismSection, height: tailLength, tag: `${id}.tail`,
      names: { bottom: `${id}.tail.junction`, top: `${id}.end` } });
    const tail = transformBrep(brepFromPrismatic(tailPrism, { id: `${id}_tail` }),
      { matrix: sweepMatrix(tailFrame.axes), offset: tailFrame.offset });
    // At the exit the bend lies behind the terminal tangent plane and the tail lies ahead.
    // For the lead versus the tail, the mid-angle tangent through the bend centre gives projections
    // −ρ sin(θ/2) − leadStation cos(θ/2) < 0 and ρ sin(θ/2) + tailStation cos(θ/2) > 0.
    // This also covers a long tail that crosses the lead's tangent plane when θ > 90°.
    if (wall !== undefined && !jointWallClear(glued, tail, wall, roundoff)) return wallError();
    const secondJoin = glueSection(glued, `${id}.end`, tail, `${id}.tail.junction`,
      tailFrame.offset, tailFrame.axes[2], roundoff, sharedSection, id);
    if (!secondJoin) return badJoint();
    glued = secondJoin;
    tailMass = density => ({ props: prismaticMassProperties(tailPrism, density), ...tailFrame });
  }
  const brep = bindBendSections(glued, id, hasTail, edgeCount, roundoff, bore !== undefined);
  const hasCap = (end: 'start' | 'end') => brep?.faces.filter(face => face.name === `${id}.${end}`
    && face.loops.length === (apertures ? 3 : opening || bore ? 2 : 1)).length === 1;
  if (!brep || brep.faces.length !== (hasTail ? 3 : 2) * (edgeCount + (bore ? 2 : 0)) + 2 || !hasCap('start') || !hasCap('end'))
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

/** Recover two separate circular carriers with one planar, forward tangent join. */
function tangentArcPair(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 5 || weights[0] !== weights[2] || weights[2] !== weights[4]
    || !(weights[1] < weights[0] && weights[3] < weights[0]) || knots[0] !== knots[2] || knots[3] !== knots[4]
    || knots[5] !== knots[7] || !(knots[2] < knots[3] && knots[4] < knots[5])) return;
  const [start, leadPole, join, tailPole, end] = poles, tolerance = pathTolerance(path, refuse);
  const first = circularSpan(start, leadPole, join, weights[1] / weights[0], tolerance);
  const second = circularSpan(join, tailPole, end, weights[3] / weights[0], tolerance);
  if (!first || !second || joinedCircularSpans(path, tolerance)) return;
  const inward = (arc: typeof first) => unit(sub(arc.toCentre, scale(arc.tangent, dot(arc.toCentre, arc.tangent))));
  const n = inward(first), c = Math.cos(first.angle), s = Math.sin(first.angle);
  const forward = add(scale(first.tangent, c), scale(n, s)), turned = add(scale(n, c), scale(first.tangent, -s));
  const secondInward = inward(second);
  const turn: 1 | -1 = dot(turned, secondInward) > 0 ? 1 : -1;
  // Keep a true single carrier on the existing one-arc path, including its total-angle limit.
  if (turn === 1 && Math.abs(first.radius - second.radius) <= tolerance) return;
  const lead = sub(join, leadPole), tail = sub(tailPole, join);
  const roundoff = 256 * Number.EPSILON * Math.max(1, geometryScaleMM(poles), first.radius, second.radius);
  const angular = Math.min(CadNumericPolicy.relativeComparison, roundoff / Math.min(len(lead), len(tail)));
  if ([unit(lead), unit(tail), second.tangent].some(tangent => len(sub(forward, tangent)) > angular))
    return refuse('GEOMETRY', 'The exact two-arc sweep path must meet with a common forward tangent.');
  const inwardError = len(sub(scale(turned, turn), secondInward));
  if (inwardError > angular || 2 * second.radius * (inwardError + len(sub(forward, second.tangent))) > tolerance)
    return refuse('CAPABILITY', 'Exact two-arc sweep needs two coplanar circular arcs.');
  return { first, second, turn };
}

/** Read two coplanar circular spans with one forward tangent quadratic straight span between them. */
function tangentArcLineArc(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 7 || weights[0] === weights[1] || weights[5] === weights[6]
    || weights[2] !== weights[3] || weights[3] !== weights[4]) return;
  const unsupported = () => refuse('CAPABILITY',
    'Exact arc-line-arc sweep needs two coplanar circular arcs separated by one straight segment.');
  const weight = weights[0];
  if (weights.some((value, index) => index !== 1 && index !== 5 && value !== weight)
    || knots[0] !== knots[2] || knots[3] !== knots[4] || knots[5] !== knots[6] || knots[7] !== knots[9]
    || !(knots[2] < knots[3] && knots[4] < knots[5] && knots[6] < knots[7])) return unsupported();
  const [start, firstPole, firstEnd, middle, secondStart, secondPole, end] = poles;
  const tolerance = pathTolerance(path, refuse), line = linearSpan(firstEnd, middle, secondStart);
  if (line.length < ExtrudedProfileLimits.minimumLengthMM)
    return refuse('PARAMETER', 'Exact arc-line-arc sweep needs a straight segment at least 0.0001 mm long.');
  if (line.error > tolerance) return unsupported();
  const first = circularSpan(start, firstPole, firstEnd, weights[1] / weight, tolerance);
  const second = circularSpan(secondStart, secondPole, end, weights[5] / weight, tolerance);
  if (!first || !second) return unsupported();
  const inward = (arc: typeof first) => unit(sub(arc.toCentre, scale(arc.tangent, dot(arc.toCentre, arc.tangent))));
  const n = inward(first), c = Math.cos(first.angle), s = Math.sin(first.angle);
  const forward = add(scale(first.tangent, c), scale(n, s)), turned = add(scale(n, c), scale(first.tangent, -s));
  const extent = geometryScaleMM(poles);
  if (!tangentMatches(line, forward, sub(firstEnd, firstPole), extent, tolerance)
    || !tangentMatches(line, second.tangent, sub(secondPole, secondStart), extent, tolerance))
    return refuse('GEOMETRY', 'The exact arc-line-arc sweep path must meet with a common forward tangent at both joins.');
  const roundoff = 256 * Number.EPSILON * Math.max(1, extent, first.radius, second.radius);
  const angular = Math.min(CadNumericPolicy.relativeComparison,
    roundoff / Math.min(line.length, len(sub(firstEnd, firstPole)), len(sub(secondPole, secondStart))));
  const secondInward = inward(second), turn: 1 | -1 = dot(turned, secondInward) > 0 ? 1 : -1;
  const inwardError = len(sub(scale(turned, turn), secondInward));
  if (inwardError > angular || 2 * second.radius * (inwardError + len(sub(forward, second.tangent))) > tolerance)
    return unsupported();
  return { first, second, turn, length: line.length };
}

/** Reserve the explicit leading-line/spaced-arc pattern without changing circular or unmatched nine-pole routes. */
function tangentLineArcLineArc(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 9 || weights.length !== 9 || knots.length !== 12
    || weights.some((weight, index) => index !== 3 && index !== 7 && weight !== weights[0])
    || !(weights[3] > 0 && weights[3] < weights[0] && weights[7] > 0 && weights[7] < weights[0])
    || knots[0] !== knots[1] || knots[1] !== knots[2] || knots[3] !== knots[4] || knots[5] !== knots[6]
    || knots[7] !== knots[8] || knots[9] !== knots[10] || knots[10] !== knots[11]
    || !(knots[2] < knots[3] && knots[4] < knots[5] && knots[6] < knots[7] && knots[8] < knots[9])) return;
  const unsupported = () => refuse('CAPABILITY', 'Exact line-arc-line-arc sweep needs a straight lead followed by two coplanar circular arcs separated by one straight segment.');
  const tolerance = pathTolerance(path, refuse), lead = linearSpan(poles[0], poles[1], poles[2]);
  if (lead.length < ExtrudedProfileLimits.minimumLengthMM)
    return refuse('PARAMETER', 'Exact line-arc-line-arc sweep needs a leading straight segment at least 0.0001 mm long.');
  if (lead.error > tolerance) return unsupported();
  const railRefuse: Refuse = (code, message) => refuse(code, message.replaceAll('arc-line-arc', 'line-arc-line-arc')
    .replace('both joins', 'all three joins'));
  const spaced = tangentArcLineArc({ ...path, controlPoints: poles.slice(2), weights: weights.slice(2),
    knots: [knots[3], ...knots.slice(3)] }, railRefuse);
  if (!spaced) return unsupported();
  if (!tangentMatches(lead, spaced.first.tangent, sub(poles[3], poles[2]), geometryScaleMM(poles), tolerance))
    return refuse('GEOMETRY', 'The exact line-arc-line-arc sweep path must meet with a common forward tangent at all three joins.');
  return { ...spaced, leadLength: lead.length };
}

/** Keep the five-span diagnostics distinct while reusing the certified shorter producers. */
function fiveSpanRefusal(refuse: Refuse): Refuse {
  return (code, message) => refuse(code, message.replace(/line-arc-line-arc|arc-line-arc/g, 'line-arc-line-arc-line')
    .replace(/all three joins|both joins/g, 'all four joins'));
}

/** Recognize only the explicit quadratic lead/bend/spacer/opposite-bend/outlet family. */
function tangentLineArcLineArcLine(path: Curve, refuse: Refuse) {
  const { degree, controlPoints: poles, weights, knots } = path;
  if (degree !== 2 || poles.length !== 11 || weights[1] !== weights[0]) return;
  const unsupported = () => refuse('CAPABILITY', 'Exact line-arc-line-arc-line sweep needs a straight lead, two opposite-turn coplanar circular arcs separated by one straight segment, and a straight outlet.');
  if (weights.length !== 11 || knots.length !== 14
    || weights.some((weight, index) => index !== 3 && index !== 7 && weight !== weights[0])
    || !(weights[3] > 0 && weights[3] < weights[0] && weights[7] > 0 && weights[7] < weights[0])
    || knots[9] !== knots[10] || knots[11] !== knots[12] || knots[12] !== knots[13]
    || !(knots[10] < knots[11])) return unsupported();
  const tolerance = pathTolerance(path, refuse), tail = linearSpan(poles[8], poles[9], poles[10]);
  if (tail.length < ExtrudedProfileLimits.minimumLengthMM)
    return refuse('PARAMETER', 'Exact line-arc-line-arc-line sweep needs an outlet straight segment at least 0.0001 mm long.');
  if (tail.error > tolerance) return unsupported();
  const leading = tangentLineArcLineArc({ ...path, controlPoints: poles.slice(0, 9), weights: weights.slice(0, 9),
    knots: [...knots.slice(0, 11), knots[10]] }, fiveSpanRefusal(refuse));
  if (!leading || leading.turn !== -1) return unsupported();
  const { second } = leading;
  const inward = unit(sub(second.toCentre, scale(second.tangent, dot(second.toCentre, second.tangent))));
  const terminal = add(scale(second.tangent, Math.cos(second.angle)), scale(inward, Math.sin(second.angle)));
  if (!tangentMatches(tail, terminal, sub(poles[8], poles[7]), geometryScaleMM(poles), tolerance))
    return refuse('GEOMETRY', 'The exact line-arc-line-arc-line sweep path must meet with a common forward tangent at all four joins.');
  return { ...leading, tailLength: tail.length };
}

function concentricBore(disk: Circle, hole: Circle, refuse: Refuse, style = 'two-arc'): Circle {
  const [x, y] = hole.center;
  const roundoff = 128 * Number.EPSILON * Math.max(1, geometryScaleMM([disk.center, hole.center]));
  if (Math.hypot(x - disk.center[0], y - disk.center[1]) > roundoff)
    return refuse('GEOMETRY', `Exact ${style} sweep needs the bore concentric with the outer circle.`);
  return { ...hole, center: [0, 0], start: [hole.start[0] - x, hole.start[1] - y] };
}

/** Bind each shared section edge on both native bend charts, including planar rectangle walls. */
function bindArcPairJoin(brep: Brep, id: string, tolerance: number, apertureCount: number, edgeCount: 2 | 4): Brep | undefined {
  const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge])), uses = new Map(brep.coedges.map(use => [use.id, use]));
  const coedges: BrepCoedge[] = [];
  const lead = Array<number>(apertureCount + 1).fill(0), tail = [...lead];
  for (const use of brep.coedges) {
    const face = facesByLoop.get(use.loop), twin = use.twin ? uses.get(use.twin) : undefined;
    const other = twin && facesByLoop.get(twin.loop);
    const first = face?.name?.startsWith(`${id}.first.`), second = face?.name?.startsWith(`${id}.second.`);
    const across = first && other?.name?.startsWith(`${id}.second.`) || second && other?.name?.startsWith(`${id}.first.`);
    if (!across) { coedges.push(use); continue; }
    const surface = face?.surface, peer = other?.surface, edge = edges.get(use.edge);
    if (surface?.kind !== 'surface' || peer?.kind !== 'surface' || !edge) return;
    // Revolve retains each aperture's chart IDs even when authored tags replace display names.
    const lane = (surfaceId: string, piece: string) => {
      for (let index = 0; index < apertureCount; index++)
        if (surfaceId.startsWith(`${id}_${piece}_hole${index}_`)) return index + 1;
      return 0;
    };
    const ring = lane(surface.id, first ? 'first' : 'second');
    if (ring !== lane(peer.id, first ? 'second' : 'first')) return;
    const expected = first ? 'u1' : 'u0';
    let binding: Curve | undefined;
    if (edgeCount === 4 && surface.degreeU === 1) binding = affinePlaneBinding(edge.curve, surface, tolerance);
    else {
      const match = ringChartEdge(edge.curve, surface, tolerance);
      if (match?.side === expected) binding = match.pcurve;
    }
    if (!binding) return;
    const { id: useId, edge: edgeId, sense, loop, next, prev, twin: twinId } = use;
    coedges.push({ id: useId, edge: edgeId, sense, loop, next, prev, twin: twinId, pcurve: binding });
    (first ? lead : tail)[ring]++;
  }
  if (lead.every(count => count === edgeCount) && tail.every(count => count === edgeCount)) return { ...brep, coedges };
}

/** Rebind both joins on the native bend and prism charts, including affine rectangle walls. */
function bindArcLineArcJoins(brep: Brep, id: string, tolerance: number, apertureCount: number, edgeCount: 2 | 4, withLead = false, withTail = false): Brep | undefined {
  const facesByLoop = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge])), uses = new Map(brep.coedges.map(use => [use.id, use]));
  const coedges: BrepCoedge[] = [];
  const first = Array<number>(apertureCount + 1).fill(0), second = [...first], lead = [...first], tail = [...first];
  for (const use of brep.coedges) {
    const face = facesByLoop.get(use.loop), twin = use.twin ? uses.get(use.twin) : undefined;
    const other = twin && facesByLoop.get(twin.loop);
    const onLead = withLead && face?.name?.startsWith(`${id}.lead.`), peerLead = withLead && other?.name?.startsWith(`${id}.lead.`);
    const onTail = withTail && face?.name?.startsWith(`${id}.tail.`), peerTail = withTail && other?.name?.startsWith(`${id}.tail.`);
    const line = face?.name?.startsWith(`${id}.line.`), otherLine = other?.name?.startsWith(`${id}.line.`);
    const atLead = onLead && other?.name?.startsWith(`${id}.first.`) || peerLead && face?.name?.startsWith(`${id}.first.`);
    const atFirst = line && other?.name?.startsWith(`${id}.first.`) || otherLine && face?.name?.startsWith(`${id}.first.`);
    const atSecond = line && other?.name?.startsWith(`${id}.second.`) || otherLine && face?.name?.startsWith(`${id}.second.`);
    const atTail = onTail && other?.name?.startsWith(`${id}.second.`) || peerTail && face?.name?.startsWith(`${id}.second.`);
    if (!atLead && !atFirst && !atSecond && !atTail) { coedges.push(use); continue; }
    const onLine = atLead ? onLead : atTail ? onTail : line, peerLine = atLead ? peerLead : atTail ? peerTail : otherLine;
    const surface = face?.surface, peer = other?.surface, edge = edges.get(use.edge);
    if (surface?.kind !== 'surface' || peer?.kind !== 'surface' || !edge) return;
    // Producer IDs keep each aperture's lane even when authored tags replace display names.
    const lane = (surfaceId: string, line: boolean | undefined) => {
      for (let index = 0; index < apertureCount; index++)
        if (surfaceId.startsWith(line ? `${id}_${atLead ? 'lead' : atTail ? 'tail' : 'line'}_w0_0_${index + 1}_`
          : `${id}_${atSecond || atTail ? 'second' : 'first'}_hole${index}_`)) return index + 1;
      return 0;
    };
    const ring = lane(surface.id, onLine);
    if (ring !== lane(peer.id, peerLine)) return;
    let binding: Curve | undefined;
    if (edgeCount === 4 && !onLine && surface.degreeU === 1) binding = affinePlaneBinding(edge.curve, surface, tolerance);
    else {
      const match = ringChartEdge(edge.curve, surface, tolerance);
      const expected = onLine ? atFirst || atTail ? 'v0' : 'v1' : atFirst || atTail ? 'u1' : 'u0';
      if (match?.side === expected) binding = match.pcurve;
    }
    if (!binding) return;
    const { id: useId, edge: edgeId, sense, loop, next, prev, twin: twinId } = use;
    coedges.push({ id: useId, edge: edgeId, sense, loop, next, prev, twin: twinId, pcurve: binding });
    (atLead ? lead : atTail ? tail : atFirst ? first : second)[ring]++;
  }
  if (first.every(count => count === 2 * edgeCount) && second.every(count => count === 2 * edgeCount)
    && (!withLead || lead.every(count => count === 2 * edgeCount))
    && (!withTail || tail.every(count => count === 2 * edgeCount)))
    return { ...brep, coedges };
}

function arcPairSweep(id: string, arcs: NonNullable<ReturnType<typeof tangentArcPair>> & { length?: number }, section: JoinedSection,
  bore: Circle | undefined, tags: SideTags | undefined, refuse: Refuse): SweepSolid {
  const { first, second, turn, length } = arcs, { profile, opening, apertures, radialReach, extent, edgeCount, bendCentre: [dx, dy] } = section;
  const rectangle = edgeCount !== 2, hasOpening = opening !== undefined || bore !== undefined;
  const hasLine = length !== undefined, style = hasLine ? 'arc-line-arc' : 'two-arc';
  if (Math.max(first.radius, second.radius) > CadNumericPolicy.coordinateAbs)
    return refuse('PARAMETER', 'Exact sweep path radius must be at most 10000 mm.');
  const radius = Math.hypot(dx, dy);
  // The transported frame keeps the first center on its local ray. Same-turn keeps it; an S-bend reverses it.
  const ratio = turn * second.radius / radius, sx = dx * ratio, sy = dy * ratio;
  const clearance = () => refuse('PARAMETER', rectangle
    ? `Exact rectangular ${style} sweep needs radial half-width smaller than both path radii.`
    : `Exact ${style} sweep needs both path radii larger than the profile radius.`);
  if (!(Math.min(radius, Math.hypot(sx, sy)) - radialReach > first.tolerance)) return clearance();
  const wall = apertures?.clearance ?? opening?.clearance ?? (bore ? radialReach - circleRadius(bore) : undefined);
  const wallError = () => apertures ? refuse('GEOMETRY', `Exact ${style} rectangular sweep needs strictly positive cover and axial web clearance between its apertures.`) : opening ? ductWallError(refuse)
    : refuse('GEOMETRY', 'Exact two-arc sweep needs strictly positive wall clearance around the bore.');
  if (wall !== undefined && !(wall > 10 * first.tolerance)) return wallError();
  const holes = apertures?.profiles ?? (opening ? [opening.profile] : bore ? [[bore]] : undefined);
  const bend = (piece: string, angle: number, bx: number, by: number, cap: 'start' | 'end') => {
    const part = `${id}_${piece}`, label = `${id}.${piece}`;
    const input: RevolveInput = { id: part, profile, angle: angle * 180 / Math.PI, axis: { origin: [bx, by], direction: [-by, bx] },
      sideTags: tags?.outer, holes, holeTags: tags?.holes };
    const original = revolveSweepProfile(input, { minimum: first.tolerance, refuse: clearance });
    const rename = <T extends { name?: string }>(element: T): T => element.name === undefined ? element
      : { ...element, name: element.name.replaceAll(`${part}.`, `${label}.`).replaceAll(`${part}_hole0.`, `${label}.hole0.`)
        .replaceAll(`${part}_hole1.`, `${label}.hole1.`)
        .replaceAll(`${label}.${cap}`, `${id}.${cap}`) };
    return { input, brep: { ...original, faces: original.faces.map(rename), edges: original.edges.map(rename) } };
  };
  const a = bend('first', first.angle, dx, dy, 'start'), b = bend('second', second.angle, sx, sy, 'end');
  const join = bendEndFrame(dx, dy, radius, a.input.angle * Math.PI / 180);
  const secondFrame = { axes: join.axes, offset: hasLine ? add(join.offset, scale(join.axes[2], length)) : join.offset };
  const placed = transformBrep(b.brep, { matrix: sweepMatrix(secondFrame.axes), offset: secondFrame.offset });
  const roundoff = 128 * Number.EPSILON * Math.max(1, radius, second.radius, extent, length ?? 0);
  if (wall !== undefined && !jointWallClear(a.brep, placed, wall, roundoff)) return wallError();
  // At distance theta from the join, the signed projection along its tangent is +/−rho sin(theta).
  // Both rhos are positive, and each angle is at most 120°, so only the common cap can touch, for either turn.
  const sharedSection: SharedSection = apertures ? [4, 4, 4] : [rectangle ? 4 : 2, opening ? 4 : bore ? 2 : 0];
  let lead: Brep = a.brep;
  let lineMass: ((density: number) => MassProperties) | undefined;
  if (hasLine) {
    const prism = prismaticFromProfile({ outer: profile, holes,
      height: length, tag: `${id}.line`, sideTags: tags,
      names: { bottom: `${id}.line.start`, top: `${id}.line.end` } });
    const straight = transformBrep(brepFromPrismatic(prism, { id: `${id}_line` }),
      { matrix: sweepMatrix(join.axes), offset: join.offset });
    if (wall !== undefined && !jointWallClear(lead, straight, wall, roundoff)) return wallError();
    // The first bend stays behind its exit tangent plane; the straight occupies the slab between both joins.
    const glued = glueSection(lead, `${id}.first.end`, straight, `${id}.line.start`, join.offset, join.axes[2], roundoff, sharedSection, id);
    if (!glued) return refuse('GEOMETRY', `The exact arc-line-arc sweep sections do not share the same ${opening ? 'outer rectangle and opening' : rectangle ? 'rectangle' : bore ? 'annulus' : 'disk'}.`);
    lead = glued;
    lineMass = density => prismaticMassProperties(prism, density);
  }
  if (hasLine && wall !== undefined && !jointWallClear(lead, placed, wall, roundoff)) return wallError();
  // With a straight span, the second bend is wholly ahead of its start plane, apart from its shared cap.
  const glued = glueSection(lead, hasLine ? `${id}.line.end` : `${id}.first.end`, placed, `${id}.second.start`,
    secondFrame.offset, secondFrame.axes[2], roundoff, sharedSection, id);
  if (!glued) return refuse('GEOMETRY', `The exact ${style} sweep sections do not share the same ${opening ? 'outer rectangle and opening' : rectangle ? 'rectangle' : bore ? 'annulus' : 'disk'}.`);
  const brep = hasLine ? bindArcLineArcJoins(glued, id, roundoff, apertures ? 2 : hasOpening ? 1 : 0, rectangle ? 4 : 2)
    : bindArcPairJoin(glued, id, roundoff, apertures ? 2 : hasOpening ? 1 : 0, rectangle ? 4 : 2);
  const hasCap = (end: 'start' | 'end') =>
    brep?.faces.some(face => face.name === `${id}.${end}` && face.loops.length === (apertures ? 3 : hasOpening ? 2 : 1));
  if (!brep || brep.faces.length !== (hasLine ? 3 : 2) * (rectangle ? edgeCount : bore ? 4 : 2) + 2 || !hasCap('start') || !hasCap('end'))
    return refuse('GEOMETRY', hasLine ? 'The exact arc-line-arc sweep could not preserve the end caps and both tangent joins.'
      : 'The exact two-arc sweep could not preserve the end caps and the tangent join.');
  return { brep, mass: density => {
    const parts: { props: MassProperties; axes: SweepAxes; offset: Point }[] = [
      { props: revolveMassProperties(a.input, density), axes: identityAxes, offset: origin },
      { props: revolveMassProperties(b.input, density), ...secondFrame },
    ];
    if (lineMass) parts.push({ props: lineMass(density), ...join });
    return combineMassProperties(parts);
  } };
}

/** Add one certified original inlet without changing the existing three-piece producer. */
function leadingSpacedArcSweep(id: string, rail: NonNullable<ReturnType<typeof tangentLineArcLineArc>>, section: JoinedSection,
  tags: SideTags | undefined, refuse: Refuse): SweepSolid {
  const { first, second, length, leadLength } = rail, { apertures, radialReach, extent } = section;
  const roundoff = 128 * Number.EPSILON * Math.max(1, first.radius, second.radius, extent, length, leadLength);
  const half = first.angle / 2;
  // Project onto the first bend's half-angle tangent through its center. The lead's maximum is
  // -(R1-h)sin(half). On a same-turn second bend the projection is (R1-R2)sin(half)+Lcos(half)
  // +(R2-q)sin(half+beta). Here |q|<=h and 0<half+beta<=pi, whose sine minimum is at an endpoint.
  // The spacer is separately ahead of this plane and the first bend shares only the lead's cap.
  // For opposite turns, the second center projects to (R1+R2)sin(half)+Lcos(half).
  // Since sin(beta-half)>=-sin(half) for 0<=beta<=120 degrees and 15<=half<=60 degrees,
  // its entire section projects no lower than (R1-h)sin(half)+Lcos(half).
  const leadUpper = -(first.radius - radialReach) * Math.sin(half);
  const secondLower = rail.turn === 1 ? (first.radius - second.radius) * Math.sin(half) + length * Math.cos(half)
    + (second.radius - radialReach) * Math.min(Math.sin(half), Math.sin(half + second.angle))
    : (first.radius - radialReach) * Math.sin(half) + length * Math.cos(half);
  if (!(secondLower - leadUpper > 10 * first.tolerance + 2 * roundoff))
    return refuse('GEOMETRY', 'Exact line-arc-line-arc sweep cannot certify separation of the inlet and second bend.');
  const existing = arcPairSweep(id, rail, section, undefined, tags, refuse);
  const prism = prismaticFromProfile({ outer: section.profile, holes: apertures!.profiles, sideTags: tags,
    from: -leadLength, height: leadLength, tag: `${id}.lead`, names: { bottom: `${id}.start`, top: `${id}.lead.end` } });
  const lead = brepFromPrismatic(prism, { id: `${id}_lead` });
  if (!jointWallClear(lead, existing.brep, apertures!.clearance, roundoff))
    return refuse('GEOMETRY', 'Exact line-arc-line-arc rectangular sweep needs strictly positive cover and axial web clearance between its apertures.');
  const glued = glueSection(lead, `${id}.lead.end`, existing.brep, `${id}.start`, origin, identityAxes[2], roundoff, [4, 4, 4], id);
  const brep = glued && bindArcLineArcJoins(glued, id, roundoff, 2, 4, true);
  if (!brep || brep.faces.length !== 50 || brep.loops.length !== 54 || brep.coedges.length !== 216
    || brep.edges.length !== 108 || brep.vertices.length !== 60
    || ['start', 'end'].some(end => brep.faces.filter(face => face.name === `${id}.${end}` && face.loops.length === 3).length !== 1))
    return refuse('GEOMETRY', 'The exact line-arc-line-arc sweep could not preserve both mouths and all three tangent joins.');
  return { brep, mass: density => combineMassProperties([
    { props: prismaticMassProperties(prism, density), axes: identityAxes, offset: origin },
    { props: existing.mass(density), axes: identityAxes, offset: origin },
  ]) };
}

/** Append one original outlet after an opposite-turn pair, with separate nonadjacent-piece certificates. */
function endedSpacedArcSweep(id: string, rail: NonNullable<ReturnType<typeof tangentLineArcLineArcLine>>, section: JoinedSection,
  tags: SideTags | undefined, refuse: Refuse): SweepSolid {
  const { first, second, length, leadLength, tailLength } = rail, { radialReach: h, extent, bendCentre: [dx, dy], apertures } = section;
  const roundoff = 128 * Number.EPSILON * Math.max(1, first.radius, second.radius, extent, length, leadLength, tailLength);
  const supportGap = (radius: number, angle: number) => 2 * (radius - h) * Math.sin(angle / 2) + length * Math.cos(angle / 2);
  // The first half-angle plane separates inlet from second bend. Reversing travel gives the
  // second half-angle plane separating outlet from first bend (and its adjacent spacer).
  // For the two straight ends use the larger bend's plane: if alpha>=beta, the outlet's
  // forward projection is cos(alpha/2-beta)>=cos(alpha/2)>=1/2. Otherwise reverse the argument.
  // Thus neither arbitrarily long straight end can close either strictly positive support gap.
  if (!(Math.min(supportGap(first.radius, first.angle), supportGap(second.radius, second.angle))
    > 10 * first.tolerance + 2 * roundoff))
    return refuse('GEOMETRY', 'Exact line-arc-line-arc-line sweep cannot certify separation of both straight ends and the retained bends.');
  const existing = leadingSpacedArcSweep(id, rail, section, tags, fiveSpanRefusal(refuse));
  const radius = Math.hypot(dx, dy), join = bendEndFrame(dx, dy, radius, first.angle);
  const ratio = -second.radius / radius;
  const end = bendEndFrame(dx * ratio, dy * ratio, second.radius, second.angle);
  const rotate = (v: Point) => add(add(scale(join.axes[0], v[0]), scale(join.axes[1], v[1])), scale(join.axes[2], v[2]));
  const axes: SweepAxes = [rotate(end.axes[0]), rotate(end.axes[1]), rotate(end.axes[2])];
  const offset = add(add(join.offset, scale(join.axes[2], length)), rotate(end.offset));
  const prism = prismaticFromProfile({ outer: section.profile, holes: apertures!.profiles, sideTags: tags,
    height: tailLength, tag: `${id}.tail`, names: { bottom: `${id}.tail.start`, top: `${id}.end` } });
  const tail = transformBrep(brepFromPrismatic(prism, { id: `${id}_tail` }), { matrix: sweepMatrix(axes), offset });
  if (!jointWallClear(existing.brep, tail, apertures!.clearance, roundoff))
    return refuse('GEOMETRY', 'Exact line-arc-line-arc-line rectangular sweep needs strictly positive cover and axial web clearance between its apertures.');
  const glued = glueSection(existing.brep, `${id}.end`, tail, `${id}.tail.start`, offset, axes[2], roundoff, [4, 4, 4], id);
  const brep = glued && bindArcLineArcJoins(glued, id, roundoff, 2, 4, true, true);
  if (!brep || brep.faces.length !== 62 || brep.loops.length !== 66 || brep.coedges.length !== 264
    || brep.edges.length !== 132 || brep.vertices.length !== 72
    || ['start', 'end'].some(cap => brep.faces.filter(face => face.name === `${id}.${cap}` && face.loops.length === 3).length !== 1))
    return refuse('GEOMETRY', 'The exact line-arc-line-arc-line sweep could not preserve both mouths and all four tangent joins.');
  return { brep, mass: density => combineMassProperties([
    { props: existing.mass(density), axes: identityAxes, offset: origin },
    { props: prismaticMassProperties(prism, density), axes, offset },
  ]) };
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

  const ended = tangentLineArcLineArcLine(path, refuse);
  const leading = ended ?? tangentLineArcLineArc(path, refuse);
  if (leading) {
    const style = ended ? 'line-arc-line-arc-line' : 'line-arc-line-arc';
    const rectangle = profileRadius === undefined ? rectangleSection(outer) : undefined;
    if (!rectangle || holes.length !== 2)
      return refuse('CAPABILITY', `Exact ${style} sweep needs two bend-aligned rectangular passages.`);
    const joined = rectangularElbowSection(rectangle, [], frame(leading.first.tangent), leading.first, refuse, `${style} rectangular`);
    const section: JoinedSection = { ...joined.section, edgeCount: 12,
      apertures: pairedRectangularApertures(rectangle, holes, joined.section, leading.first.tolerance, refuse, `${style} rectangular`) };
    const result = place(ended ? endedSpacedArcSweep(id, ended, section, sideTags, refuse)
      : leadingSpacedArcSweep(id, leading, section, sideTags, refuse), joined.axes, leading.first.start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].shells !== 1 || report.topology[0].genus !== 2)
      return refuse('GEOMETRY', `The exact ${style} sweep did not produce one valid solid with both through passages.`);
    return result;
  }

  const closed = closedCircularPath(path, refuse);
  if (closed) {
    const rectangle = profileRadius === undefined ? rectangleSection(outer) : undefined;
    if (rectangle) {
      if (closed.radius > CadNumericPolicy.coordinateAbs)
        return refuse('PARAMETER', 'Exact closed-circle sweep path radius must be at most 10000 mm.');
      const paired = holes.length > 1;
      const { section, axes } = rectangularElbowSection(rectangle, paired ? [] : holes, frame(closed.tangent), closed, refuse, 'closed-circle rectangular');
      const cavities = paired ? pairedRectangularApertures(rectangle, holes, section, closed.tolerance, refuse).profiles : undefined;
      const result = place(closedRectangularRing(id, section, closed.tolerance, sideTags, refuse, cavities), axes, closed.start);
      const report = checkBrep(result.brep, { strict: true }), shellCount = cavities ? 3 : section.opening ? 2 : 1;
      if (!report.valid || report.topology.length !== 1 || report.topology[0].shells !== shellCount || report.topology[0].genus !== shellCount)
        return refuse('GEOMETRY', 'The exact closed-circle rectangular sweep did not produce one valid closed ring.');
      return result;
    }
    if (profileRadius === undefined)
      return refuse('CAPABILITY', 'Exact closed-circle sweep needs one circular disk or one bend-aligned rectangular section.');
    const hole = circularHole(holes, 'closed-circle', refuse);
    const bore = hole && concentricBore(disk!, hole, refuse, 'closed-circle');
    const { start, tangent, toCentre, radius, tolerance } = closed;
    if (radius > CadNumericPolicy.coordinateAbs)
      return refuse('PARAMETER', 'Exact closed-circle sweep path radius must be at most 10000 mm.');
    const axes = frame(tangent), [x, y] = axes;
    const [dx, dy] = [dot(toCentre, x), dot(toCentre, y)], localRadius = Math.hypot(dx, dy);
    const clearance = () => refuse('PARAMETER', 'Exact closed-circle sweep needs a path radius larger than the profile radius.');
    if (!(localRadius - profileRadius > tolerance)) return clearance();
    if (bore && !(profileRadius - circleRadius(bore) > 10 * tolerance))
      return refuse('GEOMETRY', 'Exact closed-circle sweep needs strictly positive wall clearance around the bore.');
    const revolve: RevolveInput = { id, profile: [originDisk(profileRadius)], axis: { origin: [dx, dy], direction: [-dy, dx] },
      angle: 360, ...(sideTags ? { sideTags: sideTags.outer } : {}),
      ...(bore ? { holes: [[bore]], holeTags: sideTags?.holes } : {}) };
    const ring = revolveSweepProfile(revolve, { minimum: tolerance, refuse: clearance });
    const shellCount = bore ? 2 : 1;
    const brep = bindClosedRing(ring, 128 * Number.EPSILON * Math.max(1, localRadius + profileRadius), shellCount);
    if (!brep) return refuse('GEOMETRY', 'The exact closed-circle sweep could not bind the native ring seams.');
    const result = place({ brep, mass: density => revolveMassProperties(revolve, density) }, axes, start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].shells !== shellCount || report.topology[0].genus !== shellCount)
      return refuse('GEOMETRY', 'The exact closed-circle sweep did not produce one valid closed ring.');
    return result;
  }

  const arcLineRefuse = arcLineRefusal(refuse), arcLine = tangentArcLine(path, arcLineRefuse);
  if (arcLine) {
    const rectangle = profileRadius === undefined ? rectangleSection(outer) : undefined;
    if (!rectangle && profileRadius === undefined)
      return refuse('CAPABILITY', 'Exact arc-and-line sweep needs one circular disk or one bend-aligned rectangular section.');
    const hole = rectangle ? undefined : circularHole(holes, 'arc-and-line', refuse);
    const bore = hole && concentricBore(disk!, hole, refuse, 'arc-and-line');
    const reflected = rectangle ? rectangularArcLineSection(rectangle, holes, arcLine, frame, sideTags, arcLineRefuse) : undefined;
    const axes = reflected?.axes ?? frame(arcLine.tangent), [x, y] = axes;
    const section: JoinedSection = reflected?.section ?? { profile: [originDisk(profileRadius!)],
      bendCentre: [dot(arcLine.toCentre, x), dot(arcLine.toCentre, y)],
      radialReach: profileRadius!, extent: profileRadius!, edgeCount: 2 };
    const local = lineAndArcSweep(id, arcLine, section, bore, reflected?.tags ?? sideTags, arcLineRefuse);
    // The producer travels in reverse. Restore authored cap order and rectangle side names.
    const restoreNames = <T extends { name?: string }>(element: T): T => {
      if (element.name === undefined) return element;
      let name = element.name.split('|').map(name => name === `${id}.start` ? `${id}.end`
        : name === `${id}.end` ? `${id}.start` : name).join('|');
      if (reflected) name = name.replace(/\.side\[arcLine(?:(?:Outer|Hole)[0-3]|Hole1_[0-3])\]/g, token => reflected.names.get(token) ?? token);
      return { ...element, name };
    };
    const brep = { ...local.brep, faces: local.brep.faces.map(restoreNames), edges: local.brep.edges.map(restoreNames) };
    const result = place({ ...local, brep }, axes, arcLine.start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].shells !== 1
      || report.topology[0].genus !== (section.apertures ? 2 : bore || section.opening ? 1 : 0))
      return refuse('GEOMETRY', 'The exact arc-and-line sweep did not produce a valid closed solid.');
    return result;
  }

  const lineArc: JoinedRail | undefined = tangentLineArcLine(path, refuse) ?? tangentLineArc(path, refuse);
  if (lineArc) {
    const rectangle = profileRadius === undefined ? rectangleSection(outer) : undefined;
    if (!rectangle && profileRadius === undefined) return refuse('CAPABILITY',
      `Exact ${sweepStyle(lineArc)} sweep needs one circular disk or one bend-aligned rectangular section.`);
    const hole = rectangle ? undefined : circularHole(holes, sweepStyle(lineArc), refuse);
    const bore = hole && concentricBore(disk!, hole, refuse, sweepStyle(lineArc));
    const initial = frame(lineArc.tangent), [x, y] = initial;
    const paired = rectangle && holes.length > 1;
    const joined: { axes: SweepAxes; section: JoinedSection } = rectangle ? rectangularElbowSection(rectangle, paired ? [] : holes, initial, lineArc, refuse) : {
      axes: initial, section: { profile: [originDisk(profileRadius!)], bendCentre: [dot(lineArc.toCentre, x), dot(lineArc.toCentre, y)],
        radialReach: profileRadius!, extent: profileRadius!, edgeCount: 2 },
    };
    if (paired) joined.section = { ...joined.section, edgeCount: 12,
      apertures: pairedRectangularApertures(rectangle, holes, joined.section, lineArc.tolerance, refuse, `${sweepStyle(lineArc)} rectangular`) };
    const result = place(lineAndArcSweep(id, lineArc, joined.section, bore, sideTags, refuse), joined.axes, lineArc.start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid) return refuse('GEOMETRY',
      `The exact ${joinedStyle(lineArc, joined.section.edgeCount)} sweep is not a valid closed solid: ${report.issues[0]}`);
    const apertureCount = paired ? 2 : joined.section.opening || bore ? 1 : 0;
    if (apertureCount && (report.topology.length !== 1 || report.topology[0].shells !== 1 || report.topology[0].genus !== apertureCount))
      return refuse('GEOMETRY', `The exact ${joinedStyle(lineArc, joined.section.edgeCount)} sweep did not preserve ${paired ? 'both through openings' : 'one through opening'}.`);
    return result;
  }

  const spaced = tangentArcLineArc(path, refuse);
  if (spaced) {
    const rectangle = profileRadius === undefined ? rectangleSection(outer) : undefined;
    if (!rectangle && (!disk || profileRadius === undefined))
      return refuse('CAPABILITY', 'Exact arc-line-arc sweep needs one circular outer section or one bend-aligned rectangular section.');
    const hole = rectangle ? undefined : circularHole(holes, 'arc-line-arc', refuse);
    const bore = hole && concentricBore(disk!, hole, refuse);
    const initial = frame(spaced.first.tangent), [x, y] = initial;
    const paired = rectangle && holes.length > 1;
    const joined: { axes: SweepAxes; section: JoinedSection } = rectangle
      ? rectangularElbowSection(rectangle, paired ? [] : holes, initial, spaced.first, refuse, 'rectangular arc-line-arc') : {
      axes: initial, section: { profile: [originDisk(profileRadius!)],
        bendCentre: [dot(spaced.first.toCentre, x), dot(spaced.first.toCentre, y)],
        radialReach: profileRadius!, extent: profileRadius!, edgeCount: 2 },
    };
    if (paired) joined.section = { ...joined.section, edgeCount: 12,
      apertures: pairedRectangularApertures(rectangle, holes, joined.section, spaced.first.tolerance, refuse, 'arc-line-arc rectangular') };
    const result = place(arcPairSweep(id, spaced, joined.section, bore, sideTags, refuse), joined.axes, spaced.first.start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].shells !== 1
      || report.topology[0].genus !== (paired ? 2 : bore || joined.section.opening ? 1 : 0))
      return refuse('GEOMETRY', 'The exact arc-line-arc sweep did not produce a valid closed solid.');
    return result;
  }

  const pair = tangentArcPair(path, refuse);
  if (pair) {
    const rectangle = profileRadius === undefined ? rectangleSection(outer) : undefined;
    if (!rectangle && (!disk || profileRadius === undefined))
      return refuse('CAPABILITY', 'Exact two-arc sweep needs one circular outer section or one bend-aligned rectangular section.');
    const hole = rectangle ? undefined : circularHole(holes, 'two-arc', refuse);
    const bore = hole && concentricBore(disk!, hole, refuse);
    const initial = frame(pair.first.tangent), [x, y] = initial;
    const paired = rectangle && holes.length > 1;
    const joined: { axes: SweepAxes; section: JoinedSection } = rectangle
      ? rectangularElbowSection(rectangle, paired ? [] : holes, initial, pair.first, refuse, 'rectangular two-arc') : {
      axes: initial, section: { profile: [originDisk(profileRadius!)], bendCentre: [dot(pair.first.toCentre, x), dot(pair.first.toCentre, y)] as XY,
        radialReach: profileRadius!, extent: profileRadius!, edgeCount: 2 as const },
    };
    if (paired) joined.section = { ...joined.section, edgeCount: 12,
      apertures: pairedRectangularApertures(rectangle, holes, joined.section, pair.first.tolerance, refuse, 'two-arc rectangular') };
    const result = place(arcPairSweep(id, pair, joined.section, bore, sideTags, refuse), joined.axes, pair.first.start);
    const report = checkBrep(result.brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].shells !== 1
      || report.topology[0].genus !== (paired ? 2 : bore || joined.section.opening ? 1 : 0))
      return refuse('GEOMETRY', 'The exact two-arc sweep did not produce a valid closed solid.');
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


type PairedElbowOutletSource = Pick<ExactSweepInput, 'id' | 'mode' | 'path'>;
const pairedOutletFailure: Refuse = (code, message) => { throw new BrepError(code === 'GEOMETRY' ? 'GEOMETRY' : 'INPUT', `Exact paired elbow outlet offset: ${message}`); };
const pairedInletFailure: Refuse = (code, message) => { throw new BrepError(code === 'GEOMETRY' ? 'GEOMETRY' : 'INPUT', `Exact paired elbow inlet offset: ${message}`); };

/** Certified straight-cap recipes keep their original producer and native entity counts. */
function pairedStraightCapRail(path: Curve, inlet: boolean) {
  const refuse = inlet ? pairedInletFailure : pairedOutletFailure;
  const ended = tangentLineArcLineArcLine(path, refuse);
  if (ended) {
    const counts = { faces: 62, loops: 66, coedges: 264, edges: 132, vertices: 72 };
    if (inlet) return { length: ended.leadLength, normal: scale(ended.first.tangent, -1), wallPiece: 'lead' as const,
      endpoint: path.controlPoints[0], counts };
    const { second } = ended;
    const inward = unit(sub(second.toCentre, scale(second.tangent, dot(second.toCentre, second.tangent))));
    const normal = add(scale(second.tangent, Math.cos(second.angle)), scale(inward, Math.sin(second.angle)));
    return { length: ended.tailLength, normal, wallPiece: 'tail' as const, endpoint: path.controlPoints[10],
      counts };
  }
  const elbow = tangentLineArcLine(path, refuse);
  if (elbow?.tailLength !== undefined) {
    const counts = { faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 };
    if (inlet) return { length: elbow.length, normal: scale(elbow.tangent, -1), wallPiece: 'line' as const, counts };
    const inward = unit(sub(elbow.toCentre, scale(elbow.tangent, dot(elbow.toCentre, elbow.tangent))));
    const normal = add(scale(elbow.tangent, Math.cos(elbow.angle)), scale(inward, Math.sin(elbow.angle)));
    return { length: elbow.tailLength, normal, wallPiece: 'tail' as const, counts };
  }
  if (inlet) return;
  const reversed = tangentArcLine(path, pairedOutletFailure);
  if (!reversed) return;
  return { length: reversed.length, normal: scale(reversed.tangent, -1), wallPiece: 'line' as const,
    counts: { faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 } };
}

/** The five-span handle requires both native charts at both original caps and every retained join. */
function pairedEndedCharts(brep: Brep, id: string): boolean {
  const owners = new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face.name] as const)));
  const byEdge = new Map<string, BrepCoedge[]>();
  for (const use of brep.coedges) {
    const uses = byEdge.get(use.edge) ?? [];
    uses.push(use); byEdge.set(use.edge, uses);
  }
  const required = new Set<string>();
  for (const end of ['start', 'end']) {
    const cap = brep.faces.filter(face => face.name === `${id}.${end}`);
    if (cap.length !== 1) return false;
    const uses = brep.coedges.filter(use => cap[0].loops.includes(use.loop));
    if (uses.length !== 12) return false;
    for (const use of uses) required.add(use.edge);
  }
  for (const [first, second] of [['lead', 'first'], ['first', 'line'], ['line', 'second'], ['second', 'tail']]) {
    const joins = brep.edges.filter(edge => {
      const names = (byEdge.get(edge.id) ?? []).map(use => owners.get(use.loop));
      return names.some(name => name?.startsWith(`${id}.${first}.`)) && names.some(name => name?.startsWith(`${id}.${second}.`));
    });
    if (joins.length !== 12) return false;
    for (const edge of joins) required.add(edge.id);
  }
  if (required.size !== 72) return false;
  return [...required].every(edge => {
    const uses = byEdge.get(edge) ?? [];
    return uses.length === 2 && uses.every(use => use.pcurve !== undefined);
  });
}

/** Original straight caps only. Native incidence supplies the handle; the authored path supplies its rail. */
export function exactPairedElbowOutletOffsetFrame(brep: Brep, faceName: string,
  source: PairedElbowOutletSource): { anchor: Point; normal: Point } | undefined {
  try {
    const inlet = faceName === `${source.id}.start`;
    if (source.mode !== 'exact' || (!inlet && faceName !== `${source.id}.end`) || brep.source?.family !== 'sweep-curve'
      || brep.source.id !== source.id) return;
    validateCurve(source.path);
    const rail = pairedStraightCapRail(source.path, inlet);
    if (!rail || Object.entries(rail.counts).some(([key, count]) => brep[key as keyof typeof rail.counts].length !== count)) return;
    const matches = brep.faces.filter(face => face.name === faceName), cap = matches[0];
    if (matches.length !== 1 || cap.loops.length !== 3) return;
    const loops = brep.loops.filter(loop => cap.loops.includes(loop.id));
    if (loops.length !== 3 || loops.some(loop => loop.coedges.length !== 4)
      || loops.filter(loop => loop.kind === 'inner').length !== 2) return;
    const outer = loops.find(loop => loop.kind === 'outer');
    if (!outer) return;
    const support = faceGeometry(cap);
    if (support.kind !== 'plane') return;
    if (len(sub(support.n, rail.normal)) > 256 * Number.EPSILON) return;
    const anchor: Point = [0, 0, 0];
    for (const id of outer.coedges) {
      const use = brep.coedges.find(use => use.id === id), edge = use && brep.edges.find(edge => edge.id === use.edge);
      const vertex = edge && brep.vertices.find(vertex => vertex.id === edge.vertices[use!.sense === 'forward' ? 0 : 1]);
      if (!vertex) return;
      for (let axis = 0; axis < 3; axis++) anchor[axis] += vertex.point[axis] / 4;
    }
    const endpoint = 'endpoint' in rail ? rail.endpoint
      : rail.wallPiece === 'line' ? source.path.controlPoints[inlet ? 0 : source.path.controlPoints.length - 1] : undefined;
    if (endpoint && len(sub(anchor, endpoint)) > CadNumericPolicy.linearTolerance) return;
    if ('endpoint' in rail && !pairedEndedCharts(brep, source.id)) return;
    const report = checkBrep(brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2 || report.topology[0].shells !== 1) return;
    return { anchor, normal: support.n };
  } catch { return; }
}

function retainedElbowBoundary(before: Brep, after: Brep, face: Brep['faces'][number]): boolean {
  const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
  const loops = new Set(face.loops), uses = before.coedges.filter(use => loops.has(use.loop));
  const edges = new Set(uses.map(use => use.edge));
  const vertices = new Set(before.edges.filter(edge => edges.has(edge.id)).flatMap(edge => edge.vertices));
  return same(face, after.faces.find(value => value.id === face.id))
    && before.loops.every(loop => !loops.has(loop.id) || same(loop, after.loops.find(value => value.id === loop.id)))
    && uses.every(use => same(use, after.coedges.find(value => value.id === use.id)))
    && before.edges.every(edge => !edges.has(edge.id) || same(edge, after.edges.find(value => value.id === edge.id)))
    && before.vertices.every(vertex => !vertices.has(vertex.id) || same(vertex, after.vertices.find(value => value.id === vertex.id)));
}

/** Trim an original five-span paired outlet against a tilted plane inside its straight tail. */
export function replaceExactPairedSweepOutletIfAdmitted(brep: Brep, faceName: string, source: ExactSweepInput,
  plane: { readonly origin: Point; readonly normal: Point }): Brep | undefined {
  if (faceName !== `${source.id}.end` || source.path.controlPoints.length !== 11 ||
    !exactPairedElbowOutletOffsetFrame(brep, faceName, source) || source.outer.length !== 4 ||
    source.outer.some(segment => segment.kind !== 'line') || source.holes?.length !== 2 ||
    source.holes.some(loop => loop.length !== 4 || loop.some(segment => segment.kind !== 'line'))) return;
  const original = exactSweep(source, (code, detail) => { throw new BrepError(code === 'GEOMETRY' ? 'GEOMETRY' : 'INPUT', detail); }).brep;
  if (JSON.stringify(original) !== JSON.stringify(brep)) return;
  const rail = pairedStraightCapRail(source.path, false);
  if (!rail || !('endpoint' in rail) || rail.wallPiece !== 'tail') return;
  const axis = unit(sub(source.path.controlPoints[10], source.path.controlPoints[8]));
  return trimExactSweepOutlet(brep, faceName, { axis, length: rail.length, wallPrefix: `${source.id}.tail.` }, plane);
}

/** Continue only an admitted original straight cap. Replaying its producer binds every original native coefficient. */
export function offsetExactPairedElbowOutletIfAdmitted(brep: Brep, faceName: string,
  source: ExactSweepInput, distance: number): Brep | undefined {
  const frame = exactPairedElbowOutletOffsetFrame(brep, faceName, source);
  if (!frame || source.outer.length !== 4 || source.outer.some(segment => segment.kind !== 'line')
    || source.holes?.length !== 2 || source.holes.some(loop => loop.length !== 4 || loop.some(segment => segment.kind !== 'line'))) return;
  const inlet = faceName === `${source.id}.start`, refuse = inlet ? pairedInletFailure : pairedOutletFailure;
  const original = exactSweep(source, refuse).brep;
  if (JSON.stringify(original) !== JSON.stringify(brep)) return;
  if (!Number.isFinite(distance) || distance === 0 || Math.abs(distance) > CadNumericPolicy.coordinateAbs)
    return refuse('PARAMETER', 'distance must be nonzero and within the modeling range.');
  const rail = pairedStraightCapRail(source.path, inlet)!;
  const length = rail.length + distance;
  if (!(length >= ExtrudedProfileLimits.minimumLengthMM))
    return refuse('GEOMETRY', inlet ? 'the offset would reach or cross the retained inlet-to-bend join.' : 'the offset would reach or cross the retained bend-to-outlet join.');
  const path = structuredClone(source.path), end = inlet ? 0 : path.controlPoints.length - 1, middle = inlet ? 1 : end - 1;
  const normal = unit(sub(source.path.controlPoints[end], source.path.controlPoints[inlet ? 2 : end - 2]));
  path.controlPoints[middle] = add(path.controlPoints[middle], scale(normal, distance / 2));
  path.controlPoints[end] = add(path.controlPoints[end], scale(normal, distance));
  if (path.controlPoints[end].every((value, axis) => value === source.path.controlPoints[end][axis]))
    return refuse('GEOMETRY', inlet ? 'distance is too small to move the inlet.' : 'distance is too small to move the outlet.');
  const candidate = exactSweep({ ...source, path }, refuse).brep;
  const keys = ['bodies', 'shells', 'faces', 'loops', 'coedges', 'edges', 'vertices'] as const;
  for (const key of keys) {
    const identity = (value: { id: string; name?: string }) => [value.id, value.name];
    if (JSON.stringify(brep[key].map(identity)) !== JSON.stringify(candidate[key].map(identity)))
      return refuse('GEOMETRY', 'the offset cannot preserve the original native names and incidence.');
  }
  for (const face of brep.faces) if (face.name !== faceName && !face.name?.startsWith(`${source.id}.${rail.wallPiece}.`)
    && !retainedElbowBoundary(brep, candidate, face))
    return refuse('GEOMETRY', inlet ? 'the offset cannot preserve the bend, outlet and tangent joins.' : 'the offset cannot preserve the inlet, bend and tangent joins.');
  const next = exactPairedElbowOutletOffsetFrame(candidate, faceName, { ...source, path });
  const expected = add(frame.anchor, scale(frame.normal, distance));
  if (!next || len(sub(next.anchor, expected)) > linearToleranceMM(geometryScaleMM(candidate.vertices.map(vertex => vertex.point))))
    return refuse('GEOMETRY', 'the terminal cap cannot preserve the signed native displacement.');
  return candidate;
}
