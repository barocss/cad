import {
  brepMassProperties, CadNumericPolicy, checkBrep, curveDomain, evaluateCurve, evaluateSurface, faceGeometry,
  measureBrepEdgeContinuity, type Brep, type BrepFace, type Point,
} from '@barocss/cad';
import { cross, dot, len, sub } from '../engine/vec3';

export interface OffsetDuctDimensions {
  readonly pathRadius: number;
  readonly exterior: { readonly radial: number; readonly axial: number };
  readonly interior: { readonly radial: number; readonly axial: number };
}

type Group = 'outer' | 'inner';
type Geometry = ReturnType<typeof faceGeometry>;
interface Wall { face: BrepFace; group: Group; geometry: Geometry }
const tolerance = CadNumericPolicy.linearTolerance;
const angularTolerance = CadNumericPolicy.relativeComparison * 180 / Math.PI;
const fractions = [0, .17, .5, .77, 1];
const near = (a: number, b: number) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= tolerance;

function dimensionsValid(dimensions: OffsetDuctDimensions, offset: number): boolean {
  const { pathRadius: radius, exterior, interior } = dimensions;
  const values = [radius, exterior.radial, exterior.axial, interior.radial, interior.axial];
  return values.every(value => Number.isFinite(value) && value > tolerance && value <= CadNumericPolicy.coordinateAbs)
    && exterior.radial - interior.radial > 20 * tolerance && exterior.axial - interior.axial > 20 * tolerance
    && Number.isFinite(offset) && offset > tolerance && offset < radius - exterior.radial / 2 - tolerance;
}

function wallGroup(geometry: Geometry, dimensions: OffsetDuctDimensions): Group | undefined {
  const { pathRadius: radius } = dimensions;
  for (const group of ['outer', 'inner'] as const) {
    const section = group === 'outer' ? dimensions.exterior : dimensions.interior, direction = group === 'outer' ? 1 : -1;
    if (geometry.kind === 'cylinder' && near(Math.abs(geometry.a[2]), 1) && near(Math.hypot(geometry.c[0], geometry.c[1]), 0)) {
      const radialSign = near(geometry.r, radius - section.radial / 2) ? -1 : near(geometry.r, radius + section.radial / 2) ? 1 : undefined;
      if (radialSign && geometry.out === direction * radialSign) return group;
    } else if (geometry.kind === 'plane' && near(Math.abs(geometry.n[2]), 1)
      && near(Math.hypot(geometry.n[0], geometry.n[1]), 0) && near(Math.abs(geometry.o[2]), section.axial / 2)
      && near(geometry.n[2], direction * Math.sign(geometry.o[2]))) return group;
  }
}

function capLoop(brep: Brep, face: BrepFace, id: string, group: Group, side: 1 | -1,
  dimensions: OffsetDuctDimensions, offset: number, walls: ReadonlyMap<string, Wall>) {
  const loop = brep.loops.find(loop => loop.id === id), section = group === 'outer' ? dimensions.exterior : dimensions.interior;
  if (!loop || loop.face !== face.id || loop.kind !== group || loop.coedges.length !== 4) return;
  const r0 = dimensions.pathRadius - section.radial / 2, r1 = dimensions.pathRadius + section.radial / 2;
  const y0 = side * Math.sqrt((r0 - offset) * (r0 + offset)), y1 = side * Math.sqrt((r1 - offset) * (r1 + offset));
  const expectedY = [Math.min(y0, y1), Math.max(y0, y1)], expectedZ = [-section.axial / 2, section.axial / 2];
  const corners = new Set<string>(), edges: string[] = [], wallNames: string[] = [], points: Point[] = [];
  let signedArea = 0;
  const geometry = faceGeometry(face);
  if (geometry.kind !== 'plane') return;
  for (const id of loop.coedges) {
    const use = brep.coedges.find(use => use.id === id), twin = use?.twin && brep.coedges.find(candidate => candidate.id === use.twin);
    const edge = use && brep.edges.find(edge => edge.id === use.edge), mate = twin && walls.get(twin.loop);
    if (!use || use.loop !== loop.id || !twin || twin.twin !== use.id || twin.edge !== use.edge || twin.sense === use.sense
      || !use.pcurve || !twin.pcurve || !edge || !mate || mate.group !== group || !mate.face.name
      || edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2 || edge.curve.weights[0] !== edge.curve.weights[1]) return;
    const [a, b] = edge.curve.controlPoints;
    if ((near(a[1], b[1])) === (near(a[2], b[2]))) return;
    for (const point of [a, b]) {
      const y = near(point[1], expectedY[0]) ? 0 : near(point[1], expectedY[1]) ? 1 : undefined;
      const z = near(point[2], expectedZ[0]) ? 0 : near(point[2], expectedZ[1]) ? 1 : undefined;
      if (!near(point[0], offset) || y === undefined || z === undefined) return;
      corners.add(`${y}:${z}`); points.push(point);
    }
    signedArea += (use.sense === 'forward' ? 1 : -1) * dot(cross(a, b), geometry.n) / 2;
    edges.push(edge.id); wallNames.push(mate.face.name);
  }
  if (corners.size !== 4 || new Set(edges).size !== 4 || new Set(wallNames).size !== 4) return;
  const y: [number, number] = [Math.min(...points.map(point => point[1])), Math.max(...points.map(point => point[1]))];
  const z: [number, number] = [Math.min(...points.map(point => point[2])), Math.max(...points.map(point => point[2]))];
  const width = y[1] - y[0], height = z[1] - z[0], expectedArea = (group === 'outer' ? 1 : -1) * (expectedY[1] - expectedY[0]) * section.axial;
  if (!(width > tolerance && height > tolerance) || Math.abs(signedArea - expectedArea) > tolerance * Math.max(1, 2 * (width + height))) return;
  return { loop: loop.id, edges, walls: wallNames, y, z, width, height, signedArea };
}

