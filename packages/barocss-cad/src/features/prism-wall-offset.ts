import { BrepError, checkBrep, type Brep, type BrepEdge, type BrepFace, type BrepLoop, type BrepVertex } from '../brep/brep-core.js';
import { add, cross, dist, dot, len, lerp, scale, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';

const HEXAGON_SIDE_COUNT = 6;
// Match the authored Part polygon limit. The quadratic support proof is bounded by this count.
const MAX_PRISM_SIDES = 1024;
const supportsPrismSides = (count: number) => count >= 3 && count <= MAX_PRISM_SIDES;
const next = (i: number, count: number) => (i + 1) % count;
const prev = (i: number, count: number) => (i + count - 1) % count;
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
  readonly extent: number;
};
type WallPrism = Prism & { readonly selected: number };

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
  return walls.every(({ origin: [ox, oy], normal: [nx, ny] }, i) => {
    const j = next(i, walls.length), edge = sub(points[j], points[i]), shift = i === selected ? distance : 0;
    return nx * edge[1] - ny * edge[0] > linear && points.every(([x, y], vertex) => {
      const signed = (x - ox) * nx + (y - oy) * ny - shift;
      return vertex === i || vertex === j ? Math.abs(signed) <= roundoff : signed < -linear;
    });
  });
}

/** Prove both straight cap rings and their matching wall loops from native incidence. */
function admittedPrism(brep: Brep, includeRectangles = false): Prism | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  const count = faces.length - 2;
  if (!supportsPrismSides(count) || bodies.length !== 1 || bodies[0].kind !== 'solid' || shells.length !== 1 || bodies[0].shells.length !== 1
    || bodies[0].shells[0] !== shells[0].id || !shells[0].closed || shells[0].faces.length !== count + 2
    || loops.length !== count + 2 || coedges.length !== 6 * count || edges.length !== 3 * count || vertices.length !== 2 * count) return undefined;
  const shellFaces = new Set(shells[0].faces);
  if (shellFaces.size !== count + 2) return undefined;
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
  if (below.size !== count || new Set(below.values()).size !== count) return undefined;

  const caps: [Face?, Face?] = [], sideFaces: Face[] = [];
  for (const face of faces) {
    const loop = face.loops.length === 1 ? loopById.get(face.loops[0]) : undefined;
    const chart = affineChart(face.surface, face.sense);
    if (!chart || loop?.kind !== 'outer' || !shellFaces.has(face.id)
      || (loop.coedges.length !== 4 && loop.coedges.length !== count)) return undefined;
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
    const z = corners[0].point[2];
    if (!corners.every(({ point }) => point[2] === z)) {
      if (corners.length !== 4) return undefined;
      sideFaces.push(binding);
      continue;
    }
    const cap = z === z0 ? 0 : 1;
    if (corners.length !== count || caps[cap] || chart.normal[2] * (cap === 0 ? -1 : 1) <= 0
      || !chart.surface.controlPoints.flat().every(point => Math.abs(point[2] - z) <= roundoff)) return undefined;
    caps[cap] = binding;
  }
  if (!caps[0] || !caps[1] || sideFaces.length !== count) return undefined;
  const upper = caps[1].corners, lower: BrepVertex[] = [];
  const lowerCorners = new Set(caps[0].corners);
  for (const vertex of upper) {
    const counterpart = below.get(vertex.id);
    if (!counterpart || !lowerCorners.has(counterpart)) return undefined;
    lower.push(counterpart);
  }

  const lowerRim = new Set(caps[0].edges), upperRim = new Set(caps[1].edges), faceByRim = new Map<BrepEdge, Face>();
  for (const face of sideFaces) {
    const rims = face.edges.filter(edge => upperRim.has(edge)), [rim] = rims;
    if (rims.length !== 1 || faceByRim.has(rim)) return undefined;
    faceByRim.set(rim, face);
  }
  const walls: Wall[] = [];
  for (let i = 0; i < count; i++) {
    const j = next(i, count), rim = caps[1].edges[i], face = faceByRim.get(rim);
    if (!face) return undefined;
    const base = edgeBetween.get(pair(lower[i].id, lower[j].id));
    const start = edgeBetween.get(pair(lower[i].id, upper[i].id));
    const end = edgeBetween.get(pair(lower[j].id, upper[j].id));
    if (!base || !lowerRim.has(base) || !start || !end
      || ![base, start, end].every(edge => face.edges.includes(edge))) return undefined;
    const { origin, normal: [x, y] } = face.chart, length = Math.hypot(x, y);
    if (!(length > 0)) return undefined;
    const normal: Point = [x / length, y / length, 0];
    if (!face.chart.surface.controlPoints.flat().every(point => Math.abs(dot(sub(point, origin), normal)) <= roundoff)) return undefined;
    walls.push({ face, origin, normal });
  }
  // Replacement retains its separate rectangular path. Pivot alone also admits rectangular polygon stock.
  if (!includeRectangles && count === 4 && walls.every(({ normal }, i) => Math.abs(dot(normal, walls[next(i, count)].normal)) <= allowance(1))) return undefined;
  if (!keepsSection(upper.map(vertex => vertex.point), walls, -1, 0, extent)
    || !checkBrep(brep, { strict: true }).valid) return undefined;
  return { caps: [caps[0], caps[1]], walls, lower, upper, extent };
}

