import { faceGeometry } from '../brep/analytic-boolean.js';
import { BrepError, checkBrep, type Brep, type BrepFace } from '../brep/brep-core.js';
import { circleOf } from '../brep/brep-tessellate.js';
import { segEnd, segStart, type CurveSegment2, type XY } from '../brep/curved-arrangement.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
import { dist } from '../core/vec3.js';
import type { Point } from '../types.js';
import { boxCapOffsetFrame } from './drafted-cap-offset.js';
import { readBoxCornerTrim, readHorizontalBoxCorner, rebuildSharpCorner } from './heal-prismatic-chamfer.js';
import { affineChart } from './prism-wall-offset.js';
import { brepFromPrismatic, type PrismaticSolid } from './prismatic-solid.js';

type Line = Extract<CurveSegment2, { kind: 'line' }>;
type Arc = Extract<CurveSegment2, { kind: 'arc' }>;
const samePoint = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];
const closePoint = (a: XY, b: XY, tolerance: number) => Math.hypot(a[0] - b[0], a[1] - b[1]) <= tolerance;
const axis = ({ a, b }: Line) => a[1] === b[1] && a[0] !== b[0] ? 0 : a[0] === b[0] && a[1] !== b[1] ? 1 : undefined;

/** The six straight walls must enclose one orthogonal L, with the recovered corner its sole reflex vertex. */
function isSharpL(lines: readonly Line[], corner: XY, tolerance: number): boolean {
  const vertices = lines.map(line => line.a);
  const xs = [...new Set(vertices.map(([x]) => x))].sort((a, b) => a - b);
  const ys = [...new Set(vertices.map(([, y]) => y))].sort((a, b) => a - b);
  if (xs.length !== 3 || ys.length !== 3 || corner[0] !== xs[1] || corner[1] !== ys[1]
    || xs[1] - xs[0] <= tolerance || xs[2] - xs[1] <= tolerance
    || ys[1] - ys[0] <= tolerance || ys[2] - ys[1] <= tolerance
    || new Set(vertices.map(point => point.join(','))).size !== 6) return false;
  return lines.every((line, index) => {
    const next = lines[(index + 1) % lines.length], firstAxis = axis(line), nextAxis = axis(next);
    if (!samePoint(line.b, next.a) || firstAxis === undefined || nextAxis === undefined || firstAxis === nextAxis) return false;
    const first = line.b[firstAxis] - line.a[firstAxis], second = next.b[nextAxis] - next.a[nextAxis];
    const turn = Math.sign(first) * Math.sign(second) * (firstAxis === 0 ? 1 : -1);
    return turn === (samePoint(line.b, corner) ? -1 : 1);
  });
}

function restoreSection(outer: readonly CurveSegment2[], arc: Arc, tolerance: number): Line[] | undefined {
  const index = outer.indexOf(arc), before = outer[(index + outer.length - 1) % outer.length], after = outer[(index + 1) % outer.length];
  if (before.kind !== 'line' || after.kind !== 'line') return undefined;
  const u = axis(before), v = axis(after);
  if (u === undefined || v === undefined || u === v) return undefined;
  const corner: XY = u === 0 ? [after.a[0], before.b[1]] : [before.b[0], after.a[1]];
  const setbacks = [
    (corner[u] - before.b[u]) * Math.sign(before.b[u] - before.a[u]),
    (after.a[v] - corner[v]) * Math.sign(after.b[v] - after.a[v]),
  ];
  const centre: XY = [before.b[0] + (after.a[0] - corner[0]), before.b[1] + (after.a[1] - corner[1])];
  if (setbacks.some(back => Math.abs(back - arc.r) > tolerance)
    || !closePoint(arc.c, centre, tolerance)
    || !closePoint(segStart(arc), before.b, tolerance) || !closePoint(segEnd(arc), after.a, tolerance)) return undefined;

  const repaired: Line[] = [];
  for (const segment of outer) {
    if (segment.kind !== 'line') continue;
    repaired.push(segment === before ? { ...segment, b: corner } : segment === after ? { ...segment, a: corner } : segment);
  }
  return isSharpL(repaired, corner, tolerance) ? repaired : undefined;
}

