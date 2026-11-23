import {
  brepMassProperties, CadNumericPolicy, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  measureBrepEdgeContinuity, type Brep, type BrepFace, type Point,
} from '@barocss/cad';
import { cross, dot, len, sub } from '../engine/vec3';

interface Section { readonly radial: number; readonly axial: number }
export interface PairedDuctIntersectionDimensions {
  readonly pathRadius: number;
  readonly exterior: Section;
  readonly cavities: readonly (Section & { readonly axialInterval: readonly number[]; readonly faces: readonly string[] })[];
}
interface Wall { face: BrepFace; group: number }
interface Bounds extends Section { interval: readonly number[]; names?: ReadonlySet<string> }
const tolerance = CadNumericPolicy.linearTolerance;
const angularTolerance = CadNumericPolicy.relativeComparison * 180 / Math.PI;
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;
const baseName = (name: string) => name.replace(/#\d+$/, '');

function sections(dimensions: PairedDuctIntersectionDimensions): Bounds[] | undefined {
  const { pathRadius: radius, exterior, cavities } = dimensions;
  const finite = (value: number) => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs;
  if (![radius, exterior.radial, exterior.axial].every(value => finite(value) && value > tolerance)
    || !(radius - exterior.radial / 2 > tolerance) || cavities.length !== 2) return;
  const result: Bounds[] = [{ ...exterior, interval: [-exterior.axial / 2, exterior.axial / 2] }];
  const names = new Set<string>();
  for (const cavity of cavities) {
    const [low, high] = cavity.axialInterval;
    if (cavity.axialInterval.length !== 2 || ![cavity.radial, cavity.axial, low, high].every(finite)
      || !(cavity.radial > tolerance && cavity.axial > tolerance && exterior.radial - cavity.radial > 20 * tolerance)
      || !near(high - low, cavity.axial) || !(low + exterior.axial / 2 > 10 * tolerance && exterior.axial / 2 - high > 10 * tolerance)
      || cavity.faces.length !== 8 || cavity.faces.some(name => typeof name !== 'string' || !name)
      || new Set(cavity.faces).size !== 8) return;
    const group = new Set(cavity.faces.map(baseName));
    if (group.size !== 4 || [...group].some(name => names.has(name) || cavity.faces.filter(face => baseName(face) === name).length !== 2)) return;
    for (const name of group) names.add(name);
    result.push({ radial: cavity.radial, axial: cavity.axial, interval: cavity.axialInterval, names: group });
  }
  const sorted = result.slice(1).sort((a, b) => a.interval[0] - b.interval[0]);
  if (!(sorted[1].interval[0] - sorted[0].interval[1] > 10 * tolerance)) return;
  return result;
}

function wallKey(face: BrepFace, section: Bounds, radius: number, group: number) {
  const geometry = faceGeometry(face), direction = group === 0 ? 1 : -1, [low, high] = section.interval;
  if (face.surface.kind !== 'surface') return;
  const z = face.surface.controlPoints.flat().map(point => point[2]);
  if (geometry.kind === 'cylinder' && near(Math.abs(geometry.a[2]), 1) && near(Math.hypot(geometry.c[0], geometry.c[1]), 0)
    && near(Math.min(...z), low) && near(Math.max(...z), high)) {
    const sign = near(geometry.r, radius - section.radial / 2) ? -1 : near(geometry.r, radius + section.radial / 2) ? 1 : undefined;
    if (sign && geometry.out === direction * sign) return `${group}:cylinder:${sign}`;
  } else if (geometry.kind === 'plane' && near(Math.hypot(geometry.n[0], geometry.n[1]), 0)
    && z.every(value => near(value, geometry.o[2]))) {
    const sign = near(geometry.o[2], low) ? -1 : near(geometry.o[2], high) ? 1 : undefined;
    if (sign && near(geometry.n[2], direction * sign)) return `${group}:plane:${sign}`;
  }
}

function capLoop(brep: Brep, face: BrepFace, id: string, group: number, side: 1 | -1,
  radius: number, section: Bounds, walls: ReadonlyMap<string, Wall>) {
  const loop = brep.loops.find(loop => loop.id === id), geometry = faceGeometry(face);
  if (!loop || loop.face !== face.id || loop.kind !== (group === 0 ? 'outer' : 'inner') || loop.coedges.length !== 4 || geometry.kind !== 'plane') return;
  const expectedY = [side * radius - section.radial / 2, side * radius + section.radial / 2];
  const corners = new Set<string>(), edges: string[] = [], wallNames: string[] = [], wallIds: string[] = [], points: Point[] = [];
  let signedArea = 0;
  for (const id of loop.coedges) {
    const use = brep.coedges.find(use => use.id === id), twin = use?.twin && brep.coedges.find(candidate => candidate.id === use.twin);
    const edge = use && brep.edges.find(edge => edge.id === use.edge), mate = twin && walls.get(twin.loop);
    if (!use || use.loop !== loop.id || !twin || twin.twin !== use.id || twin.edge !== use.edge || twin.sense === use.sense
      || !use.pcurve || !twin.pcurve || !edge || !mate || mate.group !== group || !mate.face.name
      || edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2 || edge.curve.weights[0] !== edge.curve.weights[1]) return;
    const [a, b] = edge.curve.controlPoints;
    if (near(a[1], b[1]) === near(a[2], b[2])) return;
    for (const point of [a, b]) {
      const y = near(point[1], expectedY[0]) ? 0 : near(point[1], expectedY[1]) ? 1 : undefined;
      const z = near(point[2], section.interval[0]) ? 0 : near(point[2], section.interval[1]) ? 1 : undefined;
      if (!near(point[0], 0) || y === undefined || z === undefined) return;
      corners.add(`${y}:${z}`); points.push(point);
    }
    signedArea += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), geometry.n) / 2;
    edges.push(edge.id); wallNames.push(mate.face.name); wallIds.push(mate.face.id);
  }
  if (corners.size !== 4 || new Set(edges).size !== 4 || new Set(wallNames).size !== 4 || new Set(wallIds).size !== 4) return;
  const y: [number, number] = [Math.min(...points.map(point => point[1])), Math.max(...points.map(point => point[1]))];
  const z: [number, number] = [Math.min(...points.map(point => point[2])), Math.max(...points.map(point => point[2]))];
  const width = y[1] - y[0], height = z[1] - z[0], expectedArea = (group === 0 ? 1 : -1) * section.radial * section.axial;
  if (!(width > tolerance && height > tolerance) || Math.abs(signedArea - expectedArea) > tolerance * Math.max(1, 2 * (width + height))) return;
  return { name: `${face.name}.${group === 0 ? 'outer' : `cavity${group}`}-rim`, owner: face.name!, face: face.id,
    loop: loop.id, edges, walls: wallNames, wallIds, y, z, width, height, signedArea };
}