function namedFace(brep: Brep, name: string): boolean {
  return brep.faces.filter(face => face.name === name).length === 1;
}

/** Check the intended face kind before running the full native prism proof. */
function namedPrismFace(brep: Brep, name: string, kind: 'cap' | 'wall'): boolean {
  const count = brep.faces.length - 2;
  if (!supportsPrismSides(count)) return false;
  const matches = brep.faces.filter(face => face.name === name), [face] = matches;
  if (matches.length !== 1 || face.loops.length !== 1
    || brep.loops.find(loop => loop.id === face.loops[0])?.coedges.length !== (kind === 'cap' ? count : 4)) return false;
  if (count !== 4) return true;
  // Both loops have four corners here. The chart is a preflight hint; the full proof uses vertex heights.
  const chart = affineChart(face.surface, face.sense);
  if (!chart) return false;
  const [x, y, z] = chart.normal;
  return (Math.abs(z) > Math.hypot(x, y)) === (kind === 'cap');
}

function admittedWallPrism(brep: Brep, faceName: string, includeRectangles = false): WallPrism | undefined {
  if (!namedPrismFace(brep, faceName, 'wall')) return undefined;
  const prism = admittedPrism(brep, includeRectangles);
  if (!prism) return undefined;
  const selected = prism.walls.findIndex(wall => wall.face.original.name === faceName);
  if (selected < 0) return undefined;
  const [x, y] = prism.walls[selected].normal, minorComponent = Math.min(Math.abs(x), Math.abs(y));
  // An exact axis direction is valid. Keep the existing Offset cutoff for near-axis oblique walls.
  if (minorComponent > 0 && minorComponent <= 64 * Number.EPSILON) return undefined;
  return { ...prism, selected };
}

/** The face center and outward unit normal used by the signed offset handle. */
export function prismWallOffsetFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  return brep.faces.length === HEXAGON_SIDE_COUNT + 2 ? prismWallReplacementFrame(brep, faceName) : undefined;
}

/** The face center and outward unit normal for the exact prism Replace face. */
export function prismWallReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  try {
    const prism = admittedWallPrism(brep, faceName);
    if (!prism) return undefined;
    const { lower, upper, walls, selected } = prism;
    const end = next(selected, walls.length);
    const anchor = lerp(lerp(lower[selected].point, upper[selected].point, 0.5), lerp(lower[end].point, upper[end].point, 0.5), 0.5);
    return { anchor, normal: walls[selected].normal };
  } catch { return undefined; }
}

/** Intersect the two supports in coordinates local to their old corner. */
function meet(a: Wall, b: Wall, corner: Point, offset: number, refuse = fail): Point {
  const [nx, ny] = a.normal, [mx, my] = b.normal, determinant = nx * my - ny * mx;
  if (Math.abs(determinant) <= 64 * Number.EPSILON) refuse('GEOMETRY', 'the selected wall and its neighbor are parallel');
  const p = offset - dot(sub(corner, a.origin), a.normal), q = -dot(sub(corner, b.origin), b.normal);
  return [corner[0] + (p * my - q * ny) / determinant, corner[1] + (nx * q - mx * p) / determinant, corner[2]];
}

