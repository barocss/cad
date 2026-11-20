import { checkBrep, lineCurve, type Brep, type BrepCoedge, type BrepEdge, type BrepLoop } from '../brep/brep-core.js';
import { dot, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Point } from '../types.js';
import { boxCapOffsetFrame } from './drafted-cap-offset.js';
import { affineChart, coverAffineTrim, trimFits, uvPoint } from './prism-wall-offset.js';

const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const samePoint = (a: Point, b: Point) => a.every((value, axis) => value === b[axis]);
const startOf = (edge: BrepEdge, use: BrepCoedge) => edge.vertices[use.sense === 'forward' ? 0 : 1];
const axes = [0, 1, 2] as const;
type Axis = typeof axes[number];
type Neighbor = { edge: BrepEdge; twin: BrepCoedge; loop: BrepLoop };
type Support = { axis: Axis; at: number; sign: number };

/** Heal one equal-leg convex bevel along a full-height corner of an upright rectangular box. */
export function healPrismaticChamferIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string): Brep | undefined {
  const edit = readVerticalChamfer(brep, faceName, [sharpEdgeName]);
  if (!edit) return undefined;
  const healed = rebuildVerticalCorner(brep, edit, 0);
  return healed && boxCapOffsetFrame(healed, edit.capName) ? healed : undefined;
}

/** Heal one selected full-height bevel from a single pair of opposite corners of an upright box. */
export function healOppositePrismaticChamferIfAdmitted(brep: Brep, faceName: string, sharpEdges: readonly string[]): Brep | undefined {
  if (sharpEdges.length !== 2 || new Set(sharpEdges).size !== 2) return undefined;
  const bevels = [`${brep.source.id}.face#1`, `${brep.source.id}.face#2`];
  if (!bevels.includes(faceName)) return undefined;
  const peerName = bevels.find(name => name !== faceName)!;
  const edit = readVerticalChamfer(brep, faceName, sharpEdges), peer = readVerticalChamfer(brep, peerName, sharpEdges);
  if (!edit || !peer || edit.sharpEdgeName === peer.sharpEdgeName || edit.sx !== -peer.sx || edit.sy !== -peer.sy
    || Math.abs(edit.leg - peer.leg) > edit.source.roundoff
    || edit.rails.some(rail => !peer.rails.some(other => other.loop === rail.loop))
    || [edit.xSeam, edit.ySeam].some(seam => [peer.xSeam, peer.ySeam].some(other => other.loop === seam.loop))) return undefined;

  const healed = rebuildVerticalCorner(brep, edit, 1);
  if (!healed || !keepsPeerBevel(healed, peer.source)) return undefined;
  // Certify the remaining shape as the existing one-bevel rectangular stock. Publish only the first repair.
  return healPrismaticChamferIfAdmitted(healed, peerName, peer.sharpEdgeName) ? healed : undefined;
}

function keepsPeerBevel(brep: Brep, { selected, loops, neighbors, uses, vertices }: Chamfer): boolean {
  const nextLoops = byId(brep.loops), nextUses = byId(brep.coedges), nextEdges = byId(brep.edges), nextVertices = byId(brep.vertices);
  return brep.faces.includes(selected) && nextLoops.get(selected.loops[0]) === loops.get(selected.loops[0])
    && neighbors.every(({ edge, twin }) => {
      const own = uses.get(twin.twin!)!, nextTwin = nextUses.get(twin.id), nextOwn = nextUses.get(own.id);
      return !!nextTwin && !!nextOwn && nextEdges.get(edge.id) === edge && edge.vertices.every(id => nextVertices.get(id) === vertices.get(id))
        && nextTwin.pcurve === twin.pcurve && nextOwn.pcurve === own.pcurve
        && nextTwin.next === twin.next && nextTwin.prev === twin.prev && nextOwn.next === own.next && nextOwn.prev === own.prev;
    });
}

