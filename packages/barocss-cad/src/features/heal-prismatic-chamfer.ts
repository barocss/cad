import { BrepError, checkBrep, lineCurve, type Brep, type BrepCoedge, type BrepEdge, type BrepFace, type BrepLoop } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import type { CurveSegment2, XY } from '../brep/curved-arrangement.js';
import { evaluateSurface } from '../core/math.js';
import { dist, dot, sub } from '../core/vec3.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import type { Curve, Point } from '../types.js';
import { boxCapOffsetFrame } from './drafted-cap-offset.js';
import { isSharpLAtConvexCorner } from './cardinal-l-section.js';
import { affineChart, coverAffineTrim, trimFits, uvPoint } from './prism-wall-offset.js';
import { brepFromPrismatic, type PrismaticSolid } from './prismatic-solid.js';

const byId = <T extends { readonly id: string }>(items: readonly T[]) => new Map(items.map(item => [item.id, item]));
const samePoint = (a: Point, b: Point) => a.every((value, axis) => value === b[axis]);
const startOf = (edge: BrepEdge, use: BrepCoedge) => edge.vertices[use.sense === 'forward' ? 0 : 1];
const axes = [0, 1, 2] as const;
type Axis = typeof axes[number];
type Neighbor = { edge: BrepEdge; twin: BrepCoedge; loop: BrepLoop };
type Support = { axis: Axis; at: number; sign: number };
type SectionLine = Extract<CurveSegment2, { kind: 'line' }>;

function restoredLChamfer(outer: readonly SectionLine[], bevel: SectionLine, sharpEdgeName: string, tolerance: number, roundoff: number): SectionLine[] | undefined {
  const index = outer.indexOf(bevel), before = outer[(index + outer.length - 1) % outer.length], after = outer[(index + 1) % outer.length];
  const along = ({ a, b }: SectionLine) => a[1] === b[1] && a[0] !== b[0] ? 0 : a[0] === b[0] && a[1] !== b[1] ? 1 : undefined;
  const u = along(before), v = along(after);
  if (u === undefined || v === undefined || u === v || !before.tag || !after.tag
    || [before.tag, after.tag].sort().join('|') !== sharpEdgeName
    || !samePoint([...before.b, 0], [...bevel.a, 0]) || !samePoint([...bevel.b, 0], [...after.a, 0])) return;
  const corner: XY = u === 0 ? [after.a[0], before.b[1]] : [before.b[0], after.a[1]];
  const first = (corner[u] - before.b[u]) * Math.sign(before.b[u] - before.a[u]);
  const second = (after.a[v] - corner[v]) * Math.sign(after.b[v] - after.a[v]);
  if (!(first > 2 * tolerance && second > 2 * tolerance) || Math.abs(first - second) > roundoff) return;
  const repaired = outer.filter(line => line !== bevel).map(line => line === before ? { ...line, b: corner } : line === after ? { ...line, a: corner } : line);
  return isSharpLAtConvexCorner(repaired, corner, tolerance) ? repaired : undefined;
}

function nativeLine(curve: Curve): boolean {
  return curve.degree === 1 && curve.controlPoints.length === 2 && curve.knots.length === 4
    && curve.knots.every((value, i) => value === (i < 2 ? 0 : 1)) && curve.weights.length === 2 && curve.weights.every(weight => weight === 1);
}

