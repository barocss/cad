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

/** Independent tangent/chord oracle, with a bounded rational-weight correction in millimetres. */
function lineArc(path: Path) {
  const { degree, knots, controlPoints: points, weights } = path;
  if (degree !== 2 || points.length !== 5 || weights.length !== 5 || knots.length !== 8
    || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs))
    || weights.some(value => !Number.isFinite(value) || value <= 0) || knots.some(value => !Number.isFinite(value))
    || weights[0] !== weights[1] || weights[1] !== weights[2] || weights[2] !== weights[4]
    || knots[0] !== knots[2] || knots[1] !== knots[2] || knots[3] !== knots[4]
    || knots[5] !== knots[6] || knots[6] !== knots[7] || !(knots[2] < knots[3] && knots[3] < knots[5])) return;
  const [start, middle, join, pole, end] = points, leadLength = len(sub(join, start));
  const tangent = unit(sub(join, start)), chord = sub(end, join), across = sub(chord, scale(tangent, dot(chord, tangent)));
  const height = len(across), weight = weights[3] / weights[2];
  if (!(leadLength >= minimumLengthMM && height > tolerance && weight > 0 && weight < 1)
    // The midpoint pole contributes 2t(1-t), at most one half, to the straight span.
    || .5 * len(sub(middle, scale(add(start, join), .5))) > tolerance) return;
  const inward = scale(across, 1 / height), radius = dot(chord, chord) / (2 * height), rawAngle = 2 * Math.atan2(height, dot(chord, tangent));
  if (!(radius > tolerance && radius <= CadNumericPolicy.coordinateAbs)) return;
  const angle = Math.max(Math.PI / 6, Math.min(2 * Math.PI / 3, rawAngle));
  const expectedPole = add(join, scale(tangent, radius * Math.tan(angle / 2))), canonicalWeight = Math.cos(angle / 2);
  // Positive rational weights bound the pole correction by its largest displacement. The middle
  // Bernstein coefficient is at most 1/2; bound weight error with the span's chord/handle diameter.
  const diameter = Math.max(len(chord), len(sub(expectedPole, join)));
  const weightCorrection = .5 * Math.abs(weight - canonicalWeight) * diameter / Math.min(1, weight, canonicalWeight);
  if (radius * Math.abs(rawAngle - angle) > tolerance
    || len(sub(pole, expectedPole)) + weightCorrection > tolerance
    || !pointNear(end, add(join, add(scale(tangent, radius * Math.sin(angle)), scale(inward, radius * (1 - Math.cos(angle))))))) return;
  const axis = unit(cross(tangent, inward)), center = add(join, scale(inward, radius));
  const exitTangent = add(scale(tangent, Math.cos(angle)), scale(inward, Math.sin(angle)));
  const exitInward = sub(scale(inward, Math.cos(angle)), scale(tangent, Math.sin(angle)));
  return { start, join, end, tangent, inward, axis, center, radius, angle, leadLength, exitTangent, exitInward };
}
/** Independently recover both straight spans without changing the admitted lead-only oracle. */
function lineArcLine(path: Path) {
  const { degree, knots, controlPoints: points, weights } = path;
  if (degree !== 2 || points.length !== 7 || weights.length !== 7 || knots.length !== 10
    || points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs))
    || weights.some(value => !Number.isFinite(value) || value <= 0) || knots.some(value => !Number.isFinite(value))
    || weights[4] !== weights[5] || weights[5] !== weights[6]
    || knots[5] !== knots[6] || knots[7] !== knots[8] || knots[8] !== knots[9] || !(knots[6] < knots[7])) return;
  const frame = lineArc({ degree, knots: [...knots.slice(0, 7), knots[6]], controlPoints: points.slice(0, 5), weights: weights.slice(0, 5) });
  if (!frame) return;
  const [arcEnd, middle, end] = points.slice(4), tailLength = len(sub(end, arcEnd));
  if (!(tailLength >= minimumLengthMM)
    || .5 * len(sub(middle, scale(add(arcEnd, end), .5))) > tolerance
    || !pointNear(sub(end, arcEnd), scale(frame.exitTangent, tailLength))) return;
  return { ...frame, arcEnd, end, tailLength };
}
type Frame = NonNullable<ReturnType<typeof lineArc>> & { arcEnd?: Point; tailLength?: number };

