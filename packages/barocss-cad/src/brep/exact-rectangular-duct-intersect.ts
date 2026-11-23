import { curveDomain, surfaceDomain } from '../core/math.js';
import { add, dot, len, scale, sub } from '../core/vec3.js';
import { geometryScaleMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import { affinePlaneBinding } from './affine-plane-binding.js';
import { BrepError, checkBrep, type Brep, type BrepCoedge, type BrepFace } from './brep-core.js';
import { circleOf, planar } from './brep-tessellate.js';

const ANGULAR = 512 * Number.EPSILON;
const HALF_KNOTS = [0, 0, 0, .5, .5, 1, 1, 1];
const ONE_SPAN_KNOTS = [0, 0, 0, 1, 1, 1];
const HALF_WEIGHTS = [1, Math.SQRT1_2, 1, Math.SQRT1_2, 1];
const Z: Point = [0, 0, 1];
const NEGATIVE_X: Point = [-1, 0, 0];
const dist = (a: Point, b: Point) => len(sub(a, b));

interface Plane { kind: 'plane'; surface: Surface; height: number; normal: Point; origin: Point }
interface Cylinder { kind: 'cylinder'; surface: Surface; radius: number; low: number; high: number; outward: number }
type Wall = Plane | Cylinder;
interface Section { radius: number; width: number; height: number; walls: readonly Wall[] }
interface Duct { outer: Section; inner: Section; roundoff: number }

function readPlane(face: BrepFace, roundoff: number): Plane | undefined {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 1 || s.degreeV !== 1 || s.controlPoints.length !== 2
    || s.controlPoints.some(row => row.length !== 2) || s.weights.some(row => row.some(w => w !== s.weights[0][0]))) return;
  const [[o, pv], [pu, puv]] = s.controlPoints;
  if (dist(sub(puv, pv), sub(pu, o)) > roundoff) return;
  const p = planar(s);
  if (!p) return;
  return { kind: 'plane', surface: s, height: o[2], origin: o, normal: scale(p.normal, face.sense === 'forward' ? 1 : -1) };
}

/** Certify each pole of a circular arc retained by x >= offset, without changing its parameter. */
function clippedArcMatches(surface: Surface, radius: number, offset: number, roundoff: number): boolean {
  if (!(offset > 0 && offset < radius)) return false;
  const y = Math.sqrt((radius - offset) * (radius + offset)), side = Math.sign(surface.controlPoints[0][0][1]);
  const twoSpans = surface.controlPoints.length === 5, last = surface.controlPoints.length - 1;
  const weight = twoSpans ? Math.sqrt((radius + offset) / (2 * radius)) : offset / radius;
  const tangentY = radius * y / (radius + offset), height = surface.controlPoints[0][0][2];
  for (const [i, row] of surface.controlPoints.entries()) {
    const x = i === 0 || i === last ? offset : twoSpans ? radius : radius * radius / offset;
    const ordinate = i === 0 ? y : i === last ? -y : twoSpans && i === 1 ? tangentY : twoSpans && i === 3 ? -tangentY : 0;
    const w = i % 2 ? weight : 1;
    if (dist(row[0], [x, side * ordinate, height]) > roundoff
      || surface.weights[i].some(actual => Math.abs(actual - w) > ANGULAR)) return false;
  }
  return side !== 0;
}

