import { faceGeometry } from '../brep/analytic-boolean.js';
import { checkBrep, type Brep } from '../brep/brep-core.js';
import { transformBrep, type BrepAffine } from '../brep/brep-transform.js';
import type { CurveSegment2, XY } from '../brep/curved-arrangement.js';
import { ExtrudedProfileLimits } from '../features/extruded-profile-solid.js';
import { booleanPrismatic, brepFromPrismatic, prismaticExtrude, type PrismaticSolid } from '../features/prismatic-solid.js';
import type { Tools } from './part-model.js';

interface BoxSide { readonly axis: 0 | 1 | 2; readonly side: 0 | 1 }
interface CardinalBox {
  readonly ranges: readonly (readonly number[])[];
  readonly sides: ReadonlyMap<string, BoxSide>;
}

/** The six outward supports and exact corner ranges of a closed cardinal box. */
export function cardinalBoxOf(brep: Brep): CardinalBox | undefined {
  const { bodies, shells, faces, loops, coedges, edges, vertices } = brep;
  if (bodies.length !== 1 || bodies[0].kind !== 'solid' || bodies[0].shells.length !== 1
    || shells.length !== 1 || !shells[0].closed || faces.length !== 6 || loops.length !== 6
    || coedges.length !== 24 || edges.length !== 12 || vertices.length !== 8) return undefined;

  const axes = [0, 1, 2] as const;
  const ranges = axes.map(axis => [...new Set(vertices.map(vertex => vertex.point[axis]))].sort((a, b) => a - b));
  if (ranges.some(range => range.length !== 2) || new Set(vertices.map(vertex => vertex.point.join(','))).size !== 8)
    return undefined;
  const pointOf = new Map(vertices.map(vertex => [vertex.id, vertex.point]));
  const edgeOf = new Map(edges.map(edge => [edge.id, edge]));
  const coedgeOf = new Map(coedges.map(coedge => [coedge.id, coedge]));
  const loopOf = new Map(loops.map(loop => [loop.id, loop]));

  const directions = new Set<string>();
  const sides = new Map<string, BoxSide>();
  for (const face of faces) {
    if (face.surface.kind !== 'surface') return undefined;
    let plane: ReturnType<typeof faceGeometry>;
    try { plane = faceGeometry(face); } catch { return undefined; }
    if (plane.kind !== 'plane') return undefined;
    const axis = axes.find(axis => Math.abs(plane.n[axis]) === 1 && axes.every(i => i === axis || plane.n[i] === 0));
    if (axis === undefined || face.loops.length !== 1) return undefined;
    const side = plane.n[axis] > 0 ? 1 : 0;
    const direction = `${axis}:${side}`;
    if (directions.has(direction) || plane.o[axis] !== ranges[axis][side]
      || !face.surface.controlPoints.every(row => row.every(point => point[axis] === plane.o[axis]))) return undefined;
    directions.add(direction);

    const loop = loopOf.get(face.loops[0]);
    if (loop?.kind !== 'outer' || loop.coedges.length !== 4) return undefined;
    const corners = new Set<string>();
    for (const coedgeId of loop.coedges) {
      const coedge = coedgeOf.get(coedgeId);
      const edge = coedge && edgeOf.get(coedge.edge);
      if (!edge || edge.curve.degree !== 1 || edge.curve.controlPoints.length !== 2) return undefined;
      const [first, last] = edge.vertices.map(id => pointOf.get(id));
      if (!first || !last || first[axis] !== ranges[axis][side] || last[axis] !== ranges[axis][side]
        || axes.filter(i => first[i] !== last[i]).length !== 1
        || !edge.curve.controlPoints[0].every((value, i) => value === first[i])
        || !edge.curve.controlPoints[1].every((value, i) => value === last[i])) return undefined;
      corners.add(edge.vertices[0]);
      corners.add(edge.vertices[1]);
    }
    if (corners.size !== 4) return undefined;
    sides.set(face.id, { axis, side });
  }
  return checkBrep(brep).valid ? { ranges, sides } : undefined;
}

/** The exclusive thickness limit for opening one face of a validated cardinal box. */
export function boxShellWallLimit(brep: Brep, open: string): number | undefined {
  const box = cardinalBoxOf(brep);
  if (!box) return undefined;
  let openAxis: number | undefined;
  for (const face of brep.faces) if (face.name === open) openAxis = box.sides.get(face.id)?.axis;
  if (openAxis === undefined) return undefined;
  return Math.min(...box.ranges.map(([low, high], axis) => (high - low) / (axis === openAxis ? 1 : 2)));
}

