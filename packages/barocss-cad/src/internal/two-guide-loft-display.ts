import type { Brep, BrepCoedge, BrepEdge, BrepFace } from '../brep/brep-core.js';
import type { BrepMesh, BrepMeshFace } from '../brep/brep-tessellate.js';
import { add, cross, dist, dot, len, lerp, scale, sub } from '../core/vec3.js';
import type { Curve, Point } from '../types.js';

const nativeTwoGuideLofts = new WeakSet<Brep>();
const targetErrorMM = 0.01;
const fitResolution = 1500;
const maxPacketBytes = 192 * 1024;
const segmentCounts = [1, 2, 4, 8, 16, 32, 64, 128];

/** Mark the live result of the two-guide constructor. A copied or derived B-rep has no display provenance. */
export function registerTwoGuideLoftDisplay(brep: Brep): void {
  nativeTwoGuideLofts.add(brep);
}

interface Boundary {
  edge: BrepEdge;
  use: BrepCoedge;
  increasing: boolean;
}

interface FaceChart {
  face: BrepFace;
  cap: boolean;
  rows: Point[][];
  sides: Boundary[];
  ring: Boundary[];
}

interface DisplayGrid { u: number; v: number; error: number }

function bezierKnots(knots: readonly number[], degree: number): boolean {
  return knots.length === 2 * (degree + 1) && knots.every((k, i) => k === (i <= degree ? 0 : 1));
}

function polynomialCurve(curve: Curve, degree: number): boolean {
  return curve.degree === degree && bezierKnots(curve.knots, degree) && curve.controlPoints.length === degree + 1
    && curve.controlPoints.every(p => p.length === 3 && p.every(Number.isFinite))
    && curve.weights.length === degree + 1 && curve.weights.every(w => w === 1);
}

function isoSide(use: BrepCoedge): { side: number; increasing: boolean } | undefined {
  const curve = use.pcurve;
  if (!curve || !polynomialCurve(curve, 1)) return;
  const [a, b] = curve.controlPoints;
  if (a[2] !== 0 || b[2] !== 0 || !a.slice(0, 2).concat(b.slice(0, 2)).every(x => x === 0 || x === 1)) return;
  if (a[0] === b[0] && a[1] !== b[1]) return { side: a[0], increasing: a[1] < b[1] };
  if (a[1] === b[1] && a[0] !== b[0]) return { side: 2 + a[1], increasing: a[0] < b[0] };
}

function faceChart(face: BrepFace, uses: readonly BrepCoedge[], edges: ReadonlyMap<string, BrepEdge>, origin: Point): FaceChart | undefined {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 1 || s.degreeV < 1 || s.degreeV > 3 || !Number.isInteger(s.degreeV)
    || !bezierKnots(s.knotsU, 1) || !bezierKnots(s.knotsV, s.degreeV) || s.controlPoints.length !== 2 || s.weights.length !== 2
    || !s.controlPoints.every(row => row.length === s.degreeV + 1 && row.every(p => p.length === 3 && p.every(Number.isFinite)))
    || !s.weights.every(row => row.length === s.degreeV + 1 && row.every(w => w === 1))
    || (face.sense !== 'forward' && face.sense !== 'reversed')) return;
  const cap = s.degreeV === 1, sides: Boundary[] = [], ring: Boundary[] = [];
  for (const use of uses) {
    const iso = isoSide(use), edge = edges.get(use.edge);
    if (!iso || !edge || sides[iso.side] || (use.sense !== 'forward' && use.sense !== 'reversed')) return;
    const degree = cap || iso.side >= 2 ? 1 : edge.curve.degree;
    if ((!cap && iso.side < 2 && (degree < 2 || degree > s.degreeV)) || !polynomialCurve(edge.curve, degree)) return;
    const boundary = { edge, use, increasing: iso.increasing };
    sides[iso.side] = boundary;
    ring.push(boundary);
  }
  const rows = s.controlPoints.map(row => row.map(p => sub(p, origin)));
  if (cap) {
    const [[a, b], [c, d]] = rows, normal = cross(sub(c, a), sub(b, a));
    const span = len(normal), roundoff = 256 * Number.EPSILON * Math.max(1, len(origin), len(a), len(b), len(c), len(d));
    if (!(span > 0 && Math.abs(dot(normal, sub(d, a))) <= roundoff * span)) return;
  }
  return { face, cap, rows, sides, ring };
}

