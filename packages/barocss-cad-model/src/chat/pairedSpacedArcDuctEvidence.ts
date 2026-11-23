import {
  brepMassProperties, CadNumericPolicy, checkBrep, curveDomain, evaluateCurve, evaluateSurface,
  faceGeometry, measureBrepEdgeContinuity, type Brep, type BrepEdge, type Curve, type Point,
} from '@barocss/cad';
import { add, cross, dot, len, scale, sub, unit } from '../engine/vec3';

interface Source {
  readonly outer: readonly number[];
  readonly outerTags: readonly string[];
  readonly cavities: readonly { readonly min: readonly number[]; readonly max: readonly number[]; readonly tags: readonly string[] }[];
}
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
type Interval = [number, number];
interface Section { radial: number; axial: number; interval: Interval; tags: readonly string[] }
const tolerance = CadNumericPolicy.linearTolerance;
// Existing exact-sweep admission, ExtrudedProfileLimits.minimumLengthMM (not a public export).
const minimumLengthMM = .0001;
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const pointNear = (a: Point, b: Point) => near(len(sub(a, b)), 0);

/** Recover a circular carrier from its authored tangent and chord, without the sweep recognizer. */
function arc(start: Point, pole: Point, end: Point, weight: number) {
  const tangent = unit(sub(pole, start)), chord = sub(end, start);
  const across = sub(chord, scale(tangent, dot(chord, tangent))), height = len(across);
  if (!(height > tolerance && weight > 0 && weight < 1)) return;
  const inward = scale(across, 1 / height), radius = dot(chord, chord) / (2 * height);
  const rawAngle = 2 * Math.atan2(height, dot(chord, tangent));
  const angle = Math.max(Math.PI / 6, Math.min(2 * Math.PI / 3, rawAngle));
  if (!(radius > tolerance && radius <= CadNumericPolicy.coordinateAbs)) return;
  const expectedPole = add(start, scale(tangent, radius * Math.tan(angle / 2))), canonicalWeight = Math.cos(angle / 2);
  const diameter = Math.max(len(chord), len(sub(expectedPole, start)));
  const weightCorrection = .5 * Math.abs(weight - canonicalWeight) * diameter / Math.min(1, weight, canonicalWeight);
  if (radius * Math.abs(rawAngle - angle) > tolerance || len(sub(pole, expectedPole)) + weightCorrection > tolerance
    || !pointNear(end, add(start, add(scale(tangent, radius * Math.sin(angle)), scale(inward, radius * (1 - Math.cos(angle))))))) return;
  return { start, end, tangent, inward, radius, angle, center: add(start, scale(inward, radius)),
    exitTangent: add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle))),
    exitInward: sub(scale(inward, Math.cos(angle)), scale(tangent, Math.sin(angle))) };
}

function spacedArcs(path: Path) {
  const { degree, knots, controlPoints: points, weights } = path;
  if (degree !== 2 || points.length !== 7 || weights.length !== 7 || knots.length !== 10
    || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs))
    || weights.some(value => !Number.isFinite(value) || value <= 0) || knots.some(value => !Number.isFinite(value))
    || weights.some((weight, index) => index !== 1 && index !== 5 && weight !== weights[0])
    || knots[0] !== knots[1] || knots[1] !== knots[2] || knots[3] !== knots[4] || knots[5] !== knots[6]
    || knots[7] !== knots[8] || knots[8] !== knots[9] || !(knots[2] < knots[3] && knots[4] < knots[5] && knots[6] < knots[7])) return;
  const first = arc(points[0], points[1], points[2], weights[1] / weights[0]);
  const second = arc(points[4], points[5], points[6], weights[5] / weights[0]);
  const length = len(sub(points[4], points[2]));
  if (!first || !second || !(length >= minimumLengthMM)
    || .5 * len(sub(points[3], scale(add(points[2], points[4]), .5))) > tolerance) return;
  const tangent = unit(sub(points[4], points[2])), angular = CadNumericPolicy.relativeComparison;
  const turn = dot(first.exitInward, second.inward) > 0 ? 1 : -1;
  if (len(sub(tangent, first.exitTangent)) > angular || len(sub(tangent, second.tangent)) > angular
    || !pointNear(sub(points[4], points[2]), scale(first.exitTangent, length))
    || 2 * second.radius * (len(sub(scale(first.exitInward, turn), second.inward)) + len(sub(first.exitTangent, second.tangent))) > tolerance) return;
  return { first, second, length, turn, start: first.start, end: second.end, tangent: first.tangent, inward: first.inward,
    axis: unit(cross(first.tangent, first.inward)), radius: Math.min(first.radius, second.radius) };
}
type Frame = NonNullable<ReturnType<typeof spacedArcs>> & { leadLength?: number; leadStart?: Point };