/** Source half circles stay unchanged; result arcs also need the exact positive-offset pole certificate. */
function readCylinder(face: BrepFace, roundoff: number, offset = 0): Cylinder | undefined {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 2 || s.degreeV !== 1
    || (s.controlPoints.length !== 5 && !(offset > 0 && s.controlPoints.length === 3))
    || s.controlPoints.some(row => row.length !== 2)) return;
  const knots = s.controlPoints.length === 5 ? HALF_KNOTS : ONE_SPAN_KNOTS;
  if (s.knotsU.length !== knots.length || !s.knotsU.every((k, i) => Math.abs(k - knots[i]) <= ANGULAR)
    || s.knotsV.length !== 4 || s.knotsV[0] !== 0 || s.knotsV[1] !== 0 || s.knotsV[2] !== 1 || s.knotsV[3] !== 1
    || s.weights.some((row, i) => row.length !== 2 || row.some(w => !(w > 0) || (offset === 0 && Math.abs(w - HALF_WEIGHTS[i]) > ANGULAR)))) return;
  const base: Curve = { kind: 'curve', id: 'boundary', degree: 2, knots: s.knotsU,
    controlPoints: s.controlPoints.map(row => row[0]), weights: s.weights.map(row => row[0]) };
  const circle = circleOf(base), axis = sub(s.controlPoints[0][1], s.controlPoints[0][0]);
  if (!circle || circle.spans.length !== (s.controlPoints.length - 1) / 2
    || Math.abs(circle.spans.reduce((sum, span) => sum + span.phi, 0) - (offset === 0 ? Math.PI : 2 * Math.acos(offset / circle.r))) > ANGULAR
    || Math.hypot(circle.c[0], circle.c[1]) > roundoff || Math.hypot(axis[0], axis[1]) > roundoff || Math.abs(axis[2]) <= roundoff
    || s.controlPoints.some(row => dist(sub(row[1], row[0]), axis) > roundoff)
    || (offset > 0 && !clippedArcMatches(s, circle.r, offset, roundoff))) return;
  // U follows the oriented circle, V follows its extrusion; their cross product is radial with this sign.
  const orientation = (circle.e1[0] * circle.e2[1] - circle.e1[1] * circle.e2[0]) * circle.sign * Math.sign(axis[2]);
  return { kind: 'cylinder', surface: s, radius: circle.r,
    low: Math.min(circle.c[2], circle.c[2] + axis[2]), high: Math.max(circle.c[2], circle.c[2] + axis[2]),
    outward: Math.sign(orientation) * (face.sense === 'forward' ? 1 : -1) };
}

function unique(values: readonly number[], roundoff: number): number[] {
  const result: number[] = [];
  for (const value of values) if (!result.some(other => Math.abs(other - value) <= roundoff)) result.push(value);
  return result.sort((a, b) => a - b);
}

function readSection(brep: Brep, shell: Brep['shells'][number], roundoff: number): Section | undefined {
  const faces = brep.faces.filter(face => shell.faces.includes(face.id));
  if (!shell.closed || faces.length !== 8 || faces.some(face => face.loops.length !== 1
    || brep.loops.find(loop => loop.id === face.loops[0])?.coedges.length !== 4)) return;
  const walls: Wall[] = [], planes: Plane[] = [], cylinders: Cylinder[] = [];
  for (const face of faces) {
    const wall = readPlane(face, roundoff) ?? readCylinder(face, roundoff);
    if (!wall) return;
    walls.push(wall);
    if (wall.kind === 'plane') planes.push(wall); else cylinders.push(wall);
  }
  if (planes.length !== 4 || cylinders.length !== 4) return;
  const radii = unique(cylinders.map(wall => wall.radius), roundoff), heights = unique(planes.map(wall => wall.height), roundoff);
  if (radii.length !== 2 || heights.length !== 2 || Math.abs(heights[0] + heights[1]) > roundoff
    || planes.some(wall => Math.abs(Math.abs(dot(wall.normal, Z)) - 1) > ANGULAR)
    || cylinders.some(wall => Math.abs(wall.low - heights[0]) > roundoff || Math.abs(wall.high - heights[1]) > roundoff)) return;
  for (const radius of radii) if (cylinders.filter(wall => Math.abs(wall.radius - radius) <= roundoff).length !== 2) return;
  for (const height of heights) if (planes.filter(wall => Math.abs(wall.height - height) <= roundoff).length !== 2) return;
  return { radius: (radii[0] + radii[1]) / 2, width: (radii[1] - radii[0]) / 2, height: heights[1], walls };
}

function oriented(section: Section, inward: boolean, roundoff: number): boolean {
  const sign = inward ? -1 : 1;
  return section.walls.every(wall => wall.kind === 'plane'
    ? Math.abs(dot(wall.normal, Z) - sign * Math.sign(wall.height)) <= ANGULAR
    : wall.outward === sign * Math.sign(wall.radius - section.radius)
      && wall.radius > roundoff);
}

