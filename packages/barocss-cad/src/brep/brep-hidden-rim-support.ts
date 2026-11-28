// Private permission for native probes on complete convex cylinder/cap rims.
// Exact edge bindings restrict this support to the original native rim.
import { binary64Dyadic } from '../core/dyadic.js';
import { add, cross, dot, len, scale, sub, unit as normalize } from '../core/vec3.js';
import type { Curve, Point } from '../types.js';
import type { FaceGeometry } from './analytic-boolean.js';
import type { Brep, BrepCoedge, BrepEdge, BrepFace, BrepLoop } from './brep-core.js';
import type { circleOf } from './brep-tessellate.js';
import { circularBoundaryDirection } from './sweep-circular-join-bindings.js';

type Circle = NonNullable<ReturnType<typeof circleOf>>;
type Plane = Extract<FaceGeometry, { kind: 'plane' }>;
type Primitive = Exclude<FaceGeometry, { kind: 'other' }>;
type Front = ((point: Point) => boolean) & { nativeHidden?: (nativePoint: Point, epsilon: number) => boolean };
export interface ConvexRimContext {
  circle(curve: Curve): Circle | null;
  primitive(face: BrepFace): Primitive | null;
  inPlane(circle: Circle, plane: Plane): boolean;
  charge(count: number): void;
}
interface Use { coedge: BrepCoedge; loop: BrepLoop }
interface Topology {
  valid: boolean;
  edges: Map<string, BrepEdge>;
  faces: Map<string, BrepFace>;
  faceLoops: Map<BrepFace, Set<string>>;
  uses: Map<string, Use[]>;
  fronts: Map<BrepEdge, Front | null>;
}
const ENDS = [0, 1] as const;
const SIDE_TRAVERSAL = [-1, 1, 1, -1] as const;

function topology(body: Brep, charge: ConvexRimContext['charge']): Topology {
  charge(body.edges.length + body.faces.length + body.loops.length + body.coedges.length);
  const edges = new Map<string, BrepEdge>(), faces = new Map<string, BrepFace>();
  const faceLoops = new Map<BrepFace, Set<string>>(), uses = new Map<string, Use[]>();
  const loops = new Map<string, { loop: BrepLoop; members: Set<string> }>();
  let valid = true;
  for (const edge of body.edges) { if (edges.has(edge.id)) valid = false; edges.set(edge.id, edge); }
  for (const face of body.faces) {
    charge(face.loops.length);
    const members = new Set(face.loops);
    if (faces.has(face.id) || members.size !== face.loops.length) valid = false;
    faces.set(face.id, face); faceLoops.set(face, members);
  }
  for (const loop of body.loops) {
    charge(loop.coedges.length);
    const members = new Set(loop.coedges);
    if (loops.has(loop.id) || members.size !== loop.coedges.length) valid = false;
    loops.set(loop.id, { loop, members });
  }
  const ids = new Set<string>();
  for (const coedge of body.coedges) {
    if (ids.has(coedge.id)) valid = false;
    ids.add(coedge.id);
    const entry = loops.get(coedge.loop);
    if (!entry || !entry.members.has(coedge.id)) { valid = false; continue; }
    let list = uses.get(coedge.edge);
    if (!list) { list = []; uses.set(coedge.edge, list); }
    list.push({ coedge, loop: entry.loop });
  }
  return { valid, edges, faces, faceLoops, uses, fronts: new Map() };
}

/** A provided cylinder pcurve follows the edge parameter, not its loop traversal. */
function pcurveMatches(edge: BrepEdge, face: BrepFace, use: Use, end: 0 | 1, direction: 1 | -1,
  charge: ConvexRimContext['charge']): boolean {
  const pc = use.coedge.pcurve;
  if (!pc || face.surface.kind !== 'surface') return !pc;
  charge(pc.controlPoints.length + pc.weights.length + pc.knots.length);
  if (pc.degree !== 1 || pc.controlPoints.length !== 2 || pc.weights.length !== 2 || pc.knots.length !== 4
    || !Number.isFinite(pc.weights[0]) || !(pc.weights[0] > 0) || pc.weights[0] !== pc.weights[1]) return false;
  const c = edge.curve, S = face.surface, a = c.knots[c.degree], b = c.knots[c.knots.length - c.degree - 1];
  const u0 = S.knotsU[S.degreeU], u1 = S.knotsU[S.knotsU.length - S.degreeU - 1];
  const first = direction === 1 ? u0 : u1, last = direction === 1 ? u1 : u0, v = S.knotsV[end === 0 ? 1 : 2];
  return pc.knots[0] === a && pc.knots[1] === a && pc.knots[2] === b && pc.knots[3] === b
    && pc.controlPoints[0][0] === first && pc.controlPoints[1][0] === last
    && pc.controlPoints[0][1] === v && pc.controlPoints[1][1] === v
    && pc.controlPoints[0][2] === 0 && pc.controlPoints[1][2] === 0;
}

