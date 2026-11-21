import { CadNumericPolicy, checkBrep, evaluateCurve, faceGeometry, type Brep, type BrepEdge, type BrepFace, type CadPartOutput, type Curve } from '@barocss/cad';
import type { Vec3 } from './vec3';

/** Resolved targets and outward cylinders of a constant two-edge Fillet on the unplaced body. */
export interface NativeFilletPair {
  targets: readonly [string, string];
  cylinders: readonly [
    { c: Vec3; a: Vec3; r: number },
    { c: Vec3; a: Vec3; r: number },
  ];
  /** Two certified adjacent top rounds on an unplaced cardinal box. */
  adjacentTop?: true;
}

type Cylinder = Extract<ReturnType<typeof faceGeometry>, { kind: 'cylinder' }>;
const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const near = (a: readonly number[], b: readonly number[], tolerance: number) => a.length === b.length
  && a.every((value, i) => Number.isFinite(value) && Math.abs(value - b[i]) <= tolerance);
const lineKnots = [0, 0, 1, 1], quarterKnots = [0, 0, 0, 1, 1, 1];
const weightRoundoff = 64 * Number.EPSILON;

function curveMatches(curve: Curve, poles: readonly Vec3[], tolerance: number): boolean {
  const degree = poles.length - 1, weights = degree === 1 ? [1, 1] : [1, Math.SQRT1_2, 1];
  if (curve.degree !== degree || curve.controlPoints.length !== poles.length
    || !same(curve.knots, degree === 1 ? lineKnots : quarterKnots) || !near(curve.weights, weights, weightRoundoff)) return false;
  return [false, true].some(reverse => curve.controlPoints.every((point, i) => near(point, poles[reverse ? poles.length - 1 - i : i], tolerance)));
}

function quarterNet(face: BrepFace, poles: readonly (readonly Vec3[])[], tolerance: number): boolean {
  const { surface } = face;
  if (surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 1
    || !same(surface.knotsU, quarterKnots) || !same(surface.knotsV, lineKnots)
    || surface.controlPoints.length !== 3 || surface.controlPoints.some(row => row.length !== 2)
    || surface.weights.length !== 3 || surface.weights.some((row, i) => !near(row, i === 1 ? [Math.SQRT1_2, Math.SQRT1_2] : [1, 1], weightRoundoff))) return false;
  return [false, true].some(reverseU => [false, true].some(reverseV => surface.controlPoints.every((row, i) =>
    row.every((point, j) => near(point, poles[reverseU ? 2 - i : i][reverseV ? 1 - j : j], tolerance)))));
}

function cardinalPlane(face: BrepFace, axis: number, station: number, sign: number, tolerance: number): boolean {
  const { surface } = face, support = faceGeometry(face);
  const normal = [0, 0, 0]; normal[axis] = sign;
  return surface.kind === 'surface' && surface.degreeU === 1 && surface.degreeV === 1
    && same(surface.knotsU, lineKnots) && same(surface.knotsV, lineKnots)
    && surface.controlPoints.length === 2 && surface.controlPoints.every(row => row.length === 2
      && row.every(point => Math.abs(point[axis] - station) <= tolerance))
    && surface.weights.length === 2 && surface.weights.every(row => same(row, [1, 1]))
    && support.kind === 'plane' && near(support.n, normal, weightRoundoff) && Math.abs(support.o[axis] - station) <= tolerance;
}

function boundaryOf(brep: Brep, face: BrepFace) {
  const loops = byId(brep.loops), uses = byId(brep.coedges), edges = byId(brep.edges), faces = byId(brep.faces);
  const loop = loops.get(face.loops[0]);
  if (!loop || loop.kind !== 'outer' || loop.face !== face.id || loop.coedges.length !== 5) return;
  return loop.coedges.map(id => {
    const use = uses.get(id)!, twin = uses.get(use.twin!)!, edge = edges.get(use.edge)!;
    const neighbor = faces.get(loops.get(twin.loop)!.face)!;
    return { use, twin, edge, neighbor };
  });
}
type Boundary = NonNullable<ReturnType<typeof boundaryOf>>;

function boundTrim(boundary: Boundary, neighbor: string, poles: readonly Vec3[], tolerance: number): boolean {
  const matches = boundary.filter(item => item.neighbor.name === neighbor);
  return matches.length === 1 && curveMatches(matches[0].edge.curve, poles, tolerance);
}