function exactBevelTrim(brep: Brep, face: BrepFace, corners: readonly Point[]): boolean {
  const loop = brep.loops.find(loop => loop.id === face.loops[0]);
  if (!loop || loop.face !== face.id || loop.kind !== 'outer' || loop.coedges.length !== 4) return false;
  const uses = byId(brep.coedges), edges = byId(brep.edges), vertices = byId(brep.vertices);
  const expected = new Set(['0,1', '0,2', '1,3', '2,3']);
  const uv: Point[] = [[0, 0, 0], [0, 1, 0], [1, 0, 0], [1, 1, 0]];
  for (const id of loop.coedges) {
    const use = uses.get(id), edge = use && edges.get(use.edge), trim = use?.pcurve;
    if (!edge || !trim || !nativeLine(edge.curve) || !nativeLine(trim)) return false;
    const slots = edge.curve.controlPoints.map(point => corners.findIndex(corner => samePoint(point, corner)));
    if (slots.some(slot => slot < 0) || !expected.delete([...slots].sort((a, b) => a - b).join(','))) return false;
    if (!edge.curve.controlPoints.every((point, i) => {
      const vertex = vertices.get(edge.vertices[i]);
      return vertex && samePoint(vertex.point, point) && samePoint(trim.controlPoints[i], uv[slots[i]]);
    })) return false;
  }
  return expected.size === 0;
}

function fullHeightLBevel(brep: Brep, face: BrepFace, bevel: SectionLine, lo: number, hi: number): boolean {
  const { surface } = face, knots = [0, 0, 1, 1];
  if (face.sense !== 'forward' || face.loops.length !== 1 || surface.kind !== 'surface' || surface.degreeU !== 1 || surface.degreeV !== 1
    || surface.controlPoints.length !== 2 || surface.weights.length !== 2
    || !surface.knotsU.every((value, i) => value === knots[i]) || surface.knotsU.length !== 4
    || !surface.knotsV.every((value, i) => value === knots[i]) || surface.knotsV.length !== 4) return false;
  const ends = [bevel.a, bevel.b];
  if (!surface.controlPoints.every((row, i) => row.length === 2 && row.every((point, j) => samePoint(point, [...ends[i], j === 0 ? lo : hi])))
    || !surface.weights.every(row => row.length === 2 && row.every(weight => weight === 1))) return false;
  const support = faceGeometry(face), dx = bevel.b[0] - bevel.a[0], dy = bevel.b[1] - bevel.a[1], length = Math.hypot(dx, dy);
  return support.kind === 'plane' && support.n.every((value, i) => Math.abs(value - [dy / length, -dx / length, 0][i]) <= 64 * Number.EPSILON)
    && exactBevelTrim(brep, face, surface.controlPoints.flat());
}