function chartsOf(brep: Brep, edges: ReadonlyMap<string, BrepEdge>, origin: Point): FaceChart[] | undefined {
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const shell = brep.shells[0], body = brep.bodies[0];
  if (!shell.closed || body.kind !== 'solid' || shell.body !== body.id || body.shells.length !== 1 || body.shells[0] !== shell.id
    || shell.faces.length !== 6 || edges.size !== 12 || loops.size !== 6 || coedges.size !== 24) return;
  const charts: FaceChart[] = [], railUses = new Map<string, number>();
  for (const face of brep.faces) {
    const loop = loops.get(face.loops[0]);
    if (face.shell !== shell.id || !shell.faces.includes(face.id) || face.loops.length !== 1 || loop?.face !== face.id
      || loop.kind !== 'outer' || loop.coedges.length !== 4) return;
    const uses: BrepCoedge[] = [];
    for (const [i, id] of loop.coedges.entries()) {
      const use = coedges.get(id), twin = use?.twin ? coedges.get(use.twin) : undefined;
      if (!use || use.loop !== loop.id || use.next !== loop.coedges[(i + 1) % 4] || use.prev !== loop.coedges[(i + 3) % 4]
        || !twin || twin.twin !== id || twin.edge !== use.edge || twin.sense === use.sense || twin.loop === loop.id) return;
      uses.push(use);
    }
    const chart = faceChart(face, uses, edges, origin);
    if (!chart) return;
    for (const [i, { edge, use }] of chart.ring.entries()) {
      const following = chart.ring[(i + 1) % 4];
      const end = edge.vertices[use.sense === 'forward' ? 1 : 0];
      const start = following.edge.vertices[following.use.sense === 'forward' ? 0 : 1];
      if (end !== start) return;
    }
    if (!chart.cap) for (const { edge } of chart.sides.slice(0, 2)) railUses.set(edge.id, (railUses.get(edge.id) ?? 0) + 1);
    charts.push(chart);
  }
  if (new Set(charts.map(c => c.face.id)).size !== 6 || charts.filter(c => c.cap).length !== 2
    || railUses.size !== 4 || [...railUses.values()].some(count => count !== 2)) return;
  return charts;
}

function boundaryControls(chart: FaceChart, i: number): readonly Point[] {
  const [a, b] = chart.rows;
  if (i < 2) return chart.rows[i];
  const j = i === 2 ? 0 : a.length - 1;
  return [a[j], b[j]];
}

function bindingError(chart: FaceChart, origin: Point): number {
  let error = 0;
  for (const [i, { edge, increasing }] of chart.sides.entries()) {
    const chartControls = boundaryControls(chart, i), controls = edge.curve.controlPoints.map(p => sub(p, origin));
    if (!increasing) controls.reverse();
    if (controls.length === 3 && chartControls.length === 4) {
      const [a, b, c] = controls;
      controls.splice(1, 1, lerp(a, b, 2 / 3), lerp(c, b, 2 / 3));
    }
    for (const [j, p] of controls.entries()) error = Math.max(error, dist(p, chartControls[j]));
  }
  return error;
}

function differences(points: Point[]): Point[] {
  return points.slice(1).map((point, i) => sub(point, points[i]));
}

function gridFor(charts: readonly FaceChart[], allowance: number, target: number): DisplayGrid | undefined {
  let vv = 0, uv = 0;
  for (const { cap, rows } of charts) {
    if (cap) continue;
    const [a, b] = rows.map(differences), degree = a.length;
    for (const row of [a, b]) for (const d of differences(row)) vv = Math.max(vv, degree * (degree - 1) * len(d));
    for (const [i, d] of a.entries()) uv = Math.max(uv, degree * dist(d, b[i]));
  }
  let chosen: DisplayGrid | undefined, smallest = Infinity;
  for (const u of segmentCounts) for (const v of segmentCounts) {
    // Frame All magnifies small parts. Keep at least 32 rail segments even when the absolute error is small.
    if (v < 32) continue;
    const vertices = 4 * (u + 1) * (v + 1) + 8 * u + 2;
    const triangles = 8 * u * v + 8 * u, edgeSegments = 8 * u + 4 * v;
    // Packed Model buffers use 40 bytes per vertex, 12 per triangle and 56 per edge segment.
    const bytes = 40 * vertices + 12 * triangles + 56 * edgeSegments;
    // Linear interpolation in v contributes vv * hv²/8. Splitting the bilinear cell adds uv * hu * hv/4.
    const error = vv / (8 * v * v) + uv / (4 * u * v) + allowance;
    if (error <= target && bytes <= maxPacketBytes && bytes < smallest) {
      chosen = { u, v, error };
      smallest = bytes;
    }
  }
  return chosen;
}