function wholeEnd(edge: BrepEdge, face: BrepFace, use: Use, charge: ConvexRimContext['charge']): boolean {
  if (face.surface.kind !== 'surface') return false;
  const S = face.surface;
  let matches = 0;
  for (const end of ENDS) {
    charge(8 * S.controlPoints.length + 4 * S.knotsU.length + 32);
    const boundary: Curve = { kind: 'curve', id: 'rim-boundary', degree: S.degreeU, knots: S.knotsU,
      controlPoints: S.controlPoints.map(row => row[end]), weights: S.weights.map(row => row[end]) };
    // Complete coefficients, with no new spatial tolerance for native welding.
    const direction = circularBoundaryDirection(edge.curve, boundary, 0);
    if (direction && pcurveMatches(edge, face, use, end, direction, charge)) matches++;
  }
  return matches === 1;
}

/** Exact sign of (point - circle center) dot view from stored binary64 values. */
function front(point: Point, center: Point, toward: Point): boolean {
  const values = [point[0], point[1], point[2], center[0], center[1], center[2], toward[0], toward[1], toward[2]];
  const parts: ReturnType<typeof binary64Dyadic>[] = [];
  let exponent = 0;
  for (const value of values) {
    if (!Number.isFinite(value)) return false;
    const part = binary64Dyadic(value); parts.push(part);
    if (part.k > exponent) exponent = part.k;
  }
  const integers: bigint[] = [];
  for (const part of parts) integers.push(part.m << BigInt(exponent - part.k));
  return (integers[0] - integers[3]) * integers[6] + (integers[1] - integers[4]) * integers[7]
    + (integers[2] - integers[5]) * integers[8] > 0n;
}

/** Bind every native rational coefficient through the complete planar affine chart. */
function planePcurveMatches(edge: BrepEdge, plane: BrepFace, use: Use, charge: ConvexRimContext['charge']): boolean {
  const pc = use.coedge.pcurve, S = plane.surface, c = edge.curve;
  if (!pc || S.kind !== 'surface') return !pc;
  charge(32 + pc.controlPoints.length * 8 + pc.knots.length + pc.weights.length);
  const unit = (knots: readonly number[]) => knots.length === 4 && knots[0] === 0 && knots[1] === 0 && knots[2] === 1 && knots[3] === 1;
  if (S.degreeU !== 1 || S.degreeV !== 1 || !unit(S.knotsU) || !unit(S.knotsV)
    || S.controlPoints.length !== 2 || S.controlPoints.some(row => row.length !== 2)
    || S.weights.length !== 2 || S.weights.some(row => row.length !== 2 || row.some(w => w !== 1))
    || S.controlPoints.some(row => row.some(p => p.some(x => !Number.isFinite(x))))) return false;
  const origin = S.controlPoints[0][0], u = sub(S.controlPoints[1][0], origin), v = sub(S.controlPoints[0][1], origin);
  const end = S.controlPoints[1][1], magnitude = Math.max(1, len(origin), len(end), len(u), len(v));
  const error = 512 * Number.EPSILON * magnitude;
  if (!(len(cross(u, v)) > error * Math.max(len(u), len(v))) || !(len(sub(end, add(origin, add(u, v)))) <= error)) return false;
  if (pc.degree !== c.degree || pc.knots.length !== c.knots.length || pc.weights.length !== c.weights.length
    || pc.controlPoints.length !== c.controlPoints.length
    || pc.knots.some((x, k) => x !== c.knots[k]) || pc.weights.some((x, k) => x !== c.weights[k])) return false;
  return pc.controlPoints.every(([s,t,z], k) => z === 0 && Number.isFinite(s) && Number.isFinite(t)
    && len(sub(c.controlPoints[k], add(origin, add(scale(u, s), scale(v, t))))) <= error * Math.max(1, Math.abs(s), Math.abs(t)));
}

