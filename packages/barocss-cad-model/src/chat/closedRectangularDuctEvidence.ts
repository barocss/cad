import {
  brepMassProperties, CadNumericPolicy, checkBrep, faceGeometry, measureBrepEdgeContinuity,
  type Brep, type BrepShell, type Curve, type Point,
} from '@barocss/cad';
import { add, cross, dot, len, scale, sub, unit } from '../engine/vec3';

interface Source {
  readonly outer: readonly number[];
  readonly inner: readonly number[];
  readonly outerTags: readonly string[];
  readonly innerTags: readonly string[];
}
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
const tolerance = CadNumericPolicy.linearTolerance;
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;

/** Read only the four rational quadrants admitted by the D1673 closed-circle producer. */
export function closedDuctCircle(path: Path) {
  const { degree, knots, controlPoints: points, weights } = path;
  if (degree !== 2 || points.length !== 9 || weights.length !== 9 || knots.length !== 12 ||
    points.some(point => point.length !== 3 || point.some(value => !Number.isFinite(value) || Math.abs(value) > CadNumericPolicy.coordinateAbs)) ||
    weights.some(weight => !(weight > 0 && Number.isFinite(weight))) || knots.some(knot => !Number.isFinite(knot))) return;
  const [a, b, c, d, e] = [knots[2], knots[3], knots[5], knots[7], knots[9]];
  if (!(a < b && b < c && c < d && d < e) || knots[0] !== a || knots[1] !== a || knots[4] !== b ||
    knots[6] !== c || knots[8] !== d || knots[10] !== e || knots[11] !== e) return;
  const center = scale(add(points[0], points[4]), .5), radial = sub(points[0], center), radius = len(radial);
  const extent = Math.max(1, ...points.flat().map(Math.abs));
  const closureTolerance = Math.min(tolerance, 2e-9 + 128 * Number.EPSILON * extent);
  if (!(radius > tolerance && radius <= CadNumericPolicy.coordinateAbs) || len(sub(points[8], points[0])) > closureTolerance) return;
  const first = scale(radial, 1 / radius), side = sub(points[2], center);
  const tangent = unit(sub(side, scale(first, dot(side, first))));
  if (len(tangent) < .5) return;
  const next = scale(tangent, radius), quadrants = [radial, next, scale(radial, -1), scale(next, -1), radial];
  for (let turn = 0; turn < 4; turn++) {
    const i = 2 * turn, weight = weights[i + 1] / weights[0];
    if (weights[i] !== weights[0] || weights[i + 2] !== weights[0] || !(weight < 1)) return;
    const error = Math.max(len(sub(sub(points[i], center), quadrants[turn])),
      len(sub(sub(points[i + 1], center), add(quadrants[turn], quadrants[turn + 1]))),
      len(sub(sub(points[i + 2], center), quadrants[turn + 1])));
    const weightError = radius * Math.abs(weight - Math.SQRT1_2) / ((1 + weight) * (1 + Math.SQRT1_2));
    if (error + weightError > tolerance) return;
    const departure = unit(sub(points[i + 1], points[i])), arrival = unit(sub(points[i + 2], points[i + 1]));
    if (len(sub(departure, scale(quadrants[turn + 1], 1 / radius))) > 4 * closureTolerance / radius ||
      len(add(arrival, scale(quadrants[turn], 1 / radius))) > 4 * closureTolerance / radius) return;
  }
  return { center, radius, tangent, radial: first, axis: unit(cross(first, tangent)) };
}

