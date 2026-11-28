import { faceGeometry } from '../brep/analytic-boolean.js';
import { checkBrep, type Brep } from '../brep/brep-core.js';
import { cardinalBoxOf, type BoxSide, type CardinalBox } from '../brep/cardinal-box.js';
import { transformBrep, type BrepAffine } from '../brep/brep-transform.js';
import { cross } from '../core/vec3.js';
import type { CurveSegment2, XY } from '../brep/curved-arrangement.js';
import { ExtrudedProfileLimits } from '../features/extruded-profile-solid.js';
import { booleanPrismatic, brepFromPrismatic, prismaticExtrude, type PrismaticSolid } from '../features/prismatic-solid.js';
import type { Tools } from './part-model.js';
import type { Point } from '../types.js';

export { cardinalBoxOf } from '../brep/cardinal-box.js';

type NamedBoxSide = BoxSide & { readonly name: string };

/** The exclusive thickness limit for opening one face of a validated cardinal box. */
export function boxShellWallLimit(brep: Brep, open: string): number | undefined {
  const box = cardinalBoxOf(brep);
  if (!box) return undefined;
  let openAxis: number | undefined;
  for (const face of brep.faces) if (face.name === open) openAxis = box.sides.get(face.id)?.axis;
  if (openAxis === undefined) return undefined;
  return Math.min(...box.ranges.map(([low, high], axis) => (high - low) / (axis === openAxis ? 1 : 2)));
}