type SeamCircle = { c: Vec3; r: number };
function seamSamples(curve: Curve, { c, r }: SeamCircle): boolean {
  const knots = [...new Set(curve.knots)], tolerance = CadNumericPolicy.linearTolerance;
  return knots.slice(1).every((end, i) => [0, .25, .5, .75, 1].every(fraction => {
    const point = evaluateCurve(curve, knots[i] + (end - knots[i]) * fraction);
    return Math.abs(Math.hypot(point[1] - c[1], point[2] - c[2]) - r) <= tolerance
      && Math.abs(Math.hypot(point[0] - c[0], point[2] - c[2]) - r) <= tolerance;
  }));
}

function fittedSeam(edge: BrepEdge, a: Vec3, b: Vec3, diagonal: number, roundoff: number, circle: SeamCircle): boolean {
  const { curve } = edge, points = curve.controlPoints, tolerance = CadNumericPolicy.linearTolerance;
  if (curve.degree !== 3 || points.length !== 49 || curve.weights.length !== 49 || curve.weights.some(weight => weight !== 1)
    || curve.knots.length !== 53 || curve.knots.some((value, i) => value !== (i < 4 ? 0 : i >= 49 ? 1 : Math.ceil((i - 3) / 3) / 16))) return false;
  const forward = near(points[0], a, roundoff) && near(points.at(-1)!, b, roundoff);
  const reverse = near(points[0], b, roundoff) && near(points.at(-1)!, a, roundoff);
  if (!forward && !reverse) return false;
  const ordered = forward ? points : [...points].reverse();
  // The current Kernel fits the cylinder intersection with cubic spans. Its control poles
  // need not lie on either cylinder, but stay on their diagonal plane and in monotone order.
  return ordered.every((point, i) => point.every(Number.isFinite) && Math.abs(point[0] + point[1] - diagonal) <= tolerance
    && point.every((value, k) => value >= Math.min(a[k], b[k]) - tolerance && value <= Math.max(a[k], b[k]) + tolerance)
    && (i === 0 || (point[0] <= ordered[i - 1][0] + tolerance && point[1] >= ordered[i - 1][1] - tolerance && point[2] >= ordered[i - 1][2] - tolerance)))
    && seamSamples(curve, circle);
}

function sharedSeams(first: Boundary, second: Boundary, peer: readonly [BrepFace, BrepFace], a: Vec3, middle: Vec3, b: Vec3,
  diagonal: number, tolerance: number, circle: SeamCircle): boolean {
  const left = first.filter(item => item.neighbor === peer[1]), right = second.filter(item => item.neighbor === peer[0]);
  if (left.length !== 2 || right.length !== 2 || left[0].edge.id === left[1].edge.id
    || left.some(item => !right.some(other => item.edge === other.edge && item.use.id === other.twin.id && item.twin.id === other.use.id))) return false;
  return [false, true].some(reverse => fittedSeam(left[reverse ? 1 : 0].edge, a, middle, diagonal, tolerance, circle)
    && fittedSeam(left[reverse ? 0 : 1].edge, middle, b, diagonal, tolerance, circle));
}

