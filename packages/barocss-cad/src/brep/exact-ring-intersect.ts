import { surfaceD1Evaluator } from '../core/derivatives.js';
import { basis, evaluateSurface, surfaceDomain } from '../core/math.js';
import { same } from '../core/structural-equality.js';
import { add, cross, dot, len, scale, sub, unit } from '../core/vec3.js';
import { curvePiece, curveReversed } from '../nurbs/curves/curve-segment.js';
import { revolutionOf } from '../nurbs/surfaces/surface-revolution.js';
import { geometryScaleMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import { BrepError, checkBrep, type Brep, type BrepCoedge, type BrepEdge, type BrepFace } from './brep-core.js';
import { circleOf, planar } from './brep-tessellate.js';

interface Plane { point: Point; normal: Point }
interface Ring {
  center: Point;
  axis: Point;
  R: number;
  r: number;
  roundoff: number;
  supports: ReadonlyMap<Surface, BrepFace>;
}
interface Corner { u: number; v: number; point: Point }

const QUARTER_WEIGHT = Math.SQRT1_2;
const HALF_TURN_KNOTS = [0, 0, 0, .5, .5, 1, 1, 1];
const HALF_TURN_WEIGHTS = [1, QUARTER_WEIGHT, 1, QUARTER_WEIGHT, 1];
const ANGULAR_ROUNDOFF = 512 * Number.EPSILON;
const ORIGIN: Point = [0, 0, 0];
const dist = (a: Point, b: Point) => len(sub(a, b));

function facePlane(face: BrepFace): Plane | undefined {
  if (face.surface.kind !== 'surface' || face.surface.degreeU !== 1 || face.surface.degreeV !== 1) return;
  const plane = planar(face.surface);
  if (plane) return { point: plane.origin, normal: scale(plane.normal, face.sense === 'forward' ? 1 : -1) };
}
const signedDistance = (plane: Plane, point: Point) => dot(sub(point, plane.point), plane.normal);

function halfTurnGrid(surface: Surface) {
  return surface.degreeU === 2 && surface.degreeV === 2
    && surface.knotsU.length === 8 && surface.knotsV.length === 8
    && HALF_TURN_KNOTS.every((k, i) => surface.knotsU[i] === k && surface.knotsV[i] === k)
    && surface.controlPoints.length === 5 && surface.controlPoints.every(row => row.length === 5)
    && surface.weights.every((row, i) => row.every((w, j) =>
      Math.abs(w - HALF_TURN_WEIGHTS[i] * HALF_TURN_WEIGHTS[j]) <= 64 * Number.EPSILON));
}

/** Certify all coefficients of the four regular half-turn × half-circle charts made by Exact Sweep. */
function readRing(brep: Brep, tolerance: number): Ring | undefined {
  if (brep.source.family !== 'sweep-curve' || brep.faces.length !== 4 || brep.loops.length !== 4
    || brep.vertices.length !== 4 || brep.edges.length !== 8 || brep.coedges.length !== 16 || brep.coedges.some(use => !use.pcurve)) return;
  const first = brep.faces[0].surface;
  if (first.kind !== 'surface' || !halfTurnGrid(first)) return;
  const size = geometryScaleMM(first.controlPoints.flat()), revolution = revolutionOf(first, Math.max(1, size));
  if (!revolution || revolution.profile.kind !== 'arc') return;
  const { a: axis, c: axisPoint, profile: { c: [R, h], r } } = revolution;
  if (!(R > r + tolerance && r > tolerance)) return;
  const center = add(axisPoint, scale(axis, h)), roundoff = 512 * Number.EPSILON * Math.max(1, size, len(center) + R + r);
  const radialPart = (p: Point) => sub(p, scale(axis, dot(p, axis)));
  const start = unit(radialPart(sub(first.controlPoints[0][0], center)));
  const orbitSide = unit(radialPart(sub(first.controlPoints[2][0], center)));
  const quadrants = new Set<string>(), supports = new Map<Surface, BrepFace>();
  for (const face of brep.faces) {
    const surface = face.surface;
    if (surface.kind !== 'surface' || face.loops.length !== 1 || !halfTurnGrid(surface)) return;
    const grid = surface.controlPoints;
    const radial = scale(start, Math.sign(dot(sub(grid[0][0], center), start)));
    const side = scale(orbitSide, Math.sign(dot(sub(grid[2][0], center), orbitSide)));
    const profileStart = r * Math.sign(dot(sub(grid[0][0], center), radial) - R);
    const profileSide = r * Math.sign(dot(sub(grid[0][2], center), axis));
    if (!(Math.abs(profileStart) > 0 && Math.abs(profileSide) > 0)
      || Math.abs(dot(radial, side)) > ANGULAR_ROUNDOFF) return;
    const radialOffsets = [profileStart, profileStart, 0, -profileStart, -profileStart];
    const axialOffsets = [0, profileSide, profileSide, profileSide, 0];
    for (const [i, row] of grid.entries()) {
      const angle = i * Math.PI / 4;
      const ray = add(scale(radial, Math.cos(angle)), scale(side, Math.sin(angle)));
      for (const [j, actual] of row.entries()) {
        const expected = add(center, add(scale(ray, (R + radialOffsets[j]) / HALF_TURN_WEIGHTS[i]), scale(axis, axialOffsets[j])));
        if (dist(actual, expected) > roundoff) return;
      }
    }
    const key = `${Math.sign(dot(side, orbitSide))}:${Math.sign(profileSide)}`;
    if (quadrants.has(key)) return;
    quadrants.add(key);
    supports.set(surface, face);
  }
  const report = checkBrep(brep, { strict: true });
  if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 1) return;
  return { center, axis, R, r, roundoff, supports };
}

