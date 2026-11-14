import { curveDomain, surfaceDomain } from '../core/math.js';
import { add, cross, dist, dot, len, scale, sub, unit } from '../core/vec3.js';
import { geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point, Surface } from '../types.js';
import type { Brep, BrepEdge, BrepFace } from './brep-core.js';

type Range = readonly [number, number];
type ChartDomain = { readonly u: Range; readonly v: Range };
type PlaneChart = {
  readonly origin: Point;
  readonly u: Point;
  readonly v: Point;
  readonly normal: Point;
  readonly domain: ChartDomain;
};

// The native stitch permits gaps at its edges. Require agreement at the scale of floating-point rounding.
const ROUNDING = 64 * Number.EPSILON;
function roundoffAt(points: readonly Point[]): number {
  return ROUNDING * Math.max(1, geometryScaleMM(points));
}

function affinePlane(face: BrepFace): PlaneChart | undefined {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 1 || s.degreeV !== 1
    || s.controlPoints.length !== 2 || s.controlPoints[0].length !== 2) return undefined;
  const domain = surfaceDomain(s);
  const [[origin, vEnd], [uEnd, diagonal]] = s.controlPoints;
  if (!s.weights.every(row => row.every(weight => weight === s.weights[0][0]))) return undefined;
  const u = sub(uEnd, origin), v = sub(vEnd, origin);
  if (dist(sub(diagonal, uEnd), v) > roundoffAt([origin, vEnd, uEnd, diagonal])) return undefined;
  const n = cross(unit(u), unit(v));
  if (!(len(n) > ROUNDING)) return undefined;
  return { origin, u, v, normal: scale(unit(n), face.sense === 'forward' ? 1 : -1), domain };
}

function admitsBoxPlanes(planes: readonly PlaneChart[]): boolean {
  return planes.length === 6 && planes.every(plane => {
    let oppositeCount = 0;
    for (const other of planes) {
      if (other === plane) continue;
      const alignment = dot(plane.normal, other.normal);
      if (dist(plane.normal, scale(other.normal, -1)) <= ROUNDING) {
        if (!(dot(sub(plane.origin, other.origin), plane.normal) > 0)) return false;
        oppositeCount++;
      } else if (Math.abs(alignment) > ROUNDING) return false;
    }
    return oppositeCount === 1;
  });
}

function quarterCylinder(face: BrepFace) {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 2 || s.degreeV !== 1
    || s.controlPoints.length !== 3 || s.controlPoints[0].length !== 2) return undefined;
  const domain = surfaceDomain(s);
  const [[first, firstEnd], [corner, cornerEnd], [last, lastEnd]] = s.controlPoints;
  const [edgeWeight, middleWeight, lastWeight] = s.weights.map(row => row[0]);
  if (!s.weights.every(row => row[0] === row[1]) || edgeWeight !== lastWeight
    || Math.abs(middleWeight / edgeWeight - Math.SQRT1_2) > ROUNDING) return undefined;

  const axis = sub(firstEnd, first), axisDirection = unit(axis);
  const r0 = sub(last, corner), r1 = sub(first, corner);
  const radius = len(r0), r0Direction = unit(r0), r1Direction = unit(r1);
  const rounding = roundoffAt([first, firstEnd, corner, cornerEnd, last, lastEnd]);
  if (!(len(axis) > rounding && radius > rounding && len(r1) > rounding)
    || Math.abs(radius - len(r1)) > rounding
    || Math.abs(dot(r0Direction, r1Direction)) > ROUNDING
    || Math.abs(dot(r0Direction, axisDirection)) > ROUNDING
    || Math.abs(dot(r1Direction, axisDirection)) > ROUNDING
    || dist(sub(cornerEnd, corner), axis) > rounding
    || dist(sub(lastEnd, last), axis) > rounding) return undefined;

  // A right-angle tangent triangle and the middle weight cos(π/4) define a circular quadrant.
  const outward = face.sense === 'forward' ? 1 : -1;
  return {
    domain,
    generators: [
      { u: domain.u[0], start: first, end: firstEnd, normal: scale(unit(cross(r1, axis)), -outward) },
      { u: domain.u[1], start: last, end: lastEnd, normal: scale(unit(cross(r0, axis)), outward) },
    ],
  };
}

function interpolate([start, end]: Range, fraction: number): number {
  return (1 - fraction) * start + fraction * end;
}

function clampFraction(fraction: number): number {
  return Math.min(1, Math.max(0, fraction));
}