function adjacentBoxTop(output: CadPartOutput, faces: readonly BrepFace[], cylinders: readonly Cylinder[]): boolean {
  const { brep, filletTargets } = output;
  const match = filletTargets?.map(edge => /^(.+)\.side0\|\1\.top$/.exec(edge)).find(Boolean), stock = match?.[1];
  if (!stock || !filletTargets?.includes(`${stock}.side1|${stock}.top`) || brep.source.family !== 'analytic-boolean'
    || brep.source.id !== output.feature || brep.faces.length !== 8 || brep.loops.length !== 8 || brep.coedges.length !== 36
    || brep.edges.length !== 18 || brep.vertices.length !== 12 || brep.coedges.some(use => use.pcurve !== null)
    || brep.faces.some(face => face.loops.length !== 1) || new Set(brep.faces.map(face => face.name)).size !== 8
    || !checkBrep(brep, { strict: true }).valid) return false;
  const points = brep.vertices.map(vertex => vertex.point), bounds = [0, 1, 2].map(axis => [Math.min(...points.map(point => point[axis])), Math.max(...points.map(point => point[axis]))]);
  const [[x0, x1], [y0, y1], [z0, z1]] = bounds, extent = Math.max(...bounds.flat().map(Math.abs));
  const tolerance = 64 * Number.EPSILON * Math.max(1, extent), radius = cylinders[0].r;
  if (!(extent <= CadNumericPolicy.coordinateAbs && radius > 2 * CadNumericPolicy.linearTolerance && radius < z1 - z0
    && 2 * radius < x1 - x0 && 2 * radius < y1 - y0) || Math.abs(cylinders[1].r - radius) > tolerance) return false;
  const planeSpecs = [['side0', 1, y0, -1], ['side1', 0, x1, 1], ['side2', 1, y1, 1], ['side3', 0, x0, -1],
    ['top', 2, z1, 1], ['bottom', 2, z0, -1]] as const;
  if (!planeSpecs.every(([name, axis, at, sign]) => {
    const face = brep.faces.find(face => face.name === `${stock}.${name}`);
    return face && cardinalPlane(face, axis, at, sign, tolerance);
  })) return false;
  const along = (axis: number) => cylinders.findIndex(cylinder => cylinder.a.every((value, i) => Math.abs(value) === (i === axis ? 1 : 0)));
  const ix = along(0), iy = along(1);
  if (ix < 0 || iy < 0 || ix === iy) return false;
  const side0 = faces[ix], side1 = faces[iy];
  if (!near(cylinders[ix].c.slice(1), [y0 + radius, z1 - radius], tolerance)
    || !near([cylinders[iy].c[0], cylinders[iy].c[2]], [x1 - radius, z1 - radius], tolerance)
    || !quarterNet(side0, [[ [x0, y0 + radius, z1], [x1, y0 + radius, z1] ], [[x0, y0, z1], [x1, y0, z1]], [[x0, y0, z1 - radius], [x1, y0, z1 - radius]]], tolerance)
    || !quarterNet(side1, [[[x1 - radius, y0, z1], [x1 - radius, y1, z1]], [[x1, y0, z1], [x1, y1, z1]], [[x1, y0, z1 - radius], [x1, y1, z1 - radius]]], tolerance)) return false;
  const first = boundaryOf(brep, side0), second = boundaryOf(brep, side1);
  if (!first || !second) return false;
  const wallStart: Vec3 = [x1, y0, z1 - radius], topEnd: Vec3 = [x1 - radius, y0 + radius, z1];
  const q = radius * (1 - Math.SQRT1_2), middle: Vec3 = [x1 - q, y0 + q, z1 - radius + radius * Math.SQRT1_2];
  return boundTrim(first, `${stock}.side0`, [[x0, y0, z1 - radius], wallStart], tolerance)
    && boundTrim(first, `${stock}.top`, [[x0, y0 + radius, z1], topEnd], tolerance)
    && boundTrim(first, `${stock}.side3`, [[x0, y0, z1 - radius], [x0, y0, z1], [x0, y0 + radius, z1]], tolerance)
    && boundTrim(second, `${stock}.side1`, [wallStart, [x1, y1, z1 - radius]], tolerance)
    && boundTrim(second, `${stock}.top`, [topEnd, [x1 - radius, y1, z1]], tolerance)
    && boundTrim(second, `${stock}.side2`, [[x1, y1, z1 - radius], [x1, y1, z1], [x1 - radius, y1, z1]], tolerance)
    && sharedSeams(first, second, [side0, side1], wallStart, middle, topEnd, x1 + y0, tolerance,
      { c: [x1 - radius, y0 + radius, z1 - radius], r: radius });
}

export function nativeFilletPairOf(output: CadPartOutput): NativeFilletPair | undefined {
  const { brep, filletTargets } = output;
  if (filletTargets?.length !== 2 || filletTargets[0] === filletTargets[1] || output.bodyCount !== 1 ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id) return;
  const prefix = output.feature + '.';
  const faces = brep.faces.filter(face => face.name?.startsWith(prefix));
  if (faces.length !== 2 || !faces.some(face => face.name === prefix + 'face#1') ||
    !faces.some(face => face.name === prefix + 'face#2')) return;
  try {
    const [first, second] = faces.map(face => faceGeometry(face));
    if (first.kind !== 'cylinder' || second.kind !== 'cylinder' || first.out !== 1 || second.out !== 1) return;
    return {
      targets: [filletTargets[0], filletTargets[1]],
      cylinders: [{ c: [...first.c], a: [...first.a], r: first.r }, { c: [...second.c], a: [...second.a], r: second.r }],
      ...(adjacentBoxTop(output, faces, [first, second]) ? { adjacentTop: true as const } : {}),
    };
  } catch {
    // A result without two native analytical cylinders cannot qualify the handle.
    return;
  }
}
