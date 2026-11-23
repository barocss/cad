import {
  brepMassProperties, CadNumericPolicy, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  measureBrepEdgeContinuity, type Brep, type BrepShell, type Curve, type Point,
} from '@barocss/cad';
import { add, cross, dot, len, scale, sub, unit } from '../engine/vec3';
import { closedDuctCircle, isolatedDuctShell } from './closedRectangularDuctEvidence';

interface Source {
  readonly outer: readonly number[];
  readonly outerTags: readonly string[];
  /** Signed default-sketch bounds relative to the outer section centre, in authored cavity order. */
  readonly cavities: readonly { readonly min: readonly number[]; readonly max: readonly number[]; readonly tags: readonly string[] }[];
}
type Path = Pick<Curve, 'degree' | 'knots' | 'controlPoints' | 'weights'>;
type Interval = [number, number];
const tolerance = CadNumericPolicy.linearTolerance;
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const volumeNear = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b)
  && Math.abs(a - b) <= CadNumericPolicy.relativeComparison * .1 * Math.max(1, Math.abs(b));

/** Match the producer's projected default sketch axes without accepting an authored sketch plane. */
function dimensions(source: Source, frame: NonNullable<ReturnType<typeof closedDuctCircle>>) {
  const finite = (value: number) => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs;
  if (source.outer.length !== 2 || source.outer.some(value => !finite(value) || value <= 0) || source.cavities.length !== 2
    || source.outerTags.length !== 4 || source.cavities.some(cavity => cavity.min.length !== 2 || cavity.max.length !== 2
      || cavity.tags.length !== 4 || [...cavity.min, ...cavity.max].some(value => !finite(value)))) return;
  const tags = [...source.outerTags, ...source.cavities.flatMap(cavity => cavity.tags)];
  if (tags.some(tag => typeof tag !== 'string' || !tag) || new Set(tags).size !== 12) return;
  const project = (axis: Point) => sub(axis, scale(frame.tangent, dot(axis, frame.tangent)));
  const projected = project([1, 0, 0]), x = unit(len(projected) < 1e-6 ? project([0, 1, 0]) : projected);
  const axes = [x, cross(frame.tangent, x)], alignment = Math.min(CadNumericPolicy.relativeComparison, 2 * tolerance / Math.hypot(...source.outer));
  const aligned = (axis: Point) => Math.min(len(sub(axis, frame.radial)), len(add(axis, frame.radial))) <= alignment;
  const radial = aligned(axes[0]) ? 0 : aligned(axes[1]) ? 1 : undefined;
  if (radial === undefined || !(frame.radius - source.outer[radial] / 2 > tolerance)) return;
  const axial = 1 - radial, sign = dot(axes[axial], frame.axis);
  if (!near(Math.abs(sign), 1)) return;
  const cavities = [];
  for (const cavity of source.cavities) {
    const size = cavity.max.map((value, axis) => value - cavity.min[axis]);
    if (size.some(value => value <= tolerance)
      || !near(cavity.min[radial] + cavity.max[radial], 0)
      || cavity.min.some((value, axis) => value + source.outer[axis] / 2 <= 10 * tolerance
        || source.outer[axis] / 2 - cavity.max[axis] <= 10 * tolerance)) return;
    const signed = [sign * cavity.min[axial], sign * cavity.max[axial]];
    cavities.push({ radial: size[radial], axial: size[axial], interval: [Math.min(...signed), Math.max(...signed)] as Interval });
  }
  const [first, second] = cavities[0].interval[0] < cavities[1].interval[0] ? cavities : [cavities[1], cavities[0]];
  const axialWeb = second.interval[0] - first.interval[1];
  if (!(axialWeb > 10 * tolerance)) return;
  return { exterior: { radial: source.outer[radial], axial: source.outer[axial], interval: [-source.outer[axial] / 2, source.outer[axial] / 2] as Interval },
    cavities, axialWeb };
}