/** Subtract the interior of a certified cardinal box through one upper or lateral opening. */
export function boxShellWithWalls(stock: PrismaticSolid, brep: Brep, opening: string, walls: Readonly<Record<string, unknown>>,
  id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const box = cardinalBoxOf(brep);
  if (!box) return fail('CAPABILITY', 'Per-face Shell needs one exact cardinal box.');
  const names = brep.faces.map(face => face.name);
  if (!names.every(name => typeof name === 'string') || names.includes('') || new Set(names).size !== 6)
    return fail('REFERENCE', 'Per-face Shell needs six unique original face names.');
  const cap = brep.faces.find(face => face.name === opening);
  const openedSide = cap && box.sides.get(cap.id);
  if (!openedSide || (openedSide.axis === 2 && openedSide.side !== 1))
    return fail('SELECTION', 'Per-face Shell needs the original upper face or a lateral face as its opening.');
  if (Object.keys(walls).length !== 5 || Object.hasOwn(walls, opening) || names.some(name => name !== opening && !Object.hasOwn(walls, name)))
    return fail('REFERENCE', 'Per-face Shell needs one thickness for each of the five kept faces.');

  const ranges = box.ranges.map(range => [...range]), wallNames = ranges.map(() => ['', '']);
  const minimum = ExtrudedProfileLimits.minimumLengthMM;
  for (const face of brep.faces) {
    if (face === cap) continue;
    const name = face.name!, value = walls[name];
    if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum)
      return fail('PARAMETER', `Wall thickness for ${name} must be at least ${minimum} mm.`);
    const { axis, side } = box.sides.get(face.id)!;
    ranges[axis][side] += side === 0 ? value : -value;
    wallNames[axis][side] = name;
  }
  if (ranges.some(([low, high]) => !(high - low >= minimum)))
    return fail('PARAMETER', 'The wall thicknesses leave no cavity in this box.');
  if (openedSide.axis !== 2) return lateralBoxShellWithWalls(stock, brep, box, ranges, opening, walls, openedSide, id, fail);
  const [[x0, x1], [y0, y1], [floor, ceiling]] = ranges;
  const corners: XY[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const sideNames = [wallNames[1][0], wallNames[0][1], wallNames[1][1], wallNames[0][0]];
  const ring: CurveSegment2[] = corners.map((a, i) => ({
    kind: 'line', a, b: corners[(i + 1) % 4], tag: `${id}.in.${sideNames[i]}`,
  }));
  const inside = prismaticExtrude([ring], floor, ceiling);
  const regions = inside.slabs[0]?.regions;
  if (inside.slabs.length !== 1 || regions?.length !== 1) return fail('GEOMETRY', 'Per-face Shell could not build the exact cavity.');
  const solid = booleanPrismatic(stock, { ...inside, caps: [
    { z: floor, regions, tag: `${id}.in.${wallNames[2][0]}` }, { z: ceiling, regions, tag: `${id}.ceiling` },
  ] }, 'difference');
  const result = brepFromPrismatic(solid, { id });
  const report = checkBrep(result, { strict: true });
  if (!report.valid || report.counts.faces !== 11 || report.counts.loops !== 12 || report.topology[0]?.genus !== 0)
    return fail('GEOMETRY', 'Per-face Shell could not retain five exact walls and one top opening.');
  return { solid, brep: result };
}

/** Rectangle tags belong to the actual cardinal supports, independent of authored segment order. */
function namedBoxRing(ranges: readonly (readonly number[])[], names: readonly (readonly string[])[]): CurveSegment2[] {
  const [[x0, x1], [y0, y1]] = ranges;
  const corners: XY[] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  const tags = [names[1][0], names[0][1], names[1][1], names[0][0]];
  return corners.map((a, i) => ({ kind: 'line', a, b: corners[(i + 1) % 4], tag: tags[i] }));
}

function namedBoxPrism(ranges: readonly (readonly number[])[], names: readonly (readonly string[])[]): PrismaticSolid {
  const [floor, ceiling] = ranges[2], inside = prismaticExtrude([namedBoxRing(ranges, names)], floor, ceiling);
  const regions = inside.slabs[0].regions;
  return { ...inside, caps: [{ z: floor, regions, tag: names[2][0] }, { z: ceiling, regions, tag: names[2][1] }] };
}