function expandAffineTrim(chart: Chart, origin: Point, sense: BrepFace['sense'], points: readonly Point[], roundoff: number): Chart | undefined {
  const translated = { ...chart, origin };
  const uv = points.map(point => fractions(translated, point));
  // Keep the previous chart span when possible. A short trim edge can still have a wide, stable support chart.
  const build = (includeOriginal: boolean): Chart | undefined => {
    const us = uv.map(value => value[0]), vs = uv.map(value => value[1]);
    if (includeOriginal) { us.push(0, 1); vs.push(0, 1); }
    const grid = [Math.min(...us), Math.max(...us)].map(u => [Math.min(...vs), Math.max(...vs)].map(v =>
      add(origin, add(scale(chart.u, u), scale(chart.v, v)))));
    if (geometryScaleMM(grid.flat()) > CadNumericPolicy.coordinateAbs) return undefined;
    const adjusted = affineChart({ ...chart.surface, controlPoints: grid }, sense);
    return adjusted && points.every(point => trimFits(adjusted, point, roundoff)) ? adjusted : undefined;
  };
  return build(true) ?? build(false);
}

/** Keep or extend the original affine chart so it covers all trim corners on the same plane. */
export function coverAffineTrim(chart: Chart, sense: BrepFace['sense'], points: readonly Point[], roundoff: number): Chart | undefined {
  if (geometryScaleMM(chart.surface.controlPoints.flat()) <= CadNumericPolicy.coordinateAbs && points.every(point => trimFits(chart, point, roundoff))) return chart;
  return expandAffineTrim(chart, chart.origin, sense, points, roundoff);
}

function rebuiltChart(face: Face, points: readonly Point[], shift: Point, roundoff: number): Chart {
  const { chart } = face, { sense } = face.original;
  if (shift.every(value => value === 0) && points.every(point => trimFits(chart, point, roundoff))) return chart;
  const result = expandAffineTrim(chart, add(chart.origin, shift), sense, points, roundoff);
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
  const prism = brep.faces.length === HEXAGON_SIDE_COUNT + 2 && admittedWallPrism(brep, faceName);
  if (!prism) return fail('GEOMETRY', 'pick an upright wall of one straight convex hexagonal prism');
  return offsetWall(brep, prism, distance);
}

/** The Part route uses this for a valid request before it tries the rectangular taper recipe. */
export function offsetPrismWallIfAdmitted(brep: Brep, faceName: string, distance: number): Brep | undefined {
  if (brep.faces.length !== HEXAGON_SIDE_COUNT + 2) return undefined;
  const prism = admittedWallPrism(brep, faceName);
  return prism && offsetWall(brep, prism, distance);
}

function offsetWall(brep: Brep, prism: WallPrism, distance: number): Brep {
  if (distance === 0) return brep;
  if (Math.abs(distance) <= allowance(prism.extent)) fail('GEOMETRY', 'distance is too small to move the wall');
  const { lower, upper, walls, selected, caps } = prism;
  const wall = walls[selected], end = next(selected, walls.length), previous = prev(selected, walls.length);
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
  const charts = new Map<Face, Chart>(), unchanged: Point = [0, 0, 0], shift = scale(wall.normal, distance);
  for (const face of [...caps, walls[previous].face, wall.face, walls[end].face]) {
    const points = face.corners.map(vertex => moved.get(vertex.id) ?? vertex.point);
    charts.set(face, rebuiltChart(face, points, face === wall.face ? shift : unchanged, allowance(extent)));
  }
  const result = rebindPrismTrim(brep, moved, charts);
  const report = checkBrep(result, { strict: true });
  if (!report.valid) fail('GEOMETRY', `the offset solid is invalid: ${report.issues[0]}`);
  return result;
}