/** Recover four authored spans independently; keep the producer's strict forward-tangent admission. */
function leadingSpacedArcs(path: Path): Frame | undefined {
  const { degree, knots, controlPoints: points, weights } = path;
  if (degree !== 2 || points.length !== 9 || weights.length !== 9 || knots.length !== 12
    || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs))
    || weights.some(value => !Number.isFinite(value) || value <= 0) || knots.some(value => !Number.isFinite(value))
    || weights.some((weight, index) => index !== 3 && index !== 7 && weight !== weights[0])
    || !(weights[3] < weights[0] && weights[7] < weights[0])
    || knots[0] !== knots[1] || knots[1] !== knots[2] || knots[3] !== knots[4] || knots[5] !== knots[6]
    || knots[7] !== knots[8] || knots[9] !== knots[10] || knots[10] !== knots[11]
    || !(knots[2] < knots[3] && knots[4] < knots[5] && knots[6] < knots[7] && knots[8] < knots[9])) return;
  const frame = spacedArcs({ degree, controlPoints: points.slice(2), weights: weights.slice(2), knots: [knots[3], ...knots.slice(3)] });
  const leadLength = len(sub(points[2], points[0]));
  if (!frame || !(leadLength >= minimumLengthMM)) return;
  const extent = (poles: Point[]) => Math.max(1, ...poles.flatMap(point => point.map(Math.abs)));
  // Both straight joins constrain the tangent poles to coordinate roundoff. A linear-tolerance
  // pole-length correction could change the normalized native tangent and must not get evidence.
  const roundoff = 64 * Number.EPSILON * extent(points.slice(2));
  for (const [bend, pole] of [[frame.first, points[3]], [frame.second, points[7]]] as const) {
    const expected = add(bend.start, scale(bend.tangent, bend.radius * Math.tan(bend.angle / 2)));
    if (len(sub(pole, expected)) > roundoff
      || (bend.angle > Math.PI / 2 && bend.radius * (bend.angle - Math.PI / 2) <= tolerance
        && bend.radius * (bend.angle - Math.PI / 2) > roundoff)) return;
  }
  const straight = (start: Point, middle: Point, end: Point, tangent: Point, handle: Point, scaleMM: number) => {
    const chord = sub(end, start), length = len(chord), direction = unit(chord);
    const error = .5 * len(sub(sub(middle, start), scale(chord, .5))), directionError = len(sub(direction, tangent));
    const angular = Math.min(CadNumericPolicy.relativeComparison, 256 * Number.EPSILON * scaleMM / Math.min(length, len(handle)));
    return error + length * directionError <= tolerance && directionError <= angular && len(sub(direction, unit(handle))) <= angular;
  };
  if (!straight(points[0], points[1], points[2], frame.tangent, sub(points[3], points[2]), extent(points))
    || !straight(points[4], points[5], points[6], frame.first.exitTangent, sub(points[4], points[3]), extent(points.slice(2)))
    || !straight(points[4], points[5], points[6], frame.second.tangent, sub(points[7], points[6]), extent(points.slice(2)))) return;
  const angular = Math.min(CadNumericPolicy.relativeComparison,
    256 * Number.EPSILON * Math.max(extent(points.slice(2)), frame.first.radius, frame.second.radius)
      / Math.min(frame.length, len(sub(points[4], points[3])), len(sub(points[7], points[6]))));
  if (len(sub(scale(frame.first.exitInward, frame.turn), frame.second.inward)) > angular) return;
  return { ...frame, leadLength, leadStart: points[0] };
}

