import { checkBrep, type Brep, type BrepEdge, type BrepFace } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { evaluateCurve } from '../core/math.js';
import { add, cross, dist, dot, len, scale, sub, unit } from '../core/vec3.js';
import { fitConvexPolygonScrew, fitRectangularScrew, fitRectangularTurn, fitTriangularScrew, fitTriangularTurn } from '../features/loft-rectangular-turn.js';
import type { Curve, Point } from '../types.js';
import { linearToleranceMM } from '../numeric-policy.js';
import { triangleScrewAxisTolerance } from './triangular-screw-axis.js';
import { convexPolygonScrewAxisTolerance } from './convex-polygon-screw-axis.js';
import { ExtrudedProfileLimits } from '../features/extruded-profile-solid.js';

const straightKnots = [0, 0, 1, 1];
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const centre = (corners: readonly Point[]) => scale(corners.reduce((sum, point) => add(sum, point), [0, 0, 0]), 1 / corners.length);

/** Use a long cap lever so short polygon edges cannot amplify exchange roundoff. */
function longestChord(corners: readonly Point[]): [number, number] {
  let pair: [number, number] = [0, 1], longest = 0;
  for (let i = 0; i < corners.length; i++) for (let j = i + 1; j < corners.length; j++) {
    const length = dist(corners[i], corners[j]);
    if (length > longest) { longest = length; pair = [i, j]; }
  }
  return pair;
}

function reverseCurve(curve: Curve): Curve {
  return { ...curve, knots: curve.knots.slice().reverse().map(knot => 1 - knot),
    controlPoints: curve.controlPoints.slice().reverse(), weights: curve.weights.slice().reverse() };
}

function binds(curve: Curve, poles: readonly Point[], knots: readonly number[]): boolean {
  const match = (candidate: Curve) => same(candidate.knots, knots)
    && candidate.controlPoints.length === poles.length && candidate.controlPoints.every((point, i) => same(point, poles[i]));
  return match(curve) || match(reverseCurve(curve));
}

function unitCurve(curve: Curve, degree: number, count: number): boolean {
  return curve.degree === degree && curve.controlPoints.length === count && curve.weights.length === count
    && curve.weights.every(weight => weight === 1) && curve.controlPoints.every(point => point.every(Number.isFinite));
}

function sideUsesRows(face: BrepFace, edges: readonly BrepEdge[], count: number): boolean {
  const surface = face.surface;
  if (surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 3 || !same(surface.knotsU, straightKnots)
    || surface.controlPoints.length !== 2 || surface.weights.length !== 2
    || !surface.controlPoints.every(row => row.length === count)
    || !surface.weights.every(row => row.length === count && row.every(weight => weight === 1))) return false;
  const [left, right] = surface.controlPoints;
  const boundaries = [[left, surface.knotsV], [right, surface.knotsV],
    [[left[0], right[0]], straightKnots], [[left[count - 1], right[count - 1]], straightKnots]] as const;
  const matches = boundaries.map(([poles, knots]) => edges.filter(edge => binds(edge.curve, poles, knots)));
  return matches.every(found => found.length === 1) && new Set(matches.map(found => found[0].id)).size === 4;
}

type XY = [number, number];

function externalScrewPivot(poles: readonly Point[][], tolerance: number): XY | undefined {
  const first = poles.map(rail => rail[0]);
  const reference = first.length > 4 ? longestChord(first) : [0, 1];
  const [a, b, c, d] = first, u = sub(first[reference[1]], first[reference[0]]), width = len(u);
  if (first.length === 3) {
    // This frame starts at the cap centroid; only shape, not origin clearance, is known yet.
    if (triangleScrewAxisTolerance(first.map(([x, y]): XY => [x, y])) === undefined) return;
    const v = sub(c, a), span = Math.max(width, len(v), len(sub(c, b)));
    if (width <= tolerance || Math.abs(u[0] * v[1] - u[1] * v[0]) <= tolerance * span) return;
  } else if (first.length === 4) {
    const v = sub(d, a), depth = len(v), span = Math.max(width, depth);
    // Use the display proof's tighter tolerance for the original cap rectangle.
    if (Math.min(width, depth) <= tolerance || Math.abs(dot(u, v)) > tolerance * span
      || dist(add(a, c), add(b, d)) > 2 * tolerance) return;
  } else if (width <= tolerance) return;
  const [x0, y0] = centre(first);
  let determinant = 0, pivot: XY | undefined;
  for (let j = 1; j < poles[0].length; j++) {
    const edge = sub(poles[reference[1]][j], poles[reference[0]][j]);
    // The cubic control factor is complex-valued, and need not have unit length.
    const real = 1 - (u[0] * edge[0] + u[1] * edge[1]) / (width * width);
    const imag = (u[0] * edge[1] - u[1] * edge[0]) / (width * width);
    const det = real * real + imag * imag;
    if (det <= determinant || det <= 256 * Number.EPSILON) continue;
    const [x, y] = centre(poles.map(rail => rail[j]));
    pivot = [x0 + (real * (x - x0) - imag * (y - y0)) / det,
      y0 + (imag * (x - x0) + real * (y - y0)) / det];
    determinant = det;
  }
  return pivot?.every(Number.isFinite) ? pivot : undefined;
}