function rebindPrismTrim(brep: Brep, moved: ReadonlyMap<string, Point>, charts: ReadonlyMap<Face, Chart>): Brep {
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
  for (const [face, chart] of charts) {
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

  return { ...brep, vertices, edges, faces, coedges };
}

type ReplacementPlane = { readonly origin: Point; readonly normal: Point };
type PrismCap = { readonly prism: Prism; readonly cap: Face; readonly end: 0 | 1 };

function admittedPrismCap(brep: Brep, faceName: string): PrismCap | undefined {
  if (!namedPrismFace(brep, faceName, 'cap')) return undefined;
  const prism = admittedPrism(brep);
  if (!prism) return undefined;
  const end = prism.caps[0].original.name === faceName ? 0 : prism.caps[1].original.name === faceName ? 1 : undefined;
  return end === undefined ? undefined : { prism, cap: prism.caps[end], end };
}

/** The selected cap and its original outward direction for the exact prism Replace face. */
export function prismCapReplacementFrame(brep: Brep, faceName: string): { anchor: Point; normal: Point } | undefined {
  const admitted = admittedPrismCap(brep, faceName);
  if (!admitted) return undefined;
  const { cap, end } = admitted;
  const anchor: Point = [0, 0, cap.corners[0].point[2]];
  for (const { point } of cap.corners) {
    anchor[0] += point[0] / cap.corners.length;
    anchor[1] += point[1] / cap.corners.length;
  }
  return { anchor, normal: [0, 0, end === 0 ? -1 : 1] };
}

const finitePoint = (value: unknown): value is Point => Array.isArray(value) && value.length === 3 && value.every(component => typeof component === 'number' && Number.isFinite(component));

function replacementFailure(code: BrepError['code'], detail: string): never {
  throw new BrepError(code, `Replace face: ${detail}`);
}

function replacementPlaneInput(plane: ReplacementPlane): ReplacementPlane {
  if (!plane || typeof plane !== 'object' || Array.isArray(plane) || Object.keys(plane).sort().join(',') !== 'normal,origin'
    || !finitePoint(plane.origin) || !finitePoint(plane.normal)) return replacementFailure('INPUT', 'the reference needs a finite origin and normal.');
  const magnitude = len(plane.normal);
  if (!Number.isFinite(magnitude) || magnitude === 0) return replacementFailure('INPUT', 'the reference normal must have a finite nonzero length.');
  return { origin: plane.origin, normal: [plane.normal[0] / magnitude, plane.normal[1] / magnitude, plane.normal[2] / magnitude] };
}

/** Replace the upper or lower cap of the admitted straight convex polygon prism. */
export function replacePrismCapIfAdmitted(brep: Brep, faceName: string, plane: ReplacementPlane): Brep | undefined {
  const admitted = admittedPrismCap(brep, faceName);
  if (!admitted) return undefined;
  const { origin, normal: unit } = replacementPlaneInput(plane);
  if (Math.abs(unit[2]) <= 64 * Number.EPSILON)
    return replacementFailure('GEOMETRY', 'the reference plane is too close to perpendicular to the selected cap.');

  const { prism, cap, end } = admitted, outward = end === 0 ? -1 : 1;
  const normal = unit[2] * outward > 0 ? unit : scale(unit, -1);
  const lift = ([x, y]: Point): Point => [x, y, origin[2] - ((x - origin[0]) * normal[0] + (y - origin[1]) * normal[1]) / normal[2]];
  const fixed = prism.caps[end === 0 ? 1 : 0].corners[0].point[2];
  const points = cap.corners.map(vertex => lift(vertex.point));
  const extent = Math.max(prism.extent, geometryScaleMM(points, [origin]));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) return replacementFailure('GEOMETRY', 'the replacement exceeds the modeling coordinate range.');
  const heights = points.map(point => point[2]), linear = linearToleranceMM(extent);
  // Signed height is affine over the fixed convex polygon, so the minimum is at a corner.
  if (heights.some(z => (z - fixed) * outward <= linear))
    return replacementFailure('GEOMETRY', 'the replacement would reach or cross the opposite cap at one corner.');
  if (Math.max(...heights) - Math.min(...heights) <= linear)
    return replacementFailure('GEOMETRY', 'the reference plane tilt is too small for this cap.');

  const moved = new Map<string, Point>();
  for (const [i, vertex] of cap.corners.entries()) if (vertex.point[2] !== heights[i]) moved.set(vertex.id, points[i]);
  const surface = { ...cap.chart.surface, controlPoints: cap.chart.surface.controlPoints.map(row => row.map(lift)) };
  const roundoff = allowance(extent), seed = affineChart(surface, cap.original.sense);
  const chart = seed && coverAffineTrim(seed, cap.original.sense, points, roundoff);
  if (!chart) return replacementFailure('GEOMETRY', 'the replacement cannot preserve the reference plane and its trim.');
  const support = [...points, ...chart.surface.controlPoints.flat()];
  const supportRoundoff = allowance(Math.max(extent, geometryScaleMM(support)));
  if (len(sub(chart.normal, normal)) > 128 * Number.EPSILON
    || support.some(point => Math.abs(dot(sub(point, origin), normal)) > supportRoundoff))
    return replacementFailure('GEOMETRY', 'the replacement cannot preserve the reference plane and its trim.');

  const charts = new Map<Face, Chart>([[cap, chart]]);
  for (const { face } of prism.walls) {
    if (!face.corners.some(vertex => moved.has(vertex.id))) continue;
    const corners = face.corners.map(vertex => moved.get(vertex.id) ?? vertex.point);
    const kept = coverAffineTrim(face.chart, face.original.sense, corners, roundoff);
    if (!kept) return replacementFailure('GEOMETRY', 'the replacement cannot preserve the side supports and their trims.');
    charts.set(face, kept);
  }
  const result = rebindPrismTrim(brep, moved, charts), report = checkBrep(result, { strict: true });
  if (!report.valid) return replacementFailure('GEOMETRY', `the replacement solid is invalid: ${report.issues[0]}`);
  return result;
}