/** Reject a possible one-carrier normalization using independent circumcenters and whole-span bounds. */
function singleCarrier(path: Path) {
  const [start, p1, join, p3, end] = path.controlPoints.map(point => sub(point, path.controlPoints[0]));
  const [, w1, , w3] = path.weights.map(weight => weight / path.weights[0]);
  const midpoint = (a: Point, pole: Point, b: Point, weight: number) => scale(add(add(a, b), scale(pole, 2 * weight)), 1 / (2 + 2 * weight));
  const chord = len(end), half = scale(end, .5), direction = unit(end);
  for (const sample of [join, midpoint(start, p1, join, w1), midpoint(join, p3, end, w3)]) {
    const normal = cross(end, sample), squared = dot(normal, normal);
    if (!(squared > 0)) continue;
    // Solve C·end=|end|²/2 and C·sample=|sample|²/2 in their common plane.
    const center = scale(add(scale(cross(sample, normal), dot(end, end)), scale(cross(normal, end), dot(sample, sample))), 1 / (2 * squared));
    const sagitta = sub(sub(sample, half), scale(direction, dot(sub(sample, half), direction))), height = len(sagitta);
    if (!(height > tolerance)) continue;
    const centers = [center, ...[Math.PI / 6, Math.PI / 2, 2 * Math.PI / 3]
      .map(angle => sub(half, scale(sagitta, chord / (2 * height * Math.tan(angle / 2)))))];
    for (const candidate of centers) {
      const radius = len(candidate), radial = scale(candidate, -1), last = sub(end, candidate), joint = sub(join, candidate);
      if (!(radius > tolerance && len(joint) > tolerance)) continue;
      let axis = unit(normal), tangent = unit(cross(axis, radial));
      if (dot(tangent, sub(p1, start)) < 0) { axis = scale(axis, -1); tangent = scale(tangent, -1); }
      const angleOf = (ray: Point) => { const angle = Math.atan2(dot(ray, tangent), dot(ray, scale(radial, 1 / radius))); return angle > 0 ? angle : angle + 2 * Math.PI; };
      const rawAngle = angleOf(last), angle = Math.max(Math.PI / 6, Math.min(2 * Math.PI / 3, rawAngle)), firstAngle = angleOf(joint);
      if (radius * Math.abs(rawAngle - angle) > tolerance || !(firstAngle > 0 && firstAngle < angle)) continue;
      const projectedJoin = add(candidate, scale(joint, radius / len(joint))), correction = len(sub(projectedJoin, join));
      const endpointCorrection = radius * Math.abs(rawAngle - angle);
      const fits = (a: Point, pole: Point, b: Point, turn: number, weight: number) => {
        const canonicalWeight = Math.cos(turn / 2), ray = sub(a, candidate), forward = unit(cross(axis, ray));
        const canonicalPole = add(a, scale(forward, radius * Math.tan(turn / 2)));
        const diameter = Math.max(len(sub(a, b)), .5 * len(sub(a, b)) / canonicalWeight);
        const weightCorrection = .5 * Math.abs(weight - canonicalWeight) * diameter / Math.min(1, weight, canonicalWeight);
        return Math.max(correction, endpointCorrection, len(sub(pole, canonicalPole))) + weightCorrection <= tolerance;
      };
      if (fits(start, p1, projectedJoin, firstAngle, w1) && fits(projectedJoin, p3, end, angle - firstAngle, w3)) return true;
    }
  }
  return false;
}

/** Read two directly joined carriers of one requested turn, independently of the native producer. */
function directArcs(path: Path, turn: -1 | 1): Frame | undefined {
  const { degree, knots, controlPoints: points, weights } = path;
  if (degree !== 2 || points.length !== 5 || weights.length !== 5 || knots.length !== 8
    || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs))
    || weights.some(value => !Number.isFinite(value) || value <= 0) || knots.some(value => !Number.isFinite(value))
    || weights[0] !== weights[2] || weights[2] !== weights[4]
    || knots[0] !== knots[1] || knots[1] !== knots[2] || knots[3] !== knots[4]
    || knots[5] !== knots[6] || knots[6] !== knots[7] || !(knots[2] < knots[3] && knots[3] < knots[5])) return;
  const first = arc(points[0], points[1], points[2], weights[1] / weights[0]);
  const second = arc(points[2], points[3], points[4], weights[3] / weights[0]);
  if (!first || !second) return;
  // The native producer tries one-carrier normalization before its equal-radius guard.
  if (turn === 1 && (singleCarrier(path) || Math.abs(first.radius - second.radius) <= tolerance)) return;
  const lead = sub(points[2], points[1]), tail = sub(points[3], points[2]);
  // The direct producer's tangent test uses coordinate roundoff, not the wider linear tolerance.
  const roundoff = 256 * Number.EPSILON * Math.max(1, ...points.flatMap(point => point.map(Math.abs)), first.radius, second.radius);
  const angular = Math.min(CadNumericPolicy.relativeComparison, roundoff / Math.min(len(lead), len(tail)));
  const inwardError = turn === -1 ? len(add(first.exitInward, second.inward)) : len(sub(first.exitInward, second.inward));
  if ([unit(lead), unit(tail), second.tangent].some(tangent => len(sub(first.exitTangent, tangent)) > angular)
    || inwardError > angular
    || 2 * second.radius * (inwardError + len(sub(first.exitTangent, second.tangent))) > tolerance) return;
  return { first, second, length: 0, turn, start: first.start, end: second.end, tangent: first.tangent, inward: first.inward,
    axis: unit(cross(first.tangent, first.inward)), radius: Math.min(first.radius, second.radius) };
}

