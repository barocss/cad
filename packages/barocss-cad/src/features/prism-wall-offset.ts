import { BrepError, checkBrep, type Brep, type BrepEdge, type BrepFace, type BrepLoop, type BrepVertex } from '../brep/brep-core.js';
import { add, cross, dist, dot, len, lerp, scale, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';

const SIDE_COUNT = 6;
const next = (i: number) => (i + 1) % SIDE_COUNT;
const prev = (i: number) => (i + SIDE_COUNT - 1) % SIDE_COUNT;
const samePoint = (a: Point, b: Point) => a.every((value, i) => value === b[i]);
const pair = (a: string, b: string) => JSON.stringify(a < b ? [a, b] : [b, a]);
const allowance = (extent: number) => 64 * Number.EPSILON * Math.max(1, extent);

type Chart = {
  readonly surface: Surface;
  readonly origin: Point;
  readonly normal: Point;
  readonly u: Point;
  readonly v: Point;
  readonly dualU: Point;
  readonly dualV: Point;
};
type Face = {
  readonly original: BrepFace;
  readonly loop: BrepLoop;
  readonly edges: readonly BrepEdge[];
  readonly corners: readonly BrepVertex[];
  readonly chart: Chart;
};
type Wall = { readonly face: Face; readonly normal: Point; readonly origin: Point };
type Prism = {
  readonly caps: readonly [Face, Face];
  readonly walls: readonly Wall[];
  readonly lower: readonly BrepVertex[];
  readonly upper: readonly BrepVertex[];
  readonly selected: number;
  readonly extent: number;
};

function fail(code: BrepError['code'], detail: string): never {
  throw new BrepError(code, `prism wall offset: ${detail}`);
}

/** An affine, degree-one chart with a stable inverse and the original parameter directions. */
export function affineChart(surface: BrepFace['surface'], sense: BrepFace['sense']): Chart | undefined {
  if (surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 1 || surface.controlPoints.length !== 2
    || surface.controlPoints.some(row => row.length !== 2) || surface.weights.length !== 2
    || surface.weights.some(row => row.length !== 2 || row.some(weight => weight !== surface.weights[0][0]))) return undefined;
  const [[origin, p01], [p10, p11]] = surface.controlPoints;
  const u = sub(p10, origin), v = sub(p01, origin), area = cross(u, v), magnitude = len(area);
  if (!(magnitude > 0) || !(dist(sub(p11, p10), v) <= allowance(geometryScaleMM(surface.controlPoints.flat())))) return undefined;
  const normal = scale(area, 1 / magnitude);
  return { surface, origin, u, v, normal: scale(normal, sense === 'forward' ? 1 : -1),
    dualU: scale(cross(v, normal), 1 / magnitude), dualV: scale(cross(normal, u), 1 / magnitude) };
}

function fractions(chart: Chart, point: Point): [number, number] {
  const delta = sub(point, chart.origin);
  return [dot(delta, chart.dualU), dot(delta, chart.dualV)];
}

export function trimFits(chart: Chart, point: Point, roundoff: number): boolean {
  const [u, v] = fractions(chart, point), uSlack = roundoff * len(chart.dualU), vSlack = roundoff * len(chart.dualV);
  return Math.abs(dot(sub(point, chart.origin), chart.normal)) <= roundoff
    && u >= -uSlack && u <= 1 + uSlack && v >= -vSlack && v <= 1 + vSlack;
}

/** Each nonincident corner must lie strictly inside every continued wall support. */
function keepsSection(points: readonly Point[], walls: readonly Wall[], selected: number, distance: number, extent: number): boolean {
  const linear = linearToleranceMM(extent), roundoff = allowance(extent);
  return walls.every(({ origin, normal }, i) => {
    const j = next(i), edge = sub(points[j], points[i]), shift = i === selected ? distance : 0;
    return normal[0] * edge[1] - normal[1] * edge[0] > linear && points.every((point, vertex) => {
      const signed = dot(sub(point, origin), normal) - shift;
      return vertex === i || vertex === j ? Math.abs(signed) <= roundoff : signed < -linear;
    });
  });
}

/** Prove both straight cap rings and the six matching wall loops from native incidence. */
function admittedPrism(brep: Brep, faceName: string): Prism | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  if (bodies.length !== 1 || bodies[0].kind !== 'solid' || shells.length !== 1 || bodies[0].shells.length !== 1
    || bodies[0].shells[0] !== shells[0].id || !shells[0].closed || shells[0].faces.length !== 8
    || new Set(shells[0].faces).size !== 8 || faces.length !== 8 || loops.length !== 8
    || coedges.length !== 36 || edges.length !== 18 || vertices.length !== 12) return undefined;
  const heights = [...new Set(vertices.map(vertex => vertex.point[2]))].sort((a, b) => a - b);
  const [z0, z1] = heights, extent = geometryScaleMM(vertices.map(vertex => vertex.point)), linear = linearToleranceMM(extent);
  const roundoff = allowance(extent);
  if (heights.length !== 2 || !(z1 - z0 > linear) || extent > CadNumericPolicy.coordinateAbs) return undefined;
  const vertexById = new Map(vertices.map(vertex => [vertex.id, vertex]));
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const loopById = new Map(loops.map(loop => [loop.id, loop]));
  const coedgeById = new Map(coedges.map(coedge => [coedge.id, coedge]));
  const edgeBetween = new Map<string, BrepEdge>();
  const below = new Map<string, BrepVertex>();
  for (const edge of edges) {
    const [a, b] = edge.vertices.map(id => vertexById.get(id)), poles = edge.curve.controlPoints;
    const key = pair(...edge.vertices);
    if (!a || !b || edgeBetween.has(key) || edge.curve.degree !== 1 || poles.length !== 2
      || !samePoint(a.point, poles[0]) || !samePoint(b.point, poles[1]) || !(dist(a.point, b.point) > linear)) return undefined;
    edgeBetween.set(key, edge);
    if (a.point[2] === b.point[2]) continue;
    const [low, high] = a.point[2] === z0 ? [a, b] : [b, a];
    if (low.point[0] !== high.point[0] || low.point[1] !== high.point[1] || below.has(high.id)) return undefined;
    below.set(high.id, low);
  }
  if (below.size !== SIDE_COUNT || new Set(below.values()).size !== SIDE_COUNT) return undefined;

  const caps: [Face?, Face?] = [], sideFaces: Face[] = [];
  for (const face of faces) {
    const loop = face.loops.length === 1 ? loopById.get(face.loops[0]) : undefined;
    const chart = affineChart(face.surface, face.sense);
    if (!chart || loop?.kind !== 'outer' || !shells[0].faces.includes(face.id)
      || ![4, SIDE_COUNT].includes(loop.coedges.length)) return undefined;
    const corners: BrepVertex[] = [], boundary: BrepEdge[] = [];
    for (const coedge of loop.coedges) {
      const use = coedgeById.get(coedge), edge = use && edgeById.get(use.edge);
      if (!use || !edge) return undefined;
      const vertex = vertexById.get(edge.vertices[use.sense === 'forward' ? 0 : 1]);
      if (!vertex || !trimFits(chart, vertex.point, roundoff)) return undefined;
      corners.push(vertex);
      boundary.push(edge);
    }
    if (new Set(corners).size !== corners.length) return undefined;
    const binding = { original: face, loop, chart, corners, edges: boundary };
    if (corners.length === 4) { sideFaces.push(binding); continue; }
    const z = corners[0].point[2], cap = z === z0 ? 0 : 1;
    if (caps[cap] || chart.normal[2] * (cap === 0 ? -1 : 1) <= 0
      || !corners.every(({ point }) => point[2] === z)
      || !chart.surface.controlPoints.flat().every(point => Math.abs(point[2] - z) <= roundoff)) return undefined;
    caps[cap] = binding;
  }
  if (!caps[0] || !caps[1] || sideFaces.length !== SIDE_COUNT) return undefined;
  const upper = caps[1].corners, lower: BrepVertex[] = [];
  for (const vertex of upper) {
    const counterpart = below.get(vertex.id);
    if (!counterpart || !caps[0].corners.includes(counterpart)) return undefined;
    lower.push(counterpart);
  }

  const walls: Wall[] = [];
  for (let i = 0; i < SIDE_COUNT; i++) {
    const j = next(i), rim = caps[1].edges[i];
    const face = sideFaces.find(candidate => candidate.edges.includes(rim));
    if (!face || walls.some(wall => wall.face === face)) return undefined;
    const base = edgeBetween.get(pair(lower[i].id, lower[j].id));
    const start = edgeBetween.get(pair(lower[i].id, upper[i].id));
    const end = edgeBetween.get(pair(lower[j].id, upper[j].id));
    if (!base || !caps[0].edges.includes(base) || !start || !end
      || ![base, start, end].every(edge => face.edges.includes(edge))) return undefined;
    const { origin, normal: [x, y] } = face.chart, length = Math.hypot(x, y);
    if (!(length > 0)) return undefined;
    const normal: Point = [x / length, y / length, 0];
    if (!face.chart.surface.controlPoints.flat().every(point => Math.abs(dot(sub(point, origin), normal)) <= roundoff)) return undefined;
    walls.push({ face, origin, normal });
  }
  const selected = walls.findIndex(wall => wall.face.original.name === faceName);
  if (selected < 0) return undefined;
  const [x, y] = walls[selected].normal;
  const minorComponent = Math.min(Math.abs(x), Math.abs(y));
  // An exact axis direction is valid. Keep the existing cutoff for near-axis oblique walls.
  if ((minorComponent > 0 && minorComponent <= 64 * Number.EPSILON)
    || !keepsSection(upper.map(vertex => vertex.point), walls, selected, 0, extent)
    || !checkBrep(brep, { strict: true }).valid) return undefined;
  return { caps: [caps[0], caps[1]], walls, lower, upper, selected, extent };
}