interface RimChart {
  base: Circle; height: number; span: number; positionError: number;
  point(p: Point): Point;
  vector(v: Point): Point;
}
/** Only whole, bijective, four-boundary cylinder charts can certify an own-surface hit. */
function completeCylinderChart(body: Brep, face: BrepFace, context: ConvexRimContext): RimChart | null {
  const S = face.surface, { charge } = context;
  if (S.kind !== 'surface' || S.degreeU !== 2 || S.degreeV !== 1 || S.controlPoints[0].length !== 2 || face.loops.length !== 1) return null;
  charge(body.loops.length + body.coedges.length + body.edges.length + body.vertices.length + 16 * S.controlPoints.length);
  const loops = new Map(body.loops.map(x => [x.id, x])), uses = new Map(body.coedges.map(x => [x.id, x]));
  const edges = new Map(body.edges.map(x => [x.id, x])), vertices = new Map(body.vertices.map(x => [x.id, x]));
  const loop = loops.get(face.loops[0]);
  if (!loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4 || new Set(loop.coedges).size !== 4) return null;
  const unit = (K: readonly number[]) => K.length === 4 && K[0] === 0 && K[1] === 0 && K[2] === 1 && K[3] === 1;
  if (!unit(S.knotsV)) return null;
  const grid = S.controlPoints, weights = S.weights, delta = sub(grid[0][1], grid[0][0]);
  const height = len(delta);
  let magnitude = Math.max(1, height);
  for (const row of grid) for (const point of row) magnitude = Math.max(magnitude, len(point));
  const error = 1024 * Number.EPSILON * magnitude;
  if (!(height > error) || !grid.every((row, i) => row.length === 2 && row[0].every(Number.isFinite) && row[1].every(Number.isFinite)
    && len(sub(sub(row[1], row[0]), delta)) <= error && weights[i].length === 2 && weights[i][0] === weights[i][1])) return null;
  const iso: Curve[] = [
    { kind: 'curve', id: 'u0', degree: 1, knots: S.knotsV, controlPoints: grid[0], weights: weights[0] },
    { kind: 'curve', id: 'u1', degree: 1, knots: S.knotsV, controlPoints: grid[grid.length - 1], weights: weights[weights.length - 1] },
    { kind: 'curve', id: 'v0', degree: 2, knots: S.knotsU, controlPoints: grid.map(row => row[0]), weights: weights.map(row => row[0]) },
    { kind: 'curve', id: 'v1', degree: 2, knots: S.knotsU, controlPoints: grid.map(row => row[1]), weights: weights.map(row => row[1]) },
  ];
  const base = context.circle(iso[2]); if (!base) return null;
  const span = base.spans.reduce((sum, s) => sum + s.phi, 0);
  if (!(span > 0 && span <= 2 * Math.PI)) return null;
  const [u0, u1] = [S.knotsU[S.degreeU], S.knotsU[S.knotsU.length - S.degreeU - 1]];
  const corners: readonly (readonly Point[])[] = [ [[u0, 0, 0], [u0, 1, 0]], [[u1, 0, 0], [u1, 1, 0]], [[u0, 0, 0], [u1, 0, 0]], [[u0, 1, 0], [u1, 1, 0]] ];
  const occupied = new Set<number>();
  for (let k = 0; k < 4; k++) {
    const use = uses.get(loop.coedges[k]);
    if (!use || use.loop !== loop.id || use.next !== loop.coedges[(k + 1) % 4] || use.prev !== loop.coedges[(k + 3) % 4]) return null;
    const edge = edges.get(use.edge); if (!edge) return null;
    const c = edge.curve, matches: { side: number; direction: 1 | -1 }[] = [];
    for (let side = 0; side < 4; side++) {
      charge(c.controlPoints.length * 8 + c.knots.length + c.weights.length + 16);
      const boundary = iso[side]; let direction: 1 | -1 | undefined;
      if (boundary.degree === 2) direction = circularBoundaryDirection(c, boundary, 0);
      else if (c.degree === 1 && c.controlPoints.length === 2 && c.weights.length === 2 && unit(c.knots)
        && c.weights[0] > 0 && c.weights[0] === c.weights[1]) {
        const same = (reverse: boolean) => c.controlPoints.every((p, n) => p.every((x, d) => x === boundary.controlPoints[reverse ? 1 - n : n][d]));
        if (same(false) !== same(true)) direction = same(false) ? 1 : -1;
      }
      if (direction) matches.push({ side, direction });
    }
    if (matches.length !== 1) return null;
    const { side, direction } = matches[0]; if (occupied.has(side)) return null; occupied.add(side);
    if (direction * (use.sense === 'forward' ? 1 : -1) !== SIDE_TRAVERSAL[side] * (face.sense === 'forward' ? 1 : -1)) return null;
    for (const end of ENDS) if (!vertices.get(edge.vertices[end])?.point.every((x, d) => x === c.controlPoints[end ? c.controlPoints.length - 1 : 0][d])) return null;
    const pc = use.pcurve;
    if (pc) {
      const a = c.knots[c.degree], b = c.knots[c.knots.length - c.degree - 1];
      if (pc.degree !== 1 || pc.knots.length !== 4 || pc.knots[0] !== a || pc.knots[1] !== a || pc.knots[2] !== b || pc.knots[3] !== b
        || pc.weights.length !== 2 || !(pc.weights[0] > 0) || pc.weights[0] !== pc.weights[1]
        || pc.controlPoints.length !== 2 || !pc.controlPoints.every((p, n) => p.every((x, d) => x === corners[side][direction === 1 ? n : 1 - n][d]))) return null;
    }
  }
  const axis = normalize(delta);
  if (Math.abs(dot(base.e1, axis)) > 512 * Number.EPSILON || Math.abs(dot(base.e2, axis)) > 512 * Number.EPSILON) return null;
  const e1 = normalize(sub(base.e1, scale(axis, dot(axis, base.e1)))), e2 = cross(axis, e1);
  const vector = (p: Point): Point => [dot(p, e1), dot(p, e2), dot(p, axis)];
  const point = (p: Point): Point => vector(sub(p, base.c));
  return { base: { ...base, c: [0,0,0], e1: vector(base.e1), e2: vector(base.e2) }, height, span,
    positionError: 4 * error, point, vector };
}

