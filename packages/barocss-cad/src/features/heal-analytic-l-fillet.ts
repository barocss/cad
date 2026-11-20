import { faceGeometry } from '../brep/analytic-boolean.js';
import { checkBrep, lineCurve, type Brep, type BrepCoedge, type BrepEdge, type BrepFace, type BrepLoop, type BrepVertex } from '../brep/brep-core.js';
import { circleOf } from '../brep/brep-tessellate.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';

type Axis = 0 | 1 | 2;
type Plane = { surface: Surface; u: Axis; v: Axis; axis: Axis; at: number };
type SectionPoint = [number, number];
const axes = [0, 1, 2] as const;
const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const near = (a: number, b: number, tolerance: number) => Math.abs(a - b) <= tolerance;
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const lineKnots = [0, 0, 1, 1];
const quarterKnots = [0, 0, 0, 1, 1, 1];
const isLine = ({ curve }: BrepEdge) => curve.degree === 1 && curve.controlPoints.length === 2 && same(curve.weights, [1, 1]) && same(curve.knots, lineKnots);
const startOf = (edge: BrepEdge, use: BrepCoedge) => edge.vertices[use.sense === 'forward' ? 0 : 1];
const segmentKey = (a: SectionPoint, b: SectionPoint) => [a.join(','), b.join(',')].sort().join('|');

function cardinalPlane(face: BrepFace): Plane | undefined {
  const { surface } = face;
  if (surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 1
    || !same(surface.knotsU, lineKnots) || !same(surface.knotsV, lineKnots)
    || surface.controlPoints.length !== 2 || surface.controlPoints.some(row => row.length !== 2)
    || surface.weights.length !== 2 || surface.weights.some(row => !same(row, [1, 1]))) return undefined;
  const [[origin, pv], [pu, end]] = surface.controlPoints;
  const us = axes.filter(i => pu[i] !== origin[i]), vs = axes.filter(i => pv[i] !== origin[i]);
  const [u] = us, [v] = vs;
  if (us.length !== 1 || vs.length !== 1 || u === v) return undefined;
  const axis = axes.find(i => i !== u && i !== v)!;
  if (end[u] !== pu[u] || end[v] !== pv[v] || end[axis] !== origin[axis]) return undefined;
  return { surface, u, v, axis, at: origin[axis] };
}

function extendPlane(plane: Plane, points: readonly Point[]): Surface {
  const { surface, u, v, at } = plane, [[origin, pv], [pu]] = surface.controlPoints;
  function span(axis: Axis, end: number): [number, number] {
    const values = points.map(point => point[axis]);
    const lo = Math.min(origin[axis], end, ...values), hi = Math.max(origin[axis], end, ...values);
    return end > origin[axis] ? [lo, hi] : [hi, lo];
  }
  const us = span(u, pu[u]), vs = span(v, pv[v]);
  return { ...surface, controlPoints: us.map(x => vs.map(y => {
    const point: Point = [at, at, at];
    point[u] = x;
    point[v] = y;
    return point;
  })) };
}

function fullQuarter(face: BrepFace, lo: number, hi: number, tolerance: number) {
  const { surface } = face;
  if (surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 1
    || !same(surface.knotsU, quarterKnots) || !same(surface.knotsV, lineKnots) || surface.controlPoints.length !== 3
    || surface.controlPoints.some(row => row.length !== 2 || !near(row[0][1], lo, tolerance) || !near(row[1][1], hi, tolerance)
      || !near(row[0][0], row[1][0], tolerance) || !near(row[0][2], row[1][2], tolerance))) return undefined;
  const geometry = faceGeometry(face);
  if (geometry.kind !== 'cylinder' || geometry.out !== -1 || geometry.a[0] !== 0 || Math.abs(geometry.a[1]) !== 1 || geometry.a[2] !== 0
    || !(geometry.r > 2 * tolerance)) return undefined;
  return geometry;
}

