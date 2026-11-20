import { evaluateSurfaceD1 } from '../core/derivatives.js';
import { surfaceDomain } from '../core/math.js';
import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point } from '../types.js';
import { faceGeometry, type FaceGeometry } from './analytic-boolean.js';
import { checkBrep, type Brep, type BrepCoedge, type BrepEdge, type BrepFace, type BrepLoop, type BrepShell } from './brep-core.js';
import { circleOf } from './brep-tessellate.js';

type Cylinder = Extract<FaceGeometry, { kind: 'cylinder' }>;
type RimArc = { start: string; end: string; station: number; sweep: number };
type BoundaryUse = { use: BrepCoedge; twin: BrepCoedge; capLoop: BrepLoop; edge: BrepEdge };
type RimBinding = { vertices: ReadonlySet<string>; wallUses: ReadonlySet<string> };
type RadialSupport = { offset: Point; radius: number };
const ANGULAR_TOLERANCE = 1e-8;
const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const readTopology = (brep: Brep) => ({
  faces: byId(brep.faces), shells: byId(brep.shells), bodies: byId(brep.bodies),
  loops: byId(brep.loops), coedges: byId(brep.coedges), edges: byId(brep.edges),
});
type Topology = ReturnType<typeof readTopology>;

function inwardCylinder(face: BrepFace): Cylinder | undefined {
  if (face.surface.kind !== 'surface') return;
  const cylinder = faceGeometry(face);
  if (cylinder.kind !== 'cylinder' || cylinder.out !== -1 || !Number.isFinite(cylinder.r) || cylinder.r <= 0
    || !cylinder.c.every(Number.isFinite) || !(Math.abs(len(cylinder.a) - 1) <= ANGULAR_TOLERANCE)) return;

  const { u, v } = surfaceDomain(face.surface);
  // A half cylinder can have a repeated U knot at its center. Evaluate inside a single span.
  const spanEnd = face.surface.knotsU.find(knot => knot > u[0]);
  if (spanEnd === undefined || spanEnd > u[1]) return;
  const atU = u[0] + (spanEnd - u[0]) / 2;
  if (!(u[0] < atU && atU < spanEnd)) return;
  const { point, du, dv } = evaluateSurfaceD1(face.surface, atU, v[0] + (v[1] - v[0]) / 2);
  const normal = cross(du, dv), delta = sub(point, cylinder.c);
  const radial = sub(delta, scale(cylinder.a, dot(delta, cylinder.a)));
  if (!(len(normal) > 0) || !(len(radial) > 0)) return;
  const cosine = dot(unit(normal), unit(radial)) * (face.sense === 'forward' ? 1 : -1);
  // The analytic classifier has only two signs. Require a regular native normal that points toward the axis.
  return Number.isFinite(cosine) && cosine < -1 + ANGULAR_TOLERANCE ? cylinder : undefined;
}

function arcOnCylinder(curve: Brep['edges'][number]['curve'], cylinder: Cylinder, tolerance: number) {
  const circle = circleOf(curve);
  if (!circle || !(Math.abs(circle.r - cylinder.r) <= tolerance)) return;
  const normal = scale(cross(circle.e1, circle.e2), circle.sign);
  const offset = sub(circle.c, cylinder.c), station = dot(offset, cylinder.a), alignment = dot(normal, cylinder.a);
  if (!Number.isFinite(station) || !(Math.abs(alignment) >= 1 - ANGULAR_TOLERANCE)
    || !(len(cross(normal, cylinder.a)) <= ANGULAR_TOLERANCE)
    || !(len(cross(offset, cylinder.a)) <= tolerance)) return;

  // A rim uses rational quadratic circle spans. Check each span's poles and knot interval on the same circle.
  const { controlPoints: points, knots } = curve;
  const first = circle.spans[0], last = circle.spans[circle.spans.length - 1];
  if (knots[0] !== first.k0 || knots[1] !== first.k0 || knots[knots.length - 1] !== last.k1
    || knots[knots.length - 2] !== last.k1) return;
  let sweep = 0;
  for (const [i, span] of circle.spans.entries()) {
    if (!(span.k1 > span.k0) || (i && span.k0 !== circle.spans[i - 1].k1)) return;
    const radial = sub(points[2 * i], circle.c), tangent = cross(normal, radial);
    if (!(Math.abs(len(radial) - cylinder.r) <= tolerance) || !(Math.abs(dot(radial, normal)) <= tolerance)) return;
    const middle = add(radial, scale(tangent, Math.tan(span.phi / 2)));
    const end = add(scale(radial, Math.cos(span.phi)), scale(tangent, Math.sin(span.phi)));
    if (!(len(sub(sub(points[2 * i + 1], circle.c), middle)) <= tolerance)
      || !(len(sub(sub(points[2 * i + 2], circle.c), end)) <= tolerance)) return;
    sweep += span.phi;
  }
  return { station, sweep: sweep * Math.sign(alignment) };
}