function clippingPlane(box: Brep, ring: Ring, tolerance: number): Plane | undefined {
  if (box.vertices.length !== 8 || box.faces.length !== 6 || box.edges.length !== 12 || box.loops.length !== 6) return;
  const planes: Plane[] = [];
  for (const face of box.faces) {
    const plane = facePlane(face);
    if (!plane || face.loops.length !== 1) return;
    planes.push(plane);
  }
  const roundoff = Math.max(ring.roundoff, 512 * Number.EPSILON * geometryScaleMM(box.vertices.map(vertex => vertex.point)));
  const throughAxis: Plane[] = [];
  for (const plane of planes) {
    const directions = planes.filter(other => other !== plane).map(other => dot(plane.normal, other.normal));
    if (directions.filter(value => Math.abs(value + 1) <= ANGULAR_ROUNDOFF).length !== 1
      || directions.filter(value => Math.abs(value) <= ANGULAR_ROUNDOFF).length !== 4) return;
    const distances = box.vertices.map(vertex => signedDistance(plane, vertex.point));
    if (distances.some(d => d > roundoff) || distances.filter(d => Math.abs(d) <= roundoff).length !== 4) return;
    const angle = dot(plane.normal, ring.axis), atCenter = signedDistance(plane, ring.center);
    if (Math.abs(angle) * (ring.R + ring.r) <= roundoff && Math.abs(atCenter) <= roundoff) throughAxis.push(plane);
    // The torus is the tube of radius r about a circle of radius R. This is its full support against the plane.
    else if (!(atCenter + ring.R * len(sub(plane.normal, scale(ring.axis, angle))) + ring.r < -tolerance)) return;
  }
  if (throughAxis.length === 1 && checkBrep(box, { strict: true }).valid) return throughAxis[0];
}

/** Candidate corners of a retained support. A transverse plane cuts a non-seam half-turn once. */
function chartCorners(surface: Surface, plane: Plane, roundoff: number): Corner[] | undefined {
  const { u: [left, right], v: [bottom, top] } = surfaceDomain(surface), fixed = [left, right];
  const signed = (u: number) => signedDistance(plane, evaluateSurface(surface, u, bottom));
  const a = signed(left), b = signed(right);
  if (Math.abs(a) > roundoff || Math.abs(b) > roundoff) {
    if ((a > 0) === (b > 0)) return;
    // The perpendicular meridian can lie on the quarter knot. Keep the original knot instead of a roundoff-sized span.
    const knot = surface.knotsU[3];
    if (Math.abs(signed(knot)) <= roundoff) fixed.push(knot);
    else {
      let lo = left, hi = right;
      for (let i = 0; i < 56; i++) {
        const u = (lo + hi) / 2;
        if ((signed(u) > 0) === (a > 0)) lo = u; else hi = u;
      }
      fixed.push((lo + hi) / 2);
    }
  }
  return fixed.flatMap(u => [bottom, top].map(v => ({ u, v, point: evaluateSurface(surface, u, v) })));
}