/** The review scope has no sketch plane; retain the producer's projected default sketch axes. */
function sizes(source: Source, frame: NonNullable<ReturnType<typeof closedDuctCircle>>) {
  if (source.outer.length !== 2 || source.inner.length !== 2 || [...source.outer, ...source.inner].some(size => !(size > 0 && Number.isFinite(size))) ||
    source.inner.some((size, i) => !(source.outer[i] - size > 20 * tolerance)) ||
    source.outerTags.length !== 4 || source.innerTags.length !== 4 ||
    new Set([...source.outerTags, ...source.innerTags]).size !== 8 || [...source.outerTags, ...source.innerTags].some(tag => !tag)) return;
  const project = (axis: Point) => sub(axis, scale(frame.tangent, dot(axis, frame.tangent)));
  const projected = project([1, 0, 0]), x = unit(len(projected) < 1e-6 ? project([0, 1, 0]) : projected);
  const y = cross(frame.tangent, x), alignment = Math.min(CadNumericPolicy.relativeComparison, 2 * tolerance / Math.hypot(...source.outer));
  const aligned = (axis: Point) => Math.min(len(sub(axis, frame.radial)), len(add(axis, frame.radial))) <= alignment;
  const radialIndex = aligned(x) ? 0 : aligned(y) ? 1 : undefined;
  if (radialIndex === undefined || !(frame.radius - source.outer[radialIndex] / 2 > tolerance)) return;
  const axialIndex = 1 - radialIndex;
  return { exterior: { radial: source.outer[radialIndex], axial: source.outer[axialIndex] },
    interior: { radial: source.inner[radialIndex], axial: source.inner[axialIndex] } };
}

export function isolatedDuctShell(brep: Brep, shell: BrepShell): Brep {
  const faces = brep.faces.filter(face => shell.faces.includes(face.id)), faceIds = new Set(faces.map(face => face.id));
  const loops = brep.loops.filter(loop => faceIds.has(loop.face)), loopIds = new Set(loops.map(loop => loop.id));
  const coedges = brep.coedges.filter(use => loopIds.has(use.loop)), edgeIds = new Set(coedges.map(use => use.edge));
  const edges = brep.edges.filter(edge => edgeIds.has(edge.id)), vertexIds = new Set(edges.flatMap(edge => edge.vertices));
  return { ...brep, bodies: [{ ...brep.bodies[0], shells: [shell.id] }], shells: [shell], faces, loops, coedges, edges,
    vertices: brep.vertices.filter(vertex => vertexIds.has(vertex.id)) };
}

function walls(brep: Brep, shell: BrepShell, names: Set<string>, expected: { radial: number; axial: number },
  frame: NonNullable<ReturnType<typeof closedDuctCircle>>, inward: boolean) {
  const native = isolatedDuctShell(brep, shell), report = checkBrep(native, { strict: true });
  if (!shell.closed || native.faces.length !== 8 || native.loops.length !== 8 || native.coedges.length !== 32 ||
    native.edges.length !== 16 || native.vertices.length !== 8 || !report.valid || report.topology.length !== 1 || report.topology[0].genus !== 1 ||
    new Set(native.faces.map(face => face.name)).size !== 8 || native.faces.some(face => face.surface.kind !== 'surface' || !face.name || !names.has(face.name))) return;
  const radial: { size: number; out: number }[] = [], axial: { size: number; sign: number }[] = [];
  for (const face of native.faces) {
    const geometry = faceGeometry(face);
    if (geometry.kind === 'cylinder') {
      if (!near(Math.abs(dot(geometry.a, frame.axis)), 1) || !near(len(cross(sub(geometry.c, frame.center), frame.axis)), 0)) return;
      radial.push({ size: geometry.r, out: geometry.out });
    } else if (geometry.kind === 'plane') {
      const sign = dot(geometry.n, frame.axis);
      if (!near(Math.abs(sign), 1)) return;
      axial.push({ size: dot(sub(geometry.o, frame.center), frame.axis), sign });
    } else return;
  }
  if (radial.length !== 4 || axial.length !== 4) return;
  const r0 = Math.min(...radial.map(item => item.size)), r1 = Math.max(...radial.map(item => item.size));
  const h0 = Math.min(...axial.map(item => item.size)), h1 = Math.max(...axial.map(item => item.size));
  if (!near(r0 + r1, 2 * frame.radius) || !near(h0 + h1, 0) || !near(r1 - r0, expected.radial) || !near(h1 - h0, expected.axial)) return;
  const direction = inward ? -1 : 1;
  if (radial.some(item => !near(item.size, r0) && !near(item.size, r1) || item.out !== direction * (near(item.size, r0) ? -1 : 1)) ||
    axial.some(item => !near(item.size, h0) && !near(item.size, h1) || !near(item.sign, direction * (near(item.size, h0) ? -1 : 1))) ||
    radial.filter(item => near(item.size, r0)).length !== 2 || axial.filter(item => near(item.size, h0)).length !== 2) return;
  const seams: string[] = [], corners: string[] = [];
  for (const edge of native.edges) {
    const uses = native.coedges.filter(use => use.edge === edge.id);
    if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense || uses.some(use => !use.pcurve)) return;
    const straight = edge.curve.degree === 1 && edge.curve.controlPoints.length === 2;
    if (!straight && (edge.curve.degree !== 2 || edge.curve.controlPoints.length !== 5)) return;
    const continuity = measureBrepEdgeContinuity(native, edge.id), angle = straight ? 0 : 90;
    const angularTolerance = CadNumericPolicy.relativeComparison * 180 / Math.PI;
    if (continuity.status !== 'measured' || !Number.isFinite(continuity.minimumAngleDegrees) || !Number.isFinite(continuity.maximumAngleDegrees) ||
      Math.abs(continuity.minimumAngleDegrees - angle) > angularTolerance ||
      Math.abs(continuity.maximumAngleDegrees - angle) > angularTolerance) return;
    (straight ? seams : corners).push(edge.id);
  }
  if (seams.length !== 8 || corners.length !== 8) return;
  const maximumGapMM = Math.max(report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
  if (!(maximumGapMM <= tolerance)) return;
  return { faces: native.faces.map(face => face.name!), shell: shell.id, seams,
    size: { radial: r1 - r0, axial: h1 - h0 }, maximumGapMM };
}

