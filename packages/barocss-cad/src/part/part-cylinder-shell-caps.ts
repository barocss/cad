// Exact independent cap routes for one admitted original upright cylinder.
import { checkBrep, type Brep } from '../brep/brep-core.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { circleOf } from '../brep/brep-tessellate.js';
import { booleanPrismatic, prismaticExtrude, type PrismaticSolid } from '../features/prismatic-solid.js';
import { ExtrudedProfileLimits } from '../features/extruded-profile-solid.js';
import { dot, sub } from '../core/vec3.js';
import type { XY } from '../brep/curved-arrangement.js';
import { brepOf, type Part, type Tools } from './part-model.js';

/** This admission binds the cavity to one literal, unplaced, unmodified authored circle extrusion. */
export function originalCylinderCaps(reference: string, part: Part, t: Tools): { stock: PrismaticSolid; center: Readonly<XY>; radius: number } | undefined {
  const owner = t.ref(reference, 'Shell cylinder stock'), author = owner.author;
  if (reference !== owner.id || owner.part !== null || author?.kind !== 'extrude'
    || owner.result.kind !== 'solid' || owner.result.parts.length !== 1 || owner.result.parts[0] !== part
    || part.solid.kind !== 'upright' || part.history || part.moved || (author.draft !== undefined && author.draft !== 0)
    || typeof author.height !== 'number' || !Number.isFinite(author.height) || !(author.height > 0)
    || (author.from !== undefined && (typeof author.from !== 'number' || !Number.isFinite(author.from)))) return undefined;
  const sketch = t.ref(author.sketch, 'Shell cylinder sketch'), source = sketch.author;
  if (author.sketch !== sketch.id || sketch.part !== null || source?.kind !== 'sketch' || source.profile !== 'circle'
    || source.plane !== undefined || source.holes?.length || source.regions?.length
    || typeof source.radius !== 'number' || !Number.isFinite(source.radius) || !(source.radius > 0)
    || !source.center.every(value => typeof value === 'number' && Number.isFinite(value))
    || sketch.result.kind !== 'sketch' || !sketch.result.authoredCircle || sketch.result.frame
    || sketch.result.holes?.length || sketch.result.regions?.length) return undefined;
  const { center, radius } = sketch.result.authoredCircle, stock = part.solid.solid, slab = stock.slabs[0], from = author.from ?? 0;
  if (radius !== source.radius || !center.every((value, axis) => value === source.center[axis])
    || stock.slabs.length !== 1 || slab.z0 !== from || slab.z1 !== from + author.height
    || slab.regions.length !== 1 || slab.regions[0].holes.length) return undefined;
  const ring = slab.regions[0].outer, roundoff = 128 * Number.EPSILON * Math.max(1, radius, ...center.map(Math.abs));
  if (!ring.length || !ring.every(segment => segment.kind === 'arc' && Math.abs(segment.r - radius) <= roundoff
    && segment.c.every((value, axis) => value === center[axis]) && segment.sweep > 0 && !!segment.tag)
    || Math.abs(ring.reduce((sum, segment) => sum + (segment.kind === 'arc' ? segment.sweep : 0), 0) - 2 * Math.PI) > 1e-12) return undefined;
  return { stock, center, radius };
}