/** Contract the fixed-axis basis in homogeneous coordinates. The varying chart and knots are unchanged. */
function isocurve(surface: Surface, fixU: boolean, at: number, id: string): Curve {
  const fixed = basis(fixU ? surface.knotsU : surface.knotsV, 2, 5, at);
  const controlPoints: Point[] = [], weights: number[] = [];
  for (let j = 0; j < 5; j++) {
    let weight = 0, point = ORIGIN;
    for (const [i, value] of fixed.values.entries()) {
      const k = fixed.start + i, u = fixU ? k : j, v = fixU ? j : k;
      const factor = value * surface.weights[u][v];
      weight += factor;
      point = add(point, scale(surface.controlPoints[u][v], factor));
    }
    weights.push(weight);
    controlPoints.push(scale(point, 1 / weight));
  }
  return { kind: 'curve', id, degree: 2, knots: fixU ? surface.knotsV : surface.knotsU, controlPoints, weights };
}

/** Normalize each quadratic's homogeneous end weights to one. Its inverse chart map is rational linear. */
function chartTrim(surface: Surface, a: Corner, b: Corner, id: string): { edge: Curve; uv: Curve } | undefined {
  const fixU = a.u === b.u;
  if (fixU === (a.v === b.v)) return;
  const at = fixU ? a.u : a.v, first = fixU ? a.v : a.u, last = fixU ? b.v : b.u;
  const lo = Math.min(first, last), hi = Math.max(first, last), span = hi - lo;
  if (!(span > ANGULAR_ROUNDOFF)) return;
  const original = curvePiece(isocurve(surface, fixU, at, id), lo, hi, id);
  const normalize = (t: number) => (t - lo) / span;
  const uvPoint = (t: number): Point => fixU ? [at, t, 0] : [t, at, 0];
  const edgeWeights = [1], uvWeights = [1], uvPoles = [uvPoint(lo)], uvKnots = [0, 0];
  for (let i = 0; i + 2 < original.weights.length; i += 2) {
    const w0 = original.weights[i], w1 = original.weights[i + 1], w2 = original.weights[i + 2];
    const end = original.knots[i + 3];
    edgeWeights.push(w1 / Math.sqrt(w0 * w2), 1);
    uvWeights.push(uvWeights[uvWeights.length - 1] * Math.sqrt(w0 / w2));
    uvKnots.push(normalize(end));
    uvPoles.push(uvPoint(end));
  }
  uvKnots.push(1);
  const edge = { ...original, knots: original.knots.map(normalize), weights: edgeWeights };
  const uv: Curve = { kind: 'curve', id: 'pcurve', degree: 1, knots: uvKnots, controlPoints: uvPoles, weights: uvWeights };
  return first < last ? { edge, uv } : { edge: curveReversed(edge), uv: curveReversed(uv) };
}

/** Project the canonical rational edge into the affine box-cap chart, keeping its exact parameter. */
function capBinding(surface: Surface, edge: Curve, roundoff: number): Curve | undefined {
  if (surface.controlPoints.length !== 2 || surface.controlPoints[0].length !== 2
    || surface.weights.some(row => row.some(w => w !== surface.weights[0][0]))) return;
  const [[o, pv], [pu, puv]] = surface.controlPoints, a = sub(pu, o), b = sub(pv, o);
  if (dist(sub(puv, pv), a) > roundoff) return;
  const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), det = aa * bb - ab * ab;
  if (!(det > ANGULAR_ROUNDOFF * aa * bb)) return;
  const poles: Point[] = [];
  for (const point of edge.controlPoints) {
    const p = sub(point, o), ap = dot(a, p), bp = dot(b, p);
    const u = (bb * ap - ab * bp) / det, v = (aa * bp - ab * ap) / det;
    if (!(u >= 0 && u <= 1 && v >= 0 && v <= 1) || dist(add(scale(a, u), scale(b, v)), p) > roundoff) return;
    poles.push([u, v, 0]);
  }
  return { ...edge, id: 'pcurve', controlPoints: poles };
}

function agrees(a: Curve, b: Curve, roundoff: number) {
  return a.controlPoints.length === b.controlPoints.length && a.knots.length === b.knots.length
    && a.controlPoints.every((point, i) => dist(point, b.controlPoints[i]) <= roundoff
      && Math.abs(a.weights[i] - b.weights[i]) <= ANGULAR_ROUNDOFF)
    && a.knots.every((k, i) => Math.abs(k - b.knots[i]) <= ANGULAR_ROUNDOFF);
}

