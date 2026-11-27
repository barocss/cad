import { CadNumericPolicy, checkBrep, faceGeometry, type BrepFace, type CadPartOutput } from '@barocss/cad';
import type { ModelNode } from './doc';
import { featureId } from './ids';
import { nativeFilletCurveMatches, nativeFilletQuarterNet } from './nativeFilletPair';
import { add, cross, dot, len, scale, sub, unit, type Vec3 } from './vec3';

/** One certified quarter-cylinder on the first upper rim of an angled XY rectangle. */
export interface NativeAngledTopFillet {
  edge: string;
  faceId: string;
  centre: Vec3;
  axis: Vec3;
  radius: number;
}

const same = (a: readonly number[], b: readonly number[]) => a.length === b.length && a.every((value, i) => value === b[i]);
const near = (a: readonly number[], b: readonly number[], tolerance: number) => a.length === b.length
  && a.every((value, i) => Number.isFinite(value) && Math.abs(value - b[i]) <= tolerance);
const keys = (value: object, allowed: readonly string[]) => Object.keys(value).every(key => allowed.includes(key));
const point = (value: readonly unknown[], count: number): boolean => value.length === count
  && value.every(coordinate => typeof coordinate === 'number' && Number.isFinite(coordinate));
const lineKnots = [0, 0, 1, 1];
const roundoff = 64 * Number.EPSILON;

/** The deliberately small authored scope: three nodes, one side0/top round, positive non-cardinal XY axes. */
export function angledTopFilletSource(nodes: readonly ModelNode[], index: number) {
  if (index !== 2 || nodes.length !== 3) return;
  const [sketch, stock, fillet] = nodes;
  if (sketch.kind !== 'sketch' || sketch.profile !== 'rectangle' ||
    !keys(sketch, ['id', 'kind', 'profile', 'min', 'max', 'plane']) || !sketch.plane ||
    !point(sketch.min, 2) || !point(sketch.max, 2) ||
    stock.kind !== 'extrude' || !keys(stock, ['id', 'kind', 'sketch', 'height']) || stock.sketch !== 0 ||
    typeof stock.height !== 'number' || !Number.isFinite(stock.height) ||
    fillet.kind !== 'fillet' || !keys(fillet, ['id', 'kind', 'parent', 'edges', 'radius', 'sigs']) ||
    fillet.parent.node !== 1 || fillet.parent.side !== 'solid' ||
    typeof fillet.radius !== 'number' || !Number.isFinite(fillet.radius)) return;
  const plane = sketch.plane;
  if (!keys(plane, ['origin', 'normal', 'xAxis']) || !point(plane.origin, 3) || !point(plane.xAxis, 3) ||
    !same(plane.normal, [0, 0, 1]) || plane.xAxis[2] !== 0 || !(plane.xAxis[0] > 0 && plane.xAxis[1] > 0) ||
    Math.abs(len(plane.xAxis) - 1) > roundoff) return;
  const feature = featureId(nodes, index), stockId = featureId(nodes, 1), edge = `${stockId}.side0|${stockId}.top`;
  if (feature === stockId || fillet.edges.length !== 1 || fillet.edges[0] !== edge) return;
  const width = Number(sketch.max[0]) - Number(sketch.min[0]), depth = Number(sketch.max[1]) - Number(sketch.min[1]);
  const height = stock.height, radius = fillet.radius;
  if (!(radius > 2 * CadNumericPolicy.linearTolerance && radius < height && 2 * radius < width && 2 * radius < depth)) return;
  const axis = unit(plane.xAxis), outward: Vec3 = [axis[1], -axis[0], 0];
  const lift = (x: number, y: number): Vec3 => add(add(plane.origin, scale(axis, x)), [outward[0] * -y, outward[1] * -y, height]);
  const a = lift(Number(sketch.min[0]), Number(sketch.min[1])), b = lift(Number(sketch.max[0]), Number(sketch.min[1]));
  const farA = sub(a, scale(outward, depth)), farB = sub(b, scale(outward, depth));
  if (![...a, ...b, ...farA, ...farB, a[2] - height].every(value => Number.isFinite(value) && Math.abs(value) <= CadNumericPolicy.coordinateAbs)) return;
  return { edge, a, b, outward, axis, wall: `${stockId}.side0`, top: `${stockId}.top`, stock: stockId,
    feature, width, depth, height, radius };
}

type Source = NonNullable<ReturnType<typeof angledTopFilletSource>>;

function planeMatches(face: BrepFace, origin: Vec3, normal: Vec3, tolerance: number): boolean {
  const surface = face.surface, support = faceGeometry(face);
  return surface.kind === 'surface' && surface.degreeU === 1 && surface.degreeV === 1 &&
    same(surface.knotsU, lineKnots) && same(surface.knotsV, lineKnots) &&
    surface.controlPoints.length === 2 && surface.controlPoints.every(row => row.length === 2 &&
      row.every(pole => pole.every(Number.isFinite) && Math.abs(dot(sub(pole, origin), normal)) <= tolerance)) &&
    surface.weights.length === 2 && surface.weights.every(row => same(row, [1, 1])) &&
    support.kind === 'plane' && near(support.n, normal, roundoff) && Math.abs(dot(sub(support.o, origin), normal)) <= tolerance;
}