/** A blind coaxial analytic cutter keeps the two axial depths independent from the radial wall. */
export function closedCylinderCaps(part: Part, cylinder: NonNullable<ReturnType<typeof originalCylinderCaps>>, thickness: number,
  floor: number, ceiling: number, id: string, fail: Tools['fail']): Part {
  const { stock, center, radius } = cylinder, slab = stock.slabs[0], r = radius - thickness;
  if (!(thickness >= ExtrudedProfileLimits.minimumLengthMM && r >= ExtrudedProfileLimits.minimumRadiusMM))
    fail('PARAMETER', 'The Shell wall thickness leaves no supported cylindrical cavity.');
  const z0 = slab.z0 + floor, z1 = slab.z1 - ceiling;
  if (!(slab.z1 - slab.z0 - floor - ceiling >= ExtrudedProfileLimits.minimumLengthMM
    && z1 - z0 >= ExtrudedProfileLimits.minimumLengthMM && z0 > slab.z0 && z1 < slab.z1))
    fail('PARAMETER', 'The Shell floor and ceiling thicknesses leave no supported cavity height.');
  const original = brepOf(part, id), input = checkBrep(original, { strict: true });
  if (!input.valid || original.bodies.length !== 1 || original.bodies[0].kind !== 'solid'
    || original.shells.length !== 1 || !original.shells[0].closed || original.faces.length !== 4
    || new Set(original.faces.map(face => face.name)).size !== 4)
    fail('REFERENCE', 'Independent cylindrical Shell caps need one strict original cylinder.');
  const ring = slab.regions[0].outer.map(segment => segment.kind === 'arc'
    ? { ...segment, r, tag: `${id}.in.${segment.tag}` } : segment);
  const hollow = prismaticExtrude([ring], z0, z1), regions = hollow.slabs[0]?.regions;
  if (hollow.slabs.length !== 1 || regions?.length !== 1 || regions[0].holes.length
    || !regions[0].outer.length || !regions[0].outer.every(segment => segment.kind === 'arc' && segment.r === r))
    return fail('GEOMETRY', '[SHELL_NOT_CLOSED] independent cylindrical caps lost the circular cavity section.');
  const cutter = { ...hollow, caps: [{ z: z0, regions, tag: `${id}.floor` }, { z: z1, regions, tag: `${id}.ceiling` }] };
  const result: Part = { solid: { kind: 'upright', solid: booleanPrismatic(stock, cutter, 'difference') } };
  const brep = brepOf(result, id), report = checkBrep(brep, { strict: true });
  if (!report.valid || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 2
    || brep.shells.length !== 2 || !brep.shells.every(shell => shell.closed) || report.topology[0]?.genus !== 0
    || report.counts.faces !== 8 || report.counts.loops !== 8 || report.counts.coedges !== 24
    || report.counts.edges !== 12 || report.counts.vertices !== 8 || !brep.coedges.every(use => !!use.pcurve)
    || !cylinderCapSupports(brep, original, center, radius, r, slab.z0, slab.z1, z0, z1, id))
    fail('GEOMETRY', '[SHELL_NOT_CLOSED] independent cylindrical caps could not retain one strict cavity and the original outer supports.');
  return { ...result, brep };
}

/** The cutter ends at the original top station: the surviving top is an annular rim, with no inner ceiling. */
export function topOpenCylinderFloor(part: Part, cylinder: NonNullable<ReturnType<typeof originalCylinderCaps>>, thickness: number,
  floor: number, opening: string, id: string, fail: Tools['fail']): Part {
  const { stock, center, radius } = cylinder, slab = stock.slabs[0], r = radius - thickness;
  if (!(thickness >= ExtrudedProfileLimits.minimumLengthMM && r >= ExtrudedProfileLimits.minimumRadiusMM))
    fail('PARAMETER', 'The Shell wall thickness leaves no supported cylindrical cavity.');
  const z0 = slab.z0 + floor, z1 = slab.z1;
  if (!(slab.z1 - slab.z0 - floor >= ExtrudedProfileLimits.minimumLengthMM
    && z1 - z0 >= ExtrudedProfileLimits.minimumLengthMM && z0 > slab.z0 && z0 < z1))
    fail('PARAMETER', 'The Shell floor thickness leaves no cavity height.');
  const original = brepOf(part, id), input = checkBrep(original, { strict: true });
  const tops = original.faces.filter(face => face.name === opening), top = tops[0], g = top && faceGeometry(top);
  if (!input.valid || original.bodies.length !== 1 || original.bodies[0].kind !== 'solid'
    || original.shells.length !== 1 || !original.shells[0].closed || original.faces.length !== 4
    || new Set(original.faces.map(face => face.name)).size !== 4 || tops.length !== 1 || top.loops.length !== 1
    || g?.kind !== 'plane' || g.n[2] !== 1 || g.o[2] !== z1)
    fail('REFERENCE', 'Independent cylindrical Shell floor needs one strict original cylinder and its exact top cap.');
  const ring = slab.regions[0].outer.map(segment => segment.kind === 'arc'
    ? { ...segment, r, tag: `${id}.in.${segment.tag}` } : segment);
  const hollow = prismaticExtrude([ring], z0, z1), regions = hollow.slabs[0]?.regions;
  if (hollow.slabs.length !== 1 || regions?.length !== 1 || regions[0].holes.length
    || !regions[0].outer.length || !regions[0].outer.every(segment => segment.kind === 'arc' && segment.r === r))
    return fail('GEOMETRY', '[SHELL_NOT_CLOSED] independent cylindrical floor lost the circular cavity section.');
  const cutter = { ...hollow, caps: [{ z: z0, regions, tag: `${id}.floor` }] };
  const result: Part = { solid: { kind: 'upright', solid: booleanPrismatic(stock, cutter, 'difference') } };
  const brep = brepOf(result, id), report = checkBrep(brep, { strict: true });
  if (!report.valid || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 1
    || brep.shells.length !== 1 || !brep.shells[0].closed || report.topology[0]?.genus !== 0
    || report.counts.faces !== 7 || report.counts.loops !== 8 || report.counts.coedges !== 24
    || report.counts.edges !== 12 || report.counts.vertices !== 8 || !brep.coedges.every(use => !!use.pcurve)
    || !cylinderCapSupports(brep, original, center, radius, r, slab.z0, slab.z1, z0, z1, id, opening))
    fail('GEOMETRY', '[SHELL_NOT_CLOSED] independent cylindrical floor could not retain one strict top opening and the original outer supports.');
  return { ...result, brep };
}