function sameArc(old: BrepEdge, replacement: Curve, tolerance: number) {
  const a = circleOf(old.curve), b = circleOf(replacement);
  return a && b && dist(a.c, b.c) <= tolerance && Math.abs(a.r - b.r) <= tolerance
    && dist(scale(cross(a.e1, a.e2), a.sign), scale(cross(b.e1, b.e2), b.sign)) * a.r <= tolerance
    && Math.abs(a.spans.reduce((sum, span) => sum + span.phi, 0) - b.spans.reduce((sum, span) => sum + span.phi, 0)) * a.r <= tolerance;
}

function carriedEdge(edge: BrepEdge, curve: Curve): BrepEdge {
  return { ...edge, curve };
}
function withPcurve(use: BrepCoedge, pcurve: Curve): BrepCoedge {
  return { ...use, pcurve };
}

function repair(result: Brep, ring: Ring, plane: Plane, tolerance: number): Brep | undefined {
  if ((result.faces.length !== 4 && result.faces.length !== 6) || result.loops.length !== result.faces.length
    || result.edges.length !== 2 * result.faces.length - 2 || result.coedges.length !== 2 * result.edges.length) return;
  const corners = new Map<string, Corner[]>(), facesByLoop = new Map<string, BrepFace>();
  const seen = new Set<Surface>();
  let caps = 0;
  for (const face of result.faces) {
    const surface = face.surface;
    if (surface.kind !== 'surface' || face.loops.length !== 1) return;
    facesByLoop.set(face.loops[0], face);
    const input = ring.supports.get(surface);
    if (input) {
      if (input.sense !== face.sense || seen.has(surface)) return;
      seen.add(surface);
      const candidates = chartCorners(surface, plane, ring.roundoff);
      if (!candidates) return;
      corners.set(face.id, candidates);
    } else {
      const cap = facePlane(face);
      if (!cap || dist(cap.normal, plane.normal) > ANGULAR_ROUNDOFF || Math.abs(signedDistance(plane, cap.point)) > ring.roundoff) return;
      caps++;
    }
  }
  if (caps !== 2) return;

  const vertexPoints = new Map(result.vertices.map(vertex => [vertex.id, vertex.point]));
  const exactPoints = new Map<string, Point>(), bindings = new Map<string, Curve>(), edges: BrepEdge[] = [];
  for (const edge of result.edges) {
    const uses = result.coedges.filter(use => use.edge === edge.id);
    if (uses.length !== 2) return;
    let matched: ReturnType<typeof chartTrim>;
    let capUse: BrepCoedge | undefined;
    for (const use of uses) {
      const face = facesByLoop.get(use.loop);
      if (face?.surface.kind !== 'surface') return;
      const candidates = corners.get(face.id);
      if (!candidates) {
        if (capUse) return;
        capUse = use;
        continue;
      }
      const [a, b] = edge.vertices.map(id => candidates.filter(candidate => dist(candidate.point, vertexPoints.get(id)!) <= tolerance));
      if (a.length !== 1 || b.length !== 1) return;
      const trim = chartTrim(face.surface, a[0], b[0], edge.id);
      if (!trim || (matched && !agrees(matched.edge, trim.edge, ring.roundoff))) return;
      matched ??= trim;
      bindings.set(use.id, trim.uv);
    }
    if (!matched || !sameArc(edge, matched.edge, tolerance)) return;
    if (capUse) {
      const cap = facesByLoop.get(capUse.loop)!.surface as Surface;
      const uv = capBinding(cap, matched.edge, ring.roundoff);
      if (!uv) return;
      bindings.set(capUse.id, uv);
    }
    const points = matched.edge.controlPoints;
    for (const [i, id] of edge.vertices.entries()) {
      const point = points[i === 0 ? 0 : points.length - 1], old = exactPoints.get(id);
      if (old && dist(old, point) > ring.roundoff) return;
      if (!old) exactPoints.set(id, point);
    }
    edges.push(carriedEdge(edge, matched.edge));
  }
  if (exactPoints.size !== result.vertices.length || bindings.size !== result.coedges.length) return;
  const vertices = result.vertices.map(({ id, tolerance }) => ({ id, tolerance, point: exactPoints.get(id)! }));
  const coedges = result.coedges.map(use => withPcurve(use, bindings.get(use.id)!));
  const brep = { ...result, vertices, coedges, edges };
  const report = checkBrep(brep, { strict: true });
  if (report.valid && report.topology.length === 1 && report.topology[0].genus === 0 && report.maximumPcurveGap <= ring.roundoff) return brep;
}

