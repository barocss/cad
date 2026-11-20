import { faceGeometry } from '../brep/analytic-boolean.js';
import { BrepError, checkBrep, type Brep, type BrepFace } from '../brep/brep-core.js';
import { segEnd, segStart, type CurveSegment2, type XY } from '../brep/curved-arrangement.js';
import { CadNumericPolicy, geometryScaleMM, linearToleranceMM } from '../numeric-policy.js';
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