function sections(source: Source, frame: Frame, strict = false) {
  const finite = (value: number) => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs;
  if (source.outer.length !== 2 || source.outer.some(value => !finite(value) || value <= 0)
    || source.outerTags.length !== 4 || source.cavities.length !== 2
    || source.cavities.some(cavity => cavity.min.length !== 2 || cavity.max.length !== 2 || cavity.tags.length !== 4
      || [...cavity.min, ...cavity.max].some(value => !finite(value)))) return;
  const tags = [...source.outerTags, ...source.cavities.flatMap(cavity => cavity.tags)];
  if (tags.some(tag => typeof tag !== 'string' || !tag) || new Set(tags).size !== 12) return;
  const project = (axis: Point) => sub(axis, scale(frame.tangent, dot(axis, frame.tangent)));
  const projected = project([1, 0, 0]), x = unit(len(projected) < 1e-6 ? project([0, 1, 0]) : projected);
  const axes = [x, cross(frame.tangent, x)], alignment = Math.min(CadNumericPolicy.relativeComparison, 2 * tolerance / Math.hypot(...source.outer));
  const aligned = (axis: Point) => Math.min(len(sub(axis, frame.inward)), len(add(axis, frame.inward))) <= alignment;
  const radial = aligned(axes[0]) ? 0 : aligned(axes[1]) ? 1 : undefined;
  if (radial === undefined || !(frame.radius - source.outer[radial] / 2 > tolerance)) return;
  const axial = 1 - radial, sign = dot(axes[axial], frame.axis);
  if (!near(Math.abs(sign), 1)) return;
  const apertures: Section[] = [];
  let roundoff = 0;
  for (const cavity of source.cavities) {
    const size = cavity.max.map((value, axis) => value - cavity.min[axis]);
    const margin = strict ? 8 * Number.EPSILON * Math.max(1, ...source.outer.map(value => value / 2), ...[...cavity.min, ...cavity.max].map(Math.abs)) : 0;
    roundoff = Math.max(roundoff, margin);
    if (size.some(value => value < minimumLengthMM)
      || (strict ? Math.abs(cavity.min[radial] + cavity.max[radial]) > margin : !near(cavity.min[radial] + cavity.max[radial], 0))
      || cavity.min.some((value, axis) => value + source.outer[axis] / 2 <= 10 * tolerance + 2 * margin
        || source.outer[axis] / 2 - cavity.max[axis] <= 10 * tolerance + 2 * margin)) return;
    const interval = [sign * cavity.min[axial], sign * cavity.max[axial]];
    apertures.push({ radial: size[radial], axial: size[axial], interval: [Math.min(...interval), Math.max(...interval)], tags: cavity.tags });
  }
  const [first, second] = apertures[0].interval[0] < apertures[1].interval[0] ? apertures : [apertures[1], apertures[0]];
  const axialWeb = second.interval[0] - first.interval[1];
  if (!(axialWeb > 10 * tolerance + 2 * roundoff)) return;
  const exterior: Section = { radial: source.outer[radial], axial: source.outer[axial],
    interval: [-source.outer[axial] / 2, source.outer[axial] / 2], tags: source.outerTags };
  return { exterior, apertures, axialWeb };
}