function isFullHeightCarrier(face: BrepFace, arc: Arc, lo: number, hi: number, tolerance: number): boolean {
  const { surface } = face;
  if (face.loops.length !== 1 || surface.kind !== 'surface' || surface.degreeU !== 2 || surface.degreeV !== 1
    || surface.controlPoints.length !== 3 || surface.controlPoints.some(row => row.length !== 2 || row[0][2] !== lo || row[1][2] !== hi)) return false;
  const cylinder = faceGeometry(face);
  return cylinder.kind === 'cylinder' && cylinder.out === -1 && cylinder.a[0] === 0 && cylinder.a[1] === 0
    && Math.abs(cylinder.r - arc.r) <= tolerance && closePoint([cylinder.c[0], cylinder.c[1]], arc.c, tolerance);
}

/** Extend the two walls through the sole concave quarter-cylinder of a one-slab L prism. */
export function healPrismaticFilletIfAdmitted(solid: PrismaticSolid, brep: Brep, faceName: string, resultId: string): Brep | undefined {
  const [slab] = solid.slabs;
  if (solid.slabs.length !== 1 || slab.regions.length !== 1) return undefined;
  const [region] = slab.regions, { outer } = region;
  if (region.holes.length || outer.length !== 7) return undefined;
  const arcs = outer.filter(segment => segment.kind === 'arc'), [arc] = arcs;
  if (arcs.length !== 1 || arc.tag !== faceName || outer.some(segment => segment.kind === 'curve')) return undefined;
  const [body] = brep.bodies, [shell] = brep.shells;
  if (brep.bodies.length !== 1 || body.kind !== 'solid' || brep.shells.length !== 1 || !shell.closed || brep.faces.length !== 9) return undefined;
  const faces = brep.faces.filter(face => face.name === faceName), [face] = faces;
  if (faces.length !== 1) return undefined;

  const scale = geometryScaleMM(brep.vertices.map(vertex => vertex.point)), tolerance = linearToleranceMM(scale);
  if (!(scale <= CadNumericPolicy.coordinateAbs && slab.z1 - slab.z0 > tolerance
    && Number.isFinite(arc.r) && arc.r > 2 * tolerance
    && Math.abs(arc.sweep + Math.PI / 2) <= CadNumericPolicy.parameterWidth)) return undefined;
  if (!checkBrep(brep, { strict: true }).valid || !isFullHeightCarrier(face, arc, slab.z0, slab.z1, tolerance)) return undefined;
  const repaired = restoreSection(outer, arc, tolerance);
  if (!repaired) return undefined;

  const result = brepFromPrismatic({ ...solid, slabs: [{ ...slab, regions: [{ ...region, outer: repaired }] }] }, { id: resultId });
  const report = checkBrep(result, { strict: true });
  if (!report.valid) throw new BrepError('GEOMETRY', `Delete face: the healed L-prism is invalid: ${report.issues[0]}`, report);
  const retainedNames = new Set(result.faces.map(candidate => candidate.name));
  if (result.faces.length !== 8 || brep.faces.some(original => original !== face && !retainedNames.has(original.name)))
    throw new BrepError('TOPOLOGY', 'Delete face: the healed L-prism did not retain the original wall and cap names');
  return result;
}

type CornerTrim = NonNullable<ReturnType<typeof readBoxCornerTrim>>;
type Neighbor = CornerTrim['neighbors'][number];
const angularRoundoff = 64 * Number.EPSILON;

function filletWall(source: CornerTrim, seam: Neighbor, axis: 0 | 1) {
  const chart = source.chartByFace.get(seam.loop.face);
  if (!chart || Math.abs(chart.normal[axis]) < 1 - angularRoundoff
    || chart.normal.some((value, i) => i !== axis && Math.abs(value) > angularRoundoff)) return undefined;
  const ids = new Set(seam.loop.coedges.flatMap(id => source.edges.get(source.uses.get(id)!.edge)!.vertices));
  const far = [...ids].filter(id => !seam.edge.vertices.includes(id)).map(id => source.vertices.get(id)!.point);
  if (far.length !== 2 || far[0][2] === far[1][2] || far[0][0] !== far[1][0] || far[0][1] !== far[1][1]) return undefined;
  // The untrimmed vertical edge still carries the exact original wall coordinate.
  const at = far[0][axis], sign = Math.sign(chart.normal[axis]);
  const [a, b] = seam.edge.curve.controlPoints;
  if (a[2] === b[2] || a[0] !== b[0] || a[1] !== b[1] || Math.abs(a[axis] - at) > source.roundoff
    || chart.surface.controlPoints.flat().some(point => Math.abs(point[axis] - at) > source.roundoff)) return undefined;
  return { seam, chart, axis, at, sign };
}