function rimWinding(arcs: readonly RimArc[]): number | undefined {
  if (!arcs.length) return;
  const byStart = new Map(arcs.map(arc => [arc.start, arc]));
  if (byStart.size !== arcs.length) return;
  const first = arcs[0].start, direction = Math.sign(arcs[0].sweep);
  if (!direction) return;
  let start = first, sweep = 0;
  do {
    const arc = byStart.get(start);
    if (!arc || Math.sign(arc.sweep) !== direction) return;
    byStart.delete(start);
    start = arc.end;
    sweep += arc.sweep;
  } while (start !== first);
  if (!byStart.size && Math.abs(sweep - direction * 2 * Math.PI) <= ANGULAR_TOLERANCE) return direction;
}

function hasCircularRims(boundary: readonly BoundaryUse[], cylinder: Cylinder, tolerance: number): boolean {
  const rims: [RimArc[], RimArc[]] = [[], []];
  for (const { use, edge } of boundary) {
    const arc = arcOnCylinder(edge.curve, cylinder, tolerance);
    if (!arc) return false;
    const [start, end] = use.sense === 'forward' ? edge.vertices : [edge.vertices[1], edge.vertices[0]];
    const rim = !rims[0].length || Math.abs(arc.station - rims[0][0].station) <= tolerance ? rims[0] : rims[1];
    if (rim.length && Math.abs(arc.station - rim[0].station) > tolerance) return false;
    rim.push({ start, end, station: arc.station, sweep: use.sense === 'forward' ? arc.sweep : -arc.sweep });
  }
  const firstWinding = rimWinding(rims[0]);
  return firstWinding !== undefined && rimWinding(rims[1]) === -firstWinding;
}

function radialProject(vector: Point, axis: Point): Point {
  return sub(vector, scale(axis, dot(vector, axis)));
}

function sameRadialSupport(a: RadialSupport, b: RadialSupport, tolerance: number): boolean {
  return Math.abs(a.radius - b.radius) <= tolerance && len(sub(a.offset, b.offset)) <= tolerance;
}

function capClearsBore(outer: BrepLoop, topology: Topology, cylinder: Cylinder, side: number,
  onCap: (point: Point) => boolean, tolerance: number): boolean {
  if (outer.coedges.length !== 4) return false;
  const ring: Point[] = [];
  for (const id of outer.coedges) {
    const use = topology.coedges.get(id), edge = use && topology.edges.get(use.edge);
    if (!use || use.loop !== outer.id || !edge || edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2
      || !edge.curve.controlPoints.every(onCap)) return false;
    const start = edge.curve.controlPoints[use.sense === 'forward' ? 0 : 1];
    ring.push(radialProject(sub(start, cylinder.c), cylinder.a));
  }
  // A full disk fits only when it clears every support of the projected convex outer rim.
  return ring.every((corner, i) => {
    const j = (i + 1) % ring.length, direction = sub(ring[j], corner);
    if (!(len(direction) > tolerance)) return false;
    const inward = scale(unit(cross(cylinder.a, direction)), side);
    return -dot(corner, inward) > cylinder.r + tolerance
      && ring.every((point, k) => k === i || k === j || dot(sub(point, corner), inward) > tolerance);
  });
}

