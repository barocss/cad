import { checkBrep, type Brep, type BrepEdge, type BrepFace } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { circleOf } from '../brep/brep-tessellate.js';
import { evaluateCurve } from '../core/math.js';
import { add, cross, dist, dot, len, scale, sub, unit } from '../core/vec3.js';
import { fitConvexPolygonScrew, fitLineArcScrew, fitLineArcTurn, fitRectangularScrew, fitRectangularTurn, fitTriangularScrew, fitTriangularTurn } from '../features/loft-rectangular-turn.js';
import type { Curve, Point } from '../types.js';
import { linearToleranceMM } from '../numeric-policy.js';
import { triangleScrewAxisTolerance } from './triangular-screw-axis.js';
import { convexPolygonScrewAxisTolerance } from './convex-polygon-screw-axis.js';
import { buildProfileLoop, ExtrudedProfileLimits } from '../features/extruded-profile-solid.js';

const straightKnots = [0, 0, 1, 1];
const quadraticKnots = [0, 0, 0, 1, 1, 1];
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

function externalScrewPivot(poles: readonly Point[][], tolerance: number, polygon = false): XY | undefined {
  const first = poles.map(rail => rail[0]);
  const reference = first.length > 4 || polygon ? longestChord(first) : [0, 1];
  const [a, b, c, d] = first, u = sub(first[reference[1]], first[reference[0]]), width = len(u);
  if (first.length === 3) {
    // This frame starts at the cap centroid; only shape, not origin clearance, is known yet.
    if (triangleScrewAxisTolerance(first.map(([x, y]): XY => [x, y])) === undefined) return;
    const v = sub(c, a), span = Math.max(width, len(v), len(sub(c, b)));
    if (width <= tolerance || Math.abs(u[0] * v[1] - u[1] * v[0]) <= tolerance * span) return;
  } else if (first.length === 4 && !polygon) {
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

const matchingKnots = (a: readonly number[], b: readonly number[]) => a.length === b.length
  && a.every((knot, i) => Math.abs(knot - b[i]) <= 8 * Number.EPSILON);

function rationalSideBindings(face: BrepFace, edges: readonly BrepEdge[], count: number): boolean {
  const s = face.surface;
  if (s.kind !== 'surface' || (s.degreeU !== 1 && s.degreeU !== 2) || s.degreeV !== 3
    || !same(s.knotsU, s.degreeU === 1 ? straightKnots : quadraticKnots)
    || s.controlPoints.length !== s.degreeU + 1 || s.weights.length !== s.controlPoints.length
    || s.controlPoints.some(row => row.length !== count || row.some(point => !point.every(Number.isFinite)))
    || s.weights.some(row => row.length !== count || !(row[0] > 0 && row[0] <= 1) || row.some(w => w !== row[0]))
    || s.weights[0][0] !== 1 || s.weights.at(-1)![0] !== 1) return false;
  const first = s.controlPoints[0], last = s.controlPoints.at(-1)!;
  const boundaries = [
    { poles: first, knots: s.knotsV, weights: s.weights[0], degree: 3 },
    { poles: last, knots: s.knotsV, weights: s.weights.at(-1)!, degree: 3 },
    ...[0, count - 1].map(k => ({ poles: s.controlPoints.map(row => row[k]), knots: s.knotsU,
      weights: s.weights.map(row => row[k]), degree: s.degreeU })),
  ];
  const matches = boundaries.map(boundary => edges.filter(({ curve }) => {
    const match = (c: Curve) => c.degree === boundary.degree && matchingKnots(c.knots, boundary.knots)
      && same(c.weights, boundary.weights) && c.controlPoints.length === boundary.poles.length
      && c.controlPoints.every((point, i) => same(point, boundary.poles[i]));
    return match(curve) || match(reverseCurve(curve));
  }));
  return matches.every(found => found.length === 1) && new Set(matches.map(found => found[0])).size === 4;
}

/** Only one chord and two equal circular-arc pieces, all governed by the native signed fit. */
function curvedStepFamily(brep: Brep): 'curved-screw' | 'curved-turn' | false {
  if (brep.source.family !== 'step' || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid'
    || brep.shells.length !== 1 || !brep.shells[0].closed || brep.faces.length !== 5
    || brep.edges.length !== 9 || brep.vertices.length !== 6 || brep.loops.length !== 5 || brep.coedges.length !== 18) return false;
  const rails = brep.edges.filter(edge => edge.curve.degree === 3), count = rails[0]?.curve.controlPoints.length;
  if (rails.length !== 3 || count === undefined || count < 7 || count > 16) return false;
  const rawKnots = rails[0].curve.knots;
  if (rawKnots.length !== count + 4 || !rawKnots.slice(0, 4).every(k => k === 0)
    || !rawKnots.slice(-4).every(k => k === 1)
    || !rawKnots.slice(4, -4).every((k, i) => rawKnots[i + 3] < k && k < 1)
    || !rails.every(({ curve }) => unitCurve(curve, 3, count)
      && (matchingKnots(curve.knots, rawKnots) || matchingKnots(reverseCurve(curve).knots, rawKnots)))) return false;
  const lines = brep.edges.filter(({ curve }) => unitCurve(curve, 1, 2) && same(curve.knots, straightKnots));
  const arcs = brep.edges.filter(({ curve }) => curve.degree === 2 && curve.controlPoints.length === 3
    && curve.controlPoints.every(point => point.every(Number.isFinite)) && same(curve.knots, quadraticKnots)
    && curve.weights.length === 3 && curve.weights[0] === 1 && curve.weights[2] === 1
    && curve.weights[1] > 0 && curve.weights[1] < 1);
  if (lines.length !== 2 || arcs.length !== 4 || !checkBrep(brep, { strict: true }).valid) return false;
  const byEdge = new Map(brep.edges.map(edge => [edge.id, edge]));
  const byLoop = new Map(brep.loops.map(loop => [loop.id, loop]));
  const byUse = new Map(brep.coedges.map(use => [use.id, use]));
  const vertices = new Map(brep.vertices.map(vertex => [vertex.id, vertex.point]));
  if (!brep.edges.every(({ curve, vertices: [a, b] }) => same(vertices.get(a)!, curve.controlPoints[0])
    && same(vertices.get(b)!, curve.controlPoints.at(-1)!))) return false;
  const coordinateScale = Math.max(1, ...brep.edges.flatMap(({ curve }) => curve.controlPoints.flat().map(Math.abs)));
  const tolerance = Math.max(1e-9, 256 * Number.EPSILON * coordinateScale);
  const caps: { vertices: string[]; edges: BrepEdge[]; normal: Point }[] = [];
  const walls: { face: BrepFace; edges: BrepEdge[] }[] = [];
  for (const face of brep.faces) {
    const loop = byLoop.get(face.loops[0]);
    if (face.loops.length !== 1 || loop?.kind !== 'outer') return false;
    const uses = loop.coedges.map(id => byUse.get(id)!);
    const edges = uses.map(use => byEdge.get(use.edge)!);
    if (edges.some(edge => edge.curve.degree === 3)) {
      if (edges.length !== 4 || !rationalSideBindings(face, edges, count)) return false;
      walls.push({ face, edges });
    } else {
      const support = faceGeometry(face), s = face.surface;
      if (edges.length !== 3 || edges.filter(edge => lines.includes(edge)).length !== 1
        || edges.filter(edge => arcs.includes(edge)).length !== 2 || support.kind !== 'plane'
        || s.kind !== 'surface' || s.degreeU !== 1 || s.degreeV !== 1
        || !same(s.knotsU, straightKnots) || !same(s.knotsV, straightKnots)
        || s.controlPoints.length !== 2 || s.controlPoints.some(row => row.length !== 2)
        || s.weights.length !== 2 || s.weights.some(row => !same(row, [1, 1]))) return false;
      const ring = edges.map((edge, i) => edge.vertices[uses[i].sense === 'forward' ? 0 : 1]);
      const onPlane = (point: Point) => Math.abs(dot(sub(point, support.o), support.n)) <= tolerance;
      if (new Set(ring).size !== 3 || !ring.every(id => onPlane(vertices.get(id)!))
        || s.controlPoints.some(row => row.some(point => !onPlane(point)))) return false;
      caps.push({ vertices: ring, edges, normal: support.n });
    }
  }
  if (caps.length !== 2 || walls.length !== 3 || walls.filter(({ face }) => face.surface.kind === 'surface' && face.surface.degreeU === 1).length !== 1) return false;
  const [start, end] = caps.sort((a, b) => rails.filter(rail => b.vertices.includes(rail.vertices[0])).length
    - rails.filter(rail => a.vertices.includes(rail.vertices[0])).length);
  const origin = centre(start.vertices.map(id => vertices.get(id)!));
  const delta = sub(centre(end.vertices.map(id => vertices.get(id)!)), origin), advance = dot(delta, start.normal);
  const height = Math.abs(advance), axis = scale(start.normal, Math.sign(advance));
  if (!(height > tolerance) || Math.abs(Math.abs(dot(end.normal, axis)) - 1) > 1e-10) return false;
  const chord = start.edges.find(edge => lines.includes(edge))!;
  const seam = start.vertices.find(id => !chord.vertices.includes(id))!;
  const endpoints = chord.vertices.slice();
  if (dot(cross(sub(vertices.get(endpoints[1])!, vertices.get(endpoints[0])!), sub(vertices.get(seam)!, vertices.get(endpoints[0])!)), axis) < 0) endpoints.reverse();
  const orderedVertices = [...endpoints, seam];
  const first = orderedVertices.map(id => vertices.get(id)!);
  const [a, b] = longestChord(first), x = unit(sub(first[b], first[a])), y = cross(axis, x);
  const local = (p: Point): Point => { const d = sub(p, origin); return [dot(d, x), dot(d, y), dot(d, axis)]; };
  const orderedRails = orderedVertices.map(id => rails.find(edge => edge.vertices.includes(id)));
  if (orderedRails.some(edge => !edge) || new Set(orderedRails).size !== 3
    || !end.vertices.every(id => orderedRails.some(edge => edge!.vertices.includes(id)))) return false;
  const curves = orderedRails.map((edge, i) => edge!.vertices[0] === orderedVertices[i] ? edge!.curve : reverseCurve(edge!.curve));
  const knots = curves[0].knots;
  if (!curves.every(curve => matchingKnots(curve.knots, knots))) return false;
  const pivot = externalScrewPivot(curves.map(curve => curve.controlPoints.map(local)), tolerance, true);
  if (!pivot) return false;
  const pieces: { poles: Point[][]; weights: number[][] }[] = [];
  for (let i = 0; i < 3; i++) {
    const boundary = start.edges.find(edge => edge.vertices.includes(orderedVertices[i]) && edge.vertices.includes(orderedVertices[(i + 1) % 3]));
    const found = walls.filter(wall => wall.edges.includes(boundary!));
    if (!boundary || found.length !== 1) return false;
    const s = found[0].face.surface;
    if (s.kind !== 'surface' || s.degreeU !== (i === 0 ? 1 : 2)) return false;
    let poles = s.controlPoints.map(row => row.map(local)), weights = s.weights.map(row => row.slice());
    const near = (p: Point, q: Point) => dist(p, q) <= tolerance;
    let forward = true;
    if (!near(poles[0][0], local(vertices.get(orderedVertices[i])!)) && !near(poles.at(-1)![0], local(vertices.get(orderedVertices[i])!))) {
      forward = false;
      poles = poles.map(row => row.slice().reverse()); weights = weights.map(row => row.slice().reverse());
    }
    if (!matchingKnots(forward ? s.knotsV : s.knotsV.slice().reverse().map(k => 1 - k), knots)) return false;
    if (!near(poles[0][0], local(vertices.get(orderedVertices[i])!))) { poles.reverse(); weights.reverse(); }
    if (!near(poles[0][0], local(vertices.get(orderedVertices[i])!))
      || !near(poles.at(-1)![0], local(vertices.get(orderedVertices[(i + 1) % 3])!))) return false;
    pieces.push({ poles, weights });
  }
  const stations = Array.from({ length: count }, (_, i) => i / (count - 1));
  const rows = stations.map(t => pieces.map(piece => ({
    p: piece.poles.map((controlPoints): XY => {
      const [u, v] = evaluateCurve({ kind: 'curve', id: 'control', degree: 3, knots, controlPoints, weights: Array(count).fill(1) }, t);
      return [u - pivot[0], v - pivot[1]];
    }), w: piece.weights.map(row => row[0]),
  })));
  const profiles = [];
  for (const row of rows) {
    if (row[1].w[1] !== row[2].w[1]) return false;
    const circles = row.slice(1).map(piece => {
      const controlPoints = piece.p.map(([u, v]): Point => [u, v, 0]);
      const circle = circleOf({ kind: 'curve', id: 'arc', degree: 2, knots: quadraticKnots, controlPoints, weights: piece.w });
      if (!circle) return null;
      const [a, middle, b] = controlPoints, w = piece.w[1];
      // circleOf supplies a support candidate. Prove its rational tangent intersection separately:
      // endpoint-radius agreement alone also admits the opposite middle-control branch.
      const expected = add(circle.c, scale(sub(scale(add(a, b), .5), circle.c), 1 / (w * w)));
      const start = sub(a, circle.c), end = sub(b, circle.c);
      if (dist(middle, expected) > tolerance || !(start[0] * end[1] - start[1] * end[0] > 0)) return null;
      return circle;
    });
    if (circles.some(circle => !circle || circle.spans[0].phi > Math.PI / 2 + 1e-12)) return false;
    const circle = circles[0]!;
    if (dist(circle.c, circles[1]!.c) > tolerance || Math.abs(circle.r - circles[1]!.r) > tolerance) return false;
    profiles.push(buildProfileLoop([{ kind: 'line', start: row[0].p[0] },
      { kind: 'arc', start: row[1].p[0], center: [circle.c[0], circle.c[1]], direction: 'ccw' }]));
  }
  const originalArc = profiles[0].segments.find(segment => segment.kind === 'arc');
  if (originalArc?.kind !== 'arc') return false;
  const movement = Math.max(tolerance, linearToleranceMM(2 * originalArc.radius));
  const centroid = (row: typeof rows[number]): Point => centre(row.map(piece => [...piece.p[0], 0] as Point));
  if (!rows.some(row => dist(centroid(row), centroid(rows[0])) > 4 * movement)) return false;
  const heights = stations.map(t => height * t);
  const matches = (fit: ReturnType<typeof fitLineArcScrew>) => !!fit && matchingKnots(fit.knots, knots) && fit.nets.length === 3
    && pieces.every((piece, i) => piece.poles.every((column, j) =>
      column.every(([u, v, z], k) => {
        const [a, b, c, w] = fit.nets[i][j][k];
        return piece.weights[j][k] === w && dist([u - pivot[0], v - pivot[1], z], [a / w, b / w, c / w]) <= tolerance;
      })));
  if (matches(fitLineArcScrew(profiles, rows, heights, stations))) return 'curved-screw';
  // The recovered rotation axis must coincide with every section's area centroid at the
  // display proof's tight tolerance, independently of the wider authored feature admission.
  if (profiles.some(profile => Math.hypot(...profile.centroid) > tolerance)) return false;
  return matches(fitLineArcTurn(profiles, rows, heights, stations)) ? 'curved-turn' : false;
}

/** Recognize compact turn and Screw families in a STEP solid for display sampling. */
export function compactStepTurnKind(brep: Brep): 'turn' | 'screw' | 'curved-screw' | 'curved-turn' | undefined {
  if (brep.edges.some(edge => edge.curve.degree === 2)) {
    try { return curvedStepFamily(brep) || undefined; } catch { return; }
  }
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
  function frame(axis: Point, height: number, xAxis: Point = x) {
    if (height <= tolerance || [start.normal, end.normal].some(n => Math.abs(Math.abs(dot(n, axis)) - 1) > 1e-10)) return;
    const y = cross(axis, xAxis);
    const local = (point: Point): Point => {
      const offset = sub(point, origin);
      return [dot(offset, xAxis), dot(offset, y), dot(offset, axis)];
    };
    const rows = samplePoints.map(row => row.map(point => local(point).slice(0, 2) as XY));
    const poles = curves.map(curve => curve.controlPoints.map(local));
    const heights = stations.map(t => height * t);
    const matches = (fit: ReturnType<typeof fitRectangularTurn>, [u, v]: XY = [0, 0]) =>
      !!fit && curves.every((curve, i) => curve.knots.every((knot, j) => Math.abs(knot - fit.knots[j]) <= 8 * Number.EPSILON)
        && poles[i].every(([a, b, z], j) => dist([a - u, b - v, z], fit.rails[i][j]) <= tolerance));
    return { rows, poles, heights, matches };
  }

  function polygonScrew(candidate: NonNullable<ReturnType<typeof frame>>): 'screw' | undefined {
    const pivot = externalScrewPivot(candidate.poles, tolerance, true);
    if (!pivot) return;
    const [u, v] = pivot;
    const relative = candidate.rows.map(row => row.map(([a, b]): XY => [a - u, b - v]));
    const fitTolerance = convexPolygonScrewAxisTolerance(relative[0]);
    if (fitTolerance === undefined) return;
    const centroid = (row: readonly XY[]): XY => row.reduce(([x, y], [a, b]): XY =>
      [x + a / sides, y + b / sides], [0, 0] as XY);
    const [x, y] = centroid(candidate.rows[0]);
    if (!candidate.rows.some(row => {
      const [a, b] = centroid(row);
      return Math.hypot(a - x, b - y) > 4 * Math.max(fitTolerance, tolerance);
    })) return;
    // The native fitter proves all ordered sections and signed winding; the pole match proves
    // the imported charts between those sections, including linear axial advance.
    if (candidate.matches(fitConvexPolygonScrew(relative, candidate.heights, stations), pivot)) return 'screw';
  }

  if (sides <= 4) {
    const centered = frame(unit(delta), len(delta));
    const fitTurn = sides === 3 ? fitTriangularTurn : fitRectangularTurn;
    if (centered?.matches(fitTurn(centered.rows, centered.heights, stations))) return 'turn';
  }

  // Cap planes determine axial advance even if the end cap's center moved sideways.
  const normalAdvance = dot(delta, start.normal);
  const screwAxis = scale(start.normal, Math.sign(normalAdvance)), screwHeight = Math.abs(normalAdvance);
  const screw = frame(screwAxis, screwHeight);
  if (!screw) return;
  if (sides > 4) return polygonScrew(screw);
  const pivot = externalScrewPivot(screw.poles, tolerance);
  if (sides === 4) {
    // Preserve rectangle admission before trying the native non-rectangular polygon family.
    if (pivot) {
      const [u, v] = pivot, cap = screw.rows[0];
      const relative = screw.rows.map(row => row.map(([a, b]): XY => [a - u, b - v]));
      const fitTolerance = linearToleranceMM(Math.max(Math.hypot(cap[1][0] - cap[0][0], cap[1][1] - cap[0][1]),
        Math.hypot(cap[3][0] - cap[0][0], cap[3][1] - cap[0][1])));
      if (screw.rows.some(row => Math.hypot(row.reduce((sum, p) => sum + p[0] / 4, 0),
        row.reduce((sum, p) => sum + p[1] / 4, 0)) > 4 * fitTolerance)
        && screw.matches(fitRectangularScrew(relative, screw.heights, stations), pivot)) return 'screw';
    }
    const [left, right] = longestChord(startPoints);
    const quad = frame(screwAxis, screwHeight, unit(sub(startPoints[right], startPoints[left])));
    return quad && polygonScrew(quad);
  }
  if (!pivot) return;
  const [u, v] = pivot;
  const relative = screw.rows.map(row => row.map(([a, b]): XY => [a - u, b - v]));
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
}

export function isCompactStepTurn(brep: Brep): boolean {
  return compactStepTurnKind(brep) !== undefined;
}