/** Read native supports and all four reciprocal trims; an analytic cylinder label alone is insufficient. */
export function nativeAngledTopFilletOf(output: CadPartOutput, source: Source): NativeAngledTopFillet | undefined {
  try {
    return certify(output, source);
  } catch {
    // Missing or malformed evidence cannot authorize a History grip.
    return;
  }
}

function certify(output: CadPartOutput, source: Source): NativeAngledTopFillet | undefined {
  const { brep, filletTargets: targets } = output;
  if (output.feature !== source.feature || targets?.length !== 1 || targets[0] !== source.edge || output.bodyCount !== 1 ||
    brep.source.family !== 'analytic-boolean' || brep.source.id !== source.feature ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1 ||
    brep.shells.length !== 1 || !brep.shells[0].closed || brep.bodies[0].shells[0] !== brep.shells[0].id ||
    brep.faces.length !== 7 || brep.loops.length !== 7 || brep.coedges.length !== 30 || brep.edges.length !== 15 ||
    brep.vertices.length !== 10 || brep.coedges.some(use => use.pcurve !== null) ||
    brep.faces.some(face => face.loops.length !== 1) || new Set(brep.faces.map(face => face.name)).size !== 7 ||
    !checkBrep(brep, { strict: true }).valid) return;
  const { a, b, axis, outward, radius } = source, topNormal: Vec3 = [0, 0, 1];
  const extent = Math.max(1, ...brep.vertices.flatMap(vertex => vertex.point.map(Math.abs)));
  if (!Number.isFinite(extent) || extent > CadNumericPolicy.coordinateAbs) return;
  const tolerance = roundoff * extent;
  const planeSpecs: [string, Vec3, Vec3][] = [
    [source.wall, a, outward], [`${source.stock}.side1`, b, axis],
    [`${source.stock}.side2`, sub(a, scale(outward, source.depth)), scale(outward, -1)],
    [`${source.stock}.side3`, a, scale(axis, -1)], [source.top, a, topNormal],
    [`${source.stock}.bottom`, sub(a, scale(topNormal, source.height)), scale(topNormal, -1)],
  ];
  if (!planeSpecs.every(([name, origin, normal]) => {
    const face = brep.faces.find(candidate => candidate.name === name);
    return face && planeMatches(face, origin, normal, tolerance);
  })) return;
  const face = brep.faces.find(candidate => candidate.name === `${source.feature}.face`);
  if (!face) return;
  const cylinder = faceGeometry(face), centre = sub(a, scale(add(outward, topNormal), radius));
  if (cylinder.kind !== 'cylinder' || cylinder.out !== 1 || ![...cylinder.c, ...cylinder.a, cylinder.r].every(Number.isFinite) ||
    Math.abs(cylinder.r - radius) > tolerance || Math.abs(len(cylinder.a) - 1) > roundoff ||
    len(cross(cylinder.a, axis)) > roundoff || len(cross(sub(cylinder.c, centre), axis)) > tolerance) return;
  const topA = sub(a, scale(outward, radius)), topB = sub(b, scale(outward, radius));
  const wallA = sub(a, scale(topNormal, radius)), wallB = sub(b, scale(topNormal, radius));
  if (!nativeFilletQuarterNet(face, [[topA, topB], [a, b], [wallA, wallB]], tolerance)) return;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use]));
  const edges = new Map(brep.edges.map(edge => [edge.id, edge])), faces = new Map(brep.faces.map(item => [item.id, item]));
  const loop = loops.get(face.loops[0]);
  if (!loop || loop.kind !== 'outer' || loop.face !== face.id || loop.coedges.length !== 4) return;
  const boundary = loop.coedges.map(id => {
    const use = uses.get(id), twin = use?.twin && uses.get(use.twin), edge = use && edges.get(use.edge);
    const neighbor = twin && faces.get(loops.get(twin.loop)?.face ?? '');
    return use && twin && edge && neighbor && use.loop === loop.id && twin.twin === use.id &&
      twin.edge === use.edge && neighbor !== face ? { edge, neighbor } : undefined;
  });
  if (boundary.some(item => !item) || new Set(boundary.map(item => item!.edge.id)).size !== 4) return;
  const trimSpecs: [string, Vec3[]][] = [[source.wall, [wallA, wallB]], [source.top, [topA, topB]],
    [`${source.stock}.side3`, [wallA, a, topA]], [`${source.stock}.side1`, [wallB, b, topB]]];
  if (!trimSpecs.every(([name, poles]) => {
    const matches = boundary.filter(item => item!.neighbor.name === name);
    return matches.length === 1 && nativeFilletCurveMatches(matches[0]!.edge.curve, poles, tolerance);
  })) return;
  return { edge: source.edge, faceId: face.id, centre: [...cylinder.c], axis: [...cylinder.a], radius: cylinder.r };
}