/** Check four exact section corners in the independent radial/binormal world frame. */
function rectangle(edges: BrepEdge[], center: Point, inward: Point, axis: Point, section: Section) {
  if (edges.length !== 4 || new Set(edges.map(edge => edge.id)).size !== 4) return false;
  const corners = new Set<string>(), sides = new Set<string>(), normal = cross(inward, axis);
  for (const edge of edges) {
    if (edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2 || edge.curve.weights.length !== 2
      || edge.curve.weights.some(weight => !Number.isFinite(weight) || weight <= 0)) return false;
    const points = [];
    for (const point of edge.curve.controlPoints) {
      const delta = sub(point, center), q = dot(delta, inward), z = dot(delta, axis);
      const r = near(q, -section.radial / 2) ? 0 : near(q, section.radial / 2) ? 1 : undefined;
      const h = near(z, section.interval[0]) ? 0 : near(z, section.interval[1]) ? 1 : undefined;
      if (r === undefined || h === undefined || !near(dot(delta, normal), 0)) return false;
      const key = `${r},${h}`; corners.add(key); points.push(key);
    }
    const [a, b] = points;
    if (a === b || (a[0] === b[0]) === (a[2] === b[2])) return false;
    sides.add([a, b].sort().join('|'));
  }
  return corners.size === 4 && sides.size === 4;
}

/** Check every named wall support against the authored turn of the second bend. */
function walls(brep: Brep, feature: string, frame: Frame, section: Section, inward: boolean) {
  const pieces = frame.leadLength !== undefined ? ['lead', 'first', 'line', 'second']
    : frame.length === 0 ? ['first', 'second'] : ['first', 'line', 'second'], direction = inward ? -1 : 1;
  const angular = CadNumericPolicy.relativeComparison;
  const names = pieces.flatMap(piece => section.tags.map(tag => `${feature}.${piece}.side[${tag}]`));
  for (const piece of pieces) {
    const first = piece === 'lead' || piece === 'first', straight = piece === 'lead' || piece === 'line';
    const bend = first ? frame.first : frame.second;
    const radial = first ? frame.inward : frame.first.exitInward;
    const center = first ? frame.start : frame.first.end, turn = piece === 'second' ? frame.turn : 1;
    const found = new Set<string>();
    for (const name of names.filter(name => name.startsWith(`${feature}.${piece}.`))) {
      const face = brep.faces.find(face => face.name === name);
      if (!face || face.surface.kind !== 'surface' || face.loops.length !== 1) return;
      const geometry = faceGeometry(face);
      let side: string | undefined;
      if (geometry.kind === 'plane') {
        for (const [index, height] of section.interval.entries()) {
          if (len(sub(geometry.n, scale(frame.axis, direction * (index ? 1 : -1)))) <= angular
            && near(dot(sub(geometry.o, center), frame.axis), height)) side = `axial${index}`;
        }
        if (straight) for (const index of [0, 1]) {
          if (len(sub(geometry.n, scale(radial, direction * (index ? 1 : -1)))) <= angular
            && near(dot(sub(geometry.o, center), radial), (index ? 1 : -1) * section.radial / 2)) side = `radial${index}`;
        }
      } else if (!straight && geometry.kind === 'cylinder'
        && len(cross(geometry.a, frame.axis)) <= angular && near(Math.abs(dot(geometry.a, frame.axis)), 1)
        && near(len(cross(sub(geometry.c, bend.center), frame.axis)), 0)) {
        for (const index of [0, 1]) if (near(geometry.r, bend.radius - turn * (index ? 1 : -1) * section.radial / 2)
          && geometry.out === direction * turn * (index ? -1 : 1)) side = `radial${index}`;
      }
      if (!side || found.has(side)) return;
      found.add(side);
    }
    if (found.size !== 4) return;
  }
  return names;
}