/** Restore one full-height equal-distance outside bevel on an authored cardinal L prism. Native names survive; IDs are rebuilt. */
export function healConvexLPrismaticChamferIfAdmitted(solid: PrismaticSolid, brep: Brep, faceName: string, sharpEdgeName: string, resultId: string): Brep | undefined {
  const [slab] = solid.slabs, [body] = brep.bodies, [shell] = brep.shells;
  if (solid.slabs.length !== 1 || slab.regions.length !== 1 || slab.regions[0].holes.length || brep.source.family !== 'prismatic-solid'
    || brep.bodies.length !== 1 || body.kind !== 'solid' || brep.shells.length !== 1 || !shell.closed
    || brep.faces.length !== 9 || brep.loops.length !== 9 || brep.coedges.length !== 42 || brep.edges.length !== 21 || brep.vertices.length !== 14) return;
  const region = slab.regions[0], lines = region.outer.filter((segment): segment is SectionLine => segment.kind === 'line');
  const bevels = lines.filter(line => line.tag === faceName), faces = brep.faces.filter(face => face.name === faceName);
  if (region.outer.length !== 7 || lines.length !== 7 || bevels.length !== 1 || faces.length !== 1) return;
  const extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point), lines.flatMap(line => [line.a, line.b]));
  const tolerance = linearToleranceMM(extent), roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  if (!(extent <= CadNumericPolicy.coordinateAbs && slab.z1 - slab.z0 > tolerance)
    || !fullHeightLBevel(brep, faces[0], bevels[0], slab.z0, slab.z1) || !checkBrep(brep, { strict: true }).valid) return;
  const repaired = restoredLChamfer(lines, bevels[0], sharpEdgeName, tolerance, roundoff);
  if (!repaired) return;
  const healed = brepFromPrismatic({ ...solid, slabs: [{ ...slab, regions: [{ ...region, outer: repaired }] }] }, { id: resultId });
  const report = checkBrep(healed, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Delete face: the healed L-prism is invalid: ${report.issues[0]}`, report);
  const retainedNames = new Set(healed.faces.map(face => face.name));
  if (healed.faces.length !== 8 || brep.faces.some(face => face !== faces[0] && !retainedNames.has(face.name))
    || healed.edges.filter(edge => edge.name === sharpEdgeName).length !== 1)
    throw new BrepError('TOPOLOGY', 'Delete face: the healed L-prism did not retain its original wall, cap and sharp edge names');
  return healed;
}

/** Heal one equal-leg convex bevel along a full-height corner of an upright rectangular box. */
export function healPrismaticChamferIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string): Brep | undefined {
  const edit = readVerticalChamfer(brep, faceName, [sharpEdgeName]);
  if (!edit) return undefined;
  const healed = rebuildVerticalCorner(brep, edit, 0);
  return healed && boxCapOffsetFrame(healed, edit.capName) ? healed : undefined;
}

/** Heal one selected full-height bevel from a single pair of opposite corners of an upright box. */
export function healOppositePrismaticChamferIfAdmitted(brep: Brep, faceName: string, sharpEdges: readonly string[]): Brep | undefined {
  return healChamferPair(brep, faceName, sharpEdges, 'opposite');
}

/** Heal one selected full-height bevel from a single pair sharing an intact wall of an upright box. */
export function healAdjacentPrismaticChamferIfAdmitted(brep: Brep, faceName: string, sharpEdges: readonly string[]): Brep | undefined {
  return healChamferPair(brep, faceName, sharpEdges, 'adjacent');
}

function healChamferPair(brep: Brep, faceName: string, sharpEdges: readonly string[], arrangement: 'opposite' | 'adjacent'): Brep | undefined {
  if (sharpEdges.length !== 2 || new Set(sharpEdges).size !== 2) return undefined;
  const bevels = [`${brep.source.id}.face#1`, `${brep.source.id}.face#2`];
  if (!bevels.includes(faceName)) return undefined;
  const peerName = bevels.find(name => name !== faceName)!;
  const edit = readVerticalChamfer(brep, faceName, sharpEdges), peer = readVerticalChamfer(brep, peerName, sharpEdges);
  if (!edit || !peer || edit.sharpEdgeName === peer.sharpEdgeName
    || Math.abs(edit.leg - peer.leg) > edit.source.roundoff
    || edit.rails.some(rail => !peer.rails.some(other => other.loop === rail.loop))) return undefined;
  const sharedX = edit.xSeam.loop === peer.xSeam.loop, sharedY = edit.ySeam.loop === peer.ySeam.loop;
  let sharedWall: BrepLoop | undefined;
  if (arrangement === 'opposite') {
    if (sharedX || sharedY || edit.sx !== -peer.sx || edit.sy !== -peer.sy) return undefined;
  } else {
    if (sharedX === sharedY) return undefined;
    const spanAxis = sharedX ? 1 : 0;
    const seam = sharedX ? edit.xSeam : edit.ySeam, other = sharedX ? peer.xSeam : peer.ySeam;
    const sign = sharedX ? edit.sy : edit.sx, otherSign = sharedX ? peer.sy : peer.sx;
    const web = sign * (seam.edge.curve.controlPoints[0][spanAxis] - other.edge.curve.controlPoints[0][spanAxis]);
    if (sign !== -otherSign || web <= edit.source.linear || seam.twin.next === other.twin.id || seam.twin.prev === other.twin.id) return undefined;
    sharedWall = seam.loop;
  }

  const healed = rebuildVerticalCorner(brep, edit, 1);
  if (!healed || !keepsPeerBevel(healed, peer.source, sharedWall)) return undefined;
  // Certify the remaining shape as the existing one-bevel rectangular stock. Publish only the first repair.
  return healPrismaticChamferIfAdmitted(healed, peerName, peer.sharpEdgeName) ? healed : undefined;
}