/** A native point and a proved forward hit: never a global visible permission. */
function nativeRimHidden(chart: RimChart, center: Point, cap: 1 | -1, toward: Point, point: Point, eps: number): boolean {
  const k = 2, error = chart.positionError;
  if (!(cap * toward[k] < 0) || Math.abs(center[k] - (cap < 0 ? 0 : chart.height)) > error
    || !(Number.isFinite(eps) && eps >= 0)) return false;
  const [x,y] = point, [vx,vy] = toward, radius = chart.base.r;
  // This also rejects accidentally passing the old chord probe to the native hook.
  if (!point.every(Number.isFinite) || Math.abs(point[k] - center[k]) > error || Math.abs(Math.hypot(x, y) - radius) > error) return false;
  const A = vx * vx + vy * vy, B = x * vx + y * vy;
  const eA = 32 * Number.EPSILON * A, eB = 64 * Number.EPSILON * (Math.abs(x * vx) + Math.abs(y * vy)) + 2 * error * (Math.abs(vx) + Math.abs(vy));
  if (!(A - eA > 0 && B + eB < 0)) return false;
  // Retain the small native-point/radius reconstruction residual in the quadratic.
  // Omitting C would understate root uncertainty near tangency.
  const C = x * x + y * y - radius * radius;
  const eC = 64 * Number.EPSILON * (x * x + y * y + radius * radius) + 4 * error * (Math.abs(x) + Math.abs(y) + radius) + 4 * error * error;
  const discriminant = B * B - A * C;
  const eD = 64 * Number.EPSILON * (B * B + Math.abs(A * C)) + 2 * Math.abs(B) * eB + eB * eB + A * eC + Math.abs(C) * eA + eA * eC;
  if (!(discriminant > eD)) return false;
  let low = (-B - eB + Math.sqrt(discriminant - eD)) / (A + eA), high = (-B + eB + Math.sqrt(discriminant + eD)) / (A - eA);
  const quotientError = 64 * Number.EPSILON * Math.max(1, Math.abs(low), Math.abs(high)); low -= quotientError; high += quotientError;
  if (!(low > 0 && Number.isFinite(high))) return false;
  const t = (-B + Math.sqrt(discriminant)) / A, hit = point.map((x, a) => x + t * toward[a]) as Point;
  const hitError = 4 * error + (high - low) * Math.max(Math.abs(toward[0]), Math.abs(toward[1]), Math.abs(toward[2])) + 64 * Number.EPSILON * Math.max(1, Math.abs(point[0]), Math.abs(point[1]), Math.abs(point[2]), Math.abs(hit[0]), Math.abs(hit[1]), Math.abs(hit[2]));
  const speed = toward.reduce((sum, v) => sum + v * v, 0), depthError = 64 * Number.EPSILON * (point.reduce((sum, v, a) => sum + Math.abs(v * toward[a]), 0) + hit.reduce((sum, v, a) => sum + Math.abs(v * toward[a]), 0)) + hitError * toward.reduce((sum, v) => sum + Math.abs(v), 0);
  if (!(low * (speed - 32 * Number.EPSILON * speed) > eps + depthError && hit[k] > hitError && hit[k] < chart.height - hitError)) return false;
  const d = hit.map((x, a) => x - chart.base.c[a]);
  const angle = Math.atan2(d.reduce((s, x, a) => s + x * chart.base.e2[a], 0), d.reduce((s, x, a) => s + x * chart.base.e1[a], 0));
  const s = ((chart.base.sign * (angle - chart.base.a0)) % (2 * Math.PI) + 2 * Math.PI) % (2 * Math.PI);
  const angularError = 8 * (hitError + error) / radius + 64 * Number.EPSILON;
  return s > angularError && s < chart.span - angularError;
}