/** Native evidence for D1773's centered half ring. Source replay and world-Z interval conversion belong to the caller. */
export function pairedRectangularDuctIntersectionEvidence(brep: Brep, dimensions: PairedDuctIntersectionDimensions) {
  try {
    const bounds = sections(dimensions);
    if (!bounds || brep.source.family !== 'analytic-boolean' || !brep.source.id || brep.bodies.length !== 1
      || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed
      || brep.faces.length !== 14 || brep.loops.length !== 18 || brep.edges.length !== 36 || brep.coedges.length !== 72
      || brep.vertices.length !== 24 || brep.faces.some(face => face.surface.kind !== 'surface' || !face.name)
      || new Set(brep.faces.map(face => face.name)).size !== 14 || brep.coedges.some(use => !use.pcurve)) return;
    const report = checkBrep(brep, { strict: true });
    let maximumGapMM = Math.max(report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 2 || !(maximumGapMM <= tolerance)) return;
    const wallByLoop = new Map<string, Wall>(), keys = new Set<string>(), capFaces: BrepFace[] = [];
    for (const face of brep.faces) {
      const geometry = faceGeometry(face);
      if (geometry.kind === 'plane' && near(geometry.n[0], -1) && near(Math.hypot(geometry.n[1], geometry.n[2]), 0)
        && near(geometry.o[0], 0)) { capFaces.push(face); continue; }
      const group = bounds.findIndex(section => section.names?.has(baseName(face.name!)));
      const index = group < 0 ? 0 : group, section = bounds[index];
      const key = wallKey(face, section, dimensions.pathRadius, index);
      if (!key || keys.has(key) || face.loops.length !== 1 || brep.loops.find(loop => loop.id === face.loops[0])?.coedges.length !== 4) return;
      keys.add(key); wallByLoop.set(face.loops[0], { face, group: index });
    }
    if (keys.size !== 12 || capFaces.length !== 2) return;
    const caps = [], sides = new Set<number>();
    for (const face of capFaces) {
      if (face.loops.length !== 3) return;
      const outerLoop = brep.loops.find(loop => face.loops.includes(loop.id) && loop.kind === 'outer');
      const innerLoops = brep.loops.filter(loop => face.loops.includes(loop.id) && loop.kind === 'inner');
      const use = outerLoop && brep.coedges.find(use => use.id === outerLoop.coedges[0]);
      const point = use && brep.edges.find(edge => edge.id === use.edge)?.curve.controlPoints[0];
      if (!outerLoop || innerLoops.length !== 2 || !point || near(point[1], 0)) return;
      const side = Math.sign(point[1]) as 1 | -1;
      const outer = capLoop(brep, face, outerLoop.id, 0, side, dimensions.pathRadius, bounds[0], wallByLoop);
      const cavities = bounds.slice(1).map((section, index) => innerLoops.map(loop =>
        capLoop(brep, face, loop.id, index + 1, side, dimensions.pathRadius, section, wallByLoop)).filter(rim => rim !== undefined));
      if (!outer || sides.has(side) || cavities.some(matches => matches.length !== 1)) return;
      const apertures = cavities.map(matches => matches[0]), materialArea = outer.signedArea + apertures.reduce((sum, rim) => sum + rim.signedArea, 0);
      if (!(materialArea > 0 && outer.signedArea > 0 && apertures.every(rim => rim.signedArea < 0))
        || new Set([outer.loop, ...apertures.map(rim => rim.loop)]).size !== 3) return;
      const geometry = faceGeometry(face);
      if (geometry.kind !== 'plane') return;
      caps.push({ name: face.name!, face: face.id, side, normal: geometry.n, outer, cavities: apertures, materialArea }); sides.add(side);
    }
    let arcs = 0, lines = 0, measuredEdges = 0, maximumAngleErrorDegrees = 0;
    const corners: string[] = [];
    for (const edge of brep.edges) {
      const uses = brep.coedges.filter(use => use.edge === edge.id), [start, end] = curveDomain(edge.curve);
      if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense) return;
      const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
      if (!owners[0] || !owners[1] || owners[0].id === owners[1].id) return;
      if (edge.curve.degree === 1) lines++; else if (edge.curve.degree === 2) arcs++; else return;
      for (const [index, use] of uses.entries()) {
        const chart = use.pcurve!, domain = curveDomain(chart), face = owners[index]!;
        if (domain[0] !== start || domain[1] !== end || chart.controlPoints.some(point => point[2] !== 0) || face.surface.kind !== 'surface') return;
        for (const fraction of [0, .17, .5, .77, 1]) {
          const at = start + (end - start) * fraction, point = evaluateCurve(edge.curve, at), [u, v] = evaluateCurve(chart, at);
          const gap = len(sub(evaluateSurface(face.surface, u, v), point));
          if (!Number.isFinite(gap) || gap > tolerance || point[0] < -tolerance) return;
          maximumGapMM = Math.max(maximumGapMM, gap);
        }
      }
      const continuity = measureBrepEdgeContinuity(brep, edge.id);
      if (continuity.status !== 'measured' || !Number.isFinite(continuity.minimumAngleDegrees) || !Number.isFinite(continuity.maximumAngleDegrees)
        || Math.abs(continuity.minimumAngleDegrees - 90) > angularTolerance || Math.abs(continuity.maximumAngleDegrees - 90) > angularTolerance) return;
      measuredEdges++; corners.push(edge.id);
      maximumAngleErrorDegrees = Math.max(maximumAngleErrorDegrees, Math.abs(continuity.minimumAngleDegrees - 90), Math.abs(continuity.maximumAngleDegrees - 90));
    }
    if (arcs !== 12 || lines !== 24) return;
    const signed = bounds.map((section, index) => ({ ...section, sign: index === 0 ? 1 : -1 }));
    const area = signed.reduce((sum, section) => sum + section.sign * section.radial * section.axial, 0);
    const analytic = Math.PI * dimensions.pathRadius * area;
    const centroid: Point = [2 * signed.reduce((sum, section) => sum + section.sign * section.axial
      * (dimensions.pathRadius ** 2 * section.radial + section.radial ** 3 / 12), 0) / analytic, 0,
    signed.reduce((sum, section) => sum + section.sign * section.radial * section.axial * (section.interval[0] + section.interval[1]) / 2, 0) / area];
    const native = brepMassProperties(brep, 1);
    if (!(analytic > 0 && Number.isFinite(analytic)) || native.method !== 'quadrature' || !Number.isFinite(native.volume)
      || Math.abs(native.volume - analytic) > CadNumericPolicy.relativeComparison * .1 * Math.max(1, analytic)
      || !near(len(sub(native.centroid, centroid)), 0)) return;
    return { caps: caps.sort((a, b) => a.side - b.side), volume: { analytic, native: native.volume, method: 'quadrature' as const },
      centroid: { analytic: centroid, native: native.centroid }, maximumGapMM, measuredEdges, corners, maximumAngleErrorDegrees };
  } catch { return; }
}