function planeParameter(chart: PlaneChart, point: Point, tolerance: number): Point | undefined {
  const offset = sub(point, chart.origin), { u, v, normal } = chart;
  const uAcross = cross(v, normal), vAcross = cross(normal, u);
  const fu = clampFraction(dot(offset, uAcross) / dot(u, uAcross));
  const fv = clampFraction(dot(offset, vAcross) / dot(v, vAcross));
  const lifted = add(chart.origin, add(scale(u, fu), scale(v, fv)));
  if (!(dist(lifted, point) <= tolerance)) return undefined;
  return [interpolate(chart.domain.u, fu), interpolate(chart.domain.v, fv), 0];
}

function generatorParameter(origin: Point, span: Point, point: Point, tolerance: number): number | undefined {
  const fraction = clampFraction(dot(sub(point, origin), unit(span)) / len(span));
  return dist(add(origin, scale(span, fraction)), point) <= tolerance ? fraction : undefined;
}

/** Recover local parameter curves for the straight interfaces of a single fillet on a box. */
export function recoverBoxFilletBindings(brep: Brep, edge: BrepEdge, first: BrepFace, second: BrepFace): [Curve, Curve] | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  const line = edge.curve;
  if (brep.source.family !== 'analytic-boolean' || bodies.length !== 1 || bodies[0].kind !== 'solid'
    || shells.length !== 1 || !shells[0].closed || shells[0].body !== bodies[0].id
    || bodies[0].shells.length !== 1 || bodies[0].shells[0] !== shells[0].id
    || shells[0].faces.length !== faces.length || loops.length !== faces.length
    || edge.vertices[0] === edge.vertices[1]
    || !line.weights.every(weight => weight === line.weights[0])) return undefined;

  try {
    if (faces.length === 7 && coedges.length === 30 && edges.length === 15 && vertices.length === 10
      && line.degree === 1 && line.controlPoints.length === 2) {
      return recoverCircularBindings(brep, edge, first, second, curveDomain(line));
    }
    if (faces.length === 9 && coedges.length === 42 && edges.length === 21 && vertices.length === 14 && line.degree === 3) {
      return recoverQuarticBindings(brep, edge, first, second, curveDomain(line));
    }
  } catch {
    return undefined;
  }
  return undefined;
}

function recoverCircularBindings(brep: Brep, edge: BrepEdge, first: BrepFace, second: BrepFace, [t0, t1]: Range): [Curve, Curve] | undefined {
  const firstPlane = affinePlane(first), secondPlane = affinePlane(second);
  if (!!firstPlane === !!secondPlane) return undefined;
  const plane = firstPlane ?? secondPlane!;
  const cylinderFace = firstPlane ? second : first;
  const cylinder = quarterCylinder(cylinderFace);
  if (!cylinder) return undefined;
  const planes: PlaneChart[] = [];
  for (const face of brep.faces) {
    const loop = brep.loops.find(loop => loop.id === face.loops[0]);
    if (face.shell !== first.shell || !brep.shells[0].faces.includes(face.id)
      || face.loops.length !== 1 || loop?.kind !== 'outer' || loop.face !== face.id) return undefined;
    if (face === cylinderFace) {
      if (loop.coedges.length !== 4) return undefined;
      continue;
    }
    const chart = affinePlane(face);
    if (!chart) return undefined;
    planes.push(chart);
  }
  if (!admitsBoxPlanes(planes)) return undefined;

  const [start, end] = edge.curve.controlPoints;
  const [startVertex, endVertex] = edge.vertices.map(id => brep.vertices.find(vertex => vertex.id === id));
  const tolerance = Math.min(edge.tolerance, linearToleranceMM(geometryScaleMM(edge.curve.controlPoints)), roundoffAt([start, end]));
  if (!startVertex || !endVertex || !(dist(start, end) > tolerance
    && dist(start, startVertex.point) <= tolerance && dist(end, endVertex.point) <= tolerance)) return undefined;

  const planeStart = planeParameter(plane, start, tolerance), planeEnd = planeParameter(plane, end, tolerance);
  if (!planeStart || !planeEnd) return undefined;
  const pcurve = (start: Point, end: Point): Curve => ({
    kind: 'curve', id: edge.curve.id, degree: 1, knots: [t0, t0, t1, t1], controlPoints: [start, end], weights: [1, 1],
  });
  let cylinderBinding: Curve | undefined;
  for (const generator of cylinder.generators) {
    const axis = sub(generator.end, generator.start);
    const v0 = generatorParameter(generator.start, axis, start, tolerance);
    const v1 = generatorParameter(generator.start, axis, end, tolerance);
    if (v0 === undefined || v1 === undefined || v0 === v1) continue;
    if (cylinderBinding || dist(generator.normal, plane.normal) > ROUNDING) return undefined;
    const vDomain = cylinder.domain.v;
    cylinderBinding = pcurve([generator.u, interpolate(vDomain, v0), 0], [generator.u, interpolate(vDomain, v1), 0]);
  }
  if (!cylinderBinding) return undefined;
  const planeBinding = pcurve(planeStart, planeEnd);
  return firstPlane ? [planeBinding, cylinderBinding] : [cylinderBinding, planeBinding];
}