/** Positive void volume uses a copied outward shell; the original inward orientation is checked separately. */
function outwardCopy(brep: Brep): Brep {
  const reverse = (sense: 'forward' | 'reversed') => sense === 'forward' ? 'reversed' as const : 'forward' as const;
  return { ...brep, faces: brep.faces.map(face => ({ ...face, sense: reverse(face.sense) })),
    loops: brep.loops.map(loop => ({ ...loop, coedges: loop.coedges.slice().reverse() })),
    coedges: brep.coedges.map(use => ({ ...use, sense: reverse(use.sense), next: use.prev, prev: use.next })) };
}

function walls(brep: Brep, shell: BrepShell, names: Set<string>, expected: { radial: number; axial: number; interval: Interval },
  frame: NonNullable<ReturnType<typeof closedDuctCircle>>, inward: boolean) {
  const native = isolatedDuctShell(brep, shell), report = checkBrep(native, { strict: true });
  if (!shell.closed || shell.body !== brep.bodies[0].id || shell.faces.length !== 8 || native.faces.length !== 8
    || native.loops.length !== 8 || native.coedges.length !== 32 || native.edges.length !== 16 || native.vertices.length !== 8
    || !report.valid || report.topology.length !== 1 || report.topology[0].genus !== 1
    || new Set(native.faces.map(face => face.name)).size !== 8
    || native.faces.some(face => face.shell !== shell.id || face.surface.kind !== 'surface' || !face.name || !names.has(face.name))) return;
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
  const r0 = frame.radius - expected.radial / 2, r1 = frame.radius + expected.radial / 2;
  const [h0, h1] = expected.interval, direction = inward ? -1 : 1;
  if (radial.some(item => !near(item.size, r0) && !near(item.size, r1) || item.out !== direction * (near(item.size, r0) ? -1 : 1))
    || axial.some(item => !near(item.size, h0) && !near(item.size, h1) || !near(item.sign, direction * (near(item.size, h0) ? -1 : 1)))
    || radial.filter(item => near(item.size, r0)).length !== 2 || axial.filter(item => near(item.size, h0)).length !== 2) return;
  const seams: string[] = [], corners: string[] = [];
  let maximumGapMM = Math.max(report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
  for (const edge of native.edges) {
    const uses = native.coedges.filter(use => use.edge === edge.id), [start, end] = curveDomain(edge.curve);
    if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense
      || uses.some(use => !use.pcurve)) return;
    const straight = edge.curve.degree === 1 && edge.curve.controlPoints.length === 2;
    if (!straight && (edge.curve.degree !== 2 || edge.curve.controlPoints.length !== 5)) return;
    for (const use of uses) {
      const chart = use.pcurve!, domain = curveDomain(chart), face = native.faces.find(face => face.loops.includes(use.loop));
      if (domain[0] !== start || domain[1] !== end || chart.controlPoints.some(point => point[2] !== 0) || face?.surface.kind !== 'surface') return;
      for (const fraction of [0, .19, .5, .87, 1]) {
        const at = start + fraction * (end - start), [u, v] = evaluateCurve(chart, at);
        const gap = len(sub(evaluateSurface(face.surface, u, v), evaluateCurve(edge.curve, at)));
        if (!Number.isFinite(gap) || gap > tolerance) return;
        maximumGapMM = Math.max(maximumGapMM, gap);
      }
    }
    const continuity = measureBrepEdgeContinuity(native, edge.id), angle = straight ? 0 : 90;
    const angularTolerance = CadNumericPolicy.relativeComparison * 180 / Math.PI;
    if (continuity.status !== 'measured' || !Number.isFinite(continuity.minimumAngleDegrees) || !Number.isFinite(continuity.maximumAngleDegrees)
      || Math.abs(continuity.minimumAngleDegrees - angle) > angularTolerance || Math.abs(continuity.maximumAngleDegrees - angle) > angularTolerance) return;
    (straight ? seams : corners).push(edge.id);
  }
  if (seams.length !== 8 || corners.length !== 8 || !(maximumGapMM <= tolerance)) return;
  const analytic = 2 * Math.PI * frame.radius * expected.radial * expected.axial;
  const mass = brepMassProperties(inward ? outwardCopy(native) : native, 1);
  const center = add(frame.center, scale(frame.axis, (h0 + h1) / 2));
  if (mass.method !== 'quadrature' || !volumeNear(mass.volume, analytic) || !near(len(sub(mass.centroid, center)), 0)) return;
  return { faces: native.faces.map(face => face.name!), shell: shell.id, seams, corners,
    dimensions: { radial: expected.radial, axial: expected.axial }, axialInterval: expected.interval,
    volume: { analytic, native: mass.volume, method: 'quadrature' as const }, maximumGapMM };
}