/** The existing default-frame closed rectangular duct, with exactly two centered rectangular shells. */
function readDuct(brep: Brep, tolerance: number): Duct | undefined {
  if (brep.source.family !== 'sweep-curve' || brep.bodies.length !== 1 || brep.shells.length !== 2
    || brep.faces.length !== 16 || brep.loops.length !== 16 || brep.edges.length !== 32 || brep.vertices.length !== 16
    || brep.coedges.length !== 64 || brep.coedges.some(use => !use.pcurve)) return;
  const roundoff = ANGULAR * Math.max(1, geometryScaleMM(brep.vertices.map(vertex => vertex.point)),
    geometryScaleMM(brep.faces.flatMap(face => face.surface.kind === 'surface' ? face.surface.controlPoints.flat() : [])));
  const first = readSection(brep, brep.shells[0], roundoff), second = readSection(brep, brep.shells[1], roundoff);
  if (!first || !second) return;
  const outer = first.width > second.width ? first : second, inner = outer === first ? second : first;
  if (Math.abs(outer.radius - inner.radius) > roundoff || !(outer.width - inner.width > 10 * tolerance)
    || !(outer.height - inner.height > 10 * tolerance && inner.width > tolerance && inner.height > tolerance)
    || !(outer.radius - outer.width > tolerance) || !oriented(outer, false, roundoff) || !oriented(inner, true, roundoff)) return;
  const report = checkBrep(brep, { strict: true });
  if (report.valid && report.topology.length === 1 && report.topology[0].shells === 2
    && report.topology[0].genus === 2 && report.maximumPcurveGap <= roundoff) return { outer, inner, roundoff };
}

/** Retain two apertures strictly before the innermost cylinder; all other box faces stay clear. */
function coveringBox(box: Brep, duct: Duct, tolerance: number): number | undefined {
  if (box.bodies.length !== 1 || box.shells.length !== 1 || box.faces.length !== 6 || box.loops.length !== 6
    || box.vertices.length !== 8 || box.edges.length !== 12) return;
  const limits = [0, 1, 2].map(axis => unique(box.vertices.map(vertex => vertex.point[axis]), duct.roundoff));
  if (limits.some(values => values.length !== 2)) return;
  const [x, y, z] = limits, reach = duct.outer.radius + duct.outer.width;
  const offset = Math.abs(x[0]) <= duct.roundoff ? 0 : x[0];
  if ((offset !== 0 && !(offset > tolerance && offset < duct.outer.radius - duct.outer.width - tolerance))
    || !(x[1] > reach + tolerance && y[0] < -reach - tolerance && y[1] > reach + tolerance
    && z[0] < -duct.outer.height - tolerance && z[1] > duct.outer.height + tolerance)) return;
  const sides = new Set<string>();
  for (const face of box.faces) {
    const plane = readPlane(face, duct.roundoff);
    if (!plane || face.loops.length !== 1) return;
    const axis = plane.normal.findIndex(component => Math.abs(Math.abs(component) - 1) <= ANGULAR);
    if (axis < 0 || plane.normal.some((component, i) => i !== axis && Math.abs(component) > ANGULAR)) return;
    const side = plane.normal[axis] > 0 ? 1 : 0;
    if (Math.abs(plane.origin[axis] - limits[axis][side]) > duct.roundoff || sides.has(`${axis}:${side}`)) return;
    sides.add(`${axis}:${side}`);
  }
  if (checkBrep(box, { strict: true }).valid) return offset;
}

/** The same canonical rational coefficients, allowing only reversal and an affine parameter domain. */
function directionOf(edge: Curve, points: Point[], weights: number[], knots: readonly number[], roundoff: number): 1 | -1 | undefined {
  if (edge.degree !== 2 || edge.controlPoints.length !== points.length || edge.weights.length !== weights.length
    || edge.knots.length !== knots.length) return;
  const [a, b] = curveDomain(edge), c = knots[2], d = knots[knots.length - 3];
  const same = (reverse: boolean) => edge.knots.every((knot, i) => {
    const j = reverse ? knots.length - 1 - i : i, t = (knots[j] - c) / (d - c);
    return Math.abs((knot - a) / (b - a) - (reverse ? 1 - t : t)) <= ANGULAR;
  }) && edge.controlPoints.every((point, i) => {
    const j = reverse ? points.length - 1 - i : i, first = weights[reverse ? weights.length - 1 : 0];
    return dist(point, points[j]) <= roundoff && Math.abs(edge.weights[i] / edge.weights[0] - weights[j] / first) <= ANGULAR;
  });
  const forward = same(false), reversed = same(true);
  if (forward !== reversed) return forward ? 1 : -1;
}