function fullQuarterCylinder(source: CornerTrim, rails: readonly Neighbor[], lo: number, hi: number, corner: XY, centre: XY, radius: number,
  spanAxis: 0 | 1 | 2 = 2): boolean {
  const { selected, roundoff } = source, { surface } = selected;
  const quarterKnots = (knots: readonly number[]) => knots.length === 6 && knots.every((knot, i) => knot === (i < 3 ? 0 : 1));
  const transverse = [0, 1, 2].filter(axis => axis !== spanAxis);
  const section = (p: Point): XY => [p[transverse[0]], p[transverse[1]]];
  if (surface.kind !== 'surface' || surface.degreeU !== 2 || !quarterKnots(surface.knotsU) || surface.degreeV !== 1
    || surface.knotsV.length !== 4 || surface.knotsV.some((knot, i) => knot !== (i < 2 ? 0 : 1))
    || surface.controlPoints.length !== 3 || surface.controlPoints.some(row => row.length !== 2 || !samePoint(section(row[0]), section(row[1])))
    || surface.weights.some(row => row[0] !== row[1])) return false;
  const stations = surface.controlPoints[0].map(point => point[spanAxis]);
  if (!(stations[0] === lo && stations[1] === hi) && !(spanAxis !== 2 && stations[0] === hi && stations[1] === lo)) return false;
  if (surface.controlPoints.some(row => row.some((point, i) => point[spanAxis] !== stations[i]))) return false;
  // Analytic Boolean end rails are independently generated from the same circle.
  const weightRoundoff = spanAxis === 2 ? 0 : angularRoundoff;
  for (const { edge } of rails) {
    const { curve } = edge, [a, mid, b] = curve.controlPoints;
    if (curve.degree !== 2 || !mid || !b || curve.controlPoints.length !== 3 || !quarterKnots(curve.knots)
      || !closePoint(section(mid), corner, roundoff) || a[spanAxis] !== mid[spanAxis] || a[spanAxis] !== b[spanAxis]) return false;
    const atEnd = stations.indexOf(a[spanAxis]);
    if (atEnd < 0) return false;
    const matches = (reverse: boolean) => surface.controlPoints.every((row, i) => {
      const j = reverse ? 2 - i : i;
      return dist(row[atEnd], curve.controlPoints[j]) <= roundoff && Math.abs(surface.weights[i][atEnd] - curve.weights[j]) <= weightRoundoff;
    });
    if (!matches(false) && !matches(true)) return false;
    const circle = circleOf(curve);
    if (!circle || circle.spans.length !== 1 || Math.abs(circle.spans[0].phi - Math.PI / 2) > CadNumericPolicy.parameterWidth
      || Math.abs(circle.r - radius) > roundoff || !closePoint(section(circle.c), centre, roundoff)) return false;
  }
  const cylinder = faceGeometry(selected);
  return cylinder.kind === 'cylinder' && cylinder.out === 1 && Math.abs(cylinder.a[spanAxis]) === 1
    && transverse.every(axis => cylinder.a[axis] === 0) && Math.abs(cylinder.r - radius) <= roundoff && closePoint(section(cylinder.c), centre, roundoff);
}