// A cap can retain a collinear split point from the union. Remove it only from this proof.
function lBoundary(points: readonly SectionPoint[]): Set<string> | undefined {
  if (new Set(points.map(point => point.join(','))).size !== points.length) return undefined;
  const turn = (a: SectionPoint, b: SectionPoint, c: SectionPoint) => (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0]);
  const corners: SectionPoint[] = [];
  for (const [i, point] of points.entries()) {
    const next = points[(i + 1) % points.length], prev = points[(i + points.length - 1) % points.length];
    if ((point[0] === next[0]) === (point[1] === next[1])) return undefined;
    if (turn(prev, point, next) !== 0) corners.push(point);
    else if ((point[0] - prev[0]) * (next[0] - point[0]) + (point[1] - prev[1]) * (next[1] - point[1]) <= 0) return undefined;
  }
  if (corners.length !== 6) return undefined;
  const direction = Math.sign(corners.reduce((sum, [x, z], i) => {
    const [nextX, nextZ] = corners[(i + 1) % corners.length];
    return sum + x * nextZ - z * nextX;
  }, 0));
  if (!direction || !corners.some(point => same(point, [1, 1]))) return undefined;
  const segments = new Set<string>();
  for (const [i, point] of corners.entries()) {
    const prev = corners[(i + corners.length - 1) % corners.length], next = corners[(i + 1) % corners.length];
    if (Math.sign(turn(prev, point, next)) !== (same(point, [1, 1]) ? -direction : direction)) return undefined;
    segments.add(segmentKey(point, next));
  }
  return segments;
}

function provesStraightL(brep: Brep, corner: Point, tolerance: number): boolean {
  const vertices = byId(brep.vertices), edges = byId(brep.edges), uses = byId(brep.coedges), loops = byId(brep.loops);
  const station = (axis: Axis) => {
    const values = brep.vertices.map(vertex => vertex.point[axis]);
    return [Math.min(...values), Math.max(...values)];
  };
  const [lo, hi] = station(1), [left, right] = station(0), [bottom, top] = station(2);
  if ([corner[0] - left, right - corner[0], corner[2] - bottom, top - corner[2], hi - lo].some(width => width <= 2 * tolerance)) return false;
  const xs = [left, corner[0], right], zs = [bottom, corner[2], top];
  const project = ([x, , z]: Point): SectionPoint => [xs.findIndex(value => near(x, value, tolerance)), zs.findIndex(value => near(z, value, tolerance))];
  if (brep.vertices.some(({ point }) => project(point).includes(-1) || (!near(point[1], lo, tolerance) && !near(point[1], hi, tolerance)))) return false;

  const caps = new Map<number, Set<string>>(), walls = new Set<string>();
  for (const face of brep.faces) {
    const plane = cardinalPlane(face)!;
    const points = loops.get(face.loops[0])!.coedges.map(id => {
      const use = uses.get(id)!;
      return vertices.get(startOf(edges.get(use.edge)!, use))!.point;
    });
    if (plane.axis === 1) {
      const boundary = lBoundary(points.map(project)), level = near(plane.at, lo, tolerance) ? lo : hi;
      if (!boundary || !near(plane.at, level, tolerance) || caps.has(level)) return false;
      caps.set(level, boundary);
      continue;
    }
    // Every wall must span the same one side of the section at each end and have only two axial struts.
    const spanAxis = plane.axis === 0 ? 1 : 0, fixedAxis = 1 - spanAxis;
    const struts = points.filter((point, i) => !near(point[1], points[(i + 1) % points.length][1], tolerance));
    if (struts.length !== 2 || points.some((point, i) => {
      const next = points[(i + 1) % points.length];
      return !near(point[1], next[1], tolerance) && !same(project(point), project(next));
    })) return false;
    const ends = project(struts[0]), other = project(struts[1]);
    if (same(ends, other) || points.some(point => {
      const uv = project(point);
      return uv[fixedAxis] !== ends[fixedAxis] || uv[spanAxis] < Math.min(ends[spanAxis], other[spanAxis]) || uv[spanAxis] > Math.max(ends[spanAxis], other[spanAxis]);
    })) return false;
    walls.add(segmentKey(ends, other));
  }
  return walls.size === 6 && caps.size === 2 && [...walls].every(key => caps.get(lo)?.has(key) && caps.get(hi)?.has(key));
}