function bezier(points: readonly Point[], t: number): Point {
  const level = points.slice();
  for (let n = level.length - 1; n > 0; n--) for (let i = 0; i < n; i++) level[i] = lerp(level[i], level[i + 1], t);
  return level[0];
}

type Samples = ReadonlyMap<string, Point[]>;

function edgePoint(samples: Samples, boundary: Boundary, i: number): Point {
  const points = samples.get(boundary.edge.id)!;
  return points[boundary.increasing ? i : points.length - 1 - i];
}

interface MeshBuilder { positions: number[]; normals: number[]; indices: number[]; faces: BrepMeshFace[] }

function addVertex(mesh: MeshBuilder, p: Point, normal: Point): void {
  mesh.positions.push(p[0], p[1], p[2]);
  mesh.normals.push(normal[0], normal[1], normal[2]);
}

function addTriangle(mesh: MeshBuilder, a: number, b: number, c: number): boolean {
  const p = mesh.positions, A = 3 * a, B = 3 * b, C = 3 * c;
  const n = cross([p[B] - p[A], p[B + 1] - p[A + 1], p[B + 2] - p[A + 2]],
    [p[C] - p[A], p[C + 1] - p[A + 1], p[C + 2] - p[A + 2]]);
  for (const i of [A, B, C]) if (!(dot(n, mesh.normals.slice(i, i + 3)) > 0)) return false;
  mesh.indices.push(a, b, c);
  return true;
}

function emitWall(mesh: MeshBuilder, chart: FaceChart, grid: DisplayGrid, samples: Samples, origin: Point, base: number, sign: number): boolean {
  const [left, right] = chart.rows, [u0, u1, v0, v1] = chart.sides, [dl, dr] = chart.rows.map(differences);
  const stride = grid.u + 1;
  for (let j = 0; j <= grid.v; j++) {
    const v = j / grid.v, a = bezier(left, v), b = bezier(right, v), du = sub(b, a);
    const da = bezier(dl, v), db = bezier(dr, v);
    for (let i = 0; i <= grid.u; i++) {
      const u = i / grid.u;
      const point = i === 0 ? edgePoint(samples, u0, j) : i === grid.u ? edgePoint(samples, u1, j)
        : j === 0 ? edgePoint(samples, v0, i) : j === grid.v ? edgePoint(samples, v1, i)
          : add(origin, lerp(a, b, u));
      const n = cross(du, lerp(da, db, u)), length = len(n);
      if (!(length > 0 && Number.isFinite(length) && point.every(Number.isFinite))) return false;
      // The positive v degree scales both derivative rows equally and drops out on normalization.
      addVertex(mesh, point, scale(n, sign / length));
    }
  }
  for (let j = 0; j < grid.v; j++) for (let i = 0; i < grid.u; i++) {
    const a = base + j * stride + i, b = a + 1, c = a + stride, d = c + 1;
    if (sign > 0 ? !addTriangle(mesh, a, b, c) || !addTriangle(mesh, b, d, c)
      : !addTriangle(mesh, a, c, b) || !addTriangle(mesh, b, c, d)) return false;
  }
  return true;
}

function emitCap(mesh: MeshBuilder, chart: FaceChart, samples: Samples, origin: Point, base: number, sign: number): boolean {
  const [[a, b], [c, d]] = chart.rows, n = cross(sub(c, a), sub(b, a)), length = len(n);
  if (!(length > 0 && Number.isFinite(length))) return false;
  const normal = scale(n, sign / length);
  addVertex(mesh, add(origin, lerp(a, d, 0.5)), normal);
  for (const { edge, use } of chart.ring) {
    const points = samples.get(edge.id)!, count = points.length - 1;
    for (let i = 0; i < count; i++) addVertex(mesh, points[use.sense === 'forward' ? i : count - i], normal);
  }
  const last = mesh.positions.length / 3 - 1;
  for (let i = base + 1; i <= last; i++) if (!addTriangle(mesh, base, i, i === last ? base + 1 : i + 1)) return false;
  return true;
}