/** Evidence only for the source-tagged D1762 closed rectangular duct. No document or geometry changes. */
export function closedRectangularDuctEvidence(brep: Brep, path: Path, source: Source) {
  try {
    const frame = closedDuctCircle(path), dimensions = frame && sizes(source, frame);
    if (!frame || !dimensions || brep.source.family !== 'sweep-curve' || !brep.source.id || brep.bodies.length !== 1 ||
      brep.bodies[0].kind !== 'solid' || brep.shells.length !== 2) return;
    const report = checkBrep(brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2 ||
      report.counts.faces !== 16 || report.counts.loops !== 16 || report.counts.coedges !== 64 || report.counts.edges !== 32 || report.counts.vertices !== 16) return;
    const names = (tags: readonly string[]) => new Set(tags.flatMap(tag => [1, 2].map(part => `${brep.source.id}.side[${tag}]#${part}`)));
    const exteriorNames = names(source.outerTags), interiorNames = names(source.innerTags);
    const exteriorShell = brep.shells.find(shell => shell.faces.every(id => exteriorNames.has(brep.faces.find(face => face.id === id)?.name ?? '')));
    const interiorShell = brep.shells.find(shell => shell.faces.every(id => interiorNames.has(brep.faces.find(face => face.id === id)?.name ?? '')));
    if (!exteriorShell || !interiorShell || exteriorShell.id === interiorShell.id) return;
    const exterior = walls(brep, exteriorShell, exteriorNames, dimensions.exterior, frame, false);
    const interior = walls(brep, interiorShell, interiorNames, dimensions.interior, frame, true);
    if (!exterior || !interior) return;
    const analytic = 2 * Math.PI * frame.radius * (dimensions.exterior.radial * dimensions.exterior.axial - dimensions.interior.radial * dimensions.interior.axial);
    const native = brepMassProperties(brep, 1);
    if (!(analytic > 0 && Number.isFinite(analytic)) || native.method !== 'quadrature' || !Number.isFinite(native.volume) ||
      Math.abs(native.volume - analytic) > CadNumericPolicy.relativeComparison * .1 * Math.max(1, analytic) || !near(len(sub(native.centroid, frame.center)), 0)) return;
    const maximumGapMM = Math.max(exterior.maximumGapMM, interior.maximumGapMM,
      report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
    if (!(maximumGapMM <= tolerance)) return;
    return { exteriorSeams: exterior.seams, interiorSeams: interior.seams, closedCavity: {
      exteriorFaces: exterior.faces, interiorFaces: interior.faces, exteriorShell: exterior.shell, interiorShell: interior.shell,
      dimensions: { pathRadius: frame.radius, exterior: exterior.size, interior: interior.size,
        wall: { radial: (exterior.size.radial - interior.size.radial) / 2, axial: (exterior.size.axial - interior.size.axial) / 2 } },
      volume: { analytic, native: native.volume, method: 'quadrature' as const }, maximumGapMM,
    } };
  } catch { return; }
}