/** Certify actual shell ownership, opposing caps and complete native circular trims, beyond mass alone. */
function cylinderCapSupports(brep: Brep, original: Brep, center: Readonly<XY>, radius: number, innerRadius: number,
  lo: number, hi: number, z0: number, z1: number, id: string, opening?: string): boolean {
  const [outer, cavity] = brep.bodies[0].shells, inner = opening ? outer : cavity, roundoff = 128 * Number.EPSILON * Math.max(1, radius, ...center.map(Math.abs), Math.abs(lo), Math.abs(hi));
  const near = (a: number, b: number) => Math.abs(a - b) <= roundoff;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use])), edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  if (new Set(brep.faces.map(face => face.name)).size !== (opening ? 7 : 8)
    || brep.faces.filter(face => face.shell === outer).length !== (opening ? 7 : 4)
    || !opening && (outer === inner || brep.faces.filter(face => face.shell === inner).length !== 4)) return false;
  for (const face of original.faces) {
    const matches = brep.faces.filter(candidate => candidate.name === face.name), old = faceGeometry(face), current = matches[0] && faceGeometry(matches[0]);
    if (matches.length !== 1 || matches[0].shell !== outer || !current || old.kind !== current.kind) return false;
    if (old.kind === 'plane' && (current.kind !== 'plane' || !old.n.every((value, axis) => near(value, current.n[axis]))
      || !near(dot(old.n, sub(current.o, old.o)), 0))) return false;
  }
  for (const [shell, r, bottom, top, out] of [[outer, radius, lo, hi, 1], [inner, innerRadius, z0, z1, -1]] as const) {
    const cylinders = brep.faces.filter(face => {
      if (face.shell !== shell) return false;
      const g = faceGeometry(face); return g.kind === 'cylinder' && g.out === out;
    });
    if (cylinders.length !== 2) return false;
    for (const face of cylinders) {
      const g = faceGeometry(face);
      if (g.kind !== 'cylinder' || !near(g.r, r) || !near(g.c[0], center[0]) || !near(g.c[1], center[1])
        || !near(g.a[0], 0) || !near(g.a[1], 0) || !near(Math.abs(g.a[2]), 1) || g.out !== out || face.loops.length !== 1 || face.surface.kind !== 'surface') return false;
      const zs = face.surface.controlPoints.flat().map(point => point[2]);
      if (!near(Math.min(...zs), bottom) || !near(Math.max(...zs), top)) return false;
    }
  }
  const capSpecs = original.faces.filter(face => faceGeometry(face).kind === 'plane').map(face => {
    const g = faceGeometry(face);
    return { name: face.name, shell: outer, z: g.kind === 'plane' ? g.o[2] : NaN, normal: g.kind === 'plane' ? g.n[2] : NaN, r: radius };
  }).concat([{ name: `${id}.floor`, shell: inner, z: z0, normal: 1, r: innerRadius },
    ...(opening ? [] : [{ name: `${id}.ceiling`, shell: inner, z: z1, normal: -1, r: innerRadius }])]);
  return capSpecs.length === (opening ? 3 : 4) && capSpecs.every(spec => {
    const face = brep.faces.find(candidate => candidate.name === spec.name), g = face && faceGeometry(face), rim = spec.name === opening;
    if (!face || face.shell !== spec.shell || face.loops.length !== (rim ? 2 : 1) || g?.kind !== 'plane' || !near(g.o[2], spec.z)
      || !near(g.n[0], 0) || !near(g.n[1], 0) || g.n[2] !== spec.normal) return false;
    const capLoops = face.loops.map(loopId => loops.get(loopId));
    if (rim && (capLoops.filter(loop => loop?.kind === 'outer').length !== 1 || capLoops.filter(loop => loop?.kind === 'inner').length !== 1)) return false;
    return capLoops.every(loop => loop?.coedges.length === 2 && loop.coedges.every(useId => {
      const use = uses.get(useId), edge = use && edges.get(use.edge), circle = edge && circleOf(edge.curve), r = rim && loop.kind === 'inner' ? innerRadius : spec.r;
      return !!circle && near(circle.r, r) && near(circle.c[0], center[0]) && near(circle.c[1], center[1]) && near(circle.c[2], spec.z)
        && !!edge && edge.curve.controlPoints.every(point => near(point[2], spec.z));
    }));
  });
}