/** Keep native charts on an already-computed Boolean cut of an Exact Sweep ring by one transverse box face. */
export function bindHalfRingIntersection(a: Brep, b: Brep, result: Brep, tolerance: number): Brep | undefined {
  try {
    const left = readRing(a, tolerance), ring = left ?? readRing(b, tolerance);
    if (!ring) return;
    const plane = clippingPlane(left ? b : a, ring, tolerance);
    if (plane) return repair(result, ring, plane, tolerance);
  } catch (error) {
    if (error instanceof RangeError || (error instanceof BrepError && error.code !== 'INPUT')) return;
    throw error;
  }
}

/** Evaluate an exact quarter-knot rim on both original Bézier quarters, only when their derivatives agree. */
export function halfRingMeridianD1(brep: Brep, edge: BrepEdge, face: BrepFace, mate: BrepFace, uv: Curve) {
  if ((!halfRingInputTopology(brep) && !halfRingFilletTopology(brep))
    || face.surface.kind !== 'surface' || uv.degree !== 1 || uv.controlPoints.some(point => point[0] !== .5)) return;
  const uses = brep.coedges.filter(use => use.edge === edge.id);
  if (uses.length !== 2 || uses.some(use => !use.pcurve)) return;
  const surface = face.surface, plane = facePlane(mate);
  if (!plane || !halfTurnGrid(surface) || !circleOf(edge.curve)) return;
  const size = Math.max(1, geometryScaleMM(surface.controlPoints.flat())), roundoff = 512 * Number.EPSILON * size;
  const rev = revolutionOf(surface, size);
  if (!rev || rev.profile.kind !== 'arc' || !(rev.profile.c[0] > rev.profile.r)
    || Math.abs(dot(rev.a, plane.normal)) * (rev.profile.c[0] + rev.profile.r) > roundoff
    || Math.abs(signedDistance(plane, rev.c)) > roundoff
    || edge.curve.controlPoints.some(point => Math.abs(signedDistance(plane, point)) > roundoff)) return;
  const common = surface.controlPoints[2];
  if (common.some((point, j) => dist(sub(point, surface.controlPoints[1][j]), sub(surface.controlPoints[3][j], point)) > roundoff)) return;
  const left = surfaceD1Evaluator({ ...surface, knotsU: [0, 0, 0, .5, .5, .5],
    controlPoints: surface.controlPoints.slice(0, 3), weights: surface.weights.slice(0, 3) });
  const right = surfaceD1Evaluator({ ...surface, knotsU: [.5, .5, .5, 1, 1, 1],
    controlPoints: surface.controlPoints.slice(2), weights: surface.weights.slice(2) });
  return (u: number, v: number) => {
    const a = left(u, v), b = right(u, v);
    const nA = unit(cross(a.du, a.dv)), nB = unit(cross(b.du, b.dv));
    if (u !== .5 || dist(a.point, b.point) > roundoff || dist(a.du, b.du) > 4 * roundoff
      || dist(a.dv, b.dv) > 4 * roundoff || dist(nA, nB) > ANGULAR_ROUNDOFF)
      throw new RangeError('The native quarter patches do not have the same tangent plane at their knot.');
    return a;
  };
}

interface HalfRingCap {
  face: BrepFace;
  plane: Plane;
  center: Point;
  radius: number;
  edges: BrepEdge[];
}