function projectedArc(use: BrepCoedge, edge: BrepEdge, cylinder: Cylinder, station: number,
  onCap: (point: Point) => boolean, tolerance: number): RimArc | undefined {
  const { curve } = edge;
  if (!curve.controlPoints.every(onCap)) return;
  const projected = { ...curve, controlPoints: curve.controlPoints.map(point => radialProject(sub(point, cylinder.c), cylinder.a)) };
  const arc = arcOnCylinder(projected, { ...cylinder, c: [0, 0, 0] }, tolerance);
  if (!arc) return;
  const [start, end] = use.sense === 'forward' ? edge.vertices : [edge.vertices[1], edge.vertices[0]];
  return { start, end, station, sweep: use.sense === 'forward' ? arc.sweep : -arc.sweep };
}

function readAnnularOuterRim(outer: BrepLoop, topology: Topology, shell: BrepShell, bore: Cylinder, side: number,
  onCap: (point: Point) => boolean, tolerance: number) {
  if (outer.coedges.length !== 2) return;
  const arcs: RimArc[] = [], walls = new Set<BrepFace>(), wallUses = new Set<string>();
  const supports: RadialSupport[] = [];
  for (const id of outer.coedges) {
    const use = topology.coedges.get(id), twin = use?.twin ? topology.coedges.get(use.twin) : undefined;
    const loop = twin && topology.loops.get(twin.loop), wall = loop && topology.faces.get(loop.face);
    const edge = use && topology.edges.get(use.edge);
    if (!use || use.loop !== outer.id || !edge || !twin || twin.twin !== id || twin.edge !== use.edge || twin.sense === use.sense
      || loop?.kind !== 'outer' || !loop.coedges.includes(twin.id)
      || !wall || wall.shell !== shell.id || wall.surface.kind !== 'surface' || walls.has(wall)) return;
    const cylinder = faceGeometry(wall);
    if (cylinder.kind !== 'cylinder' || cylinder.out !== 1 || len(cross(cylinder.a, bore.a)) > 64 * Number.EPSILON) return;
    const offset = radialProject(sub(cylinder.c, bore.c), bore.a), support = { offset, radius: cylinder.r };
    if (!(cylinder.r - bore.r > len(offset) + tolerance)
      || (supports.length && !sameRadialSupport(supports[0], support, tolerance))) return;
    const arc = projectedArc(use, edge, cylinder, 0, onCap, tolerance);
    if (!arc) return;
    arcs.push(arc);
    walls.add(wall);
    wallUses.add(twin.id);
    supports.push(support);
  }
  return rimWinding(arcs) === side ? { supports, walls, wallUses, vertices: new Set(arcs.map(arc => arc.start)) } : undefined;
}