function namedFace(brep: Brep, name: string): boolean {
  return brep.faces.filter(face => face.name === name).length === 1;
}

/** The face center and outward unit normal used by the signed offset handle. */
export function prismWallOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  if (!namedFace(brep, faceName)) return undefined;
  try {
    const prism = admittedPrism(brep, faceName);
    if (!prism) return undefined;
    const { lower, upper, walls, selected } = prism;
    const anchor = lerp(lerp(lower[selected].point, upper[selected].point, 0.5), lerp(lower[next(selected)].point, upper[next(selected)].point, 0.5), 0.5);
    return { anchor, normal: walls[selected].normal };
  } catch { return undefined; }
}

/** Intersect the two supports in coordinates local to their old corner. */
function meet(a: Wall, b: Wall, corner: Point, offset: number): Point {
  const [nx, ny] = a.normal, [mx, my] = b.normal, determinant = nx * my - ny * mx;
  if (Math.abs(determinant) <= 64 * Number.EPSILON) fail('GEOMETRY', 'the selected wall and its neighbor are parallel');
  const p = offset - dot(sub(corner, a.origin), a.normal), q = -dot(sub(corner, b.origin), b.normal);
  return [corner[0] + (p * my - q * ny) / determinant, corner[1] + (nx * q - mx * p) / determinant, corner[2]];
}