/** Heal the one concave full-span Y-axis fillet left by the analytic union of two cardinal L-bracket plates. */
export function healAnalyticLFilletIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string, operationId: string): Brep | undefined {
  const [body] = brep.bodies, [shell] = brep.shells;
  if (brep.source.family !== 'analytic-boolean' || brep.bodies.length !== 1 || body.kind !== 'solid' || brep.shells.length !== 1 || !shell.closed
    || brep.faces.length !== 9 || brep.loops.length !== 9 || brep.coedges.length !== 46 || brep.edges.length !== 23 || brep.vertices.length !== 16
    || brep.loops.some(loop => loop.kind !== 'outer') || brep.faces.some(face => !face.name || face.loops.length !== 1)
    || brep.coedges.some(use => use.pcurve !== null) || !checkBrep(brep, { strict: true }).valid) return undefined;
  const selected = brep.faces.find(face => face.name === faceName);
  if (!selected || brep.edges.some(edge => edge.name === sharpEdgeName)) return undefined;
  const faces = byId(brep.faces), loops = byId(brep.loops), uses = byId(brep.coedges), edges = byId(brep.edges), vertices = byId(brep.vertices);
  const remaining = brep.faces.filter(face => face !== selected), planes = new Map(remaining.map(face => [face.id, cardinalPlane(face)]));
  if ([...planes.values()].some(plane => !plane)) return undefined;
  const selectedLoop = loops.get(selected.loops[0])!;
  if (selectedLoop.coedges.length !== 4) return undefined;
  const neighbors = selectedLoop.coedges.map(id => {
    const use = uses.get(id)!, twin = uses.get(use.twin!)!, face = faces.get(loops.get(twin.loop)!.face)!;
    return { edge: edges.get(use.edge)!, twin, face, plane: planes.get(face.id)! };
  });
  if (new Set(neighbors.map(item => item.face.id)).size !== 4 || neighbors.some(item => !item.plane)) return undefined;
  const caps = neighbors.filter(item => item.plane.axis === 1).sort((a, b) => a.plane.at - b.plane.at);
  const walls = neighbors.filter(item => item.plane.axis !== 1).sort((a, b) => a.plane.axis - b.plane.axis);
  if (caps.length !== 2 || walls.length !== 2 || walls[0].plane.axis !== 0 || walls[1].plane.axis !== 2
    || walls.map(item => item.face.name).sort().join('|') !== sharpEdgeName || walls.some(item => !isLine(item.edge))) return undefined;

  const scale = geometryScaleMM(brep.vertices.map(vertex => vertex.point)), tolerance = linearToleranceMM(scale);
  const lo = caps[0].plane.at, hi = caps[1].plane.at;
  if (!(scale <= CadNumericPolicy.coordinateAbs && hi - lo > 2 * tolerance)) return undefined;
  const cylinder = fullQuarter(selected, lo, hi, tolerance);
  if (!cylinder) return undefined;
  // Each generator is the full-height tangent to its planar wall and has one vertex in each end rim.
  for (const { edge, plane } of walls) {
    const railAxis = plane.axis === 0 ? 2 : 0;
    const points = edge.vertices.map(id => vertices.get(id)!.point).sort((a, b) => a[1] - b[1]);
    if (!near(points[0][1], lo, tolerance) || !near(points[1][1], hi, tolerance)
      || !near(Math.abs(plane.at - cylinder.c[plane.axis]), cylinder.r, tolerance)
      || points.some(point => !near(point[plane.axis], plane.at, tolerance) || !near(point[railAxis], cylinder.c[railAxis], tolerance))) return undefined;
  }

  const prefix = `${operationId}_heal`, relocated = new Map<string, BrepVertex>(), ridgeEnds: BrepVertex[] = [], capLines = new Set<string>();
  for (const [i, { edge, twin, plane }] of caps.entries()) {
    const point: Point = [walls[0].plane.at, plane.at, walls[1].plane.at];
    const circle = circleOf(edge.curve);
    if (!circle || circle.spans.length !== 1 || !same(edge.curve.knots, quarterKnots)
      || !near(circle.spans[0].phi, Math.PI / 2, CadNumericPolicy.relativeComparison)
      || !near(circle.r, cylinder.r, tolerance) || !near(circle.c[0], cylinder.c[0], tolerance) || !near(circle.c[2], cylinder.c[2], tolerance)
      || !near(circle.c[1], plane.at, tolerance) || !edge.curve.controlPoints[1].every((value, axis) => near(value, point[axis], tolerance))
      || walls.some(wall => wall.edge.vertices.filter(id => edge.vertices.includes(id)).length !== 1)) return undefined;
    const vertex = { id: `${prefix}_v${i}`, point, tolerance };
    for (const id of edge.vertices) relocated.set(id, vertex);
    ridgeEnds.push(vertex);
    const rimVertices = twin.sense === 'forward' ? edge.vertices : [edge.vertices[1], edge.vertices[0]];
    for (const [j, useId] of [twin.prev, twin.next].entries()) {
      const use = uses.get(useId)!, oldEdge = edges.get(use.edge)!;
      const wall = walls.find(item => item.edge.vertices.includes(rimVertices[j]));
      if (!isLine(oldEdge) || !wall || loops.get(uses.get(use.twin!)!.loop)!.face !== wall.face.id) return undefined;
      capLines.add(oldEdge.id);
    }
  }
  if (relocated.size !== 4 || capLines.size !== 4) return undefined;

  const discarded = new Set(neighbors.map(item => item.edge.id));
  const survivingEdges = brep.edges.filter(edge => !discarded.has(edge.id));
  if (survivingEdges.some(edge => !isLine(edge) || edge.vertices.filter(id => relocated.has(id)).length !== Number(capLines.has(edge.id)))) return undefined;
  const [start, end] = ridgeEnds;
  const ridge: BrepEdge = { id: `${prefix}_edge`, vertices: [start.id, end.id], curve: lineCurve(`${prefix}_curve`, start.point, end.point), name: sharpEdgeName, tolerance };
  const ridgeUses: BrepCoedge[] = walls.map(({ edge, twin }, i) => ({ ...twin, id: `${prefix}_c${i}`, twin: `${prefix}_c${1 - i}`, edge: ridge.id,
    sense: relocated.get(startOf(edge, twin)) === start ? 'forward' : 'reversed' }));
  if (ridgeUses[0].sense === ridgeUses[1].sense || ridgeEnds.some(vertex => vertices.has(vertex.id)) || edges.has(ridge.id)
    || ridgeUses.some(use => uses.has(use.id))) return undefined;
  const newLoops: BrepLoop[] = [], newUses: BrepCoedge[] = [];
  for (const loop of brep.loops) {
    if (loop === selectedLoop) continue;
    const cycle = loop.coedges.flatMap(id => {
      const use = uses.get(id)!;
      const wall = walls.findIndex(item => item.twin === use);
      return wall >= 0 ? [ridgeUses[wall]] : discarded.has(use.edge) ? [] : [use];
    });
    newLoops.push({ ...loop, coedges: cycle.map(use => use.id) });
    for (const [i, use] of cycle.entries()) newUses.push({ ...use, next: cycle[(i + 1) % cycle.length].id, prev: cycle[(i + cycle.length - 1) % cycle.length].id });
  }
  const newEdges = survivingEdges.map(edge => {
    if (!capLines.has(edge.id)) return edge;
    const from = relocated.get(edge.vertices[0]) ?? vertices.get(edge.vertices[0])!;
    const to = relocated.get(edge.vertices[1]) ?? vertices.get(edge.vertices[1])!;
    return { ...edge, vertices: [from.id, to.id] as const, curve: lineCurve(edge.curve.id, from.point, to.point) };
  });
  const newFaces = remaining.map(face => {
    const wall = walls.find(item => item.face === face);
    return wall ? { ...face, surface: extendPlane(wall.plane, [start.point, end.point]) } : face;
  });
  const candidate: Brep = { ...brep, shells: [{ ...shell, faces: shell.faces.filter(id => id !== selected.id) }], faces: newFaces,
    loops: newLoops, coedges: newUses, edges: [...newEdges, ridge], vertices: [...brep.vertices.filter(vertex => !relocated.has(vertex.id)), ...ridgeEnds] };
  if (!checkBrep(candidate, { strict: true }).valid || !provesStraightL(candidate, start.point, tolerance)) return undefined;
  return candidate;
}