/** Recognize the compact polynomial families in a STEP solid for display sampling. */
export function compactStepTurnKind(brep: Brep): 'turn' | 'screw' | undefined {
  const sides = brep.faces.length - 2;
  if (brep.source.family !== 'step' || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed || sides < 3 || sides > ExtrudedProfileLimits.segments
    || brep.edges.length !== 3 * sides || brep.vertices.length !== 2 * sides
    || brep.loops.length !== sides + 2 || brep.coedges.length !== 6 * sides) return;
  const rails = brep.edges.filter(edge => edge.curve.degree === 3), count = rails[0]?.curve.controlPoints.length;
  if (rails.length !== sides || count === undefined || count < 7 || count > 16) return;
  const knots = rails[0].curve.knots;
  if (knots.length !== count + 4 || !knots.slice(0, 4).every(knot => knot === 0)
    || !knots.slice(-4).every(knot => knot === 1)
    || !knots.slice(4, -4).every((knot, i) => knots[i + 3] < knot && knot < 1)
    || !rails.every(({ curve }) => unitCurve(curve, 3, count) && same(curve.knots, knots))) return;
  if (!brep.edges.every(({ curve }) => curve.degree === 3 || (unitCurve(curve, 1, 2) && same(curve.knots, straightKnots)))) return;

  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  if (!brep.edges.every(({ curve, vertices: [a, b] }) => {
    const start = vertices.get(a), end = vertices.get(b);
    return start && end && same(start, curve.controlPoints[0]) && same(end, curve.controlPoints.at(-1)!);
  }) || !checkBrep(brep, { strict: true }).valid) return;

  const coordinateScale = Math.max(1, ...rails.flatMap(({ curve }) => curve.controlPoints.flat().map(Math.abs)));
  const tolerance = Math.max(1e-9, 256 * Number.EPSILON * coordinateScale);
  const caps: { ring: string[]; normal: Point }[] = [];
  for (const face of brep.faces) {
    const loop = loops.get(face.loops[0]);
    if (face.loops.length !== 1 || loop?.kind !== 'outer') return;
    const uses = loop.coedges.map(id => coedges.get(id)!);
    const ring = uses.map(use => edges.get(use.edge)!);
    if (ring.some(edge => edge.curve.degree === 3)) {
      if (ring.length !== 4 || !sideUsesRows(face, ring, count)) return;
    } else {
      const chart = face.surface, support = faceGeometry(face);
      if (ring.length !== sides || support.kind !== 'plane' || chart.kind !== 'surface' || chart.degreeU !== 1 || chart.degreeV !== 1
        || !same(chart.knotsU, straightKnots) || !same(chart.knotsV, straightKnots)
        || chart.controlPoints.length !== 2 || !chart.controlPoints.every(row => row.length === 2)
        || chart.weights.length !== 2 || !chart.weights.every(row => same(row, [1, 1]))) return;
      const verticesInRing = ring.map((edge, i) => edge.vertices[uses[i].sense === 'forward' ? 0 : 1]);
      const onPlane = (point: Point) => Math.abs(dot(sub(point, support.o), support.n)) <= tolerance;
      if (new Set(verticesInRing).size !== sides || !verticesInRing.every(id => onPlane(vertices.get(id)!))
        || !chart.controlPoints.every(row => row.every(onPlane))) return;
      caps.push({ ring: verticesInRing, normal: support.n });
    }
  }
  if (caps.length !== 2) return;
  const [start, end] = caps.sort((a, b) => rails.filter(rail => b.ring.includes(rail.vertices[0])).length
    - rails.filter(rail => a.ring.includes(rail.vertices[0])).length);
  const ordered = start.ring.map(id => rails.find(edge => edge.vertices.includes(id)));
  if (ordered.some(edge => !edge) || new Set(ordered).size !== sides
    || !end.ring.every(id => ordered.some(edge => edge?.vertices.includes(id)))) return;

  const startPoints = start.ring.map(id => vertices.get(id)!);
  const endPoints = end.ring.map(id => vertices.get(id)!);
  const origin = centre(startPoints), delta = sub(centre(endPoints), origin);
  const [left, right] = sides > 4 ? longestChord(startPoints) : [0, 1];
  const x = unit(sub(startPoints[right], startPoints[left]));
  const curves = ordered.map((edge, i) => edge!.vertices[0] === start.ring[i] ? edge!.curve : reverseCurve(edge!.curve));
  const stations = Array.from({ length: count }, (_, i) => i / (count - 1));
  const samplePoints = stations.map(t => curves.map(curve => evaluateCurve(curve, t)));
  function frame(axis: Point, height: number) {
    if (height <= tolerance || [start.normal, end.normal].some(n => Math.abs(Math.abs(dot(n, axis)) - 1) > 1e-10)) return;
    const y = cross(axis, x);
    const local = (point: Point): Point => {
      const offset = sub(point, origin);
      return [dot(offset, x), dot(offset, y), dot(offset, axis)];
    };
    const rows = samplePoints.map(row => row.map(point => local(point).slice(0, 2) as XY));
    const poles = curves.map(curve => curve.controlPoints.map(local));
    const heights = stations.map(t => height * t);
    const matches = (fit: ReturnType<typeof fitRectangularTurn>, [u, v]: XY = [0, 0]) =>
      !!fit && curves.every((curve, i) => curve.knots.every((knot, j) => Math.abs(knot - fit.knots[j]) <= 8 * Number.EPSILON)
        && poles[i].every(([a, b, z], j) => dist([a - u, b - v, z], fit.rails[i][j]) <= tolerance));
    return { rows, poles, heights, matches };
  }

  if (sides <= 4) {
    const centered = frame(unit(delta), len(delta));
    const fitTurn = sides === 3 ? fitTriangularTurn : fitRectangularTurn;
    if (centered?.matches(fitTurn(centered.rows, centered.heights, stations))) return 'turn';
  }

  // Cap planes determine axial advance even if the end cap's center moved sideways.
  const normalAdvance = dot(delta, start.normal);
  const screw = frame(scale(start.normal, Math.sign(normalAdvance)), Math.abs(normalAdvance));
  if (!screw) return;
  const pivot = externalScrewPivot(screw.poles, tolerance);
  if (!pivot) return;
  const [u, v] = pivot;
  const relative = screw.rows.map(row => row.map(([a, b]): XY => [a - u, b - v]));
  if (sides > 4) {
    const fitTolerance = convexPolygonScrewAxisTolerance(relative[0]);
    if (fitTolerance === undefined) return;
    const centroid = (row: readonly XY[]): XY => row.reduce(([x, y], [a, b]): XY =>
      [x + a / sides, y + b / sides], [0, 0] as XY);
    const [x, y] = centroid(screw.rows[0]);
    if (!screw.rows.some(row => {
      const [a, b] = centroid(row);
      return Math.hypot(a - x, b - y) > 4 * Math.max(fitTolerance, tolerance);
    })) return;
    // The native fitter proves all ordered sections and signed winding; the pole match proves
    // the imported charts between those sections, including linear axial advance.
    if (screw.matches(fitConvexPolygonScrew(relative, screw.heights, stations), pivot)) return 'screw';
    return;
  }
  if (sides === 3) {
    const fitTolerance = triangleScrewAxisTolerance(relative[0]);
    if (fitTolerance === undefined) return;
    const centroid = (row: readonly XY[]): XY => row.reduce(([x, y], [a, b]): XY =>
      [x + a / 3, y + b / 3], [0, 0] as XY);
    const [x, y] = centroid(screw.rows[0]);
    if (!screw.rows.some(row => {
      const [a, b] = centroid(row);
      return Math.hypot(a - x, b - y) > 4 * Math.max(fitTolerance, tolerance);
    })) return;
    if (screw.matches(fitTriangularScrew(relative, screw.heights, stations), pivot)) return 'screw';
    return;
  }
  const cap = screw.rows[0];
  const fitTolerance = linearToleranceMM(Math.max(Math.hypot(cap[1][0] - cap[0][0], cap[1][1] - cap[0][1]),
    Math.hypot(cap[3][0] - cap[0][0], cap[3][1] - cap[0][1])));
  if (!screw.rows.some(row => Math.hypot(row.reduce((sum, p) => sum + p[0] / 4, 0),
    row.reduce((sum, p) => sum + p[1] / 4, 0)) > 4 * fitTolerance)) return;
  if (screw.matches(fitRectangularScrew(relative, screw.heights, stations), pivot)) return 'screw';
}

export function isCompactStepTurn(brep: Brep): boolean {
  return compactStepTurnKind(brep) !== undefined;
}