/** Restore one full-height convex circular fillet to the sharp corner of its original rectangular stock. */
export function healConvexPrismaticFilletIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string): Brep | undefined {
  if (brep.source.family !== 'prismatic-solid' || brep.coedges.some(use => !use.pcurve)) return undefined;
  const source = readBoxCornerTrim(brep, faceName, [sharpEdgeName], true);
  if (!source) return undefined;
  const { chartByFace, neighbors, vertices, linear, roundoff } = source;
  const levels = [...new Set(brep.vertices.map(({ point }) => point[2]))].sort((a, b) => a - b), [lo, hi] = levels;
  if (levels.length !== 2 || hi - lo <= linear) return undefined;
  const rails = neighbors.filter(({ edge }) => edge.curve.degree === 2);
  const seams = neighbors.filter(({ edge }) => edge.curve.degree === 1);
  if (rails.length !== 2 || seams.length !== 2 || rails[0].edge.curve.controlPoints[0][2] === rails[1].edge.curve.controlPoints[0][2]
    || rails.some(({ loop, edge }) => loop.coedges.length !== 5 || seams.some(seam => seam.edge.vertices.filter(id => edge.vertices.includes(id)).length !== 1))
    || seams.some(({ loop }) => loop.coedges.length !== 4)
    || seams.map(({ loop }) => brep.faces.find(face => face.id === loop.face)!.name).sort().join('|') !== sharpEdgeName) return undefined;

  const x = filletWall(source, seams[0], 0) ?? filletWall(source, seams[1], 0);
  const y = filletWall(source, seams[0], 1) ?? filletWall(source, seams[1], 1);
  if (!x || !y) return undefined;
  const corner: XY = [x.at, y.at];
  const [a] = x.seam.edge.curve.controlPoints, [b] = y.seam.edge.curve.controlPoints;
  const rx = x.sign * (x.at - b[0]), ry = y.sign * (y.at - a[1]);
  if (!(rx > 2 * linear && ry > 2 * linear) || Math.abs(rx - ry) > roundoff) return undefined;
  const centre: XY = [b[0], a[1]];
  if (!fullQuarterCylinder(source, rails, lo, hi, corner, centre, rx)) return undefined;

  // Circle endpoint trigonometry can put a tangent wall a few ulps off its original support.
  // Recover only the fixed coordinate of the two certified walls, then continue their affine trims.
  for (const wall of [x, y]) {
    const { axis, at, chart } = wall;
    if (chart.surface.controlPoints.flat().every(point => point[axis] === at)) continue;
    const face = brep.faces.find(face => face.id === wall.seam.loop.face)!;
    const controlPoints = chart.surface.controlPoints.map(row => row.map(point => {
      const exact: Point = [...point];
      exact[axis] = at;
      return exact;
    }));
    const exact = affineChart({ ...chart.surface, controlPoints }, face.sense);
    if (!exact) return undefined;
    chartByFace.set(face.id, exact);
  }
  const points = new Map(x.seam.edge.vertices.map(id => [id, [x.at, y.at, vertices.get(id)!.point[2]] as Point]));
  const remap = new Map(y.seam.edge.vertices.map(id => [id, x.seam.edge.vertices.find(keep => vertices.get(keep)!.point[2] === vertices.get(id)!.point[2])!]));
  const healed = rebuildSharpCorner(brep, source, x.seam, y.seam, rails, points, remap, sharpEdgeName, 0);
  const cap = brep.faces.find(face => face.id === rails[0].loop.face)!.name!;
  return healed && boxCapOffsetFrame(healed, cap) ? healed : undefined;
}

/** Restore one full-span outside circular fillet between a cap and a side of a straight rectangular box. */
export function healHorizontalPrismaticFilletIfAdmitted(brep: Brep, faceName: string, sharpEdgeName: string): Brep | undefined {
  if (brep.source.family !== 'analytic-boolean' || brep.coedges.some(use => use.pcurve !== null)) return undefined;
  const source = readBoxCornerTrim(brep, faceName, [sharpEdgeName], true);
  if (!source) return undefined;
  const corner = readHorizontalBoxCorner(brep, source, sharpEdgeName);
  if (!corner) return undefined;
  const { cap, wall, spanAxis, lo, hi, leg, wallSeam, capSeam, rails, points, remap, capName } = corner;
  if (leg <= 2 * source.linear || wallSeam.edge.curve.degree !== 1 || capSeam.edge.curve.degree !== 1) return undefined;
  const centre: XY = [wall.at - wall.sign * leg, cap.at - cap.sign * leg];
  if (!fullQuarterCylinder(source, rails, lo, hi, [wall.at, cap.at], centre, leg, spanAxis)) return undefined;
  const healed = rebuildSharpCorner(brep, source, wallSeam, capSeam, rails, points, remap, sharpEdgeName, 0);
  return healed && boxCapOffsetFrame(healed, capName) ? healed : undefined;
}