function halfRingCap(body: Brep, face: BrepFace): HalfRingCap | undefined {
  const plane = facePlane(face);
  if (!plane || face.loops.length !== 1) return;
  const loop = body.loops.find(candidate => candidate.id === face.loops[0]);
  if (loop?.kind !== 'outer' || loop.coedges.length !== 2) return;
  const edges: BrepEdge[] = [];
  let first: NonNullable<ReturnType<typeof circleOf>> | undefined;
  for (const id of loop.coedges) {
    const use = body.coedges.find(candidate => candidate.id === id);
    const edge = use && body.edges.find(candidate => candidate.id === use.edge), circle = edge && circleOf(edge.curve);
    if (!edge || !circle || circle.spans.length !== 2 || Math.abs(circle.spans[0].phi + circle.spans[1].phi - Math.PI) > ANGULAR_ROUNDOFF) return;
    const roundoff = ANGULAR_ROUNDOFF * Math.max(1, geometryScaleMM(edge.curve.controlPoints));
    if (Math.abs(signedDistance(plane, circle.c)) > roundoff
      || edge.curve.controlPoints.some(point => Math.abs(signedDistance(plane, point)) > roundoff)
      || first && (dist(first.c, circle.c) > roundoff || Math.abs(first.r - circle.r) > roundoff)) return;
    first ??= circle;
    edges.push(edge);
  }
  if (first) return { face, plane, center: first.c, radius: first.r, edges };
}

function sameChart(a: BrepFace, b: BrepFace) {
  const x = a.surface, y = b.surface;
  return a.sense === b.sense && x.kind === 'surface' && y.kind === 'surface'
    && x.degreeU === y.degreeU && x.degreeV === y.degreeV
    && same(x.knotsU, y.knotsU) && same(x.knotsV, y.knotsV)
    && same(x.controlPoints, y.controlPoints) && same(x.weights, y.weights);
}

function originalDirection(a: Curve, b: Curve): 'forward' | 'reversed' | undefined {
  if (a.degree !== b.degree) return;
  const equal = (candidate: Curve) => same(a.knots, candidate.knots)
    && same(a.controlPoints, candidate.controlPoints) && same(a.weights, candidate.weights);
  const forward = equal(b), reversed = equal(curveReversed(b));
  if (forward !== reversed) return forward ? 'forward' : 'reversed';
}

interface HalfRingFilletPlan {
  stock: Brep;
  opposite: HalfRingCap;
  radius: number;
  roundoff: number;
}

function readHalfRingFilletStock(body: Brep) {
  if (!halfRingInputTopology(body)) return;
  const caps: HalfRingCap[] = [];
  const walls: { face: BrepFace; surface: Surface }[] = [];
  for (const face of body.faces) {
    if (face.surface.kind !== 'surface') return;
    if (halfTurnGrid(face.surface)) walls.push({ face, surface: face.surface });
    else {
      const cap = halfRingCap(body, face);
      if (!cap) return;
      caps.push(cap);
    }
  }
  if (walls.length !== 4 || caps.length !== 2) return;
  const torus = walls[0].surface;
  const [a, b] = caps;
  const size = Math.max(1, geometryScaleMM(torus.controlPoints.flat()));
  const roundoff = ANGULAR_ROUNDOFF * size;
  const rev = revolutionOf(torus, size);
  if (!rev || rev.profile.kind !== 'arc' || !(rev.profile.c[0] > rev.profile.r)) return;
  const { a: axis, c, profile: { c: [R, h], r } } = rev, center = add(c, scale(axis, h));
  const offset = sub(a.center, center);
  if (dist(a.plane.normal, b.plane.normal) > ANGULAR_ROUNDOFF || Math.abs(signedDistance(a.plane, b.plane.point)) > roundoff
    || Math.abs(dot(axis, a.plane.normal)) > ANGULAR_ROUNDOFF || Math.abs(signedDistance(a.plane, center)) > roundoff
    || Math.abs(len(offset) - R) > roundoff || Math.abs(dot(offset, axis)) > roundoff
    || dist(add(a.center, b.center), scale(center, 2)) > roundoff
    || Math.abs(a.radius - r) > roundoff || Math.abs(b.radius - r) > roundoff) return;
  if (body.vertices.some(vertex => signedDistance(a.plane, vertex.point) > roundoff)) return;
  for (const { face, surface } of walls) {
    const carrier = revolutionOf(surface, size);
    if (!carrier || carrier.profile.kind !== 'arc'
      || Math.abs(Math.abs(dot(carrier.a, axis)) - 1) > ANGULAR_ROUNDOFF
      || dist(add(carrier.c, scale(carrier.a, carrier.profile.c[1])), center) > roundoff
      || Math.abs(carrier.profile.c[0] - R) > roundoff || Math.abs(carrier.profile.r - r) > roundoff) return;
    const sample = surfaceD1Evaluator(surface)(.25, .25);
    const fromCenter = sub(sample.point, center), radial = sub(fromCenter, scale(axis, dot(fromCenter, axis)));
    const outward = unit(sub(fromCenter, scale(unit(radial), R)));
    const normal = scale(unit(cross(sample.du, sample.dv)), face.sense === 'forward' ? 1 : -1);
    if (dist(normal, outward) > ANGULAR_ROUNDOFF) return;
  }
  const report = checkBrep(body, { strict: true });
  if (!report.valid || report.topology.length !== 1 || report.topology[0].genus !== 0) return;
  return { caps: [a, b] as const, radius: r, roundoff };
}