function readPlanarRim(loop: BrepLoop, group: readonly BoundaryUse[], topology: Topology, shell: BrepShell,
  cylinder: Cylinder, tolerance: number, annular: boolean) {
  const face = topology.faces.get(loop.face);
  if (!face || face.shell !== shell.id || !shell.faces.includes(face.id) || face.loops.length !== 2
    || !face.loops.includes(loop.id) || face.surface.kind !== 'surface' || loop.kind !== 'inner'
    || group.length !== 2 || loop.coedges.length !== group.length
    || !loop.coedges.every(id => group.some(({ twin }) => twin.id === id))) return;
  const outer = topology.loops.get(face.loops.find(id => id !== loop.id)!);
  const plane = faceGeometry(face);
  if (outer?.kind !== 'outer' || outer.face !== face.id || plane.kind !== 'plane') return;
  const alignment = dot(plane.n, cylinder.a), side = Math.sign(alignment);
  if (!(Math.abs(alignment) > ANGULAR_TOLERANCE)) return;
  const station = dot(plane.n, sub(plane.o, cylinder.c)) / alignment;
  const slope = scale(radialProject(plane.n, cylinder.a), -1 / alignment);
  const onCap = (point: Point) => Math.abs(dot(sub(point, plane.o), plane.n)) <= tolerance;
  if (!face.surface.controlPoints.every(row => row.every(onCap))) return;
  const outerRim = annular ? readAnnularOuterRim(outer, topology, shell, cylinder, side, onCap, tolerance) : undefined;
  if (annular ? !outerRim : !capClearsBore(outer, topology, cylinder, side, onCap, tolerance)) return;

  const arcs: RimArc[] = [];
  for (const { use, edge } of group) {
    const arc = projectedArc(use, edge, cylinder, station, onCap, tolerance);
    if (!arc) return;
    arcs.push(arc);
  }
  const vertices = new Set(arcs.map(arc => arc.start));
  const wallUses = new Set(group.map(({ use }) => use.id));
  return rimWinding(arcs) === side ? { face, station, side, slope, vertices, wallUses, outerRim } : undefined;
}

function hasAxialSeams(topology: Topology, shell: BrepShell, members: readonly BrepFace[],
  lower: RimBinding, upper: RimBinding, axis: Point, tolerance: number): boolean {
  const memberIds = new Set(members.map(face => face.id));
  const seams = new Set<BrepEdge>();
  for (const face of members) {
    const loop = topology.loops.get(face.loops[0]);
    if (!shell.faces.includes(face.id) || face.loops.length !== 1 || loop?.kind !== 'outer' || loop.coedges.length !== 4
      || loop.coedges.filter(id => lower.wallUses.has(id)).length !== 1
      || loop.coedges.filter(id => upper.wallUses.has(id)).length !== 1) return false;
    for (const id of loop.coedges) {
      if (lower.wallUses.has(id) || upper.wallUses.has(id)) continue;
      const use = topology.coedges.get(id), edge = use && topology.edges.get(use.edge);
      const twin = use?.twin ? topology.coedges.get(use.twin) : undefined;
      const other = twin && topology.loops.get(twin.loop);
      if (!edge || edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2 || !other
        || !memberIds.has(other.face) || other.face === face.id) return false;
      const [start, end] = edge.vertices, [a, b] = edge.curve.controlPoints;
      if (!((lower.vertices.has(start) && upper.vertices.has(end)) || (lower.vertices.has(end) && upper.vertices.has(start)))
        || !(len(radialProject(sub(b, a), axis)) <= tolerance)) return false;
      seams.add(edge);
    }
  }
  return seams.size === 2;
}