/** Per-projection native topology and permissions; all work uses the caller's existing cap. */
export function convexCylinderRimSupport(toward: Point, context: ConvexRimContext):
(body: Brep, edge: BrepEdge, a: BrepFace, b: BrepFace) => Front | null {
  const tables = new WeakMap<Brep, Topology>(), { charge } = context;
  return (body, edge, a, b) => {
    charge(64); // Failed and cached queries also consume the shared projection budget.
    const circle = context.circle(edge.curve); if (!circle) return null;
    const ga = context.primitive(a), gb = context.primitive(b);
    const cylinder = ga?.kind === 'cylinder' && ga.out === 1 && gb?.kind === 'plane' ? a
      : gb?.kind === 'cylinder' && gb.out === 1 && ga?.kind === 'plane' ? b : null;
    const plane = cylinder === a ? b : a, planeGeometry = cylinder === a ? gb : ga;
    if (!cylinder || planeGeometry?.kind !== 'plane' || !context.inPlane(circle, planeGeometry)) return null;
    let table = tables.get(body);
    if (!table) { table = topology(body, charge); tables.set(body, table); }
    if (!table.valid || table.edges.get(edge.id) !== edge || table.faces.get(a.id) !== a
      || table.faces.get(b.id) !== b || a === b) return null;
    const uses = table.uses.get(edge.id);
    if (!uses || uses.length !== 2) return null;
    const ua = uses[0].loop.face === a.id ? uses[0] : uses[1].loop.face === a.id ? uses[1] : null;
    const ub = uses[0].loop.face === b.id ? uses[0] : uses[1].loop.face === b.id ? uses[1] : null;
    if (!ua || !ub || ua === ub || ua.loop.kind !== 'outer' || ub.loop.kind !== 'outer'
      || ua.coedge.twin !== ub.coedge.id || ub.coedge.twin !== ua.coedge.id
      || !table.faceLoops.get(a)!.has(ua.loop.id) || !table.faceLoops.get(b)!.has(ub.loop.id)) return null;
    if (table.fronts.has(edge)) return table.fronts.get(edge)!;
    const use = cylinder === a ? ua : ub, planeUse = plane === a ? ua : ub;
    const planeBound = planePcurveMatches(edge, plane, planeUse, charge);
    const chart = planeBound ? completeCylinderChart(body, cylinder, context) : null;
    let result: Front | null = null;
    if (chart && wholeEnd(edge, cylinder, use, charge)) {
      const n = chart.vector(planeGeometry.n), cap = n[2] < 0 ? -1 : 1;
      if (Math.abs(n[0]) <= 512 * Number.EPSILON && Math.abs(n[1]) <= 512 * Number.EPSILON
        && Math.abs(n[2] - cap) <= 512 * Number.EPSILON) {
        const center = chart.point(circle.c), ray = chart.vector(toward);
        result = Object.assign((point: Point) => front(point, circle.c, toward),
          { nativeHidden: (point: Point, epsilon: number) => nativeRimHidden(chart, center, cap, ray, chart.point(point), epsilon) });
      }
    }
    table.fronts.set(edge, result); return result;
  };
}