function readVerticalChamfer(brep: Brep, faceName: string, sharpEdges: readonly string[]) {
  if (brep.source.family !== 'prismatic-solid' || brep.coedges.some(use => !use.pcurve)) return undefined;
  const source = readChamfer(brep, faceName, sharpEdges);
  if (!source) return undefined;
  const { chartByFace, neighbors, vertices, bevel, linear, roundoff } = source;
  const levels = [...new Set(brep.vertices.map(({ point }) => point[2]))].sort((a, b) => a - b);
  if (levels.length !== 2 || levels[1] - levels[0] <= linear) return undefined;
  const axial = ({ edge }: Neighbor) => edge.curve.controlPoints[0][2] !== edge.curve.controlPoints[1][2];
  const rails = neighbors.filter(item => !axial(item)), seams = neighbors.filter(axial);
  if (seams.length !== 2 || rails.length !== 2 || rails[0].edge.curve.controlPoints[0][2] === rails[1].edge.curve.controlPoints[0][2]
    || rails.some(({ loop }) => loop.coedges.length !== 4 + sharpEdges.length) || seams.some(({ loop }) => loop.coedges.length !== 4)) return undefined;

  // The two named walls must be cardinal, face outwards from the omitted corner and meet at that corner.
  const cardinalSeam = (axis: 0 | 1) => seams.find(({ loop }) => {
    const normal = chartByFace.get(loop.face)?.normal;
    return normal?.every((value, i) => i === axis ? Math.abs(value) > 0 : value === 0);
  });
  const xSeam = cardinalSeam(0), ySeam = cardinalSeam(1);
  const sharpEdgeName = sharpName(brep, seams);
  if (!xSeam || !ySeam || !sharpEdges.includes(sharpEdgeName)) return undefined;
  const xWall = chartByFace.get(xSeam.loop.face)!, yWall = chartByFace.get(ySeam.loop.face)!;
  const x = xWall.origin[0], y = yWall.origin[1], sx = Math.sign(xWall.normal[0]), sy = Math.sign(yWall.normal[1]);
  const [a, aEnd] = xSeam.edge.curve.controlPoints, [b, bEnd] = ySeam.edge.curve.controlPoints;
  const dx = sx * (x - b[0]), dy = sy * (y - a[1]);
  if (!(dx > linear && dy > linear) || Math.abs(dx - dy) > roundoff || a[0] !== x || b[1] !== y
    || aEnd[0] !== a[0] || bEnd[0] !== b[0] || aEnd[1] !== a[1] || bEnd[1] !== b[1]
    || Math.abs(bevel.normal[0] - sx * Math.SQRT1_2) > 64 * Number.EPSILON
    || Math.abs(bevel.normal[1] - sy * Math.SQRT1_2) > 64 * Number.EPSILON || bevel.normal[2] !== 0
    || !rails.every(({ edge }) => seams.every(seam => seam.edge.vertices.filter(id => edge.vertices.includes(id)).length === 1))) return undefined;
  if (!clearsBevel(brep, source, seams)) return undefined;

  const sharpPoints = new Map(xSeam.edge.vertices.map(id => [id, [x, y, vertices.get(id)!.point[2]] as Point]));
  const remap = new Map(ySeam.edge.vertices.map(id => [id, xSeam.edge.vertices.find(keep => vertices.get(keep)!.point[2] === vertices.get(id)!.point[2])!]));
  const capName = brep.faces.find(face => face.id === rails[0].loop.face)!.name!;
  return { source, xSeam, ySeam, rails, sharpPoints, remap, sharpEdgeName, capName, sx, sy, leg: dx };
}

function rebuildVerticalCorner(brep: Brep, edit: NonNullable<ReturnType<typeof readVerticalChamfer>>, remaining: 0 | 1): Brep | undefined {
  return rebuildSharpCorner(brep, edit.source, edit.xSeam, edit.ySeam, edit.rails, edit.sharpPoints, edit.remap, edit.sharpEdgeName, remaining);
}