/** Common native wall, mouth, join and mass checks for the two bounded arc producers. */
function pairedArcDuctEvidence(brep: Brep, path: Path, source: Source, direct: boolean, turn: -1 | 1 = -1, leading = false) {
  try {
    const frame: Frame | undefined = leading ? leadingSpacedArcs(path) : direct ? directArcs(path, turn) : spacedArcs(path);
    const sizes = frame && sections(source, frame, leading), feature = brep.source.id;
    if (!frame || !sizes || brep.source.family !== 'sweep-curve' || !feature || brep.bodies.length !== 1
      || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed
      || brep.bodies[0].shells.length !== 1 || brep.bodies[0].shells[0] !== brep.shells[0].id
      || brep.shells[0].body !== brep.bodies[0].id) return;
    const report = checkBrep(brep, { strict: true });
    const expected = leading ? { bodies: 1, shells: 1, faces: 50, loops: 54, coedges: 216, edges: 108, vertices: 60 }
      : direct ? { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 }
      : { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 };
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2
      || Object.entries(expected).some(([key, value]) => report.counts[key as keyof typeof expected] !== value)) return;
    if (leading) {
      const { first, second, length, leadLength } = frame, reach = sizes.exterior.radial / 2, half = first.angle / 2;
      const roundoff = 128 * Number.EPSILON * Math.max(1, first.radius, second.radius,
        sizes.exterior.radial / 2, sizes.exterior.axial / 2, length, leadLength!);
      // Compare whole-section supports along the first bend's half-angle tangent. Each angle is
      // 30..120°, so sin(half+beta) is nonnegative and its interval minimum occurs at an endpoint.
      const leadUpper = -(first.radius - reach) * Math.sin(half);
      // For opposite turns the second-center projection is (R1+R2)sin(half)+Lcos(half).
      // Its radial contribution is bounded below by -(R2+h)sin(half), since
      // sin(beta-half)>=-sin(half) throughout the admitted 0..120 degree second span.
      const secondLower = frame.turn === 1 ? (first.radius - second.radius) * Math.sin(half) + length * Math.cos(half)
        + (second.radius - reach) * Math.min(Math.sin(half), Math.sin(half + second.angle))
        : (first.radius - reach) * Math.sin(half) + length * Math.cos(half);
      if (report.topology[0].shells !== 1 || !(secondLower - leadUpper > 10 * tolerance + 2 * roundoff)) return;
    }
    const groups = [sizes.exterior, ...sizes.apertures], wallGroups = groups.map((section, index) => walls(brep, feature, frame, section, index > 0));
    if (wallGroups.some(group => !group)) return;
    const names = new Set([...wallGroups.flat(), `${feature}.start`, `${feature}.end`]);
    if (names.size !== expected.faces || new Set(brep.faces.map(face => face.name)).size !== expected.faces
      || brep.faces.some(face => !face.name || !names.has(face.name) || face.shell !== brep.shells[0].id)) return;
    let maximumGapMM = Math.max(report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
    const peers = (edge: BrepEdge, requireCharts: boolean) => {
      const uses = brep.coedges.filter(use => use.edge === edge.id), domain = curveDomain(edge.curve);
      if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense) return;
      for (const use of uses) {
        if (!use.pcurve) { if (requireCharts) return; continue; }
        const chart = use.pcurve, face = brep.faces.find(face => face.loops.includes(use.loop)), chartDomain = curveDomain(chart);
        if (face?.surface.kind !== 'surface' || chartDomain[0] !== domain[0] || chartDomain[1] !== domain[1]
          || chart.controlPoints.some(point => point[2] !== 0)) return;
        for (const fraction of [0, .19, .5, .87, 1]) {
          const at = domain[0] + fraction * (domain[1] - domain[0]), [u, v] = evaluateCurve(chart, at);
          const gap = len(sub(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, at)));
          if (!Number.isFinite(gap) || gap > tolerance) return;
          maximumGapMM = Math.max(maximumGapMM, gap);
        }
      }
      return uses;
    };
    // Revolved physical caps inherit absent charts. Every existing chart is still checked.
    for (const edge of brep.edges) if (!peers(edge, false)) return;
    const caps = [];
    for (const end of ['start', 'end']) {
      const name = `${feature}.${end}`, face = brep.faces.find(face => face.name === name), start = end === 'start';
      const center = start ? leading ? frame.leadStart! : frame.start : frame.end;
      const radial = start ? frame.inward : scale(frame.second.exitInward, frame.turn);
      const normal = start ? scale(frame.tangent, -1) : frame.second.exitTangent, piece = start ? leading ? 'lead' : 'first' : 'second';
      if (!face || face.loops.length !== 3) return;
      const plane = faceGeometry(face);
      if (plane.kind !== 'plane' || len(sub(plane.n, normal)) > CadNumericPolicy.relativeComparison
        || !near(dot(sub(plane.o, center), normal), 0)) return;
      const found = new Map<number, string[]>();
      for (const id of face.loops) {
        const loop = brep.loops.find(loop => loop.id === id);
        if (!loop || loop.face !== face.id || loop.coedges.length !== 4) return;
        const edges: BrepEdge[] = [], adjacent: string[] = [];
        let area = 0;
        for (const id of loop.coedges) {
          const use = brep.coedges.find(use => use.id === id), edge = use && brep.edges.find(edge => edge.id === use.edge);
          const pair = edge && peers(edge, leading && start), twin = pair?.find(peer => peer.id !== use?.id);
          const other = twin && brep.faces.find(face => face.loops.includes(twin.loop));
          if (!use || use.loop !== loop.id || !edge || !pair || !other?.name || edge.curve.controlPoints.length !== 2) return;
          adjacent.push(other.name); edges.push(edge);
          const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
          area += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
        }
        const group = groups.findIndex(section => adjacent.every(name => section.tags.some(tag => name === `${feature}.${piece}.side[${tag}]`)));
        if (group < 0 || found.has(group) || new Set(adjacent).size !== 4 || loop.kind !== (group ? 'inner' : 'outer')) return;
        const section = groups[group];
        if (!rectangle(edges, center, radial, frame.axis, section) || !near(area, (group ? -1 : 1) * section.radial * section.axial)) return;
        found.set(group, edges.map(edge => edge.id));
      }
      if (found.size !== 3) return;
      const apertures = sizes.apertures.map((section, index) => ({ index, tags: [...section.tags], edges: found.get(index + 1)!,
        center: add(center, scale(frame.axis, (section.interval[0] + section.interval[1]) / 2)),
        dimensions: { radial: section.radial, axial: section.axial }, axialInterval: section.interval }));
      caps.push({ name, outerEdges: found.get(0)!, innerEdges: apertures.flatMap(aperture => aperture.edges),
        center, plane: { origin: plane.o, normal: plane.n }, apertures });
    }
    const joins = direct ? [{ pieces: ['first', 'second'], center: frame.first.end, radial: frame.first.exitInward }]
      : [...(leading ? [{ pieces: ['lead', 'first'], center: frame.first.start, radial: frame.inward }] : []),
        { pieces: ['first', 'line'], center: frame.first.end, radial: frame.first.exitInward },
        { pieces: ['line', 'second'], center: frame.second.start, radial: frame.first.exitInward }];
    const rings: string[][][] = [];
    for (const join of joins) {
      const seamGroups: string[][] = [];
      for (const section of groups) {
        const edges: BrepEdge[] = [];
        for (const tag of section.tags) {
          const names = join.pieces.map(piece => `${feature}.${piece}.side[${tag}]`);
          const matches = brep.edges.filter(edge => edge.name === names.join('|') || edge.name === names.slice().reverse().join('|'));
          if (matches.length !== 1) return;
          const [edge] = matches, uses = peers(edge, true);
          if (!uses || new Set(uses.map(use => brep.faces.find(face => face.loops.includes(use.loop))?.name)).size !== 2
            || uses.some(use => !names.includes(brep.faces.find(face => face.loops.includes(use.loop))?.name ?? ''))) return;
          const continuity = measureBrepEdgeContinuity(brep, edge.id), angular = CadNumericPolicy.relativeComparison * 180 / Math.PI;
          if (continuity.status !== 'measured' || !Number.isFinite(continuity.minimumAngleDegrees) || !Number.isFinite(continuity.maximumAngleDegrees)
            || Math.abs(continuity.minimumAngleDegrees) > angular || Math.abs(continuity.maximumAngleDegrees) > angular) return;
          edges.push(edge);
        }
        if (!rectangle(edges, join.center, join.radial, frame.axis, section)) return;
        seamGroups.push(edges.map(edge => edge.id));
      }
      rings.push(seamGroups);
    }
    if (new Set(rings.flat(2)).size !== 12 * joins.length) return;
    const seamGroups = groups.map((_, index) => rings.flatMap(ring => ring[index]));
    const areaOf = (section: Section) => section.radial * section.axial;
    const area = areaOf(sizes.exterior) - sizes.apertures.reduce((sum, section) => sum + areaOf(section), 0);
    const radialMoment = (areaOf(sizes.exterior) * sizes.exterior.radial ** 2
      - sizes.apertures.reduce((sum, section) => sum + areaOf(section) * section.radial ** 2, 0)) / (12 * area);
    const axialMean = -sizes.apertures.reduce((sum, section) => sum + areaOf(section) * (section.interval[0] + section.interval[1]) / 2, 0) / area;
    const length = frame.length + frame.first.radius * frame.first.angle + frame.second.radius * frame.second.angle + (frame.leadLength ?? 0);
    let moment = scale(add(frame.first.end, scale(frame.first.exitTangent, frame.length / 2)), frame.length);
    for (const bend of [frame.first, frame.second]) {
      const integralInward = sub(scale(bend.inward, Math.sin(bend.angle)), scale(bend.tangent, 1 - Math.cos(bend.angle)));
      moment = add(moment, scale(sub(scale(bend.center, bend.angle), scale(integralInward,
        bend.radius + radialMoment / bend.radius)), bend.radius));
    }
    if (leading) moment = add(moment, scale(add(frame.first.start, scale(frame.tangent, -frame.leadLength! / 2)), frame.leadLength!));
    const centroid = add(scale(moment, 1 / length), scale(frame.axis, axialMean)), analytic = area * length, mass = brepMassProperties(brep, 1);
    if (!(analytic > 0) || mass.method !== 'quadrature' || !Number.isFinite(mass.volume)
      || Math.abs(mass.volume - analytic) > CadNumericPolicy.relativeComparison * .1 * Math.max(1, analytic)
      || !pointNear(mass.centroid, centroid) || !(maximumGapMM <= tolerance)) return;
    return { pathKind: 'arc-line-arc' as const, caps, exteriorSeams: seamGroups[0], interiorSeams: seamGroups.slice(1), throughApertures: {
      exteriorFaces: wallGroups[0]!, apertures: sizes.apertures.map((section, index) => ({ index, tags: [...section.tags],
        faces: wallGroups[index + 1]!, seams: seamGroups[index + 1], dimensions: { radial: section.radial, axial: section.axial }, axialInterval: section.interval })),
      dimensions: { firstRadius: frame.first.radius, secondRadius: frame.second.radius, lineLength: frame.length,
        ...(leading ? { leadLength: frame.leadLength! } : {}),
        firstSweepRadians: frame.first.angle, secondSweepRadians: frame.second.angle,
        exterior: { radial: sizes.exterior.radial, axial: sizes.exterior.axial }, axialWeb: sizes.axialWeb },
      junctions: joins.map((join, index) => ({ pieces: join.pieces, exteriorSeams: rings[index][0], interiorSeams: rings[index].slice(1) })),
      volume: { analytic, native: mass.volume, method: 'quadrature' as const }, centroid: { analytic: centroid, native: mass.centroid }, maximumGapMM,
    } };
  } catch { return; }
}