type QuarticPatch = { readonly face: BrepFace; readonly surface: Surface; readonly domain: ChartDomain };

// The rolling-ball solve, cubic collocation and stitch introduce separate rounding errors.
// Keep their admission bound below the native linear tolerance even for large boxes.
const LOFT_ROUNDING = 4096 * Number.EPSILON;

function quarticPatch(face: BrepFace): QuarticPatch | undefined {
  const s = face.surface;
  if (s.kind !== 'surface' || s.degreeU !== 4 || s.degreeV !== 3 || s.controlPoints.length !== 5) return undefined;
  const domain = surfaceDomain(s);
  if (!s.weights.every(row => row.every(weight => weight === s.weights[0][0]))) return undefined;
  const spans = s.controlPoints[0].length - 3;
  const [v0, v1] = domain.v;
  for (let i = 1; i < spans; i++) {
    if (!(Math.abs((s.knotsV[i + 3] - v0) / (v1 - v0) - i / spans) <= LOFT_ROUNDING)) return undefined;
  }
  return { face, surface: s, domain };
}

function planeDistance(plane: PlaneChart, point: Point): number {
  return dot(sub(point, plane.origin), plane.normal);
}

function greville(knots: readonly number[], i: number): number {
  return (knots[i + 1] + knots[i + 2] + knots[i + 3]) / 3;
}

function increasesAlong(points: readonly Point[], direction: Point): boolean {
  return points.every((point, i) => i === 0 || dot(sub(point, points[i - 1]), direction) > 0);
}

function quarticBoxSection(patches: readonly QuarticPatch[], planes: readonly PlaneChart[], tolerance: number) {
  const reference = patches[0];
  const [first, nearFirst, middle, nearLast, last] = reference.surface.controlPoints;
  const axial = sub(middle[middle.length - 1], middle[0]);
  const sense = reference.face.sense === 'forward' ? 1 : -1;
  const normal0 = scale(unit(cross(sub(nearFirst[0], first[0]), axial)), sense);
  const normal1 = scale(unit(cross(sub(last[0], nearLast[0]), axial)), sense);
  const plane0 = planes.find(plane => dist(plane.normal, normal0) <= LOFT_ROUNDING * 32);
  const plane1 = planes.find(plane => dist(plane.normal, normal1) <= LOFT_ROUNDING * 32);
  if (!plane0 || !plane1 || Math.abs(dot(plane0.normal, plane1.normal)) > ROUNDING) return undefined;

  const radius = -planeDistance(plane1, first[0]);
  const tangentLength = dot(sub(nearFirst[0], first[0]), plane1.normal);
  if (!(tangentLength > tolerance && radius - tangentLength > tolerance)) return undefined;
  const across = radius - tangentLength;
  const offsets: readonly Point[] = [scale(plane1.normal, -radius), scale(plane1.normal, -across),
    [0, 0, 0], scale(plane0.normal, -across), scale(plane0.normal, -radius)];
  const corner = sub(sub(middle[0], scale(plane0.normal, planeDistance(plane0, middle[0]))),
    scale(plane1.normal, planeDistance(plane1, middle[0])));
  const direction = scale(unit(cross(plane0.normal, plane1.normal)), sense);
  const ends: Range[] = [];
  for (const patch of patches) {
    const controls = patch.surface.controlPoints;
    const [v0, v1] = patch.domain.v;
    const start = dot(sub(controls[2][0], corner), direction);
    const finish = dot(sub(controls[2][controls[2].length - 1], corner), direction);
    if (patch.face.sense !== reference.face.sense || !(finish - start > tolerance)
      || !controls.every(row => increasesAlong(row, direction))) return undefined;
    ends.push([start, finish]);

    // Greville coefficients reproduce a line in V. In U, the first and last three poles
    // lie in the respective planes, with the common middle pole on their intersection.
    for (let j = 0; j < controls[2].length; j++) {
      const fraction = (greville(patch.surface.knotsV, j) - v0) / (v1 - v0);
      const along = add(corner, scale(direction, interpolate([start, finish], fraction)));
      for (let i = 0; i < offsets.length; i++) {
        if (!(dist(controls[i][j], add(along, offsets[i])) <= tolerance)) return undefined;
      }
    }
  }

  ends.sort(([a], [b]) => a - b);
  const startCap = planes.find(plane => dist(plane.normal, scale(direction, -1)) <= ROUNDING);
  const endCap = planes.find(plane => dist(plane.normal, direction) <= ROUNDING);
  if (!startCap || !endCap
    || Math.abs(planeDistance(startCap, add(corner, scale(direction, ends[0][0])))) > tolerance
    || Math.abs(planeDistance(endCap, add(corner, scale(direction, ends[ends.length - 1][1])))) > tolerance) return undefined;
  for (let i = 1; i < ends.length; i++) {
    if (Math.abs(ends[i - 1][1] - ends[i][0]) > tolerance) return undefined;
  }
  return { plane0, plane1, direction };
}