/** Replace one wall of the admitted straight convex polygon prism with a nonparallel plane. */
export function replacePrismWallIfAdmitted(brep: Brep, faceName: string, plane: ReplacementPlane): Brep | undefined {
  const prism = admittedWallPrism(brep, faceName);
  if (!prism) return undefined;
  return replacePrismWall(brep, prism, plane);
}

type PivotFailure = (code: 'INPUT' | 'CAPABILITY' | 'REFERENCE' | 'SELECTION' | 'GEOMETRY', detail: string) => never;

/** Turn one original convex polygon wall about its exact shared edge with the signed world-Z start cap. */
export function pivotPrismWall(brep: Brep, faceName: string, edgeName: string, angle: number, pull: 'z' | '-z', refuse: PivotFailure): Brep {
  if (!Number.isFinite(angle) || angle === 0 || Math.abs(angle) >= Math.PI / 4)
    return refuse('INPUT', 'Pivot face needs a nonzero angle below 45 degrees in size.');
  const faces = brep.faces.filter(face => face.name === faceName), edges = brep.edges.filter(edge => edge.name === edgeName);
  if (faces.length !== 1 || edges.length !== 1)
    return refuse('REFERENCE', 'The original Pivot face or edge is missing or ambiguous.');
  const prism = admittedWallPrism(brep, faceName, true);
  if (!prism) return refuse('CAPABILITY', 'Pivot face needs an original upright wall of one straight convex polygon extrusion.');
  const wall = prism.walls[prism.selected], [edge] = edges;
  const uses = brep.coedges.filter(use => use.edge === edge.id);
  const incident = uses.map(use => brep.loops.find(loop => loop.id === use.loop)?.face);
  const fixed = pull === 'z' ? 0 : 1, cap = prism.caps[fixed];
  if (uses.length !== 2 || uses[0].sense === uses[1].sense || !incident.includes(wall.face.original.id)
    || !incident.includes(cap.original.id) || !wall.face.edges.includes(edge) || !cap.edges.includes(edge)
    || edge.curve.controlPoints.some(point => point[2] !== cap.corners[0].point[2]))
    return refuse('SELECTION', 'The Pivot edge must join the selected original side to the start cap of the signed Z pull.');
  const c = Math.cos(angle), s = Math.sin(angle) * (pull === 'z' ? 1 : -1);
  const normal: Point = [wall.normal[0] * c, wall.normal[1] * c, s];
  return replacePrismWall(brep, prism, { origin: edge.curve.controlPoints[0], normal }, fixed,
    (code, detail) => refuse(code === 'INPUT' ? 'INPUT' : 'GEOMETRY', `Pivot face: ${detail}`));
}