/** Evidence only for D1770's source-tagged closed rectangular duct with two separate sealed voids. */
export function closedPairedRectangularDuctEvidence(brep: Brep, path: Path, source: Source) {
  try {
    const frame = closedDuctCircle(path), sizes = frame && dimensions(source, frame);
    if (!frame || !sizes || brep.source.family !== 'sweep-curve' || !brep.source.id || brep.bodies.length !== 1
      || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 3 || brep.bodies[0].shells.length !== 3
      || new Set(brep.bodies[0].shells).size !== 3
      || brep.shells.some(shell => !brep.bodies[0].shells.includes(shell.id))
      || brep.faces.length !== 24 || brep.loops.length !== 24 || brep.coedges.length !== 96 || brep.edges.length !== 48 || brep.vertices.length !== 24) return;
    const report = checkBrep(brep, { strict: true });
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 3) return;
    const names = (tags: readonly string[]) => new Set(tags.flatMap(tag => [1, 2].map(part => `${brep.source.id}.side[${tag}]#${part}`)));
    const groups = [source.outerTags, ...source.cavities.map(cavity => cavity.tags)].map(names);
    const shells = groups.map(group => brep.shells.find(shell => shell.faces.length === 8
      && shell.faces.every(id => group.has(brep.faces.find(face => face.id === id)?.name ?? ''))));
    if (shells.some(shell => !shell) || new Set(shells.map(shell => shell!.id)).size !== 3) return;
    const exterior = walls(brep, shells[0]!, groups[0], sizes.exterior, frame, false);
    const cavities = sizes.cavities.map((size, index) => walls(brep, shells[index + 1]!, groups[index + 1], size, frame, true));
    if (!exterior || !cavities[0] || !cavities[1]) return;
    const [first, second] = [cavities[0], cavities[1]], analytic = exterior.volume.analytic - first.volume.analytic - second.volume.analytic;
    const mass = brepMassProperties(brep, 1);
    const axialMoment = first.volume.analytic * (first.axialInterval[0] + first.axialInterval[1]) / 2
      + second.volume.analytic * (second.axialInterval[0] + second.axialInterval[1]) / 2;
    const center = add(frame.center, scale(frame.axis, -axialMoment / analytic));
    if (!(analytic > 0) || mass.method !== 'quadrature' || !volumeNear(mass.volume, analytic)
      || !near(len(sub(mass.centroid, center)), 0)) return;
    const maximumGapMM = Math.max(exterior.maximumGapMM, first.maximumGapMM, second.maximumGapMM,
      report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
    if (!(maximumGapMM <= tolerance)) return;
    return { exteriorSeams: exterior.seams, interiorSeams: [first.seams, second.seams], closedCavities: {
      exteriorFaces: exterior.faces, exteriorShell: exterior.shell, cavities: [first, second],
      dimensions: { pathRadius: frame.radius, exterior: exterior.dimensions, axialWeb: sizes.axialWeb },
      volume: { analytic, native: mass.volume, method: 'quadrature' as const }, maximumGapMM,
    } };
  } catch { return; }
}