function sections(source: Source, frame: Frame) {
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
  for (const cavity of source.cavities) {
    const size = cavity.max.map((value, axis) => value - cavity.min[axis]);
    if (size.some(value => value < minimumLengthMM) || !near(cavity.min[radial] + cavity.max[radial], 0)
      || cavity.min.some((value, axis) => value + source.outer[axis] / 2 <= 10 * tolerance
        || source.outer[axis] / 2 - cavity.max[axis] <= 10 * tolerance)) return;
    const interval = [sign * cavity.min[axial], sign * cavity.max[axial]];
    apertures.push({ radial: size[radial], axial: size[axial], interval: [Math.min(...interval), Math.max(...interval)], tags: cavity.tags });
  }
  const [first, second] = apertures[0].interval[0] < apertures[1].interval[0] ? apertures : [apertures[1], apertures[0]];
  const axialWeb = second.interval[0] - first.interval[1];
  if (!(axialWeb > 10 * tolerance)) return;
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

/** No generic/fitted wall supports: verify every tagged straight plane and bend plane/cylinder. */
function walls(brep: Brep, feature: string, frame: Frame, section: Section, inward: boolean) {
  const pieces = frame.tailLength === undefined ? ['line', 'bend'] : ['line', 'bend', 'tail'];
  const names = pieces.flatMap(piece => section.tags.map(tag => `${feature}.${piece}.side[${tag}]`));
  const direction = inward ? -1 : 1, angular = CadNumericPolicy.relativeComparison;
  for (const piece of pieces) {
    const radial = piece === 'tail' ? frame.exitInward : frame.inward, center = piece === 'tail' ? frame.arcEnd! : frame.join;
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
        if (piece !== 'bend') for (const index of [0, 1]) {
          if (len(sub(geometry.n, scale(radial, direction * (index ? 1 : -1)))) <= angular
            && near(dot(sub(geometry.o, center), radial), (index ? 1 : -1) * section.radial / 2)) side = `radial${index}`;
        }
      } else if (piece === 'bend' && geometry.kind === 'cylinder'
        && len(cross(geometry.a, frame.axis)) <= angular && near(Math.abs(dot(geometry.a, frame.axis)), 1)
        && near(len(cross(sub(geometry.c, frame.center), frame.axis)), 0)) {
        for (const index of [0, 1]) if (near(geometry.r, frame.radius - (index ? 1 : -1) * section.radial / 2)
          && geometry.out === direction * (index ? -1 : 1)) side = `radial${index}`;
      }
      if (!side || found.has(side)) return;
      found.add(side);
    }
    if (found.size !== 4) return;
  }
  return names;
}