function cylinderBinding(edge: Curve, surface: Surface, roundoff: number): Curve | undefined {
  const { u, v } = surfaceDomain(surface), [start, end] = curveDomain(edge), matches: Curve[] = [];
  const addBinding = (first: Point, last: Point) => matches.push({ kind: 'curve', id: 'pcurve', degree: 1,
    knots: [start, start, end, end], controlPoints: [first, last], weights: [1, 1] });
  for (const side of [0, 1]) {
    if (edge.degree === 2) {
      const direction = directionOf(edge, surface.controlPoints.map(row => row[side]), surface.weights.map(row => row[side]), surface.knotsU, roundoff);
      if (direction) addBinding([u[direction === 1 ? 0 : 1], v[side], 0], [u[direction === 1 ? 1 : 0], v[side], 0]);
    } else if (edge.degree === 1 && edge.controlPoints.length === 2 && edge.weights[0] === edge.weights[1]) {
      const row = side ? surface.controlPoints.length - 1 : 0, points = surface.controlPoints[row];
      const forward = edge.controlPoints.every((point, i) => dist(point, points[i]) <= roundoff);
      const reversed = edge.controlPoints.every((point, i) => dist(point, points[1 - i]) <= roundoff);
      if (forward !== reversed) addBinding([u[side], v[forward ? 0 : 1], 0], [u[side], v[forward ? 1 : 0], 0]);
    }
  }
  if (matches.length === 1) return matches[0];
}

/** Affine projection preserves every rational pole, knot and weight of a whole circular corner. */
function planeBinding(edge: Curve, surface: Surface, roundoff: number): Curve | undefined {
  if (edge.degree === 1) return affinePlaneBinding(edge, surface, roundoff);
  if (edge.degree !== 2 || (edge.controlPoints.length !== 3 && edge.controlPoints.length !== 5) || !circleOf(edge)) return;
  const [[o, pv], [pu]] = surface.controlPoints, a = sub(pu, o), b = sub(pv, o);
  const aa = dot(a, a), ab = dot(a, b), bb = dot(b, b), determinant = aa * bb - ab * ab;
  if (!(determinant > ANGULAR * aa * bb)) return;
  const { u, v } = surfaceDomain(surface), poles: Point[] = [], uvTolerance = roundoff / Math.sqrt(Math.min(aa, bb));
  for (const point of edge.controlPoints) {
    const q = sub(point, o), aq = dot(a, q), bq = dot(b, q), x = (bb * aq - ab * bq) / determinant, y = (aa * bq - ab * aq) / determinant;
    if (!(x >= -uvTolerance && x <= 1 + uvTolerance && y >= -uvTolerance && y <= 1 + uvTolerance)
      || dist(q, add(scale(a, x), scale(b, y))) > roundoff) return;
    poles.push([u[0] + x * (u[1] - u[0]), v[0] + y * (v[1] - v[0]), 0]);
  }
  return { ...edge, id: 'pcurve', controlPoints: poles };
}

function capLoop(brep: Brep, id: string, section: Section, station: number, roundoff: number, offset: number): boolean {
  const lowRadius = section.radius - section.width, highRadius = section.radius + section.width;
  const low = Math.sqrt((lowRadius - offset) * (lowRadius + offset)), high = Math.sqrt((highRadius - offset) * (highRadius + offset));
  const center = offset === 0 ? station : Math.sign(station) * (low + high) / 2;
  const width = offset === 0 ? section.width : (high - low) / 2;
  const loop = brep.loops.find(candidate => candidate.id === id);
  if (!loop || loop.coedges.length !== 4) return false;
  const corners = new Set<string>();
  for (const id of loop.coedges) {
    const use = brep.coedges.find(candidate => candidate.id === id), edge = use && brep.edges.find(candidate => candidate.id === use.edge);
    if (!edge || edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2 || edge.curve.weights[0] !== edge.curve.weights[1]) return false;
    const signs: string[] = [];
    for (const point of edge.curve.controlPoints) {
      const y = point[1] - center, z = point[2];
      if (Math.abs(point[0] - offset) > roundoff || Math.abs(Math.abs(y) - width) > roundoff || Math.abs(Math.abs(z) - section.height) > roundoff) return false;
      const key = `${Math.sign(y)}:${Math.sign(z)}`;
      corners.add(key); signs.push(key);
    }
    const [a, b] = edge.curve.controlPoints;
    if (signs[0] === signs[1] || (Math.abs(a[1] - b[1]) <= roundoff) === (Math.abs(a[2] - b[2]) <= roundoff)) return false;
  }
  return corners.size === 4;
}