/** Replacement and hinge drafting share the support proof, chart extension and native trim binding. */
function replacePrismWall(brep: Brep, prism: WallPrism, plane: ReplacementPlane, fixedCap?: 0 | 1,
  refuse: typeof replacementFailure = replacementFailure): Brep {
  const { origin, normal: unit } = replacementPlaneInput(plane);
  const { selected, walls, lower, upper, caps } = prism;
  const wall = walls[selected], previous = prev(selected, walls.length), end = next(selected, walls.length);
  const horizontal = Math.hypot(unit[0], unit[1]), angularRoundoff = 64 * Number.EPSILON;
  const alignment = dot(unit, wall.normal), projected = Math.abs(alignment);
  if (horizontal <= angularRoundoff || projected <= angularRoundoff)
    return refuse('GEOMETRY', 'the reference plane is too close to perpendicular to the selected wall.');
  const normal = alignment > 0 ? unit : scale(unit, -1);
  const horizontalNormal: Point = [normal[0] / horizontal, normal[1] / horizontal, 0];
  const sourceExtent = Math.max(prism.extent, geometryScaleMM([origin]));
  if (!(sourceExtent <= CadNumericPolicy.coordinateAbs))
    return refuse('GEOMETRY', 'the replacement exceeds the modeling coordinate range.');
  const supportAt = (point: Point) => dot(sub(point, origin), normal);
  const refuseParallel = (code: BrepError['code']) => refuse(code, 'the reference plane is parallel to an adjacent wall.');
  const sections = [lower, upper].map((corners, capIndex) => {
    const anchor: Point = [wall.origin[0], wall.origin[1], corners[0].point[2]];
    const support = { ...wall, origin: add(anchor, scale(horizontalNormal, -supportAt(anchor) / horizontal)), normal: horizontalNormal };
    const supports = walls.map((original, i) => i === selected ? support : original);
    // The fixed cap and hinge records never enter an intersection or roundoff-snap calculation.
    if (capIndex === fixedCap) return { corners, points: corners.map(vertex => vertex.point), supports };
    function fitCorner(index: number, neighbor: Wall): Point {
      const old = corners[index].point, point = meet(support, neighbor, old, 0, refuseParallel);
      return dist(point, old) <= allowance(sourceExtent) ? old : point;
    }
    const a = fitCorner(selected, walls[previous]), b = fitCorner(end, walls[end]);
    return { corners, points: corners.map((vertex, i) => i === selected ? a : i === end ? b : vertex.point), supports };
  });
  const extent = Math.max(sourceExtent, geometryScaleMM(...sections.map(section => section.points)));
  if (!(extent <= CadNumericPolicy.coordinateAbs))
    return refuse('GEOMETRY', 'the replacement exceeds the modeling coordinate range.');
  const roundoff = allowance(extent), linear = linearToleranceMM(extent);
  const displacements = wall.face.corners.map(vertex => supportAt(vertex.point) / projected);
  if (Math.max(...displacements) - Math.min(...displacements) <= linear)
    return refuse('GEOMETRY', 'the reference plane tilt is too small for this wall.');
  const incident = (i: number) => i === selected || i === end;
  // Intersections and signed plane distances are affine in Z, so both certified end sections prove the entire slab.
  for (const { points, supports } of sections) {
    if (!keepsSection(points, supports, selected, 0, extent)
      || points.some((point, i) => !incident(i) && supportAt(point) >= -linear * horizontal))
      return refuse('GEOMETRY', 'the replacement would collapse or cross a wall of the polygon section.');
    if (points.some((point, i) => incident(i) && Math.abs(supportAt(point)) > roundoff))
      return refuse('GEOMETRY', 'the replacement cannot preserve the reference plane and its trim.');
  }

  const moved = new Map<string, Point>();
  for (const { corners, points } of sections) for (const i of [selected, end]) {
    if (points[i] !== corners[i].point) moved.set(corners[i].id, points[i]);
  }
  // Projection along the original horizontal normal lifts the source affine envelope onto the true donor plane.
  const lift = (point: Point) => add(point, scale(wall.normal, -supportAt(point) / projected));
  const charts = new Map<Face, Chart>();
  for (const face of [...caps, walls[previous].face, wall.face, walls[end].face]) {
    if (!face.corners.some(vertex => moved.has(vertex.id))) continue;
    const corners = face.corners.map(vertex => moved.get(vertex.id) ?? vertex.point);
    const surface = face.chart.surface;
    const seed = face === wall.face ? affineChart({ ...surface, controlPoints: surface.controlPoints.map(row => row.map(lift)) }, face.original.sense) : face.chart;
    const fitted = seed && coverAffineTrim(seed, face.original.sense, corners, roundoff);
    if (!fitted) return refuse('GEOMETRY', 'the replacement cannot preserve the planar supports and their trims.');
    if (face === wall.face) {
      const poles = fitted.surface.controlPoints.flat(), supportRoundoff = allowance(Math.max(extent, geometryScaleMM(poles)));
      if (len(sub(fitted.normal, normal)) > 128 * Number.EPSILON || poles.some(point => Math.abs(supportAt(point)) > supportRoundoff))
        return refuse('GEOMETRY', 'the replacement cannot preserve the reference plane and its trim.');
    }
    charts.set(face, fitted);
  }
  const result = rebindPrismTrim(brep, moved, charts), report = checkBrep(result, { strict: true });
  if (!report.valid) return refuse('GEOMETRY', `the replacement solid is invalid: ${report.issues[0]}`);
  return result;
}