/** Subtract the interior of a certified cardinal box through one original cardinal opening. */
export function boxShellWithWalls(stock: PrismaticSolid, brep: Brep, opening: string, walls: Readonly<Record<string, unknown>>,
  id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const box = cardinalBoxOf(brep);
  if (!box) return fail('CAPABILITY', 'Per-face Shell needs one exact cardinal box.');
  const names = brep.faces.map(face => face.name);
  if (!names.every(name => typeof name === 'string') || names.includes('') || new Set(names).size !== 6)
    return fail('REFERENCE', 'Per-face Shell needs six unique original face names.');
  const cap = brep.faces.find(face => face.name === opening);
  const openedSide = cap && box.sides.get(cap.id);
  if (!openedSide) return fail('SELECTION', 'Per-face Shell needs one original cardinal face as its opening.');
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
  if (openedSide.axis !== 2 || openedSide.side !== 1) return reorientedBoxShellWithWalls(stock, brep, box, ranges, opening, walls, openedSide, id, fail);
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

/** The native stock and the Boolean operand must own the same six named cardinal supports. */
function checkNamedBoxStock(stock: PrismaticSolid, box: CardinalBox, names: readonly (readonly string[])[], fail: Tools['fail']): void {
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
}

/** Subtract an enclosed rectangular cavity with one independent thickness per original plane. */
export function closedBoxShellWithWalls(stock: PrismaticSolid, source: Brep, walls: Readonly<Record<string, unknown>>,
  id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const box = cardinalBoxOf(source);
  if (!box || !checkBrep(source, { strict: true }).valid)
    return fail('CAPABILITY', 'Closed per-face Shell needs one strict exact cardinal box.');
  const names = source.faces.map(face => face.name);
  if (!names.every((name): name is string => typeof name === 'string' && !!name) || new Set(names).size !== 6)
    return fail('REFERENCE', 'Per-face Shell needs six unique original face names.');
  if (Object.keys(walls).length !== 6 || names.some(name => !Object.hasOwn(walls, name)))
    return fail('REFERENCE', 'Closed per-face Shell needs one thickness for each of the six original faces.');

  const supports = box.ranges.map(() => ['', '']);
  const cavity = box.ranges.map(pair => [...pair]);
  const minimum = ExtrudedProfileLimits.minimumLengthMM;
  for (const face of source.faces) {
    const name = face.name!, { axis, side } = box.sides.get(face.id)!;
    const thickness = walls[name];
    if (typeof thickness !== 'number' || !Number.isFinite(thickness) || thickness < minimum)
      return fail('PARAMETER', `Wall thickness for ${name} must be at least ${minimum} mm.`);
    supports[axis][side] = name;
    cavity[axis][side] += side === 0 ? thickness : -thickness;
  }
  if (cavity.some(([low, high]) => !(high - low >= minimum)))
    return fail('PARAMETER', 'The wall thicknesses leave no cavity in this box.');
  checkNamedBoxStock(stock, box, supports, fail);

  const innerNames = supports.map(pair => pair.map(name => `${id}.in.${name}`));
  const solid = booleanPrismatic(stock, namedBoxPrism(cavity, innerNames), 'difference');
  const brep = brepFromPrismatic(solid, { id });
  const report = checkBrep(brep, { strict: true }), counts = report.counts;
  if (!report.valid || counts.bodies !== 1 || counts.shells !== 2 || counts.faces !== 12 || counts.loops !== 12
    || counts.coedges !== 48 || counts.edges !== 24 || counts.vertices !== 16
    || report.topology.length !== 1 || report.topology[0].genus !== 0 || !brep.coedges.every(use => use.pcurve))
    return fail('GEOMETRY', 'Closed per-face Shell could not retain two exact closed shells.');

  const byName = new Map(brep.faces.map(face => [face.name, face]));
  const outerShell = byName.get(names[0])?.shell;
  const innerShell = byName.get(`${id}.in.${names[0]}`)?.shell;
  if (!outerShell || !innerShell || outerShell === innerShell)
    return fail('GEOMETRY', 'Closed per-face Shell could not identify the exterior and cavity.');
  for (const original of source.faces) {
    const { axis, side } = box.sides.get(original.id)!, outward = side === 0 ? -1 : 1;
    const outer = byName.get(original.name), inner = byName.get(`${id}.in.${original.name}`);
    if (!outer || !inner || outer.shell !== outerShell || inner.shell !== innerShell ||
      !matchesBoxSupport(outer, axis, box.ranges[axis][side], outward) ||
      !matchesBoxSupport(inner, axis, cavity[axis][side], -outward))
      return fail('GEOMETRY', 'Closed per-face Shell moved an original wall or lost its exact cavity support.');
  }
  return { solid, brep };
}

function matchesBoxSupport(face: Brep['faces'][number], axis: number, boundary: number, normal: number): boolean {
  const geometry = faceGeometry(face);
  return geometry.kind === 'plane' && geometry.o[axis] === boundary
    && geometry.n.every((value, i) => value === (i === axis ? normal : 0))
    && face.surface.kind === 'surface'
    && face.surface.controlPoints.every(row => row.every(point => point[axis] === boundary));
}

/** Subtract a rectangular cavity through three or four original cardinal faces. */
export function threeOrFourOpeningBoxShellWithWalls(stock: PrismaticSolid, source: Brep,
  openings: readonly [string, string, string] | readonly [string, string, string, string],
  walls: Readonly<Record<string, unknown>>, id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const four = openings.length === 4, label = four ? 'Four-opening' : 'Three-opening';
  const box = cardinalBoxOf(source);
  if (!box || !checkBrep(source, { strict: true }).valid)
    return fail('CAPABILITY', `${label} per-face Shell needs one strict exact cardinal box.`);
  const names = source.faces.map(face => face.name);
  if (!names.every((name): name is string => typeof name === 'string' && !!name) || new Set(names).size !== 6)
    return fail('REFERENCE', 'Per-face Shell needs six unique original face names.');
  const opened = openings.map(name => source.faces.find(face => face.name === name));
  if (new Set(openings).size !== openings.length || opened.some(face => !face))
    return fail('SELECTION', `${label} per-face Shell needs ${four ? 'four' : 'three'} distinct original cardinal faces.`);
  const axes = opened.map(face => box.sides.get(face!.id)!.axis);
  const oppositeAxis = axes.find((axis, index) => axes.indexOf(axis) !== index);
  const kept = source.faces.filter(face => !openings.includes(face.name!));
  if (Object.keys(walls).length !== kept.length || kept.some(face => !Object.hasOwn(walls, face.name!)))
    return fail('REFERENCE', `${label} per-face Shell needs one thickness for each of the ${four ? 'two' : 'three'} kept faces.`);
  const keptAxes = kept.map(face => box.sides.get(face.id)!.axis);
  if (four && keptAxes[0] === keptAxes[1])
    return fail('CAPABILITY', '[SHELL_DISCONNECTED] Four-opening per-face Shell would leave two opposite retained walls disconnected.');
  const throughAxis = four ? ([0, 1, 2] as const).find(axis => !keptAxes.includes(axis)) : undefined;

  const supports = box.ranges.map(() => ['', '']), cavity = box.ranges.map(pair => [...pair]);
  const minimum = ExtrudedProfileLimits.minimumLengthMM;
  for (const face of source.faces) {
    const name = face.name!, { axis, side } = box.sides.get(face.id)!;
    supports[axis][side] = name;
    if (openings.includes(name)) continue;
    const thickness = walls[name];
    if (typeof thickness !== 'number' || !Number.isFinite(thickness) || thickness < minimum)
      return fail('PARAMETER', `Wall thickness for ${name} must be at least ${minimum} mm.`);
    cavity[axis][side] += side === 0 ? thickness : -thickness;
  }
  if (cavity.some(([low, high]) => !(high - low >= minimum)))
    return fail('PARAMETER', 'The wall thicknesses leave no cavity in this box.');
  checkNamedBoxStock(stock, box, supports, fail);

  const innerNames = supports.map(pair => pair.map(name => `${id}.in.${name}`));
  const solid = booleanPrismatic(stock, namedBoxPrism(cavity, innerNames), 'difference');
  const brep = brepFromPrismatic(solid, { id });
  const report = checkBrep(brep, { strict: true }), counts = report.counts;
  // World-Z slabs split a channel across more coplanar patches when its through axis is horizontal.
  const [faces, edges, vertices] = four ? (throughAxis === 2 ? [8, 18, 12] : [10, 22, 14])
    : oppositeAxis === undefined ? [11, 25, 16] : oppositeAxis === 2 ? [10, 24, 16] : [14, 32, 20];
  if (!report.valid || counts.bodies !== 1 || counts.shells !== 1 || counts.faces !== faces || counts.loops !== faces
    || counts.coedges !== 2 * edges || counts.edges !== edges || counts.vertices !== vertices
    || report.topology.length !== 1 || report.topology[0].genus !== 0 || !brep.coedges.every(use => use.pcurve)
    || new Set(brep.faces.map(face => face.name)).size !== faces || !brep.shells[0].closed)
    return fail('GEOMETRY', `${label} per-face Shell could not retain its exact rims and ${four ? 'two' : 'three'} walls.`);

  for (const original of source.faces) {
    const name = original.name!, { axis, side } = box.sides.get(original.id)!, normal = side === 0 ? -1 : 1;
    const open = openings.includes(name);
    const outer = brep.faces.filter(face => face.name === name || face.name?.replace(/#\d+$/, '') === name);
    const inner = brep.faces.find(face => face.name === innerNames[axis][side]);
    const patches = !open ? 1 : four ? (throughAxis !== 2 && axis === throughAxis ? 2 : 1)
      : oppositeAxis === undefined || oppositeAxis === 2 ? (axis === 2 ? 1 : 2) : axis === oppositeAxis ? 3 : 2;
    if (outer.length !== patches
      || outer.some(face => !matchesBoxSupport(face, axis, box.ranges[axis][side], normal))
      || (open ? inner !== undefined : !inner || !matchesBoxSupport(inner, axis, cavity[axis][side], -normal)))
      return fail('GEOMETRY', `${label} per-face Shell moved an original wall or lost an exact interior support.`);
  }
  return { solid, brep };
}

/** Exact rims or rings of two original cardinal openings, using the existing top-pair converter. */
export function twoOpeningBoxShellWithWalls(stock: PrismaticSolid, source: Brep, openings: readonly [string, string],
  walls: Readonly<Record<string, unknown>>, id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const box = cardinalBoxOf(source);
  if (!box || !checkBrep(source, { strict: true }).valid)
    return fail('CAPABILITY', 'Two-opening per-face Shell needs one strict exact cardinal box.');
  const names = source.faces.map(face => face.name);
  if (!names.every((name): name is string => typeof name === 'string' && !!name) || new Set(names).size !== 6)
    return fail('REFERENCE', 'Per-face Shell needs six unique original face names.');
  const selected = openings.map(name => source.faces.find(face => face.name === name));
  if (openings[0] === openings[1] || selected.some(face => !face))
    return fail('SELECTION', 'Two-opening per-face Shell needs two distinct original cardinal face names.');
  const sides = selected.map(face => box.sides.get(face!.id)!);
  const top = sides.findIndex(side => side.axis === 2 && side.side === 1), vertical = sides.findIndex(side => side.axis !== 2);
  const tube = top >= 0 && sides.some(side => side.axis === 2 && side.side === 0);
  if (Object.keys(walls).length !== 4 || openings.some(name => Object.hasOwn(walls, name))
    || names.some(name => !openings.includes(name) && !Object.hasOwn(walls, name)))
    return fail('REFERENCE', 'Two-opening per-face Shell needs one thickness for each of the four kept faces.');

  const supports = box.ranges.map(() => ['', '']), cavity = box.ranges.map(pair => [...pair]);
  const minimum = ExtrudedProfileLimits.minimumLengthMM;
  for (const face of source.faces) {
    const name = face.name!, side = box.sides.get(face.id)!;
    supports[side.axis][side.side] = name;
    if (openings.includes(name)) continue;
    const thickness = walls[name];
    if (typeof thickness !== 'number' || !Number.isFinite(thickness) || thickness < minimum)
      return fail('PARAMETER', `Wall thickness for ${name} must be at least ${minimum} mm.`);
    cavity[side.axis][side.side] += side.side === 0 ? thickness : -thickness;
  }
  if (cavity.some(([low, high]) => !(high - low >= minimum)))
    return fail('PARAMETER', 'The wall thicknesses leave no cavity in this box.');
  checkNamedBoxStock(stock, box, supports, fail);
  // Keep every previously admitted top pair on its original producer, including its native bytes.
  if (top < 0)
    return reorientedTwoOpeningBoxShell(stock, source, box, supports, cavity, openings,
      openings.map((name, i) => ({ name, ...sides[i] })), walls, id, fail);
  const innerNames = supports.map(pair => pair.map(name => `${id}.in.${name}`));
  const solid = booleanPrismatic(stock, namedBoxPrism(cavity, innerNames), 'difference');
  const brep = brepFromPrismatic(solid, { id });
  checkTwoOpeningBoxShell(brep, source, box, cavity, openings, { primary: openings[top], secondary: openings[vertical], tube }, id, fail);
  return { solid, brep };
}

/** Validate exact world supports and canonical rim roles after either direct construction or signed placement. */
function checkTwoOpeningBoxShell(brep: Brep, source: Brep, box: CardinalBox, cavity: readonly (readonly number[])[],
  openings: readonly [string, string], rim: { readonly primary: string; readonly secondary?: string; readonly tube: boolean },
  id: string, fail: Tools['fail']): void {
  const { tube } = rim, report = checkBrep(brep, { strict: true });
  const counts = report.counts;
  if (!report.valid || counts.bodies !== 1 || counts.shells !== 1 || counts.faces !== (tube ? 10 : 12) || counts.loops !== 12
    || counts.coedges !== (tube ? 48 : 56) || counts.edges !== (tube ? 24 : 28) || counts.vertices !== (tube ? 16 : 18)
    || report.topology.length !== 1 || report.topology[0].genus !== (tube ? 1 : 0) || !brep.coedges.every(use => use.pcurve)
    || new Set(brep.faces.map(face => face.name)).size !== (tube ? 10 : 12))
    return fail('GEOMETRY', 'Two-opening per-face Shell could not retain its exact rims and four interior walls.');

  const byName = new Map(brep.faces.map(face => [face.name, face]));
  const checkSupport = (face: Brep['faces'][number], axis: number, boundary: number, normal: number) => {
    if (!matchesBoxSupport(face, axis, boundary, normal))
      return fail('GEOMETRY', 'Two-opening per-face Shell moved an original wall or its exact interior support.');
  };
  for (const original of source.faces) {
    const name = original.name!, { axis, side } = box.sides.get(original.id)!;
    const outer = brep.faces.filter(face => face.name === name || face.name?.replace(/#\d+$/, '') === name);
    const pieces = !tube && name === rim.secondary ? 3 : 1;
    if (outer.length !== pieces || outer.some(face => face.loops.length !== (tube && openings.includes(name) ? 2 : 1)))
      return fail('GEOMETRY', 'Two-opening per-face Shell lost an original face or its rim patches.');
    for (const face of outer) checkSupport(face, axis, box.ranges[axis][side], side === 1 ? 1 : -1);
    const inner = byName.get(`${id}.in.${name}`);
    if (openings.includes(name)) {
      const loops = outer.flatMap(face => face.loops.map(id => brep.loops.find(loop => loop.id === id)!));
      if (tube) {
        if (inner || loops.filter(loop => loop.kind === 'outer').length !== 1
          || loops.filter(loop => loop.kind === 'inner').length !== 1 || loops.some(loop => loop.coedges.length !== 4))
          return fail('GEOMETRY', 'Two-opening per-face Shell could not retain its exact original cap rings.');
        continue;
      }
      const loopLengths = loops.map(loop => loop.coedges.length).sort((a, b) => a - b);
      const expected = name === rim.primary ? [8] : [4, 5, 5];
      if (inner || JSON.stringify(loopLengths) !== JSON.stringify(expected))
        return fail('GEOMETRY', 'Two-opening per-face Shell could not retain the exact open rim trims.');
    } else {
      if (!inner) return fail('GEOMETRY', 'Two-opening per-face Shell lost a kept interior wall.');
      if (tube && (outer[0].loops.some(id => brep.loops.find(loop => loop.id === id)!.coedges.length !== 4)
        || inner.loops.length !== 1 || brep.loops.find(loop => loop.id === inner.loops[0])!.coedges.length !== 4))
        return fail('GEOMETRY', 'Two-opening per-face Shell lost an exact rectangular side wall.');
      checkSupport(inner, axis, cavity[axis][side], side === 1 ? -1 : 1);
    }
  }
}

/** A signed basis maps a new pair to an existing top pair without rounding world coordinates. */
function reorientedTwoOpeningBoxShell(stock: PrismaticSolid, source: Brep, box: CardinalBox,
  names: readonly (readonly string[])[], cavity: readonly (readonly number[])[], openings: readonly [string, string],
  selections: readonly NamedBoxSide[], walls: Readonly<Record<string, unknown>>, id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const selected = [...selections].sort((a, b) => a.axis - b.axis || a.side - b.side);
  const [first, second] = selected, tube = first.axis === second.axis;
  const outward = ({ axis, side }: BoxSide): Point => [0, 1, 2].map(k => k === axis ? side === 1 ? 1 : -1 : 0) as Point;
  const w = outward(first);
  let u: Point, v: Point;
  if (tube) {
    u = [0, 1, 2].map(k => k === (first.axis === 0 ? 1 : 0) ? 1 : 0) as Point;
    v = cross(w, u);
  } else {
    v = outward(second).map(value => -value) as Point;
    u = cross(v, w);
  }
  const basis = [u, v, w], axes = basis.map(direction => {
    const axis = direction.findIndex(value => value !== 0);
    return { axis, sign: direction[axis] };
  });
  if (new Set(axes.map(({ axis }) => axis)).size !== 3 || axes.some(({ sign }) => Math.abs(sign) !== 1)
    || !cross(u, v).every((value, k) => value === w[k]))
    return fail('GEOMETRY', 'Two-opening per-face Shell could not establish an exact cardinal basis.');
  const localRanges = axes.map(({ axis, sign }) => sign === 1 ? [...box.ranges[axis]] : [-box.ranges[axis][1], -box.ranges[axis][0]]);
  const localNames = axes.map(({ axis, sign }) => sign === 1 ? [...names[axis]] : [names[axis][1], names[axis][0]]);
  const localStock = namedBoxPrism(localRanges, localNames), localSource = brepFromPrismatic(localStock, { id: `${id}_box` });
  const local = twoOpeningBoxShellWithWalls(localStock, localSource, openings, walls, id, fail);
  const matrix: [number, number, number, number, number, number, number, number, number] = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  basis.forEach((direction, column) => direction.forEach((value, row) => { matrix[3 * row + column] = value; }));
  const brep = transformBrep(local.brep, { matrix });
  // The world operand, rather than the local slab direction, remains the downstream Boolean and mass authority.
  const solid = booleanPrismatic(stock, namedBoxPrism(cavity, names.map(pair => pair.map(name => `${id}.in.${name}`))), 'difference');
  checkTwoOpeningBoxShell(brep, source, box, cavity, openings, { primary: first.name, secondary: second.name, tube }, id, fail);
  return { solid, brep };
}

/** A non-top cavity has the same world slab solid, with its opening reoriented to a cardinal cap. */
function reorientedBoxShellWithWalls(stock: PrismaticSolid, source: Brep, box: CardinalBox,
  cavity: readonly (readonly number[])[], opening: string, walls: Readonly<Record<string, unknown>>,
  open: BoxSide, id: string, fail: Tools['fail']): { solid: PrismaticSolid; brep: Brep } {
  const names = box.ranges.map(() => ['', '']);
  for (const face of source.faces) {
    const side = box.sides.get(face.id)!;
    names[side.axis][side.side] = face.name!;
  }
  checkNamedBoxStock(stock, box, names, fail);

  // The maps have determinant +1 and entries 0/+1/-1. No rounded rotation or translation is used.
  // local W points out through the chosen opening; local U x local V = local W.
  const sign: 1 | -1 = open.side === 1 ? 1 : -1;
  // The original bottom uses (+X, -Y, -Z), so the original top is the kept local lower wall.
  const axes: readonly { axis: 0 | 1 | 2; sign: 1 | -1 }[] = open.axis === 2 ? [
    { axis: 0, sign: 1 }, { axis: 1, sign: -1 }, { axis: 2, sign: -1 },
  ] : [
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
    return fail('GEOMETRY', 'Per-face Shell could not retain five exact walls and one reoriented opening.');
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