function rebuiltChart(face: Face, points: readonly Point[], shift: Point, roundoff: number): Chart {
  const { chart } = face;
  const translated = { ...chart, origin: add(chart.origin, shift) };
  if (shift.every(value => value === 0) && points.every(point => trimFits(chart, point, roundoff))) return chart;

  const uv = points.map(point => fractions(translated, point));
  // Keep the previous chart span when possible. A short trim edge can still have a wide, stable support chart.
  const build = (includeOriginal: boolean): Chart | undefined => {
    const us = uv.map(value => value[0]), vs = uv.map(value => value[1]);
    if (includeOriginal) { us.push(0, 1); vs.push(0, 1); }
    const grid = [Math.min(...us), Math.max(...us)].map(u => [Math.min(...vs), Math.max(...vs)].map(v =>
      add(translated.origin, add(scale(chart.u, u), scale(chart.v, v)))));
    if (geometryScaleMM(grid.flat()) > CadNumericPolicy.coordinateAbs) return undefined;
    const adjusted = affineChart({ ...chart.surface, controlPoints: grid }, face.original.sense);
    return adjusted && points.every(point => trimFits(adjusted, point, roundoff)) ? adjusted : undefined;
  };
  const result = build(true) ?? build(false);
  if (!result) return fail('GEOMETRY', 'the offset cannot keep the trim in its planar chart within the modeling range');
  return result;
}

export function uvPoint(chart: Chart, point: Point): Point {
  const [u, v] = fractions(chart, point), U = chart.surface.knotsU, V = chart.surface.knotsV;
  const at = (value: number, knots: number[]) => knots[1] + Math.min(1, Math.max(0, value)) * (knots[2] - knots[1]);
  return [at(u, U), at(v, V), 0];
}