function readChamfer(brep: Brep, faceName: string, sharpEdges: readonly string[]) {
  const [body] = brep.bodies, [shell] = brep.shells;
  const count = sharpEdges.length;
  if (brep.bodies.length !== 1 || body.kind !== 'solid' || body.shells.length !== 1
    || brep.shells.length !== 1 || !shell.closed || brep.faces.length !== 6 + count || brep.loops.length !== 6 + count
    || brep.coedges.length !== 24 + 6 * count || brep.edges.length !== 12 + 3 * count || brep.vertices.length !== 8 + 2 * count
    || brep.loops.some(loop => loop.kind !== 'outer') || brep.faces.some(face => !face.name || face.loops.length !== 1)
    || new Set(brep.faces.map(face => face.name)).size !== 6 + count
    || brep.edges.some(edge => edge.name && sharpEdges.includes(edge.name)) || !checkBrep(brep, { strict: true }).valid) return undefined;

  const selected = brep.faces.find(face => face.name === faceName);
  if (!selected) return undefined;
  const loops = byId(brep.loops), uses = byId(brep.coedges), edges = byId(brep.edges), vertices = byId(brep.vertices);
  const chartByFace = new Map(brep.faces.map(face => [face.id, affineChart(face.surface, face.sense)]));
  const bevel = chartByFace.get(selected.id);
  const extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point));
  if (!bevel || !(extent <= CadNumericPolicy.coordinateAbs) || !bevel.normal.every(Number.isFinite)) return undefined;
  const linear = linearToleranceMM(extent), roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  if (brep.edges.some(({ curve, vertices: ends }) => curve.degree !== 1 || curve.controlPoints.length !== 2
    || curve.weights.length !== 2 || curve.weights.some(weight => weight !== 1)
    || curve.knots.length !== 4 || curve.knots.some((knot, i) => knot !== (i < 2 ? 0 : 1))
    || ends.some((id, i) => !samePoint(vertices.get(id)!.point, curve.controlPoints[i])))) return undefined;

  const selectedLoop = loops.get(selected.loops[0])!;
  if (selectedLoop.coedges.length !== 4) return undefined;
  const neighbors: Neighbor[] = selectedLoop.coedges.map(id => {
    const use = uses.get(id)!, twin = uses.get(use.twin!)!;
    return { edge: edges.get(use.edge)!, twin, loop: loops.get(twin.loop)! };
  });
  if (new Set(neighbors.map(item => item.loop.face)).size !== 4
    || neighbors.some(({ edge }) => edge.curve.controlPoints.some(point => !trimFits(bevel, point, roundoff)))) return undefined;
  return { shell, selected, loops, uses, edges, vertices, chartByFace, bevel, neighbors, linear, roundoff };
}

type Chamfer = NonNullable<ReturnType<typeof readChamfer>>;
const sharpName = (brep: Brep, seams: readonly Neighbor[]) => seams.map(({ loop }) => brep.faces.find(face => face.id === loop.face)!.name).sort().join('|');

function clearsBevel(brep: Brep, { bevel, linear }: Chamfer, seams: readonly Neighbor[]): boolean {
  const seamIds = new Set(seams.flatMap(({ edge }) => edge.vertices));
  return seamIds.size === 4 && brep.vertices.every(({ id, point }) => seamIds.has(id) || dot(sub(point, bevel.origin), bevel.normal) < -linear);
}

function cardinalSupport(chart: ReturnType<typeof affineChart>): Support | undefined {
  if (!chart) return undefined;
  const axis = axes.find(candidate => Math.abs(chart.normal[candidate]) > 0 && axes.every(i => i === candidate || chart.normal[i] === 0));
  if (axis === undefined) return undefined;
  const at = chart.origin[axis];
  if (!chart.surface.controlPoints.every(row => row.every(point => point[axis] === at))) return undefined;
  return { axis, at, sign: Math.sign(chart.normal[axis]) };
}