const sameIncidence = (a: BrepCoedge, b: BrepCoedge) => a.edge === b.edge && a.loop === b.loop && a.sense === b.sense
  && a.next === b.next && a.prev === b.prev && a.twin === b.twin;

function keepsPeerBevel(brep: Brep, { selected, loops, neighbors, uses, vertices, roundoff }: Chamfer, sharedWall?: BrepLoop): boolean {
  const nextLoops = byId(brep.loops), nextUses = byId(brep.coedges), nextEdges = byId(brep.edges), nextVertices = byId(brep.vertices);
  const chart = brep.faces.find(face => face.id === sharedWall?.face)?.surface;
  return brep.faces.includes(selected) && nextLoops.get(selected.loops[0]) === loops.get(selected.loops[0])
    && neighbors.every(({ edge, twin, loop }) => {
      const own = uses.get(twin.twin!)!, nextTwin = nextUses.get(twin.id), nextOwn = nextUses.get(own.id);
      if (!nextTwin || !nextOwn || nextEdges.get(edge.id) !== edge || edge.vertices.some(id => nextVertices.get(id) !== vertices.get(id))
        || !sameIncidence(nextTwin, twin) || !sameIncidence(nextOwn, own) || nextOwn.pcurve !== own.pcurve) return false;
      if (loop !== sharedWall) return nextTwin.pcurve === twin.pcurve;
      // Only the wall chart spans more of its plane. Its affine UV line must lift to the same two world poles.
      const trim = nextTwin.pcurve;
      return chart?.kind === 'surface' && !!trim && trim.id === twin.pcurve?.id && trim.degree === 1 && trim.controlPoints.length === 2
        && trim.weights.length === 2 && trim.weights.every(weight => weight === 1)
        && trim.controlPoints.every(([u, v], i) => dist(evaluateSurface(chart, u, v), edge.curve.controlPoints[i]) <= roundoff);
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
  const corner = readBoxCornerTrim(brep, faceName, sharpEdges);
  if (!corner) return undefined;
  const bevel = corner.chartByFace.get(corner.selected.id);
  if (!bevel || !bevel.normal.every(Number.isFinite)
    || corner.neighbors.some(({ edge }) => edge.curve.controlPoints.some(point => !trimFits(bevel, point, corner.roundoff)))) return undefined;
  return { ...corner, bevel };
}

/** Read the closed trim of a bounded box-corner finish. Each caller proves its removed face geometry. */
export function readBoxCornerTrim(brep: Brep, faceName: string, sharpEdges: readonly string[], curvedRails = false) {
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
  const extent = geometryScaleMM(brep.vertices.map(vertex => vertex.point));
  if (!(extent <= CadNumericPolicy.coordinateAbs)) return undefined;
  const linear = linearToleranceMM(extent), roundoff = 64 * Number.EPSILON * Math.max(1, extent);
  const selectedLoop = loops.get(selected.loops[0])!;
  if (selectedLoop.coedges.length !== 4) return undefined;
  const neighbors: Neighbor[] = selectedLoop.coedges.map(id => {
    const use = uses.get(id)!, twin = uses.get(use.twin!)!;
    return { edge: edges.get(use.edge)!, twin, loop: loops.get(twin.loop)! };
  });
  if (new Set(neighbors.map(item => item.loop.face)).size !== 4) return undefined;
  for (const edge of brep.edges) {
    const { curve } = edge, poles = curve.controlPoints;
    if (!samePoint(vertices.get(edge.vertices[0])!.point, poles[0]) || !samePoint(vertices.get(edge.vertices[1])!.point, poles.at(-1)!)) return undefined;
    if (curvedRails && curve.degree === 2 && neighbors.some(neighbor => neighbor.edge === edge)) continue;
    if (curve.degree !== 1 || poles.length !== 2 || curve.weights.length !== 2 || curve.weights.some(weight => weight !== 1)
      || curve.knots.length !== 4 || curve.knots.some((knot, i) => knot !== (i < 2 ? 0 : 1))) return undefined;
  }
  return { shell, selected, loops, uses, edges, vertices, chartByFace, neighbors, linear, roundoff };
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
  const corner = readHorizontalBoxCorner(brep, source, sharpEdgeName);
  if (!corner) return undefined;
  const { cap, wall, spanAxis, wallSeam, capSeam, rails, points, remap, capName } = corner;
  const { bevel } = source;
  const normalSlack = 64 * Number.EPSILON;
  if (Math.abs(bevel.normal[spanAxis]) > normalSlack || Math.abs(bevel.normal[cap.axis] - cap.sign * Math.SQRT1_2) > normalSlack
    || Math.abs(bevel.normal[wall.axis] - wall.sign * Math.SQRT1_2) > normalSlack || !clearsBevel(brep, source, [wallSeam, capSeam])) return undefined;
  const healed = rebuildSharpCorner(brep, source, wallSeam, capSeam, rails, points, remap, sharpEdgeName, 0);
  return healed && boxCapOffsetFrame(healed, capName) ? healed : undefined;
}

/** Prove six original cardinal supports and the mate topology for one horizontal box corner. */
export function readHorizontalBoxCorner(brep: Brep, source: NonNullable<ReturnType<typeof readBoxCornerTrim>>, sharpEdgeName: string) {
  const { selected, chartByFace, neighbors, vertices, loops, uses, edges, linear, roundoff } = source;
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
  if (seams.length !== 2 || rails.length !== 2 || sharpName(brep, seams) !== sharpEdgeName) return undefined;
  const capSeam = seams.find(({ loop }) => supports.get(loop.face)!.axis === 2);
  const wallSeam = seams.find(({ loop }) => supports.get(loop.face)!.axis !== 2);
  if (!capSeam || !wallSeam) return undefined;
  const cap = supports.get(capSeam.loop.face)!, wall = supports.get(wallSeam.loop.face)!;
  const spanAxis: 0 | 1 = wall.axis === 0 ? 1 : 0;

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

  // Native intersections can leave machine rounding at a vertex. Use only its actual incident
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
  const [lo, hi] = [...exactSpanEnds].sort((a, b) => a - b);
  return { cap, wall, spanAxis, wallSeam, capSeam, rails, points, remap, capName, lo, hi, leg: firstLeg! };
}

export function rebuildSharpCorner(brep: Brep, source: NonNullable<ReturnType<typeof readBoxCornerTrim>>, keepSeam: Neighbor, discardSeam: Neighbor, rails: readonly Neighbor[],
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
    const sameChart = extended.surface === face.surface;
    nextFaces.push(sameChart ? face : { ...face, surface: extended.surface });
    nextLoops.push(cycle.length === loop.coedges.length ? loop : { ...loop, coedges: cycle.map(use => use.id) });
    for (const [i, use] of cycle.entries()) {
      const edge = edgeById.get(use.edge)!;
      const pcurve = !use.pcurve || (sameChart && edge === edges.get(uses.get(use.id)!.edge)) ? use.pcurve
        : lineCurve(use.pcurve.id, uvPoint(extended, edge.curve.controlPoints[0]), uvPoint(extended, edge.curve.controlPoints[1]));
      nextUses.push({ ...use, pcurve, next: cycle[(i + 1) % cycle.length].id, prev: cycle[(i + cycle.length - 1) % cycle.length].id });
    }
  }
  return { ...brep, shells: [{ ...shell, faces: shell.faces.filter(id => id !== selected.id) }],
    faces: nextFaces, loops: nextLoops, coedges: nextUses, edges: nextEdges, vertices: nextVertices };
}