/** Offset one upright wall of a straight convex hexagonal prism. */
export function offsetPrismWall(brep: Brep, faceName: string, distance: number): Brep {
  if (typeof distance !== 'number' || !Number.isFinite(distance)) fail('INPUT', 'distance must be finite');
  if (!namedFace(brep, faceName)) fail('INPUT', 'the selected face name is missing or ambiguous');
  const prism = admittedPrism(brep, faceName);
  if (!prism) return fail('GEOMETRY', 'pick an upright wall of one straight convex hexagonal prism');
  return offsetWall(brep, prism, distance);
}

/** The Part route uses this for a valid request before it tries the rectangular taper recipe. */
export function offsetPrismWallIfAdmitted(brep: Brep, faceName: string, distance: number): Brep | undefined {
  if (!namedFace(brep, faceName)) return undefined;
  const prism = admittedPrism(brep, faceName);
  return prism && offsetWall(brep, prism, distance);
}

function offsetWall(brep: Brep, prism: Prism, distance: number): Brep {
  if (distance === 0) return brep;
  if (Math.abs(distance) <= allowance(prism.extent)) fail('GEOMETRY', 'distance is too small to move the wall');
  const { lower, upper, walls, selected, caps } = prism;
  const wall = walls[selected], end = next(selected), previous = prev(selected);
  const a = meet(wall, walls[previous], upper[selected].point, distance);
  const b = meet(wall, walls[end], upper[end].point, distance);
  const extent = Math.max(prism.extent, geometryScaleMM([a, b]));
  if (!Number.isFinite(extent) || extent > CadNumericPolicy.coordinateAbs) fail('GEOMETRY', 'the offset exceeds the modeling coordinate range');
  const section = upper.map((vertex, i) => i === selected ? a : i === end ? b : vertex.point);
  if (!keepsSection(section, walls, selected, distance, extent)) fail('GEOMETRY', 'the offset would collapse or cross a wall of the hexagonal section');

  const moved = new Map<string, Point>();
  for (const i of [selected, end]) {
    const [x, y] = section[i];
    moved.set(upper[i].id, section[i]);
    moved.set(lower[i].id, [x, y, lower[i].point[2]]);
  }
  const vertices = brep.vertices.map(vertex => {
    const point = moved.get(vertex.id);
    return point ? { ...vertex, point } : vertex;
  });
  const changedEdges = new Set<string>();
  const edges = brep.edges.map(edge => {
    if (!edge.vertices.some(id => moved.has(id))) return edge;
    const adjusted = { ...edge, curve: { ...edge.curve, controlPoints: edge.vertices.map((id, i) => moved.get(id) ?? edge.curve.controlPoints[i]) } };
    changedEdges.add(edge.id);
    return adjusted;
  });

  const changedCharts = new Set<string>(), affectedCharts = new Map<string, Chart>();
  const changedFaces = new Map<string, BrepFace>();
  const unchanged: Point = [0, 0, 0], shift = scale(wall.normal, distance);
  for (const face of [...caps, walls[previous].face, wall.face, walls[end].face]) {
    const points = face.corners.map(vertex => moved.get(vertex.id) ?? vertex.point);
    const chart = rebuiltChart(face, points, face === wall.face ? shift : unchanged, allowance(extent));
    affectedCharts.set(face.loop.id, chart);
    if (chart === face.chart) continue;
    changedCharts.add(face.loop.id);
    changedFaces.set(face.original.id, { ...face.original, surface: chart.surface });
  }
  const faces = brep.faces.map(face => changedFaces.get(face.id) ?? face);
  const edgeById = new Map(edges.map(edge => [edge.id, edge]));
  const coedges = brep.coedges.map(coedge => {
    if (!coedge.pcurve || (!changedEdges.has(coedge.edge) && !changedCharts.has(coedge.loop))) return coedge;
    const chart = affectedCharts.get(coedge.loop)!, { curve } = edgeById.get(coedge.edge)!;
    const pcurve = { ...curve, id: coedge.pcurve.id, controlPoints: curve.controlPoints.map(point => uvPoint(chart, point)) };
    return { ...coedge, pcurve };
  });

  const result: Brep = { ...brep, vertices, edges, faces, coedges };
  const report = checkBrep(result, { strict: true });
  if (!report.valid) fail('GEOMETRY', `the offset solid is invalid: ${report.issues[0]}`);
  return result;
}