/** A bounded display approximation of an untouched two-guide Loft. Native tessellation stays available independently. */
export function tessellateTwoGuideLoftDisplay(brep: Brep): { mesh: BrepMesh; error: number } | undefined {
  if (!nativeTwoGuideLofts.has(brep) || brep.source.family !== 'loft' || brep.bodies.length !== 1 || brep.shells.length !== 1
    || brep.faces.length !== 6 || brep.loops.length !== 6 || brep.coedges.length !== 24 || brep.edges.length !== 12
    || brep.vertices.length !== 8) return;
  const origin = brep.vertices[0].point, vertexPoints = new Map(brep.vertices.map(v => [v.id, v.point]));
  const edges = new Map(brep.edges.map(e => [e.id, e]));
  if (vertexPoints.size !== 8 || [...vertexPoints.values()].some(p => p.length !== 3 || !p.every(Number.isFinite))) return;
  const charts = chartsOf(brep, edges, origin);
  if (!charts) return;
  let magnitude = 1, endpointError = 0, boundaryError = 0;
  const lower: Point = [Infinity, Infinity, Infinity], upper: Point = [-Infinity, -Infinity, -Infinity];
  for (const chart of charts) {
    boundaryError = Math.max(boundaryError, bindingError(chart, origin));
    for (const row of chart.rows) for (const p of row) {
      for (let axis = 0; axis < 3; axis++) {
        lower[axis] = Math.min(lower[axis], p[axis]);
        upper[axis] = Math.max(upper[axis], p[axis]);
        magnitude = Math.max(magnitude, Math.abs(origin[axis]), Math.abs(origin[axis] + p[axis]));
      }
    }
  }
  for (const edge of brep.edges) {
    const points = edge.curve.controlPoints, a = vertexPoints.get(edge.vertices[0]), b = vertexPoints.get(edge.vertices[1]);
    if (!a || !b) return;
    endpointError = Math.max(endpointError, dist(a, points[0]), dist(b, points[points.length - 1]));
  }
  // Bounded low-degree de Casteljau arithmetic, world-to-local subtraction and the final world-coordinate addition.
  const roundoff = 256 * Number.EPSILON * magnitude;
  if (!(boundaryError <= roundoff && endpointError <= roundoff)) return;
  // Bound error relative to the model scale as well as in millimetres.
  const target = Math.min(targetErrorMM, Math.max(...sub(upper, lower)) / fitResolution);
  const grid = gridFor(charts, roundoff + boundaryError + endpointError, target);
  if (!grid) return;

  const samples = new Map<string, Point[]>();
  for (const edge of brep.edges) {
    const count = edge.curve.degree === 1 ? grid.u : grid.v;
    const controls = edge.curve.controlPoints.map(p => sub(p, origin));
    const points = [vertexPoints.get(edge.vertices[0])!];
    for (let i = 1; i < count; i++) points.push(add(origin, bezier(controls, i / count)));
    points.push(vertexPoints.get(edge.vertices[1])!);
    samples.set(edge.id, points);
  }
  const mesh: MeshBuilder = { positions: [], normals: [], indices: [], faces: [] };
  for (const chart of charts) {
    const vertexOffset = mesh.positions.length / 3, indexOffset = mesh.indices.length, sign = chart.face.sense === 'forward' ? 1 : -1;
    const ok = chart.cap ? emitCap(mesh, chart, samples, origin, vertexOffset, sign) : emitWall(mesh, chart, grid, samples, origin, vertexOffset, sign);
    if (!ok) return;
    mesh.faces.push({ faceId: chart.face.id, kind: chart.cap ? 'planar' : 'ruled', vertexOffset, indexOffset,
      vertexCount: mesh.positions.length / 3 - vertexOffset, indexCount: mesh.indices.length - indexOffset });
  }
  return {
    mesh: {
      positions: Float64Array.from(mesh.positions), normals: Float64Array.from(mesh.normals), indices: Uint32Array.from(mesh.indices),
      faces: mesh.faces, edges: brep.edges.map(edge => ({ edgeId: edge.id, points: Float64Array.from(samples.get(edge.id)!.flat()) })),
    },
    error: grid.error,
  };
}