function quarticBoundary(edge: BrepEdge, t: Range, patch: QuarticPatch, atStart: boolean, tolerance: number): Curve | undefined {
  const { surface, domain } = patch;
  const row = surface.controlPoints[atStart ? 0 : 4];
  const { controlPoints, knots } = edge.curve;
  if (controlPoints.length !== row.length) return undefined;
  const [t0, t1] = t;
  const [v0, v1] = domain.v;
  const u = domain.u[atStart ? 0 : 1];
  // Compare all poles and knots after the affine change of parameter, in both canonical directions.
  const matches = (reversed: boolean): boolean => controlPoints.every((point, i) =>
    dist(point, row[reversed ? row.length - 1 - i : i]) <= tolerance) && knots.every((knot, i) => {
    const other = surface.knotsV[reversed ? knots.length - 1 - i : i];
    const fraction = reversed ? (v1 - other) / (v1 - v0) : (other - v0) / (v1 - v0);
    return Math.abs((knot - t0) / (t1 - t0) - fraction) <= LOFT_ROUNDING;
  });
  const forward = matches(false), reversed = matches(true);
  if (forward === reversed) return undefined;
  return { kind: 'curve', id: edge.curve.id, degree: 1, knots: [t0, t0, t1, t1],
    controlPoints: [[u, forward ? v0 : v1, 0], [u, forward ? v1 : v0, 0]], weights: [1, 1] };
}

function recoverQuarticBindings(brep: Brep, edge: BrepEdge, first: BrepFace, second: BrepFace, t: Range): [Curve, Curve] | undefined {
  const planes = new Map<BrepFace, PlaneChart>();
  const patches = new Map<BrepFace, QuarticPatch>();
  let scaleMM = 1;
  for (const face of brep.faces) {
    const loop = brep.loops.find(loop => loop.id === face.loops[0]);
    if (face.shell !== first.shell || !brep.shells[0].faces.includes(face.id)
      || face.loops.length !== 1 || loop?.kind !== 'outer' || loop.face !== face.id) return undefined;
    const plane = affinePlane(face);
    if (plane) {
      planes.set(face, plane);
      continue;
    }
    const patch = quarticPatch(face);
    if (!patch || loop.coedges.length !== 4) return undefined;
    patches.set(face, patch);
    for (const row of patch.surface.controlPoints) scaleMM = Math.max(scaleMM, geometryScaleMM(row));
  }
  if (patches.size !== 3 || !admitsBoxPlanes(Array.from(planes.values()))) return undefined;
  const firstPlane = planes.get(first), secondPlane = planes.get(second);
  const plane = firstPlane ?? secondPlane;
  const patch = patches.get(firstPlane ? second : first);
  if (!plane || !patch) return undefined;
  const tolerance = Math.min(edge.tolerance, linearToleranceMM(scaleMM) / 10, LOFT_ROUNDING * scaleMM);
  const section = quarticBoxSection(Array.from(patches.values()), Array.from(planes.values()), tolerance);
  if (!section || (plane !== section.plane0 && plane !== section.plane1)) return undefined;

  const points = edge.curve.controlPoints;
  const along = dot(sub(points[points.length - 1], points[0]), section.direction);
  if (!(Math.abs(along) > tolerance) || !increasesAlong(points, scale(section.direction, Math.sign(along)))) return undefined;
  const startVertex = brep.vertices.find(vertex => vertex.id === edge.vertices[0]);
  const endVertex = brep.vertices.find(vertex => vertex.id === edge.vertices[1]);
  if (!startVertex || !endVertex || !(dist(points[0], startVertex.point) <= tolerance
    && dist(points[points.length - 1], endVertex.point) <= tolerance)) return undefined;
  const patchBinding = quarticBoundary(edge, t, patch, plane === section.plane0, tolerance);
  if (!patchBinding) return undefined;
  const controlPoints: Point[] = [];
  for (const point of points) {
    const uv = planeParameter(plane, point, tolerance);
    if (!uv) return undefined;
    controlPoints.push(uv);
  }
  const planeBinding: Curve = { ...edge.curve, controlPoints };
  return firstPlane ? [planeBinding, patchBinding] : [patchBinding, planeBinding];
}
