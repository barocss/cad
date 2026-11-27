import { checkBrep, lineCurve, type Brep } from '../brep/brep-core.js';
import { CadNumericPolicy, linearToleranceMM } from '../numeric-policy.js';
import type { Point, Surface } from '../types.js';
import { cardinalBoxOf } from './part-box-shell.js';
import type { Tools } from './part-model.js';

type Ranges = readonly (readonly number[])[];
type CardinalBox = NonNullable<ReturnType<typeof cardinalBoxOf>>;
type BoxSide = { readonly axis: 0 | 1 | 2; readonly side: 0 | 1 };

/** A plane covering the trim with poles inside the result's bounds. */
function boxDraftPlane(id: string, axis: 0 | 1 | 2, side: 0 | 1, base: Ranges, top: Ranges): Surface {
  const cap = side === 0 ? base : top;
  let controlPoints: Point[][];
  if (axis === 2) {
    controlPoints = cap[0].map(x => cap[1].map((y): Point => [x, y, cap[2][side]]));
  } else {
    // Across the side, cover both cap spans. Along the pull, follow the side's turned support.
    const across = axis === 0 ? 1 : 0;
    const span = [Math.min(base[across][0], top[across][0]), Math.max(base[across][1], top[across][1])];
    controlPoints = span.map(u => [base, top].map((end, j): Point => {
      const v = end[axis][side], z = end[2][j];
      return axis === 0 ? [v, u, z] : [u, v, z];
    }));
  }
  return { kind: 'surface', id, degreeU: 1, degreeV: 1, knotsU: [0, 0, 1, 1], knotsV: [0, 0, 1, 1],
    controlPoints, weights: [[1, 1], [1, 1]] };
}

/** Draft original box sides and retain one intersection at each cap. */
export function draftBoxCorner(brep: Brep, names: readonly string[], neutral: number, angle: number, id: string, fail: Tools['fail']): Brep | undefined {
  if ((names.length !== 2 && names.length !== 3 && names.length !== 4) || new Set(names).size !== names.length) return undefined;
  const chosen = names.map(name => brep.faces.filter(face => face.name === name));
  if (chosen.some(faces => faces.length !== 1)) return undefined;
  const box = cardinalBoxOf(brep);
  if (!box) return undefined;
  const sides = chosen.map(([face]) => box.sides.get(face.id)!);
  // Both transverse axes must participate. Two opposite faces use the existing wedge path.
  if (sides.some(side => side.axis === 2) || new Set(sides.map(side => side.axis)).size !== 2) return undefined;
  const [start, end] = box.ranges[2];
  // Four sides retain the existing whole-extrusion and raw noninterior routes.
  if (names.length === 4 && !(neutral > start && neutral < end)) return undefined;
  if (neutral < start) fail('CAPABILITY', 'Draft on adjacent box sides needs the neutral plane at the start of the pull');
  if (neutral >= end) return undefined;
  return rebuildDraftedBox(brep, box, sides, neutral, angle, id, fail);
}

/** Turn one box face about its exact shared edge with the pull's start face. */
export function draftBoxHinge(brep: Brep, name: string, edgeName: string, angle: number, id: string, fail: Tools['fail']): Brep {
  const box = cardinalBoxOf(brep);
  if (!box) return fail('CAPABILITY', 'Draft about an edge needs one closed cardinal box.');
  const faces = brep.faces.filter(face => face.name === name);
  const edges = brep.edges.filter(edge => edge.name === edgeName);
  if (faces.length !== 1 || edges.length !== 1)
    return fail('REFERENCE', 'The original Draft face or edge is missing or ambiguous.');

  const [face] = faces, [edge] = edges, side = box.sides.get(face.id)!;
  const uses = brep.coedges.filter(use => use.edge === edge.id);
  const incident = uses.map(use => brep.loops.find(loop => loop.id === use.loop)?.face);
  const other = incident.find(faceId => faceId !== face.id);
  const startFace = other === undefined ? undefined : box.sides.get(other);
  const start = box.ranges[2][0];
  // The box proof certifies full native line curves and their ordered vertex positions.
  if (side.axis === 2 || uses.length !== 2 || uses[0].sense === uses[1].sense || !incident.includes(face.id)
    || startFace?.axis !== 2 || startFace.side !== 0 || edge.curve.controlPoints.some(point => point[2] !== start))
    return fail('SELECTION', 'The Draft edge must join the selected face to the start face of the pull.');

  return rebuildDraftedBox(brep, box, [side], start, angle, id, fail, edge.id);
}

function rebuildDraftedBox(brep: Brep, box: CardinalBox, sides: readonly BoxSide[], neutral: number, angle: number,
  id: string, fail: Tools['fail'], hingeId?: string): Brep {
  const [start, end] = box.ranges[2];
  const slope = Math.tan(angle);
  const capRanges = (station: number) => {
    const ranges = box.ranges.map(range => [...range]), inset = (station - neutral) * slope;
    for (const { axis, side } of sides) ranges[axis][side] += side === 0 ? inset : -inset;
    return ranges;
  };
  const base = neutral === start ? box.ranges : capRanges(start), top = capRanges(end);
  for (const { axis, side } of sides) {
    const original = box.ranges[axis][side];
    if (base[axis][side] === original && top[axis][side] === original)
      fail('GEOMETRY', 'the angle is too small to move the selected box sides');
  }
  const extent = Math.max(...box.ranges.flat().map(Math.abs), ...base.flat().map(Math.abs), ...top.flat().map(Math.abs));
  if (extent > CadNumericPolicy.coordinateAbs) fail('PARAMETER', 'the drafted box exceeds the modeling coordinate range');
  // Width and depth are affine in the pull direction. Positive end gaps certify the whole interval.
  const collapsed = ([low, high]: readonly number[]) => high - low <= linearToleranceMM(extent);
  if (top.some(collapsed) || (neutral !== start && base.some(collapsed)))
    fail('GEOMETRY', 'the draft closes a box wall at or before the end of the pull');

  const vertices = brep.vertices.map(vertex => {
    const [x, y, z] = vertex.point;
    const cap = z === start ? base : top;
    if (cap === box.ranges) return vertex;
    const point: Point = [cap[0][Number(x === box.ranges[0][1])], cap[1][Number(y === box.ranges[1][1])], z];
    return { ...vertex, point };
  });
  const points = new Map(vertices.map(vertex => [vertex.id, vertex.point]));
  const edges = brep.edges.map(edge => edge.id === hingeId ? edge : ({ ...edge,
    curve: lineCurve(edge.curve.id, points.get(edge.vertices[0])!, points.get(edge.vertices[1])!) }));
  const faces = brep.faces.map(face => {
    const { axis, side } = box.sides.get(face.id)!;
    // The side chart for Y points towards -Y; the other charts point towards their positive axis.
    const sense = (axis === 1 ? side === 0 : side === 1) ? 'forward' as const : 'reversed' as const;
    return { ...face, sense, surface: boxDraftPlane(face.surface.id, axis, side, base, top) };
  });
  // The trims retain their topology; UV curves from the old plane charts do not apply to the new ones.
  const coedges = brep.coedges.map(coedge => ({ ...coedge, pcurve: null }));
  const result: Brep = { ...brep, source: { family: 'draft', id }, vertices, edges, faces, coedges };
  const report = checkBrep(result, { strict: true });
  if (!report.valid) fail('GEOMETRY', `the drafted box is invalid: ${report.issues[0]}`);
  return result;
}