/** A lateral cavity has the same world slab solid, but its single opening is a cap in a cardinal chart. */
function lateralBoxShellWithWalls(stock: PrismaticSolid, source: Brep, box: CardinalBox,
  cavity: readonly (readonly number[])[], opening: string, walls: Readonly<Record<string, unknown>>,
  open: BoxSide, id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const names = box.ranges.map(() => ['', '']);
  for (const face of source.faces) {
    const side = box.sides.get(face.id)!;
    names[side.axis][side.side] = face.name!;
  }
  // The cached native box and the upright mass/Boolean operand must be the same named stock.
  const slab = stock.slabs[0], region = slab?.regions[0], expected = namedBoxRing(box.ranges, names);
  const pointEqual = (a: XY, b: XY) => a[0] === b[0] && a[1] === b[1];
  if (stock.slabs.length !== 1 || slab.z0 !== box.ranges[2][0] || slab.z1 !== box.ranges[2][1]
    || slab.regions.length !== 1 || !region || region.holes.length || region.outer.length !== 4
    || new Set(region.outer.map(segment => segment.tag)).size !== 4
    || !region.outer.every(segment => segment.kind === 'line' && expected.some(other => other.kind === 'line'
      && segment.tag === other.tag && (pointEqual(segment.a, other.a) && pointEqual(segment.b, other.b)
        || pointEqual(segment.a, other.b) && pointEqual(segment.b, other.a))))
    || stock.caps?.length !== 2 || new Set(stock.caps.map(cap => cap.tag)).size !== 2
    || !stock.caps.every(cap => cap.tag === names[2][0] && cap.z === slab.z0
      || cap.tag === names[2][1] && cap.z === slab.z1))
    return fail('CAPABILITY', 'Per-face Shell needs the same exact named upright box in its native and slab representations.');

  // The maps have determinant +1 and entries 0/+1/-1. No rounded rotation or translation is used.
  // local W points out through the chosen opening; local U x local V = local W.
  const sign: 1 | -1 = open.side === 1 ? 1 : -1;
  const axes: readonly { axis: 0 | 1 | 2; sign: 1 | -1 }[] = [
    { axis: open.axis === 0 ? 1 : 0, sign: open.axis === 0 ? sign : sign === 1 ? -1 : 1 },
    { axis: 2, sign: 1 }, { axis: open.axis, sign },
  ];
  const localRanges = axes.map(({ axis, sign }) => sign === 1 ? [...box.ranges[axis]] : [-box.ranges[axis][1], -box.ranges[axis][0]]);
  const localNames = axes.map(({ axis, sign }) => sign === 1 ? [...names[axis]] : [names[axis][1], names[axis][0]]);
  const localStock = namedBoxPrism(localRanges, localNames);
  const localOriginal = brepFromPrismatic(localStock, { id: `${id}_box` });
  const local = boxShellWithWalls(localStock, localOriginal, opening, walls, id, fail);
  const matrix: [number, number, number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  axes.forEach(({ axis, sign }, i) => { matrix[3 * axis + i] = sign; });
  const placement: BrepAffine = { matrix };
  const result = transformBrep(local.brep, placement);

  // The world upright representation retains its normal mass and downstream Boolean contract.
  // Its cavity has precisely these same five inset supports and the original open support.
  const innerNames = names.map(pair => pair.map(name => name === opening ? name : `${id}.in.${name}`));
  const solid = booleanPrismatic(stock, namedBoxPrism(cavity, innerNames), 'difference');
  const report = checkBrep(result, { strict: true });
  const counts = report.counts, byName = new Map(result.faces.map(face => [face.name, face]));
  const openingFace = byName.get(opening);
  const loopKinds = openingFace?.loops.map(loop => result.loops.find(candidate => candidate.id === loop)?.kind);
  if (!report.valid || counts.bodies !== 1 || counts.shells !== 1 || counts.faces !== 11 || counts.loops !== 12
    || counts.coedges !== 48 || counts.edges !== 24 || counts.vertices !== 16 || report.topology.length !== 1
    || report.topology[0].genus !== 0 || byName.size !== 11 || !result.coedges.every(use => use.pcurve)
    || loopKinds?.length !== 2 || !loopKinds.includes('outer') || !loopKinds.includes('inner'))
    return fail('GEOMETRY', 'Per-face Shell could not retain five exact walls and one lateral opening.');
  const checkSupport = (face: Brep['faces'][number] | undefined, axis: 0 | 1 | 2, boundary: number, normal: number) => {
    if (!face) return fail('GEOMETRY', 'Per-face Shell lost an original wall owner.');
    const geometry = faceGeometry(face);
    if (geometry.kind !== 'plane' || geometry.n[axis] !== normal || geometry.o[axis] !== boundary
      || !geometry.n.every((value, i) => i === axis || value === 0)
      || face.surface.kind !== 'surface' || !face.surface.controlPoints.every(row => row.every(point => point[axis] === boundary)))
      return fail('GEOMETRY', 'Per-face Shell moved an original wall or its exact interior support.');
  };
  for (const original of source.faces) {
    const { axis, side } = box.sides.get(original.id)!;
    checkSupport(byName.get(original.name), axis, box.ranges[axis][side], side === 1 ? 1 : -1);
    if (original.name !== opening)
      checkSupport(byName.get(`${id}.in.${original.name}`), axis, cavity[axis][side], side === 1 ? -1 : 1);
  }
  return { solid, brep: result };
}