/** The native bored plate or straight tube with one rim lifted to a tilted plane. */
function hasTiltedRim(brep: Brep, topology: Topology, shell: BrepShell, members: readonly BrepFace[],
  boundary: readonly BoundaryUse[], cylinder: Cylinder): boolean {
  const annular = brep.faces.length === 6;
  const [faces, loops, uses, edges, vertices] = annular ? [6, 8, 24, 12, 8] : [8, 10, 36, 18, 12];
  if (brep.bodies.length !== 1 || brep.shells.length !== 1 || brep.faces.length !== faces || shell.faces.length !== faces
    || brep.loops.length !== loops || brep.coedges.length !== uses || brep.edges.length !== edges || brep.vertices.length !== vertices
    || members.length !== 2 || boundary.length !== 4) return false;
  const extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point));
  const tolerance = linearToleranceMM(Math.max(extent, cylinder.r));
  const groups = new Map<BrepLoop, BoundaryUse[]>();
  for (const use of boundary) {
    const group = groups.get(use.capLoop);
    if (group) group.push(use);
    else groups.set(use.capLoop, [use]);
  }
  if (groups.size !== 2) return false;
  const rims = [...groups].map(([loop, group]) => readPlanarRim(loop, group, topology, shell, cylinder, tolerance, annular));
  const lower = rims.find(rim => rim?.side === -1), upper = rims.find(rim => rim?.side === 1);
  if (!lower || !upper || lower.face === upper.face) return false;
  let supports: readonly RadialSupport[] = [{ offset: [0, 0, 0], radius: cylinder.r }];
  if (annular) {
    const a = lower.outerRim, b = upper.outerRim;
    if (!a || !b || !b.supports.every(support => sameRadialSupport(a.supports[0], support, tolerance))
      || [...a.walls].some(wall => !b.walls.has(wall))
      || !hasAxialSeams(topology, shell, [...a.walls], a, b, cylinder.a, tolerance)) return false;
    supports = [...a.supports, ...b.supports];
  }
  const clearanceRadius = Math.max(...supports.map(support => support.radius));
  const flat = (rim: typeof lower) => clearanceRadius * len(rim.slope) <= tolerance;
  if (flat(lower) === flat(upper)) return false;
  const centerGap = upper.station - lower.station, slope = sub(upper.slope, lower.slope), slopeLength = len(slope);
  // Evaluate the minimum axial gap about each verified support's actual center.
  return supports.every(({ offset, radius }) => centerGap + dot(slope, offset) - radius * slopeLength > tolerance)
    && hasAxialSeams(topology, shell, members, lower, upper, cylinder.a, tolerance)
    && checkBrep(brep, { strict: true }).valid;
}

/** Reads the diameter of a cylindrical through bore with two complete native rims. */
export function createCylindricalBoreCheck(brep: Brep): (members: readonly BrepFace[]) => number | undefined {
  let topology: Topology | undefined;
  return members => {
    const first = members[0];
    if (!first) return;
    const native = (topology ??= readTopology(brep));
    const { faces, shells, bodies, loops, coedges, edges } = native;
    const shell = shells.get(first.shell), body = shell && bodies.get(shell.body);
    if (!shell?.closed || body?.kind !== 'solid' || body.shells[0] !== shell.id) return;

    try {
      const cylinder = inwardCylinder(first);
      if (!cylinder || !Number.isFinite(2 * cylinder.r)) return;
      const [x, y, z] = cylinder.c;
      const tolerance = linearToleranceMM(Math.max(cylinder.r, Math.abs(x), Math.abs(y), Math.abs(z)));
      const selected = new Set(members.map(face => face.id));
      if (selected.size !== members.length) return;
      const boundary: BoundaryUse[] = [];
      for (const face of members) {
        if (faces.get(face.id) !== face || face.shell !== shell.id) return;
        const geometry = face === first ? cylinder : inwardCylinder(face);
        if (!geometry || Math.abs(geometry.r - cylinder.r) > tolerance
          || len(cross(geometry.a, cylinder.a)) > ANGULAR_TOLERANCE
          || len(cross(sub(geometry.c, cylinder.c), cylinder.a)) > tolerance) return;

        for (const loopId of face.loops) {
          const loop = loops.get(loopId);
          if (loop?.face !== face.id) return;
          for (const id of loop.coedges) {
            const use = coedges.get(id), twin = use?.twin && coedges.get(use.twin);
            const twinLoop = twin && loops.get(twin.loop);
            if (use?.loop !== loopId || !twin || !twinLoop || twin.twin !== id || twin.edge !== use.edge || twin.sense === use.sense) return;
            if (selected.has(twinLoop.face)) continue;
            const edge = edges.get(use.edge);
            if (!edge) return;
            boundary.push({ use, twin, capLoop: twinLoop, edge });
          }
        }
      }
      if (hasCircularRims(boundary, cylinder, tolerance) || hasTiltedRim(brep, native, shell, members, boundary, cylinder)) return 2 * cylinder.r;
    } catch { /* Unrecognized native geometry cannot establish a bore. */ }
  };
}