function withBinding(use: BrepCoedge, pcurve: Curve): BrepCoedge { return { ...use, pcurve }; }

function repair(result: Brep, duct: Duct, offset: number): Brep | undefined {
  if (result.source.family !== 'analytic-boolean' || result.bodies.length !== 1 || result.shells.length !== 1
    || result.faces.length !== 10 || result.loops.length !== 12 || result.edges.length !== 24
    || result.coedges.length !== 48 || result.vertices.length !== 16) return;
  const faces = new Map<string, Wall>(), matched = new Set<Wall>(), capStations = new Set<number>();
  for (const face of result.faces) {
    const wall = readPlane(face, duct.roundoff) ?? readCylinder(face, duct.roundoff, offset);
    if (!wall) return;
    for (const loop of face.loops) faces.set(loop, wall);
    if (wall.kind === 'plane' && dist(wall.normal, NEGATIVE_X) <= ANGULAR) {
      if (face.loops.length !== 2 || Math.abs(wall.origin[0] - offset) > duct.roundoff) return;
      const loops = face.loops.map(id => result.loops.find(loop => loop.id === id));
      const outer = loops.find(loop => loop?.kind === 'outer'), inner = loops.find(loop => loop?.kind === 'inner');
      if (!outer || !inner) return;
      const edges = outer.coedges.map(id => result.edges.find(edge => edge.id === result.coedges.find(use => use.id === id)?.edge));
      const sum = edges.reduce((total, edge) => total + (edge?.curve.controlPoints[0][1] ?? NaN), 0);
      const station = Math.sign(sum) * duct.outer.radius;
      if (capStations.has(station) || !capLoop(result, outer.id, duct.outer, station, duct.roundoff, offset)
        || !capLoop(result, inner.id, duct.inner, station, duct.roundoff, offset)) return;
      capStations.add(station);
      continue;
    }
    if (face.loops.length !== 1 || result.loops.find(loop => loop.id === face.loops[0])?.coedges.length !== 4) return;
    const candidates = duct.outer.walls.concat(duct.inner.walls).filter(original => original.kind === wall.kind && (original.kind === 'plane' && wall.kind === 'plane'
      ? Math.abs(original.height - wall.height) <= duct.roundoff && dist(original.normal, wall.normal) <= ANGULAR
      : original.kind === 'cylinder' && wall.kind === 'cylinder' && Math.abs(original.radius - wall.radius) <= duct.roundoff
        && Math.abs(original.low - wall.low) <= duct.roundoff && Math.abs(original.high - wall.high) <= duct.roundoff && original.outward === wall.outward));
    if (candidates.length !== 2 || candidates.some(candidate => matched.has(candidate))) return;
    for (const candidate of candidates) matched.add(candidate);
  }
  if (matched.size !== 16 || capStations.size !== 2) return;
  const edges = new Map(result.edges.map(edge => [edge.id, edge])), bindings = new Map<string, Curve>();
  for (const use of result.coedges) {
    const wall = faces.get(use.loop), edge = edges.get(use.edge);
    if (!wall || !edge) return;
    const binding = wall.kind === 'plane' ? planeBinding(edge.curve, wall.surface, duct.roundoff) : cylinderBinding(edge.curve, wall.surface, duct.roundoff);
    if (!binding) return;
    bindings.set(use.id, binding);
  }
  const coedges = result.coedges.map(use => withBinding(use, bindings.get(use.id)!)), repaired = { ...result, coedges };
  const report = checkBrep(repaired, { strict: true });
  if (report.valid && report.topology.length === 1 && report.topology[0].genus === 1 && report.maximumPcurveGap <= duct.roundoff) return repaired;
}

/** Bind only the already-stitched default-frame duct retained by one transverse box face. */
export function bindHalfRectangularDuctIntersection(a: Brep, b: Brep, result: Brep, tolerance: number): Brep | undefined {
  try {
    const left = readDuct(a, tolerance), duct = left ?? readDuct(b, tolerance);
    if (!duct) return;
    const offset = coveringBox(left ? b : a, duct, tolerance);
    if (offset !== undefined) return repair(result, duct, offset);
  } catch (error) {
    if (error instanceof RangeError || (error instanceof BrepError && error.code !== 'INPUT')) return;
    throw error;
  }
}