/** Certify the complete transverse cap rim before the rolling ball chooses its inward offset branch. */
export function planHalfRingFillet(body: Brep, names: readonly string[]): HalfRingFilletPlan | undefined {
  if (names.length !== 2 || new Set(names).size !== 2) return;
  const proof = readHalfRingFilletStock(body);
  if (!proof) return;
  const [a, b] = proof.caps;
  const selected = proof.caps.find(cap => cap.edges.every(edge => edge.name !== undefined && names.includes(edge.name)));
  if (selected) return { stock: body, opposite: selected === a ? b : a, radius: proof.radius, roundoff: proof.roundoff };
}

/** Keep the two certified cap rims separate for saved constant-fillet reference verification. */
export function halfRingFilletReferenceRims(body: Brep) {
  return readHalfRingFilletStock(body)?.caps.map(cap => ({ center: cap.center, edges: cap.edges.map(edge => edge.name ?? edge.id) }));
}

function halfRingInputTopology(brep: Brep) {
  return brep.source.family === 'analytic-boolean' && brep.faces.length === 6 && brep.edges.length === 10
    && brep.coedges.length === 20 && brep.coedges.every(use => use.pcurve);
}

function halfRingFilletTopology(brep: Brep) {
  return brep.source.family === 'analytic-boolean' && brep.faces.length === 14 && brep.edges.length === 32 && brep.coedges.length === 64;
}

function loopOwners(brep: Brep): Map<string, BrepFace> {
  return new Map(brep.faces.flatMap(face => face.loops.map(loop => [loop, face] as const)));
}

/** Reapply only exact, unchanged edge parameters after rounding one whole cap of an Exact Sweep half ring. */
export function retainHalfRingFilletCharts(result: Brep, plan: HalfRingFilletPlan): Brep {
  if (!halfRingFilletTopology(result)) return result;
  const { stock: body, opposite, roundoff } = plan;
  if (result.faces.filter(face => sameChart(face, opposite.face)).length !== 1) return result;
  const originalFaces = loopOwners(body), faces = loopOwners(result), keep = new Map<string, Curve>(), matched = new Set<string>();
  for (const edge of result.edges) {
    const uses = result.coedges.filter(use => use.edge === edge.id);
    if (uses.length !== 2 || edge.curve.degree !== 2) continue;
    const matches = body.edges.flatMap(candidate => {
      const direction = originalDirection(edge.curve, candidate.curve);
      return direction ? [{ edge: candidate, direction }] : [];
    });
    if (matches.length !== 1) continue;
    const [match] = matches, oldUses = body.coedges.filter(use => use.edge === match.edge.id);
    const bindings = uses.map(use => {
      const face = faces.get(use.loop);
      if (!face) return;
      const older = oldUses.filter(old => {
        const owning = originalFaces.get(old.loop);
        return owning && sameChart(face, owning) && (old.sense === use.sense) === (match.direction === 'forward');
      });
      return older.length === 1 ? older[0] : undefined;
    });
    const [first, second] = bindings;
    if (!first?.pcurve || !second?.pcurve || first.id === second.id || matched.has(match.edge.id)) continue;
    matched.add(match.edge.id);
    for (const [i, binding] of [first, second].entries()) {
      const uv = binding.pcurve!;
      keep.set(uses[i].id, match.direction === 'forward' ? uv : curveReversed(uv));
    }
  }
  if (!opposite.edges.every(edge => matched.has(edge.id))) return result;
  const coedges = result.coedges.map(use => {
    const pcurve = keep.get(use.id);
    return pcurve ? withPcurve(use, pcurve) : use;
  });
  const repaired = { ...result, coedges };
  const report = checkBrep(repaired, { strict: true });
  return report.valid && report.topology.length === 1 && report.topology[0].genus === 0 && report.maximumPcurveGap <= roundoff ? repaired : result;
}
