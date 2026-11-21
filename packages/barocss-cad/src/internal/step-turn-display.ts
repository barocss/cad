import { checkBrep, type Brep, type BrepEdge, type BrepFace } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { evaluateCurve } from '../core/math.js';
import { add, cross, dist, dot, len, scale, sub, unit } from '../core/vec3.js';
import { fitRectangularTurn, fitTriangularTurn } from '../features/loft-rectangular-turn.js';
import type { Curve, Point } from '../types.js';

const straightKnots = [0, 0, 1, 1];
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const centre = (corners: readonly Point[]) => scale(corners.reduce((sum, point) => add(sum, point), [0, 0, 0]), 1 / corners.length);

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

/** Recognize a compact rectangular or triangular turn in a STEP solid for display sampling. */
export function isCompactStepTurn(brep: Brep): boolean {
  const sides = brep.faces.length - 2;
  if (brep.source.family !== 'step' || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed || (sides !== 3 && sides !== 4)
    || brep.edges.length !== 3 * sides || brep.vertices.length !== 2 * sides
    || brep.loops.length !== sides + 2 || brep.coedges.length !== 6 * sides) return false;
  const rails = brep.edges.filter(edge => edge.curve.degree === 3), count = rails[0]?.curve.controlPoints.length;
  if (rails.length !== sides || count === undefined || count < 7 || count > 16) return false;
  const knots = rails[0].curve.knots;
  if (knots.length !== count + 4 || !knots.slice(0, 4).every(knot => knot === 0)
    || !knots.slice(-4).every(knot => knot === 1)
    || !knots.slice(4, -4).every((knot, i) => knots[i + 3] < knot && knot < 1)
    || !rails.every(({ curve }) => unitCurve(curve, 3, count) && same(curve.knots, knots))) return false;
  if (!brep.edges.every(({ curve }) => curve.degree === 3 || (unitCurve(curve, 1, 2) && same(curve.knots, straightKnots)))) return false;

  const edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  if (!brep.edges.every(({ curve, vertices: [a, b] }) => {
    const start = vertices.get(a), end = vertices.get(b);
    return start && end && same(start, curve.controlPoints[0]) && same(end, curve.controlPoints.at(-1)!);
  }) || !checkBrep(brep, { strict: true }).valid) return false;

  const coordinateScale = Math.max(1, ...rails.flatMap(({ curve }) => curve.controlPoints.flat().map(Math.abs)));
  const tolerance = Math.max(1e-9, 256 * Number.EPSILON * coordinateScale);
  const caps: { ring: string[]; normal: Point }[] = [];
  for (const face of brep.faces) {
    const loop = loops.get(face.loops[0]);
    if (face.loops.length !== 1 || loop?.kind !== 'outer') return false;
    const uses = loop.coedges.map(id => coedges.get(id)!);
    const ring = uses.map(use => edges.get(use.edge)!);
    if (ring.some(edge => edge.curve.degree === 3)) {
      if (ring.length !== 4 || !sideUsesRows(face, ring, count)) return false;
    } else {
      const chart = face.surface, support = faceGeometry(face);
      if (ring.length !== sides || support.kind !== 'plane' || chart.kind !== 'surface' || chart.degreeU !== 1 || chart.degreeV !== 1
        || !same(chart.knotsU, straightKnots) || !same(chart.knotsV, straightKnots)
        || chart.controlPoints.length !== 2 || !chart.controlPoints.every(row => row.length === 2)
        || chart.weights.length !== 2 || !chart.weights.every(row => same(row, [1, 1]))) return false;
      const verticesInRing = ring.map((edge, i) => edge.vertices[uses[i].sense === 'forward' ? 0 : 1]);
      const onPlane = (point: Point) => Math.abs(dot(sub(point, support.o), support.n)) <= tolerance;
      if (new Set(verticesInRing).size !== sides || !verticesInRing.every(id => onPlane(vertices.get(id)!))
        || !chart.controlPoints.every(row => row.every(onPlane))) return false;
      caps.push({ ring: verticesInRing, normal: support.n });
    }
  }
  if (caps.length !== 2) return false;
  const [start, end] = caps.sort((a, b) => rails.filter(rail => b.ring.includes(rail.vertices[0])).length
    - rails.filter(rail => a.ring.includes(rail.vertices[0])).length);
  const ordered = start.ring.map(id => rails.find(edge => edge.vertices.includes(id)));
  if (ordered.some(edge => !edge) || new Set(ordered).size !== sides
    || !end.ring.every(id => ordered.some(edge => edge?.vertices.includes(id)))) return false;

  const startPoints = start.ring.map(id => vertices.get(id)!);
  const endPoints = end.ring.map(id => vertices.get(id)!);
  const origin = centre(startPoints), delta = sub(centre(endPoints), origin), height = len(delta), axis = unit(delta);
  if (height <= tolerance || [start.normal, end.normal].some(n => Math.abs(Math.abs(dot(n, axis)) - 1) > 1e-10)) return false;
  const x = unit(sub(startPoints[1], startPoints[0])), y = cross(axis, x);
  const local = (point: Point): Point => {
    const offset = sub(point, origin);
    return [dot(offset, x), dot(offset, y), dot(offset, axis)];
  };
  const curves = ordered.map((edge, i) => edge!.vertices[0] === start.ring[i] ? edge!.curve : reverseCurve(edge!.curve));
  const stations = Array.from({ length: count }, (_, i) => i / (count - 1));
  const rows = stations.map(t => curves.map(curve => local(evaluateCurve(curve, t)).slice(0, 2) as [number, number]));
  const fitTurn = sides === 3 ? fitTriangularTurn : fitRectangularTurn;
  const fit = fitTurn(rows, stations.map(t => height * t), stations);
  return !!fit && curves.every((curve, i) => curve.knots.every((knot, j) => Math.abs(knot - fit.knots[j]) <= 8 * Number.EPSILON)
    && curve.controlPoints.every((point, j) => dist(local(point), fit.rails[i][j]) <= tolerance));
}