/** Native evidence for paired, open line–arc and line–arc–line producers. Inputs stay unchanged. */
export function pairedLineArcDuctEvidence(brep: Brep, path: Path, source: Source) {
  try {
    const frame: Frame | undefined = path.controlPoints.length === 7 ? lineArcLine(path) : lineArc(path), sizes = frame && sections(source, frame), feature = brep.source.id;
    if (!frame || !sizes || brep.source.family !== 'sweep-curve' || !feature || brep.bodies.length !== 1
      || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed
      || brep.bodies[0].shells.length !== 1 || brep.bodies[0].shells[0] !== brep.shells[0].id
      || brep.shells[0].body !== brep.bodies[0].id) return;
    const hasTail = frame.tailLength !== undefined;
    const report = checkBrep(brep, { strict: true }), expected = hasTail
      ? { bodies: 1, shells: 1, faces: 38, loops: 42, coedges: 168, edges: 84, vertices: 48 }
      : { bodies: 1, shells: 1, faces: 26, loops: 30, coedges: 120, edges: 60, vertices: 36 };
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2
      || Object.entries(expected).some(([key, value]) => report.counts[key as keyof typeof expected] !== value)) return;
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
    for (const edge of brep.edges) if (!peers(edge, edge.curve.degree === 1)) return;
    const caps = [];
    for (const end of ['start', 'end']) {
      const name = `${feature}.${end}`, face = brep.faces.find(face => face.name === name);
      const start = end === 'start', center = start ? frame.start : frame.end, inward = start ? frame.inward : frame.exitInward;
      const normal = start ? scale(frame.tangent, -1) : frame.exitTangent, piece = start ? 'line' : hasTail ? 'tail' : 'bend';
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
          const pair = edge && peers(edge, true), twin = pair?.find(peer => peer.id !== use?.id);
          const other = twin && brep.faces.find(face => face.loops.includes(twin.loop));
          if (!use || use.loop !== loop.id || !edge || !pair || !other?.name) return;
          adjacent.push(other.name); edges.push(edge);
          if (edge.curve.controlPoints.length !== 2) return;
          const [a, b] = edge.curve.controlPoints.map(point => sub(point, center));
          area += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), normal) / 2;
        }
        const group = groups.findIndex(section => adjacent.every(name => section.tags.some(tag => name === `${feature}.${piece}.side[${tag}]`)));
        if (group < 0 || found.has(group) || new Set(adjacent).size !== 4 || loop.kind !== (group ? 'inner' : 'outer')) return;
        const section = groups[group];
        if (!rectangle(edges, center, inward, frame.axis, section) || !near(area, (group ? -1 : 1) * section.radial * section.axial)) return;
        found.set(group, edges.map(edge => edge.id));
      }
      if (found.size !== 3) return;
      const apertures = sizes.apertures.map((section, index) => ({ index, tags: [...section.tags], edges: found.get(index + 1)!,
        center: add(center, scale(frame.axis, (section.interval[0] + section.interval[1]) / 2)),
        dimensions: { radial: section.radial, axial: section.axial }, axialInterval: section.interval }));
      caps.push({ name, outerEdges: found.get(0)!, innerEdges: apertures.flatMap(aperture => aperture.edges),
        center, plane: { origin: plane.o, normal: plane.n }, apertures });
    }
    const joins = [{ pieces: ['line', 'bend'], center: frame.join, inward: frame.inward },
      ...(hasTail ? [{ pieces: ['bend', 'tail'], center: frame.arcEnd!, inward: frame.exitInward }] : [])];
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
        if (!rectangle(edges, join.center, join.inward, frame.axis, section)) return;
        seamGroups.push(edges.map(edge => edge.id));
      }
      rings.push(seamGroups);
    }
    if (new Set(rings.flat(2)).size !== (hasTail ? 24 : 12)) return;
    const seamGroups = groups.map((_, index) => rings.flatMap(ring => ring[index]));
    const areaOf = (section: Section) => section.radial * section.axial, area = areaOf(sizes.exterior) - sizes.apertures.reduce((sum, section) => sum + areaOf(section), 0);
    const length = frame.leadLength + frame.radius * frame.angle + (frame.tailLength ?? 0), analytic = area * length, mass = brepMassProperties(brep, 1);
    const radialMoment = (areaOf(sizes.exterior) * sizes.exterior.radial ** 2
      - sizes.apertures.reduce((sum, section) => sum + areaOf(section) * section.radial ** 2, 0)) / (12 * area);
    const axialMean = -sizes.apertures.reduce((sum, section) => sum + areaOf(section) * (section.interval[0] + section.interval[1]) / 2, 0) / area;
    const meanRadius = frame.radius + radialMoment / frame.radius;
    const leadCenter = add(frame.join, scale(frame.tangent, -frame.leadLength / 2));
    const bendCenter = add(frame.join, add(scale(frame.tangent, meanRadius * (1 - Math.cos(frame.angle)) / frame.angle),
      scale(frame.inward, frame.radius - meanRadius * Math.sin(frame.angle) / frame.angle)));
    const firstMoment = add(scale(leadCenter, frame.leadLength), scale(bendCenter, frame.radius * frame.angle));
    const centroid = add(scale(hasTail ? add(firstMoment, scale(add(frame.arcEnd!, scale(frame.exitTangent, frame.tailLength! / 2)), frame.tailLength!))
      : firstMoment, 1 / length), scale(frame.axis, axialMean));
    if (!(analytic > 0) || mass.method !== 'quadrature' || !Number.isFinite(mass.volume)
      || Math.abs(mass.volume - analytic) > CadNumericPolicy.relativeComparison * .1 * Math.max(1, analytic)
      || !pointNear(mass.centroid, centroid) || !(maximumGapMM <= tolerance)) return;
    return { pathKind: hasTail ? 'line-arc-line' as const : 'line-and-arc' as const, caps, exteriorSeams: seamGroups[0], interiorSeams: seamGroups.slice(1), throughApertures: {
      exteriorFaces: wallGroups[0]!, apertures: sizes.apertures.map((section, index) => ({ index, tags: [...section.tags],
        faces: wallGroups[index + 1]!, seams: seamGroups[index + 1], dimensions: { radial: section.radial, axial: section.axial }, axialInterval: section.interval })),
      dimensions: { pathRadius: frame.radius, leadLength: frame.leadLength, ...(hasTail ? { tailLength: frame.tailLength! } : {}), sweepRadians: frame.angle,
        exterior: { radial: sizes.exterior.radial, axial: sizes.exterior.axial }, axialWeb: sizes.axialWeb },
      ...(hasTail ? { junctions: joins.map((join, index) => ({ pieces: join.pieces, exteriorSeams: rings[index][0], interiorSeams: rings[index].slice(1) })) } : {}),
      volume: { analytic, native: mass.volume, method: 'quadrature' as const }, centroid: { analytic: centroid, native: mass.centroid }, maximumGapMM,
    } };
  } catch { return; }
}