/** Native evidence only. Proposal replay, source ownership and image pins belong to the caller. */
export function offsetRectangularDuctIntersectionEvidence(brep: Brep, dimensions: OffsetDuctDimensions, offset: number) {
  try {
    if (!dimensionsValid(dimensions, offset) || brep.source.family !== 'analytic-boolean' || !brep.source.id
      || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed
      || brep.faces.length !== 10 || brep.loops.length !== 12 || brep.edges.length !== 24 || brep.coedges.length !== 48
      || brep.vertices.length !== 16 || brep.faces.some(face => face.surface.kind !== 'surface' || !face.name)
      || new Set(brep.faces.map(face => face.name)).size !== 10 || brep.coedges.some(use => !use.pcurve)) return;
    const report = checkBrep(brep, { strict: true });
    let maximumGapMM = Math.max(report.maximumVertexGap, report.maximumPcurveGap, report.maximumEdgeSurfaceGap);
    if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 1 || !(maximumGapMM <= tolerance)) return;
    const wallByLoop = new Map<string, Wall>(), wallKeys = new Set<string>(), capFaces: BrepFace[] = [];
    for (const face of brep.faces) {
      const geometry = faceGeometry(face);
      if (geometry.kind === 'plane' && near(geometry.n[0], -1) && near(Math.hypot(geometry.n[1], geometry.n[2]), 0)
        && near(geometry.o[0], offset)) { capFaces.push(face); continue; }
      const group = wallGroup(geometry, dimensions);
      if (!group || face.loops.length !== 1 || brep.loops.find(loop => loop.id === face.loops[0])?.coedges.length !== 4) return;
      const key = geometry.kind === 'cylinder' ? `${group}:cylinder:${Math.sign(geometry.r - dimensions.pathRadius)}`
        : geometry.kind === 'plane' ? `${group}:plane:${Math.sign(geometry.o[2])}` : undefined;
      if (!key || wallKeys.has(key)) return;
      wallKeys.add(key); wallByLoop.set(face.loops[0], { face, group, geometry });
    }
    if (wallKeys.size !== 8 || capFaces.length !== 2) return;
    const caps = [], capIds = new Set(capFaces.map(face => face.id)), sides = new Set<number>();
    for (const face of capFaces) {
      if (face.loops.length !== 2) return;
      const outerLoop = brep.loops.find(loop => face.loops.includes(loop.id) && loop.kind === 'outer');
      const innerLoop = brep.loops.find(loop => face.loops.includes(loop.id) && loop.kind === 'inner');
      const use = outerLoop && brep.coedges.find(use => use.id === outerLoop.coedges[0]);
      const point = use && brep.edges.find(edge => edge.id === use.edge)?.curve.controlPoints[0];
      if (!outerLoop || !innerLoop || !point || near(point[1], 0)) return;
      const side = Math.sign(point[1]) as 1 | -1;
      const outer = capLoop(brep, face, outerLoop.id, 'outer', side, dimensions, offset, wallByLoop);
      const inner = capLoop(brep, face, innerLoop.id, 'inner', side, dimensions, offset, wallByLoop);
      const geometry = faceGeometry(face);
      if (!outer || !inner || geometry.kind !== 'plane' || sides.has(side)) return;
      const materialArea = outer.signedArea + inner.signedArea;
      if (!(materialArea > 0 && outer.signedArea > 0 && inner.signedArea < 0)) return;
      caps.push({ name: face.name!, side, normal: geometry.n, outer, inner, materialArea }); sides.add(side);
    }
    let arcs = 0, lines = 0, capCylinderJoints = 0, measuredEdges = 0, maximumAngleErrorDegrees = 0;
    for (const edge of brep.edges) {
      const uses = brep.coedges.filter(use => use.edge === edge.id);
      if (uses.length !== 2 || uses[0].twin !== uses[1].id || uses[1].twin !== uses[0].id || uses[0].sense === uses[1].sense) return;
      const owners = uses.map(use => brep.faces.find(face => face.loops.includes(use.loop)));
      if (!owners[0] || !owners[1] || owners[0].id === owners[1].id) return;
      const [start, end] = curveDomain(edge.curve);
      if (edge.curve.degree === 1) lines++; else if (edge.curve.degree === 2) arcs++; else return;
      for (const use of uses) {
        const binding = use.pcurve!, domain = curveDomain(binding), face = brep.faces.find(face => face.loops.includes(use.loop))!;
        if (domain[0] !== start || domain[1] !== end || binding.controlPoints.some(point => point[2] !== 0) || face.surface.kind !== 'surface') return;
        for (const fraction of fractions) {
          const at = start + (end - start) * fraction, point = evaluateCurve(edge.curve, at), [u, v] = evaluateCurve(binding, at);
          const gap = len(sub(evaluateSurface(face.surface, u, v), point));
          if (!Number.isFinite(gap) || gap > tolerance || point[0] < offset - tolerance) return;
          maximumGapMM = Math.max(maximumGapMM, gap);
        }
      }
      const cylinder = owners.map(face => faceGeometry(face!)).find(geometry => geometry.kind === 'cylinder');
      const capCylinder = cylinder?.kind === 'cylinder' && owners.some(face => capIds.has(face!.id));
      if (capCylinder) capCylinderJoints++;
      const expectedAngleDegrees = capCylinder ? Math.acos(-cylinder.out * offset / cylinder.r) * 180 / Math.PI : 90;
      const continuity = measureBrepEdgeContinuity(brep, edge.id);
      if (continuity.status !== 'measured' || !Number.isFinite(continuity.minimumAngleDegrees) || !Number.isFinite(continuity.maximumAngleDegrees)
        || Math.abs(continuity.minimumAngleDegrees - expectedAngleDegrees) > angularTolerance
        || Math.abs(continuity.maximumAngleDegrees - expectedAngleDegrees) > angularTolerance) return;
      measuredEdges++;
      maximumAngleErrorDegrees = Math.max(maximumAngleErrorDegrees, Math.abs(continuity.minimumAngleDegrees - expectedAngleDegrees),
        Math.abs(continuity.maximumAngleDegrees - expectedAngleDegrees));
    }
    if (arcs !== 8 || lines !== 16 || capCylinderJoints !== 8) return;
    const { pathRadius: radius, exterior, interior } = dimensions;
    const segment = (r: number) => r * r * Math.acos(offset / r) - offset * Math.sqrt((r - offset) * (r + offset));
    const firstMoment = (r: number) => 2 / 3 * Math.sqrt((r - offset) * (r + offset)) ** 3;
    const difference = (section: { radial: number; axial: number }, f: (radius: number) => number) =>
      section.axial * (f(radius + section.radial / 2) - f(radius - section.radial / 2));
    const analytic = difference(exterior, segment) - difference(interior, segment), native = brepMassProperties(brep, 1);
    const centroidX = (difference(exterior, firstMoment) - difference(interior, firstMoment)) / analytic;
    if (!(analytic > 0 && Number.isFinite(analytic)) || native.method !== 'quadrature' || !Number.isFinite(native.volume)
      || Math.abs(native.volume - analytic) > CadNumericPolicy.relativeComparison * .1 * Math.max(1, analytic)
      || !near(native.centroid[0], centroidX) || !near(native.centroid[1], 0) || !near(native.centroid[2], 0)) return;
    return { caps: caps.sort((a, b) => a.side - b.side), volume: { analytic, native: native.volume, method: 'quadrature' as const }, maximumGapMM, measuredEdges, maximumAngleErrorDegrees };
  } catch { return; }
}