/** Heal one full-span 45-degree bevel between a horizontal cap and a cardinal side of a straight box. */
export function healHorizontalChamferIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string): Brep | undefined {
  if (brep.source.family !== 'polyhedral-boolean' || brep.coedges.some(use => use.pcurve !== null)) return undefined;
  const source = readChamfer(brep, faceName, [sharpEdgeName]);
  if (!source) return undefined;
  const { selected, chartByFace, neighbors, vertices, loops, uses, edges, bevel, linear, roundoff } = source;
  const remaining = brep.faces.filter(face => face !== selected);
  const supports = new Map<string, Support>();
  for (const face of remaining) {
    const support = cardinalSupport(chartByFace.get(face.id));
    if (!support) return undefined;
    supports.set(face.id, support);
  }
  for (const axis of axes) {
    const pair = [...supports.values()].filter(support => support.axis === axis);
    const lower = pair.find(({ sign }) => sign === -1), upper = pair.find(({ sign }) => sign === 1);
    if (pair.length !== 2 || !lower || !upper || upper.at - lower.at <= linear) return undefined;
  }

  const seams = neighbors.filter(({ loop }) => loop.coedges.length === 4);
  const rails = neighbors.filter(({ loop }) => loop.coedges.length === 5);
  if (seams.length !== 2 || rails.length !== 2 || sharpName(brep, seams) !== sharpEdgeName || !clearsBevel(brep, source, seams)) return undefined;
  const capSeam = seams.find(({ loop }) => supports.get(loop.face)!.axis === 2);
  const wallSeam = seams.find(({ loop }) => supports.get(loop.face)!.axis !== 2);
  if (!capSeam || !wallSeam) return undefined;
  const cap = supports.get(capSeam.loop.face)!, wall = supports.get(wallSeam.loop.face)!;
  const spanAxis = wall.axis === 0 ? 1 : 0;
  const normalSlack = 64 * Number.EPSILON;
  if (Math.abs(bevel.normal[spanAxis]) > normalSlack || Math.abs(bevel.normal[cap.axis] - cap.sign * Math.SQRT1_2) > normalSlack
    || Math.abs(bevel.normal[wall.axis] - wall.sign * Math.SQRT1_2) > normalSlack) return undefined;

  const remap = new Map<string, string>(), points = new Map<string, Point>();
  const seamIds = new Set(seams.flatMap(({ edge }) => edge.vertices));
  const exactSpanEnds = new Set<number>();
  let firstLeg: number | undefined;
  for (const { edge, loop } of rails) {
    const end = supports.get(loop.face)!;
    const wallId = edge.vertices.find(id => wallSeam.edge.vertices.includes(id));
    const capId = edge.vertices.find(id => capSeam.edge.vertices.includes(id));
    if (end.axis !== spanAxis || exactSpanEnds.has(end.at) || !wallId || !capId || remap.has(capId) || points.has(wallId)) return undefined;
    exactSpanEnds.add(end.at);
    const a = vertices.get(wallId)!.point, b = vertices.get(capId)!.point;
    const wallLeg = wall.sign * (wall.at - b[wall.axis]), capLeg = cap.sign * (cap.at - a[cap.axis]);
    if (!(wallLeg > linear && capLeg > linear) || Math.abs(wallLeg - capLeg) > roundoff
      || (firstLeg !== undefined && Math.abs(firstLeg - wallLeg) > roundoff)) return undefined;
    firstLeg = wallLeg;
    const sharp: Point = [0, 0, 0];
    sharp[wall.axis] = wall.at;
    sharp[cap.axis] = cap.at;
    sharp[spanAxis] = end.at;
    remap.set(capId, wallId);
    points.set(wallId, sharp);
  }

  // Polyhedral intersections can leave machine rounding at a vertex. Use only its actual incident
  // supports to recover the exact corner, and reject a larger gap instead of moving the stock.
  const supportsByVertex = new Map<string, Support[]>(brep.vertices.map(vertex => [vertex.id, []]));
  for (const face of remaining) {
    const loop = loops.get(face.loops[0])!;
    const ids = new Set(loop.coedges.flatMap(id => edges.get(uses.get(id)!.edge)!.vertices));
    for (const id of ids) supportsByVertex.get(id)!.push(supports.get(face.id)!);
  }
  for (const { id, point } of brep.vertices) {
    const incident = supportsByVertex.get(id)!;
    const isSeam = seamIds.has(id);
    if (incident.length !== (isSeam ? 2 : 3) || new Set(incident.map(({ axis }) => axis)).size !== incident.length
      || incident.some(({ axis, at }) => Math.abs(point[axis] - at) > roundoff)) return undefined;
    if (isSeam) continue;
    const exact: Point = [...point];
    for (const { axis, at } of incident) exact[axis] = at;
    if (!samePoint(exact, point)) points.set(id, exact);
  }

  const capName = brep.faces.find(face => face.id === capSeam.loop.face)!.name!;
  const healed = rebuildSharpCorner(brep, source, wallSeam, capSeam, rails, points, remap, sharpEdgeName, 0);
  return healed && boxCapOffsetFrame(healed, capName) ? healed : undefined;
}

