import { checkBrep, lineCurve, type Brep, type BrepCoedge, type BrepEdge } from '../brep/brep-core.js';
import { dot, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point } from '../types.js';
import { boxCapOffsetFrame } from './drafted-cap-offset.js';
import { affineChart, coverAffineTrim, trimFits, uvPoint } from './prism-wall-offset.js';

const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const samePoint = (a: Point, b: Point) => a.every((value, axis) => value === b[axis]);
const startOf = (edge: BrepEdge, use: BrepCoedge) => edge.vertices[use.sense === 'forward' ? 0 : 1];

/** Heal one equal-leg convex bevel along a full-height corner of an upright rectangular box. */
export function healPrismaticChamferIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string): Brep | undefined {
  const [body] = brep.bodies, [shell] = brep.shells;
  if (brep.source.family !== 'prismatic-solid' || brep.bodies.length !== 1 || body.kind !== 'solid' || body.shells.length !== 1
    || brep.shells.length !== 1 || !shell.closed || brep.faces.length !== 7 || brep.loops.length !== 7
    || brep.coedges.length !== 30 || brep.edges.length !== 15 || brep.vertices.length !== 10
    || brep.loops.some(loop => loop.kind !== 'outer') || brep.faces.some(face => !face.name || face.loops.length !== 1)
    || new Set(brep.faces.map(face => face.name)).size !== 7 || brep.coedges.some(use => !use.pcurve)
    || brep.edges.some(edge => edge.name === sharpEdgeName) || !checkBrep(brep, { strict: true }).valid) return undefined;

  const selected = brep.faces.find(face => face.name === faceName);
  if (!selected) return undefined;
  const loops = byId(brep.loops), uses = byId(brep.coedges), edges = byId(brep.edges), vertices = byId(brep.vertices);
  const chartByFace = new Map(brep.faces.map(face => [face.id, affineChart(face.surface, face.sense)]));
  const bevel = chartByFace.get(selected.id);
  const extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point));
  if (!bevel || !(extent <= CadNumericPolicy.coordinateAbs) || !bevel.normal.every(Number.isFinite)) return undefined;
  const linear = linearToleranceMM(extent), roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  const levels = [...new Set(brep.vertices.map(({ point }) => point[2]))].sort((a, b) => a - b);
  if (levels.length !== 2 || levels[1] - levels[0] <= linear) return undefined;
  if (brep.edges.some(({ curve, vertices: ends }) => curve.degree !== 1 || curve.controlPoints.length !== 2
    || curve.weights.length !== 2 || curve.weights.some(weight => weight !== 1)
    || curve.knots.length !== 4 || curve.knots.some((knot, i) => knot !== (i < 2 ? 0 : 1))
    || ends.some((id, i) => !samePoint(vertices.get(id)!.point, curve.controlPoints[i])))) return undefined;

  const selectedLoop = loops.get(selected.loops[0])!;
  if (selectedLoop.coedges.length !== 4) return undefined;
  const neighbors = selectedLoop.coedges.map(id => {
    const use = uses.get(id)!, twin = uses.get(use.twin!)!;
    return { edge: edges.get(use.edge)!, twin, loop: loops.get(twin.loop)! };
  });
  if (new Set(neighbors.map(item => item.loop.face)).size !== 4) return undefined;
  const axial = ({ edge }: typeof neighbors[number]) => edge.curve.controlPoints[0][2] !== edge.curve.controlPoints[1][2];
  const rails = neighbors.filter(item => !axial(item));
  const seams = neighbors.filter(axial);
  if (seams.length !== 2 || rails.length !== 2 || rails[0].edge.curve.controlPoints[0][2] === rails[1].edge.curve.controlPoints[0][2]
    || rails.some(({ loop }) => loop.coedges.length !== 5) || seams.some(({ loop }) => loop.coedges.length !== 4)
    || neighbors.some(({ edge }) => edge.curve.controlPoints.some(point => !trimFits(bevel, point, roundoff)))) return undefined;

  // The two named walls must be cardinal, face outwards from the omitted corner and meet at that corner.
  const cardinalSeam = (axis: 0 | 1) => seams.find(({ loop }) => {
    const normal = chartByFace.get(loop.face)?.normal;
    return normal?.every((value, i) => i === axis ? Math.abs(value) > 0 : value === 0);
  });
  const xSeam = cardinalSeam(0), ySeam = cardinalSeam(1);
  if (!xSeam || !ySeam || seams.map(({ loop }) => brep.faces.find(face => face.id === loop.face)!.name).sort().join('|') !== sharpEdgeName) return undefined;
  const xWall = chartByFace.get(xSeam.loop.face)!, yWall = chartByFace.get(ySeam.loop.face)!;
  const x = xWall.origin[0], y = yWall.origin[1], sx = Math.sign(xWall.normal[0]), sy = Math.sign(yWall.normal[1]);
  const [a, aEnd] = xSeam.edge.curve.controlPoints, [b, bEnd] = ySeam.edge.curve.controlPoints;
  const dx = sx * (x - b[0]), dy = sy * (y - a[1]);
  if (!(dx > linear && dy > linear) || Math.abs(dx - dy) > roundoff || a[0] !== x || b[1] !== y
    || aEnd[0] !== a[0] || bEnd[0] !== b[0] || aEnd[1] !== a[1] || bEnd[1] !== b[1]
    || Math.abs(bevel.normal[0] - sx * Math.SQRT1_2) > 64 * Number.EPSILON
    || Math.abs(bevel.normal[1] - sy * Math.SQRT1_2) > 64 * Number.EPSILON || bevel.normal[2] !== 0
    || !rails.every(({ edge }) => seams.every(seam => seam.edge.vertices.filter(id => edge.vertices.includes(id)).length === 1))) return undefined;
  const seamIds = new Set(seams.flatMap(({ edge }) => edge.vertices));
  if (seamIds.size !== 4 || brep.vertices.some(({ id, point }) => !seamIds.has(id) && dot(sub(point, bevel.origin), bevel.normal) >= -linear)) return undefined;

  // Keep the X-wall seam ID and both wall uses. The other seam joins it at the same two cap stations.
  const kept = xSeam.edge, removed = ySeam.edge;
  const remap = new Map(removed.vertices.map(id => [id, kept.vertices.find(keep => vertices.get(keep)!.point[2] === vertices.get(id)!.point[2])!]));
  const nextVertices = brep.vertices.flatMap(vertex => remap.has(vertex.id) ? [] : [kept.vertices.includes(vertex.id)
    ? { ...vertex, point: [x, y, vertex.point[2]] as Point } : vertex]);
  const pointById = byId(nextVertices);
  const railIds = new Set(rails.map(({ edge }) => edge.id));
  const nextEdges = brep.edges.filter(edge => edge !== removed && !railIds.has(edge.id)).map(edge => {
    if (edge.vertices.every(id => !seamIds.has(id))) return edge;
    const ends = edge.vertices.map(id => remap.get(id) ?? id) as [string, string];
    const curve = lineCurve(edge.curve.id, pointById.get(ends[0])!.point, pointById.get(ends[1])!.point);
    return { ...edge, curve, vertices: ends, ...(edge === kept ? { name: sharpEdgeName } : {}) };
  });
  const edgeById = byId(nextEdges);
  const keptUse = { ...xSeam.twin, twin: ySeam.twin.id };
  const originalStart = startOf(removed, ySeam.twin);
  const joinedUse: BrepCoedge = { ...ySeam.twin, edge: kept.id, twin: keptUse.id,
    sense: remap.get(originalStart) === kept.vertices[0] ? 'forward' : 'reversed' };
  if (keptUse.sense === joinedUse.sense) return undefined;

  const nextFaces: Brep['faces'][number][] = [], nextLoops: Brep['loops'][number][] = [], nextUses: BrepCoedge[] = [];
  const remaining = brep.faces.filter(face => face !== selected);
  for (const face of remaining) {
    const loop = loops.get(face.loops[0])!, chart = chartByFace.get(face.id);
    if (!chart) return undefined;
    const cycle = loop.coedges.map(id => id === keptUse.id ? keptUse : id === joinedUse.id ? joinedUse : uses.get(id)!)
      .filter(use => !railIds.has(use.edge));
    if (cycle.length !== 4) return undefined;
    const points = cycle.map(use => pointById.get(startOf(edgeById.get(use.edge)!, use))!.point);
    const extended = coverAffineTrim(chart, face.sense, points, roundoff);
    if (!extended || !points.every(point => trimFits(extended, point, roundoff))) return undefined;
    nextFaces.push(extended === chart ? face : { ...face, surface: extended.surface });
    nextLoops.push(cycle.length === loop.coedges.length ? loop : { ...loop, coedges: cycle.map(use => use.id) });
    for (const [i, use] of cycle.entries()) {
      const edge = edgeById.get(use.edge)!;
      const pcurve = extended === chart && edge === edges.get(uses.get(use.id)!.edge) ? use.pcurve
        : lineCurve(use.pcurve!.id, uvPoint(extended, edge.curve.controlPoints[0]), uvPoint(extended, edge.curve.controlPoints[1]));
      nextUses.push({ ...use, pcurve, next: cycle[(i + 1) % cycle.length].id, prev: cycle[(i + cycle.length - 1) % cycle.length].id });
    }
  }
  const healed: Brep = { ...brep, shells: [{ ...shell, faces: shell.faces.filter(id => id !== selected.id) }],
    faces: nextFaces, loops: nextLoops, coedges: nextUses, edges: nextEdges, vertices: nextVertices };
  const capName = nextFaces.find(face => face.id === rails[0].loop.face)!.name!;
  return boxCapOffsetFrame(healed, capName) ? healed : undefined;
}