/** Native review for exactly two passages on the same- or opposite-turn arc–line–arc producer. */
export function pairedSpacedArcDuctEvidence(brep: Brep, path: Path, source: Source) {
  return pairedArcDuctEvidence(brep, path, source, false);
}

/** Native review for the original paired planar line–arc–line–arc route, including its charted inlet. */
export function pairedLeadingSpacedArcDuctEvidence(brep: Brep, path: Path, source: Source) {
  const evidence = pairedArcDuctEvidence(brep, path, source, false, 1, true);
  if (!evidence || evidence.throughApertures.dimensions.leadLength === undefined) return;
  return { ...evidence, pathKind: 'line-arc-line-arc' as const };
}

/** Native review for exactly two passages on directly joined opposite-turn circular arcs. */
export function pairedOppositeArcDuctEvidence(brep: Brep, path: Path, source: Source) {
  return directDuctEvidence(brep, path, source, -1);
}

/** Native review for exactly two passages on directly joined unequal-radius same-turn circular arcs. */
export function pairedSameTurnArcDuctEvidence(brep: Brep, path: Path, source: Source) {
  return directDuctEvidence(brep, path, source, 1);
}

function directDuctEvidence(brep: Brep, path: Path, source: Source, turn: -1 | 1) {
  const evidence = pairedArcDuctEvidence(brep, path, source, true, turn);
  if (!evidence) return;
  const { firstRadius, secondRadius, firstSweepRadians, secondSweepRadians, exterior, axialWeb } = evidence.throughApertures.dimensions;
  return { ...evidence, pathKind: 'two-arc' as const, throughApertures: { ...evidence.throughApertures,
    dimensions: { firstRadius, secondRadius, firstSweepRadians, secondSweepRadians, exterior, axialWeb } } };
}