function rebuildSharpCorner(brep: Brep, source: Chamfer, keepSeam: Neighbor, discardSeam: Neighbor, rails: readonly Neighbor[],
  points: ReadonlyMap<string, Point>, remap: ReadonlyMap<string, string>, sharpEdgeName: string, remaining: 0 | 1): Brep | undefined {
  const { shell, selected, loops, uses, edges, chartByFace, roundoff } = source;
  const kept = keepSeam.edge, removed = discardSeam.edge;
  const nextVertices = brep.vertices.flatMap(vertex => {
    const point = points.get(vertex.id);
    return remap.has(vertex.id) ? [] : [point ? { ...vertex, point } : vertex];
  });
  const pointById = byId(nextVertices);
  const railIds = new Set(rails.map(({ edge }) => edge.id));
  const nextEdges = brep.edges.filter(edge => edge !== removed && !railIds.has(edge.id)).map(edge => {
    if (edge.vertices.every(id => !points.has(id) && !remap.has(id))) return edge;
    const ends = edge.vertices.map(id => remap.get(id) ?? id) as [string, string];
    const curve = lineCurve(edge.curve.id, pointById.get(ends[0])!.point, pointById.get(ends[1])!.point);
    return { ...edge, curve, vertices: ends, ...(edge === kept ? { name: sharpEdgeName } : {}) };
  });
  const edgeById = byId(nextEdges);
  const keptUse = { ...keepSeam.twin, twin: discardSeam.twin.id };
  const originalStart = startOf(removed, discardSeam.twin);
  const joinedUse: BrepCoedge = { ...discardSeam.twin, edge: kept.id, twin: keptUse.id,
    sense: remap.get(originalStart) === kept.vertices[0] ? 'forward' : 'reversed' };
  if (keptUse.sense === joinedUse.sense) return undefined;

  const nextFaces: Brep['faces'][number][] = [], nextLoops: Brep['loops'][number][] = [], nextUses: BrepCoedge[] = [];
  const surviving = brep.faces.filter(face => face !== selected);
  for (const face of surviving) {
    const loop = loops.get(face.loops[0])!, chart = chartByFace.get(face.id);
    if (!chart) return undefined;
    const cycle = loop.coedges.map(id => id === keptUse.id ? keptUse : id === joinedUse.id ? joinedUse : uses.get(id)!)
      .filter(use => !railIds.has(use.edge));
    if (cycle.length !== 4 + (rails.some(rail => rail.loop === loop) ? remaining : 0)) return undefined;
    const points = cycle.map(use => pointById.get(startOf(edgeById.get(use.edge)!, use))!.point);
    const extended = coverAffineTrim(chart, face.sense, points, roundoff);
    if (!extended || !points.every(point => trimFits(extended, point, roundoff))) return undefined;
    nextFaces.push(extended === chart ? face : { ...face, surface: extended.surface });
    nextLoops.push(cycle.length === loop.coedges.length ? loop : { ...loop, coedges: cycle.map(use => use.id) });
    for (const [i, use] of cycle.entries()) {
      const edge = edgeById.get(use.edge)!;
      const pcurve = !use.pcurve || (extended === chart && edge === edges.get(uses.get(use.id)!.edge)) ? use.pcurve
        : lineCurve(use.pcurve.id, uvPoint(extended, edge.curve.controlPoints[0]), uvPoint(extended, edge.curve.controlPoints[1]));
      nextUses.push({ ...use, pcurve, next: cycle[(i + 1) % cycle.length].id, prev: cycle[(i + cycle.length - 1) % cycle.length].id });
    }
  }
  return { ...brep, shells: [{ ...shell, faces: shell.faces.filter(id => id !== selected.id) }],
    faces: nextFaces, loops: nextLoops, coedges: nextUses, edges: nextEdges, vertices: nextVertices };
}
