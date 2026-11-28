// R5.3 (D225): the part model's shell and thicken features, moved out of part-model.ts's operation() as they were
// there. Since D361 the shell helpers (`shellOf` and the rest) live here too and reach part-model.ts's values through a
// function-level import. The dispatcher calls `shellOperation` for those kinds.
import { BrepError, checkBrep, isFacetFace, mergeBreps, type Brep } from '../brep/brep-core.js';
import { isMeshBrepError } from '../mesh/mesh-brep.js';
import { booleanPrismatic, prismaticExtrude, type PrismaticSolid } from '../features/prismatic-solid.js';
import { erodeSection } from '../features/section-offset.js';
import { booleanCurveRegions, curveTolerance, regionMoments, segReverse, type CurveRegion2, type CurveSegment2, type XY } from '../brep/curved-arrangement.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import { facetBrepFromTriangles } from '../mesh/facet-brep.js';
import { buildProfileLoop, ExtrudedProfileLimits, type ProfileSegmentInput } from '../features/extruded-profile-solid.js';
import { revolveProfile, revolveMassProperties, type RevolveInput } from '../features/revolve.js';
import { transformBrep } from '../brep/brep-transform.js';
import { unsupportedNativeMass } from '../internal/native-si-mass-state.js';
import { withCavities } from '../brep/brep-glue.js';
import { generalShell } from '../blend/general-shell.js';
import { closedLShellWallLimit } from '../features/closed-l-shell-profile.js';
import { closedBoxShellWithWalls, threeOrFourOpeningBoxShellWithWalls, twoOpeningBoxShellWithWalls, boxShellWallLimit, boxShellWithWalls } from './part-box-shell.js';
import { originalCylinderCaps, closedCylinderCaps, topOpenCylinderFloor, bottomOpenCylinderCeiling } from './part-cylinder-shell-caps.js';
import { openRevolvedCapsuleShell } from './part-capsule-shell.js';
import { offsetCavity, offsetShell, smoothOffsetBody } from '../blend/offset-cavity.js';
import { regionShell } from '../blend/region-shell.js';
import { meshInnerOffset } from '../mesh/mesh-offset.js';
import { type MassProperties } from '../brep/solid-mass.js';
import { cross, dot, len, sub, unit } from '../core/vec3.js';
import { type Point } from '../types.js';
import { thickenSolid } from '../brep/thicken-solid.js';
import { isThickenPlanarError, thickenPlanarSolid } from '../brep/thicken-planar.js';
import { isThickenCylinderError, thickenCylinderSolid } from '../brep/thicken-cylinder.js';
import { validateSurface } from '../core/math.js';
import type { CadPartDim, Solid, CadPartFeature, Result, Tools, PartHelpers, Part, Finish, SweepStep } from './part-model.js';
import { CadPartError, CadPartLimits, affine, boolean, brepOf, facetTriangles, movedMass, profiling, sweepBrep } from './part-model.js';
import { finishEdges } from './part-finish.js';
import { checkExpected, expectOf } from './part-expect.js';

/** A shell or thicken feature's evaluation (part-model.ts's operation() for these kinds). */
export function shellOperation(f: CadPartFeature & Record<string, unknown>, t: Tools, k: PartHelpers): () => Result {
  const { dim, solids, fail, at } = t;
  const { isRecord } = k;
  const one = (s: Solid): Result => ({ kind: 'solid', parts: [{ solid: s }] });
  switch (f.kind) {
    case 'thicken': {
      const g = f.surface as Record<string, unknown>, t = dim(f.thickness as CadPartDim, 'thickness', true), side = f.side ?? 'normal', mode = f.mode === undefined ? 'sampled' : f.mode;
      if (!isRecord(g)) fail('INPUT', 'surface must be a NURBS surface { degreeU, degreeV, knotsU, knotsV, controlPoints, weights }');
      if (side !== 'normal' && side !== 'reverse' && side !== 'both') fail('INPUT', 'side must be normal, reverse or both');
      if (mode !== 'sampled' && mode !== 'exact-planar' && mode !== 'exact-cylinder') fail('INPUT', 'Thicken mode must be sampled, exact-planar or exact-cylinder');
      const surface = { kind: 'surface' as const, id: 'surface', degreeU: g.degreeU as number, degreeV: g.degreeV as number, knotsU: g.knotsU as number[], knotsV: g.knotsV as number[], controlPoints: g.controlPoints as Point[][], weights: g.weights as number[][] };
      try { validateSurface(surface); } catch (cause) { fail('INPUT', `surface: ${cause instanceof Error ? cause.message : String(cause)}`); }
      return () => {
        try {
          const request = { id: at, surface, thickness: t, side: side as 'normal' | 'reverse' | 'both' };
          const brep = mode === 'exact-cylinder' ? thickenCylinderSolid(request) : mode === 'exact-planar' ? thickenPlanarSolid(request) : thickenSolid(request);
          return one({ kind: 'brep', brep });
        }
        catch (cause) {
          if (isThickenPlanarError(cause)) fail('CAPABILITY', cause.message);
          if (isThickenCylinderError(cause)) fail('CAPABILITY', cause.message);
          const m = cause instanceof BrepError ? /CAPABILITY: shell: (.*)$/s.exec(cause.message) : null;
          if (m) fail('CAPABILITY', m[1]);
          if (cause instanceof RangeError || isMeshBrepError(cause)) fail('GEOMETRY', cause.message);
          throw cause;
        }
      };
    }
    case 'shell': {
      const target = solids(f.target, 'target'), thickness = dim(f.thickness as CadPartDim, 'thickness', true);
      const open = f.open === undefined ? [] : f.open as unknown;
      if (!Array.isArray(open) || open.length > CadPartLimits.edges || !open.every(x => typeof x === 'string')) fail('INPUT', 'open must list up to 64 face names');
      if (target.length !== 1) fail('REFERENCE', 'shell one part at a time (name it as id/k)');
      const names = open as string[], part = target[0], expect = expectOf(f, fail);
      const join = f.join;
      if (join !== undefined && join !== 'sharp' && join !== 'arc') fail('INPUT', 'Shell join must be sharp or arc.');
      const floorThickness = f.floorThickness;
      if (floorThickness !== undefined && (typeof floorThickness !== 'number' || !Number.isFinite(floorThickness) || floorThickness < ExtrudedProfileLimits.minimumLengthMM))
        fail('PARAMETER', `Shell floor thickness must be at least ${ExtrudedProfileLimits.minimumLengthMM} mm.`);
      const ceilingThickness = f.ceilingThickness;
      if (ceilingThickness !== undefined && (typeof ceilingThickness !== 'number' || !Number.isFinite(ceilingThickness) || ceilingThickness < ExtrudedProfileLimits.minimumLengthMM))
        fail('PARAMETER', `Shell ceiling thickness must be at least ${ExtrudedProfileLimits.minimumLengthMM} mm.`);
      const pairedCaps = floorThickness !== undefined && ceilingThickness !== undefined;
      if (pairedCaps && names.length)
        fail('INPUT', 'Independent Shell floor and ceiling thicknesses need a closed body with no openings.');
      const capThickness = floorThickness ?? ceilingThickness, capLabel = floorThickness !== undefined ? 'floor' : 'ceiling';
      const limit = join === undefined && capThickness === undefined ? undefined : originalClosedLShellLimit(f.target, part, t);
      const cylinder = capThickness !== undefined ? originalCylinderCaps(f.target, part, t) : undefined;
      if (cylinder && join !== undefined)
        fail('CAPABILITY', 'Independent cylindrical Shell caps do not support an explicit join.');
      const [targetId, output] = f.target.split('/'), capPrefix = `${targetId}.cut.`;
      const capOpening = names.length === 1 && (names[0] === `${targetId}.top` || names[0] === `${targetId}.bottom`);
      const openingSign = names[0] === `${targetId}.bottom` ? -1 : 1;
      if (pairedCaps && limit === undefined && cylinder === undefined)
        fail('CAPABILITY', 'Independent closed Shell caps need one original zero-draft upright orthogonal L extrusion.');
      if (!pairedCaps && floorThickness !== undefined && (limit === undefined && cylinder === undefined || names.length !== 1 || names[0] !== `${targetId}.top`))
        fail('CAPABILITY', 'Independent Shell floor needs one original zero-draft upright orthogonal L or literal unplaced XY solid-circle extrusion with only its exact top cap opened.');
      if (!pairedCaps && ceilingThickness !== undefined && (limit === undefined && cylinder === undefined || names.length !== 1 || names[0] !== `${targetId}.bottom`))
        fail('CAPABILITY', 'Independent Shell ceiling needs one original zero-draft upright orthogonal L or literal unplaced XY solid-circle extrusion with only its exact bottom cap opened.');
      if (join !== undefined && (names.length > 0 && !capOpening || limit === undefined))
        fail('CAPABILITY', 'Explicit Shell join needs one original closed zero-draft upright orthogonal L extrusion, or its single exact original top cap or bottom cap.');
      if (capThickness !== undefined && limit !== undefined
        && (thickness < ExtrudedProfileLimits.minimumLengthMM || 2 * (limit - thickness) < ExtrudedProfileLimits.minimumLengthMM))
        fail('PARAMETER', 'The Shell side thickness leaves no supported L cavity.');
      if (limit !== undefined && thickness >= limit)
        fail('PARAMETER', `Shell join wall thickness must be less than ${limit} mm to keep both L arms and the closed height.`);
      const caps = names.length && output !== undefined && t.featureKind(targetId) === 'split'
        ? names.filter(name => name.startsWith(capPrefix) && /^(?:side[0-3]|top|bottom)$/.test(name.slice(capPrefix.length))) : [];
      return () => {
        if (caps.length || expect) {
          // Inspect the chosen Split output before a base tag can open several native faces.
          const brep = caps.length ? part.brep ?? brepOf({ solid: part.solid }, targetId) : brepOf(part, at);
          for (const cap of caps) {
            const count = brep.faces.filter(face => !isFacetFace(face) && face.name?.replace(/#\d+$/, '') === cap).length;
            if (count > 1) fail('REFERENCE', `Split cap "${cap}" is ambiguous on this output (${count} native faces).`);
          }
          if (expect) checkExpected(brep, expect, false, 'shell', fail);
        }
        if (floorThickness !== undefined && ceilingThickness !== undefined) {
          if (cylinder) return { kind: 'solid', parts: [closedCylinderCaps(part, cylinder, thickness, floorThickness, ceilingThickness, at, fail)] };
          const original = brepOf(part, f.target), input = checkBrep(original, { strict: true });
          const stock = part.solid.kind === 'upright' ? part.solid.solid : fail('CAPABILITY', 'Independent closed Shell caps need original upright stock.');
          if (!input.valid || original.bodies.length !== 1 || original.bodies[0].kind !== 'solid' || original.shells.length !== 1
            || !original.shells[0].closed || original.faces.length !== 8 || new Set(original.faces.map(face => face.name)).size !== 8)
            fail('REFERENCE', 'Independent closed Shell caps need one strict original L prism.');
          const slab = stock.slabs[0], height = slab.z1 - slab.z0, z0 = slab.z0 + floorThickness, z1 = slab.z1 - ceilingThickness;
          if (!(height - floorThickness - ceilingThickness >= ExtrudedProfileLimits.minimumLengthMM
            && z1 - z0 >= ExtrudedProfileLimits.minimumLengthMM && z0 > slab.z0 && z1 < slab.z1))
            fail('PARAMETER', 'The Shell floor and ceiling thicknesses leave no supported cavity height.');
          const sharp = join === 'sharp', hollow = independentLCapHollow(stock, thickness, z0, z1, sharp, at, fail);
          const result: Part = { solid: { kind: 'upright', solid: booleanPrismatic(stock, hollow, 'difference') } };
          const brep = brepOf(result, at), report = checkBrep(brep, { strict: true });
          if (!report.valid || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.bodies[0].shells.length !== 2
            || brep.shells.length !== 2 || !brep.shells.every(shell => shell.closed) || report.topology[0]?.genus !== 0
            || report.counts.faces !== (sharp ? 16 : 17) || report.counts.loops !== (sharp ? 16 : 17)
            || report.counts.coedges !== (sharp ? 72 : 78) || report.counts.edges !== (sharp ? 36 : 39) || report.counts.vertices !== (sharp ? 24 : 26)
            || !brep.coedges.every(use => !!use.pcurve) || !closedLCapCavity(brep, original, stock, z0, z1, at)
            || !lWallSupports(brep, original, stock, thickness, at, sharp))
            fail('GEOMETRY', '[SHELL_NOT_CLOSED] independent closed L caps could not retain one strict cavity and the original outer supports.');
          return { kind: 'solid', parts: [{ ...result, brep }] };
        }
        if (capThickness !== undefined) {
          if (cylinder) return { kind: 'solid', parts: [floorThickness !== undefined
            ? topOpenCylinderFloor(part, cylinder, thickness, floorThickness, names[0], at, fail)
            : bottomOpenCylinderCeiling(part, cylinder, thickness, capThickness, names[0], at, fail)] };
          const original = brepOf(part, f.target), input = checkBrep(original, { strict: true });
          const caps = original.faces.filter(face => face.name === names[0]), support = caps[0] && faceGeometry(caps[0]);
          const capName = openingSign === 1 ? 'top' : 'bottom', station = (openingSign === 1 ? Math.max : Math.min)(...original.vertices.map(vertex => vertex.point[2]));
          if (!input.valid || original.bodies.length !== 1 || original.shells.length !== 1 || original.faces.length !== 8
            || new Set(original.faces.map(face => face.name)).size !== 8 || caps.length !== 1 || caps[0].loops.length !== 1
            || support?.kind !== 'plane' || support.n[2] !== openingSign || support.o[2] !== station)
            fail('REFERENCE', `Independent Shell ${capLabel} needs one strict original L prism and its unambiguous exact ${capName} cap.`);
          const stock = part.solid.kind === 'upright' ? part.solid.solid : fail('CAPABILITY', `Independent Shell ${capLabel} needs original upright stock.`);
          const slab = stock.slabs[0], height = slab.z1 - slab.z0;
          if (!(height - capThickness >= ExtrudedProfileLimits.minimumLengthMM))
            fail('PARAMETER', `The Shell ${capLabel} thickness leaves no cavity height.`);
          const sharp = join === 'sharp', hollow = floorThickness !== undefined && !sharp
            ? hollowOf(stock, thickness, names, at, fail, floorThickness).hollow
            : independentLCapHollow(stock, thickness, openingSign === 1 ? slab.z0 + capThickness : slab.z0 - 1,
              openingSign === 1 ? slab.z1 + 1 : slab.z1 - capThickness, sharp, at, fail);
          const result: Part = { solid: { kind: 'upright', solid: booleanPrismatic(stock, hollow, 'difference') } };
          const brep = brepOf(result, at), report = checkBrep(brep, { strict: true });
          if (!report.valid || brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1
            || !brep.shells[0].closed || report.topology[0]?.genus !== 0 || report.counts.faces !== (sharp ? 15 : 16)
            || report.counts.loops !== (sharp ? 16 : 17) || report.counts.edges !== (sharp ? 36 : 39) || report.counts.vertices !== (sharp ? 24 : 26)
            || !brep.coedges.every(use => !!use.pcurve) || !singleLCapOpening(brep, original, names[0], capThickness, openingSign)
            || !lWallSupports(brep, original, stock, thickness, at, sharp)
            || !original.faces.every(face => {
              const matches = brep.faces.filter(candidate => candidate.name === face.name), old = faceGeometry(face);
              const current = matches[0] && faceGeometry(matches[0]);
              return matches.length === 1 && old.kind === 'plane' && current?.kind === 'plane'
                && old.n.every((value, axis) => value === current.n[axis]) && dot(old.n, sub(current.o, old.o)) === 0;
            }))
            fail('GEOMETRY', `[SHELL_NOT_CLOSED] independent L ${capLabel} could not retain one strict ${sharp ? 'Sharp' : 'Round'} ${capName} opening and its original outer supports.`);
          return { kind: 'solid', parts: [{ ...result, brep }] };
        }
        if (join !== undefined) {
          const original = brepOf(part, f.target), input = checkBrep(original, { strict: true });
          if (!input.valid || original.bodies.length !== 1 || original.shells.length !== 1 || original.faces.length !== 8)
            fail('CAPABILITY', 'Explicit Shell join needs one strict original L prism.');
          if (capOpening) {
            const caps = original.faces.filter(face => face.name === names[0]), cap = caps[0], support = cap && faceGeometry(cap);
            const station = (openingSign === 1 ? Math.max : Math.min)(...original.vertices.map(vertex => vertex.point[2]));
            if (caps.length !== 1 || cap.loops.length !== 1 || support?.kind !== 'plane' || support.n[2] !== openingSign || support.o[2] !== station)
              fail('REFERENCE', `Explicit Shell join needs one unambiguous original ${openingSign === 1 ? 'top' : 'bottom'} cap.`);
          }
          try {
            const brep = generalShell(original, thickness, new Set(names), at, join), report = checkBrep(brep, { strict: true });
            if (!report.valid || brep.bodies.length !== 1 || brep.shells.length !== (capOpening ? 1 : 2)
              || capOpening && (brep.bodies[0].kind !== 'solid' || !brep.shells[0].closed || report.topology[0]?.genus !== 0 || !singleLCapOpening(brep, original, names[0], thickness, openingSign)))
              fail('CAPABILITY', `[SHELL_NOT_CLOSED] the explicit L join did not produce one strict body with ${capOpening ? `one connected ${openingSign === 1 ? 'top' : 'bottom'} opening` : 'one cavity'}: ${report.issues[0] ?? 'unexpected topology'}`);
            return one({ kind: 'brep', brep });
          } catch (cause) {
            const message = cause instanceof BrepError ? /CAPABILITY: shell: (.*)$/s.exec(cause.message) : null;
            if (message) fail('CAPABILITY', message[1]);
            throw cause;
          }
        }
        return { kind: 'solid', parts: [shellOf(part, thickness, names, at, fail)] };
      };
    }
    case 'shell-walls': {
      const target = solids(f.target, 'target'), part = target[0];
      if (target.length !== 1 || t.featureKind(f.target) !== 'extrude' || part.solid.kind !== 'upright')
        return fail('CAPABILITY', 'Per-face Shell needs one original upright box extrusion.');
      const { opening, secondOpening, thirdOpening, fourthOpening, walls } = f;
      if ((opening !== null && (typeof opening !== 'string' || !opening)) || !isRecord(walls))
        return fail('INPUT', 'Per-face Shell needs an opening name or an explicit closed mode and a map of wall thicknesses.');
      if (secondOpening !== undefined && (opening === null || typeof secondOpening !== 'string' || !secondOpening || secondOpening === opening))
        return fail('INPUT', 'Per-face Shell needs two distinct original opening names for two openings.');
      if (thirdOpening !== undefined && (opening === null || secondOpening === undefined || typeof thirdOpening !== 'string'
        || !thirdOpening || thirdOpening === opening || thirdOpening === secondOpening))
        return fail('INPUT', 'Per-face Shell needs three distinct original opening names.');
      if (fourthOpening !== undefined && (thirdOpening === undefined || typeof fourthOpening !== 'string'
        || !fourthOpening || fourthOpening === opening || fourthOpening === secondOpening || fourthOpening === thirdOpening))
        return fail('INPUT', 'Per-face Shell needs four distinct original opening names.');
      if (opening === null || secondOpening !== undefined) {
        const parent = t.ref(f.target, 'Per-face Shell stock').author;
        const sketch = parent?.kind === 'extrude' ? t.ref(parent.sketch, 'Per-face Shell sketch') : undefined;
        if (parent?.kind !== 'extrude' || (parent.draft !== undefined && parent.draft !== 0)
          || sketch?.author?.kind !== 'sketch' || sketch.author.profile !== 'rectangle'
          || sketch.result.kind !== 'sketch' || sketch.result.holes?.length || sketch.result.regions?.length)
          return fail('CAPABILITY', opening === null ? 'Closed per-face Shell needs one original zero-draft rectangular extrusion.'
            : thirdOpening === undefined ? 'Two-opening per-face Shell needs one original zero-draft rectangular extrusion.'
              : fourthOpening === undefined ? 'Three-opening per-face Shell needs one original zero-draft rectangular extrusion.'
                : 'Four-opening per-face Shell needs one original zero-draft rectangular extrusion.');
      }
      const stock = part.solid.solid, expect = expectOf(f, fail);
      return () => {
        const original = brepOf(part, f.target);
        if (expect) {
          if (expect.size !== 6) fail('REFERENCE', 'Per-face Shell needs all six original face signatures.');
          checkExpected(original, expect, false, 'shell-walls', fail);
        }
        const { solid, brep } = opening === null ? closedBoxShellWithWalls(stock, original, walls, at, fail)
          : secondOpening === undefined ? boxShellWithWalls(stock, original, opening, walls, at, fail)
            : thirdOpening === undefined ? twoOpeningBoxShellWithWalls(stock, original, [opening, secondOpening], walls, at, fail)
              : threeOrFourOpeningBoxShellWithWalls(stock, original,
                fourthOpening === undefined ? [opening, secondOpening, thirdOpening] : [opening, secondOpening, thirdOpening, fourthOpening], walls, at, fail);
        return { kind: 'solid', parts: [{ solid: { kind: 'upright', solid }, brep }] };
      };
    }
  }
  throw new Error(`shellOperation: ${f.kind} is not one of its features`);
}

/** An opened L has one cap annulus, an intact opposite cap, and a cavity floor/ceiling at the wall depth. */
function singleLCapOpening(brep: Brep, original: Brep, capName: string, thickness: number, sign: 1 | -1): boolean {
  const levels = [...new Set(original.vertices.map(v => v.point[2]))].sort((a, b) => a - b), [lo, hi] = levels;
  if (levels.length !== 2) return false;
  const roundoff = 128 * Number.EPSILON * Math.max(1, Math.abs(lo), Math.abs(hi), thickness);
  const horizontal = brep.faces.map(face => ({ face, support: faceGeometry(face) })).filter(item => item.support.kind === 'plane' && Math.abs(item.support.n[2]) === 1);
  const at = (z: number, sign: number) => horizontal.filter(item => item.support.kind === 'plane' && item.support.n[2] === sign && Math.abs(item.support.o[2] - z) <= roundoff);
  const rimStation = sign === 1 ? hi : lo, retainedStation = sign === 1 ? lo : hi;
  const rim = at(rimStation, sign), retained = at(retainedStation, -sign), cavity = at(retainedStation + sign * thickness, sign), cap = rim[0]?.face;
  if (horizontal.length !== 3 || rim.length !== 1 || retained.length !== 1 || cavity.length !== 1 || cap?.name !== capName
    || retained[0].face.loops.length !== 1 || cavity[0].face.loops.length !== 1 || cap.loops.length !== 2) return false;
  const loops = cap.loops.map(id => brep.loops.find(loop => loop.id === id));
  if (loops.filter(loop => loop?.kind === 'outer').length !== 1 || loops.filter(loop => loop?.kind === 'inner').length !== 1) return false;
  const coedges = new Map(brep.coedges.map(use => [use.id, use])), edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  return loops.every(loop => loop && loop.coedges.every(id => {
    const use = coedges.get(id), edge = use && edges.get(use.edge);
    return edge && edge.curve.controlPoints.every(point => Math.abs(point[2] - rimStation) <= roundoff);
  }));
}

/** The named inner planes and optional Round chart belong to the certified original side supports. */
function lWallSupports(brep: Brep, original: Brep, stock: PrismaticSolid, thickness: number, id: string, sharp: boolean): boolean {
  const roundoff = 128 * Number.EPSILON * Math.max(1, thickness, ...original.vertices.flatMap(vertex => vertex.point.map(Math.abs)));
  for (const face of original.faces) {
    const source = faceGeometry(face);
    if (source.kind !== 'plane' || source.n[2] !== 0) continue;
    const inner = brep.faces.filter(candidate => candidate.name?.replace(/#\d+$/, '') === `${id}.in.${face.name}`)
      .map(candidate => faceGeometry(candidate)).filter(geometry => geometry.kind === 'plane');
    const plane = inner[0];
    if (inner.length !== 1 || plane?.kind !== 'plane' || !source.n.every((value, axis) => Math.abs(value + plane.n[axis]) <= roundoff)
      || Math.abs(dot(source.n, sub(plane.o, source.o)) + thickness) > roundoff) return false;
  }
  const ring = stock.slabs[0].regions[0].outer;
  const reflex = ring.filter((segment, i) => {
    const previous = ring[(i + ring.length - 1) % ring.length];
    return segment.kind === 'line' && previous.kind === 'line'
      && (previous.b[0] - previous.a[0]) * (segment.b[1] - segment.a[1]) - (previous.b[1] - previous.a[1]) * (segment.b[0] - segment.a[0]) < 0;
  });
  const cylinders = brep.faces.map(face => faceGeometry(face)).filter(geometry => geometry.kind === 'cylinder'), corner = reflex[0];
  if (sharp) return reflex.length === 1 && cylinders.length === 0 && brep.faces.every(face => faceGeometry(face).kind === 'plane');
  const cylinder = cylinders[0];
  return reflex.length === 1 && corner?.kind === 'line' && cylinders.length === 1 && cylinder?.kind === 'cylinder'
    && Math.abs(cylinder.r - thickness) <= roundoff && Math.abs(cylinder.c[0] - corner.a[0]) <= roundoff
    && Math.abs(cylinder.c[1] - corner.a[1]) <= roundoff && cylinder.out === 1
    && Math.abs(cylinder.a[2]) === 1;
}

/** A certified cardinal L retains its side inset and uses the caller's exact cavity stations. */
function independentLCapHollow(stock: PrismaticSolid, thickness: number, z0: number, z1: number, sharp: boolean, id: string, fail: Tools['fail']): PrismaticSolid {
  const slab = stock.slabs[0], ring = slab.regions[0].outer;
  const lines = ring.filter((segment): segment is Extract<CurveSegment2, { kind: 'line' }> => segment.kind === 'line');
  if (stock.slabs.length !== 1 || slab.regions.length !== 1 || slab.regions[0].holes.length || lines.length !== 6 || ring.length !== 6)
    return fail('CAPABILITY', 'Independent Shell cap needs one certified original L section.');
  let inner: CurveRegion2[];
  if (sharp) {
    const normals = lines.map(segment => [-Math.sign(segment.b[1] - segment.a[1]), Math.sign(segment.b[0] - segment.a[0])] as XY);
    if (normals.some((normal, i) => {
      const previous = normals[(i + 5) % 6];
      return Math.abs(normal[0]) + Math.abs(normal[1]) !== 1 || normal[0] * previous[0] + normal[1] * previous[1] !== 0;
    })) return fail('CAPABILITY', 'Independent Sharp Shell cap needs exact orthogonal side supports.');
    const points = lines.map((segment, i): XY => {
      const normal = normals[i], previous = normals[(i + 5) % 6];
      return [segment.a[0] + thickness * (previous[0] + normal[0]), segment.a[1] + thickness * (previous[1] + normal[1])];
    });
    const outer = lines.map((segment, i): CurveSegment2 => ({ kind: 'line', a: points[i], b: points[(i + 1) % 6], tag: `${id}.in.${segment.tag ?? 'wall'}` }));
    if (points.some(point => point.some(value => !Number.isFinite(value))) || lines.some((segment, i) => {
      const a = points[i], b = points[(i + 1) % 6];
      return (b[0] - a[0]) * Math.sign(segment.b[0] - segment.a[0])
        + (b[1] - a[1]) * Math.sign(segment.b[1] - segment.a[1]) < ExtrudedProfileLimits.minimumLengthMM;
    })) return fail('PARAMETER', 'The Shell side thickness leaves no supported Sharp L cavity.');
    inner = [{ outer, holes: [] }];
  } else inner = erodeSection(slab.regions, thickness, () => false, tag => `${id}.in.${tag ?? 'wall'}`, curveTolerance([ring]));
  const hollow = prismaticExtrude(inner.flatMap(region => [region.outer, ...region.holes]), z0, z1), cavity = hollow.slabs[0];
  if (hollow.slabs.length !== 1 || !cavity || cavity.regions.length !== 1 || cavity.regions[0].holes.length
    || cavity.regions[0].outer.length !== (sharp ? 6 : 7)
    || cavity.regions[0].outer.filter(segment => segment.kind === 'line').length !== 6
    || cavity.regions[0].outer.filter(segment => segment.kind === 'arc').length !== (sharp ? 0 : 1))
    return fail('GEOMETRY', 'Independent Shell cap could not retain one exact L cavity with its chosen corner.');
  const regions = cavity.regions;
  return { ...hollow, caps: [{ z: z0, regions, tag: `${id}.floor` }, { z: z1, regions, tag: `${id}.ceiling` }] };
}

/** The eight original faces enclose one internal shell whose floor and ceiling oppose each other. */
function closedLCapCavity(brep: Brep, original: Brep, stock: PrismaticSolid, z0: number, z1: number, id: string): boolean {
  const [outer, cavity] = brep.bodies[0].shells;
  const originalNames = new Set(original.faces.map(face => face.name)), outerFaces = brep.faces.filter(face => face.shell === outer);
  const innerFaces = brep.faces.filter(face => face.shell === cavity);
  if (outer === cavity || outerFaces.length !== 8 || outerFaces.some(face => !originalNames.has(face.name))
    || innerFaces.length !== brep.faces.length - 8 || new Set(brep.faces.map(face => face.name)).size !== brep.faces.length) return false;
  if (!original.faces.every(face => {
    const matches = outerFaces.filter(candidate => candidate.name === face.name), old = faceGeometry(face), current = matches[0] && faceGeometry(matches[0]);
    return matches.length === 1 && matches[0].loops.length === 1 && old.kind === 'plane' && current?.kind === 'plane'
      && old.n.every((value, axis) => value === current.n[axis]) && dot(old.n, sub(current.o, old.o)) === 0;
  })) return false;
  const horizontal = brep.faces.filter(face => { const support = faceGeometry(face); return support.kind === 'plane' && Math.abs(support.n[2]) === 1; });
  const roundoff = 128 * Number.EPSILON * Math.max(1, Math.abs(z0), Math.abs(z1), ...original.vertices.flatMap(vertex => vertex.point.map(Math.abs)));
  const capAt = (name: string, shell: string, z: number, normal: number) => {
    const matches = horizontal.filter(face => face.name === name), face = matches[0], support = face && faceGeometry(face);
    return matches.length === 1 && face.shell === shell && face.loops.length === 1 && support?.kind === 'plane'
      && support.n[2] === normal && Math.abs(support.o[2] - z) <= roundoff;
  };
  const slab = stock.slabs[0];
  const originals = horizontal.filter(face => originalNames.has(face.name));
  if (horizontal.length !== 4 || originals.length !== 2
    || !originals.every(face => { const support = faceGeometry(face); return support.kind === 'plane'
      && (support.n[2] === -1 && Math.abs(support.o[2] - slab.z0) <= roundoff || support.n[2] === 1 && Math.abs(support.o[2] - slab.z1) <= roundoff); })
    || !capAt(`${id}.floor`, cavity, z0, 1) || !capAt(`${id}.ceiling`, cavity, z1, -1)) return false;
  const loops = new Map(brep.loops.map(loop => [loop.id, loop])), uses = new Map(brep.coedges.map(use => [use.id, use])), edges = new Map(brep.edges.map(edge => [edge.id, edge]));
  return innerFaces.every(face => face.loops.length === 1 && face.loops.every(loopId => {
    const loop = loops.get(loopId);
    return loop?.coedges.every(useId => {
      const use = uses.get(useId), edge = use && edges.get(use.edge);
      return edge && edge.curve.controlPoints.every(point => point[2] >= z0 - roundoff && point[2] <= z1 + roundoff);
    });
  }));
}

/** Authored ownership and the evaluated straight section must describe the same unplaced original L. */
function originalClosedLShellLimit(reference: string, part: Part, t: Tools): number | undefined {
  const owner = t.ref(reference, 'Shell join stock'), author = owner.author;
  if (author?.kind !== 'extrude' || owner.result.kind !== 'solid' || owner.result.parts.length !== 1 || owner.result.parts[0] !== part
    || (author.draft !== undefined && author.draft !== 0) || part.solid.kind !== 'upright') return undefined;
  const sketch = t.ref(author.sketch, 'Shell join sketch'), source = sketch.author;
  if (source?.kind !== 'sketch' || (source.profile !== 'polygon' && source.profile !== 'loop') || source.plane !== undefined
    || source.holes?.length || source.regions?.length || sketch.result.kind !== 'sketch' || sketch.result.frame
    || sketch.result.holes?.length || sketch.result.regions?.length) return undefined;
  const raw = source.profile === 'polygon' ? source.points : source.segments.every(s => s.kind === 'line') ? source.segments.map(s => s.start) : [];
  if (raw.some(p => p.some(v => typeof v !== 'number'))) return undefined;
  const points = raw.map(p => [p[0] as number, p[1] as number] as XY), height = t.dim(author.height, 'Shell join stock height'), from = t.dim(author.from ?? 0, 'Shell join stock from');
  const limit = closedLShellWallLimit(points, height), slabs = part.solid.solid.slabs, slab = slabs[0];
  if (limit === undefined || slabs.length !== 1 || slab.z0 !== from || slab.z1 !== from + height
    || slab.regions.length !== 1 || slab.regions[0].holes.length) return undefined;
  const outer = slab.regions[0].outer;
  const lines = outer.filter((g): g is Extract<CurveSegment2, { kind: 'line' }> => g.kind === 'line');
  if (lines.length !== outer.length || closedLShellWallLimit(lines.map(g => g.a), height) !== limit) return undefined;
  if (!lines.every((g, i) => points.some(p => p[0] === g.a[0] && p[1] === g.a[1])
    && g.b[0] === lines[(i + 1) % lines.length].a[0] && g.b[1] === lines[(i + 1) % lines.length].a[1])) return undefined;
  return limit;
}

// Shell helpers moved from part-model.ts (3b, D361).
// ---- shell -----------------------------------------------------------------------------------------------
/**
 * An upright body of one section, hollowed: the section eroded by the thickness (exact for lines and
 * arcs), extruded from the thickness above the bottom to below the top (or through an open top or
 * bottom), and taken away; open side walls let the hollow run through them.
 */
/** The shell of a part, by how it was made (its mass exact when that can be). */
export function shellOf(part: Part, t: number, open: string[], at: string, fail: Tools['fail']): Part {
  if (profiling) profiling.shells++;
  // A mesh body (facet faces): its cavity its triangles offset in, the wall it achieves measured (R11.3, D114).
  const s = part.solid;
  if (s.kind === 'brep' && s.brep.faces.length && s.brep.faces.every(isFacetFace)) {
    if (open.length) fail('CAPABILITY', `opening a face of a mesh body (${open.join(', ')}) is not supported yet: shell it closed`);
    if (s.brep.bodies.some(b => b.kind === 'sheet')) fail('CAPABILITY', 'a mesh sheet encloses nothing to shell: thicken it instead');
    const mesh = facetTriangles(s.brep);
    try {
      const r = meshInnerOffset(mesh.positions, mesh.indices, t);
      const cavity = facetBrepFromTriangles(r.positions, mesh.indices, { id: `${at}_in`, maximumTriangles: CadPartLimits.meshTriangles, groups: mesh.groups, groupName: g => `${at}.in.${mesh.names[g]}`, crease: 180 });
      return { solid: { kind: 'brep', brep: withCavities(s.brep, cavity, { family: 'shell', id: at }) }, shell: r.report };
    } catch (cause) {
      const m = cause instanceof BrepError ? /CAPABILITY: (.*)$/s.exec(cause.message) : null;
      if (m) fail('CAPABILITY', m[1]);
      if (isMeshBrepError(cause)) fail('GEOMETRY', cause.message);
      throw cause;
    }
  }
  if (part.solid.kind !== 'upright') {
    if (part.revolved) return shellRevolved(part, part.revolved, t, open, at, fail);
    if (part.swept) return shellSwept(part, part.swept, t, open, at, fail);
    // A moved copy: the original's shell, moved (a scaled copy's with the wall scaled back).
    if (!part.history && part.moved) {
      const { from, m, o } = part.moved, k = Math.cbrt(Math.abs(m[0] * (m[4] * m[8] - m[5] * m[7]) - m[1] * (m[3] * m[8] - m[5] * m[6]) + m[2] * (m[3] * m[7] - m[4] * m[6])));
      const inner = shellOf(from, t / k, open, at, fail);
      return { solid: affine(inner.solid, m, o), ...(inner.mass ? { mass: (d: number) => movedMass(inner.mass!(d), m, o) } : {}) };
    }
  }
  return { solid: shellPart(part, t, open, at, fail) };
}

/** The slab route's refusals of a face's kind or trim, which the offset route may take instead (other refusals stand). */
const OFFSET_ROUTE = /freeform faces joined to others|trimmed by a curve other than its rulings and circles|bounded by a curve that is not a line or an arc/;
function shellPart(part: Part, t: number, open: string[], at: string, fail: Tools['fail']): Solid {
  if (part.solid.kind === 'upright') { const h = hollowOf(part.solid.solid, t, open, at, fail); return { kind: 'upright', solid: booleanPrismatic(part.solid.solid, h.hollow, 'difference') }; }
  if (!part.history) {
    // Any other body of planes and cylinders: its wall as the union of a slab per face.
    const body = brepOf(part, 'target'), names = new Set(body.faces.map(f => f.name ?? ''));
    for (const n of open) if (!names.has(n)) fail('SELECTION', `no face named ${n} to open; faces: ${[...names].slice(0, 12).join(', ')}`);
    const openings = new Set(open);
    const limit = openings.size === 1 ? boxShellWallLimit(body, open[0]) : undefined;
    if (limit !== undefined && t >= limit)
      fail('PARAMETER', `a wall of ${t} mm leaves no hollow at ${open[0]}; use a wall less than ${limit} mm`);
    try { return { kind: 'brep', brep: generalShell(body, t, openings, at) }; }
    catch (cause) {
      // A closed body of freeform faces meeting smoothly (a SubD body): its cavity, its faces offset (R11.2a, D110); kept
      // faces trimmed planes and cylinders too, offset exactly, where the opening leaves no sharp edge (R11.2c-1, D112).
      if (cause instanceof BrepError && OFFSET_ROUTE.test(cause.message) && smoothOffsetBody(body, new Set(open))) {
        // Opened faces (R11.2b, D111): the kept faces, their offset and the wall's end at the opening's edges.
        try { return { kind: 'brep', brep: open.length ? offsetShell(body, t, new Set(open), at, at).shell : withCavities(body, offsetCavity(body, t, `${at}_in`, at).cavity, { family: 'shell', id: at }) }; }
        catch (inner) { const m = inner instanceof BrepError ? /CAPABILITY: (.*)$/s.exec(inner.message) : null; if (m) fail('CAPABILITY', m[1]); throw inner; }
      }
      // Sharp edges between such faces' smooth regions and the planes that bound the body: bands and regions' slabs (R11.2c-2, D113).
      if (cause instanceof BrepError && OFFSET_ROUTE.test(cause.message)) {
        try { return { kind: 'brep', brep: regionShell(body, t, new Set(open), at) }; }
        catch (inner) { const m = inner instanceof BrepError ? /CAPABILITY: (.*)$/s.exec(inner.message) : null; if (m) fail('CAPABILITY', m[1]); throw inner; }
      }
      const m = cause instanceof BrepError ? /CAPABILITY: (.*)$/s.exec(cause.message) : null;
      if (m) fail('CAPABILITY', m[1]);
      if (cause instanceof BrepError && /not supported yet/.test(cause.message)) fail('CAPABILITY', cause.message.replace(/^B-rep: (analytic Boolean: )?/, ''));
      throw cause;
    }
  }
  // A finished body: its hollow is the base's hollow with the same finishes, offset by the wall — a
  // rolling ball of radius r less the wall rounds the offset of a convex edge rounded r (sharp when r
  // is not more than the wall); an equal chamfer d on a corner of angle α becomes d + t(1 − 1/sin(α/2))/cos(α/2).
  const { base, finishes } = part.history!;
  if (base.slabs.length !== 1) fail('CAPABILITY', 'shell after finishing edges works on bodies extruded from one section yet');
  const h = hollowOf(base, t, open, at, fail);
  // Walls split in parts (a full circle's halves) keep their `#k` inside.
  const face = (n: string) => { const w = n.replace(/#\d+$/, ''); return h.sides.has(w) ? `${at}.in.${n}` : h.tops.has(n) ? `${at}.ceiling` : h.bottoms.has(n) ? `${at}.floor` : null; };
  const outer = brepOf(part, 'target'), faces = new Map(outer.faces.map(f => [f.name, f]));
  let hollow: Part = { solid: { kind: 'upright', solid: h.hollow } };
  for (const fin of finishes) {
    if (fin.radii) { hollow = varyingHollow(hollow, fin, base, face, t, open, at, fail); continue; }
    // Edges by their offset size (a chamfer's depends on each corner's angle).
    const jobs = new Map<number, string[]>();
    for (const name of fin.edges) {
      let size = fin.size - t;
      const parts = name.split('|');
      if (parts.some(n => open.includes(n))) fail('CAPABILITY', `${name} borders an open face: finish the opening's edges after the shell`);
      const mapped = parts.map(face);
      if (mapped.some(n => n === null)) fail('CAPABILITY', `${fin.id} finishes ${name}, an edge made by an earlier finish: shell before that finish`);
      if (fin.kind === 'chamfer') {
        // The corner's angle from the faces' normals there (a cap meets a wall square).
        const g = parts.map(n => { try { return faces.has(n) ? faceGeometry(faces.get(n)!) : { kind: 'other' as const }; } catch { return { kind: 'other' as const }; } });
        const alpha = g[0].kind === 'plane' && g[1].kind === 'plane' ? Math.PI - Math.acos(Math.max(-1, Math.min(1, dot(g[0].n, g[1].n)))) : Math.PI / 2;
        size = fin.size + t * (1 - 1 / Math.sin(alpha / 2)) / Math.cos(alpha / 2);
      }
      if (!(size > 1e-9)) continue;
      const key = Math.round(size * 1e9) / 1e9;
      jobs.set(key, [...(jobs.get(key) ?? []), (mapped as string[]).sort().join('|')]);
    }
    [...jobs].forEach(([size, edges], k) => {
      const known = new Set(brepOf(hollow, `${at}_hollow`).edges.map(e => e.name)), missing = edges.find(e => !known.has(e));
      if (missing) fail('CAPABILITY', `the wall rounds the inside corner of ${missing} already: shell inside corners finished by ${fin.id} is not supported yet`);
      hollow = { solid: finishEdges(hollow, edges, size, fin.kind, `${at}_in_${fin.id}${k ? `_${k}` : ''}`, fail) };
    });
  }
  // (Ids are identifiers; the hollow's finished faces are named `${at}.in.${finish}.…`.)
  const inner = hollow.solid.kind === 'brep' ? { kind: 'brep' as const, brep: transformBrep(hollow.solid.brep, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, 0] }, n => n.split(`${at}_in_`).join(`${at}.in.`)) } : hollow.solid;
  return boolean(part.solid, inner, 'difference', at);
}

/**
 * The hollow rounded after a variable-radius fillet (D108): the ball's spine is the outer fillet's, its radius the outer
 * one less the wall — exact for a straight chain with its radius linear along it (two points): the radius at the hollow
 * chain's ends from the outer law. Sharp where the wall reaches the radius all along; refused where it does partway, and
 * for a curved chain or more points (their law along the hollow's chain is not the outer one's).
 */
function varyingHollow(hollow: Part, fin: Finish, base: PrismaticSolid, face: (n: string) => string | null, t: number, open: readonly string[], at: string, fail: Tools['fail']): Part {
  const radii = fin.radii!, outer = brepOf({ solid: { kind: 'upright', solid: base } }, 'base');
  const lines = fin.edges.map(name => {
    if (name.split('|').some(n => open.includes(n))) fail('CAPABILITY', `${name} borders an open face: finish the opening's edges after the shell`);
    const e = outer.edges.find(x => x.name === name || x.name === name.split('|').reverse().join('|'));
    if (!e) return fail('CAPABILITY', `${fin.id} rounds ${name}, an edge made by an earlier finish: shell before that finish`);
    if (!(e.curve.degree === 1 && e.curve.controlPoints.length === 2)) return fail('CAPABILITY', `[SHELL_VARIABLE_RADIUS] ${fin.id} varies its radius along a curved edge (${name}): its hollow's radius along the chain is not the outer one's less the wall; not supported yet`);
    return e.curve.controlPoints as Point[];
  });
  if (radii.length !== 2) fail('CAPABILITY', `[SHELL_VARIABLE_RADIUS] ${fin.id} gives ${radii.length} radii: shell after a variable radius takes two (linear along a straight chain) yet`);
  const p0 = radii[0].at, u = unit(sub(lines[0][1], lines[0][0]));
  for (const [a, b] of lines) if (len(cross(sub(b, a), u)) > 1e-9 * Math.max(1, len(b)) || len(cross(sub(a, p0), u)) > 1e-6 * Math.max(1, len(a))) fail('CAPABILITY', `[SHELL_VARIABLE_RADIUS] ${fin.id}'s edges do not lie on one line: shell after a variable radius takes a straight chain yet`);
  const s1 = dot(sub(radii[1].at, p0), u), r = (p: Point) => radii[0].radius + (radii[1].radius - radii[0].radius) * dot(sub(p, p0), u) / s1;
  const names = fin.edges.map(name => { const m = name.split('|').map(face); if (m.some(n => n === null)) fail('CAPABILITY', `${fin.id} rounds ${name}, an edge made by an earlier finish: shell before that finish`); return (m as string[]).sort().join('|'); });
  const inner = brepOf(hollow, `${at}_hollow`), ends = names.flatMap(n => { const e = inner.edges.find(x => x.name === n); if (!e) return fail('CAPABILITY', `the wall rounds the inside corner of ${n} already: shell inside corners finished by ${fin.id} is not supported yet`); return e.curve.controlPoints as Point[]; });
  const along = ends.map(p => dot(sub(p, p0), u)), lo = ends[along.indexOf(Math.min(...along))], hi = ends[along.indexOf(Math.max(...along))];
  const rLo = r(lo) - t, rHi = r(hi) - t;
  if (!(rLo > 1e-9) && !(rHi > 1e-9)) return hollow;
  if (!(rLo > 1e-9) || !(rHi > 1e-9)) fail('CAPABILITY', `[SHELL_VARIABLE_RADIUS] ${fin.id}'s radius falls to the wall (${t} mm) partway along: the hollow's round would run out there; not supported yet`);
  return { solid: finishEdges(hollow, names, Math.max(rLo, rHi), 'fillet', `${at}_in_${fin.id}`, fail, undefined, [{ at: lo, radius: rLo }, { at: hi, radius: rHi }]) };
}

/** A body less hollows inside it: masses and moments subtracted (inertia via the origin; mm and g). */
function massLess(outer: MassProperties, inner: readonly MassProperties[]): MassProperties {
  const about = (p: MassProperties) => { const c = p.centroid, cc = c[0] ** 2 + c[1] ** 2 + c[2] ** 2; return p.inertia.map((row, i) => row.map((v, j) => v + p.mass * ((i === j ? cc : 0) - c[i] * c[j]))); };
  const m = outer.mass - inner.reduce((a, p) => a + p.mass, 0), V = outer.volume - inner.reduce((a, p) => a + p.volume, 0);
  const c = [0, 1, 2].map(i => (outer.mass * outer.centroid[i] - inner.reduce((a, p) => a + p.mass * p.centroid[i], 0)) / m) as Point;
  const T = about(outer); for (const p of inner) about(p).forEach((row, i) => row.forEach((v, j) => { T[i][j] -= v; }));
  const cc = c[0] ** 2 + c[1] ** 2 + c[2] ** 2;
  const I = T.map((row, i) => row.map((v, j) => v - m * ((i === j ? cc : 0) - c[i] * c[j]))) as [[number, number, number], [number, number, number], [number, number, number]];
  return unsupportedNativeMass({ volume: V, mass: m, centroid: c, inertia: I, method: outer.method }, 'difference');
}
/** A ring of section segments as profile segments (each from its start). */
const profileOfRing = (ring: readonly CurveSegment2[]): ProfileSegmentInput[] => ring.map(g => {
  if (g.kind === 'line') return { kind: 'line', start: [g.a[0], g.a[1]] };
  if (g.kind === 'arc') return { kind: 'arc', start: [g.c[0] + g.r * Math.cos(g.t0), g.c[1] + g.r * Math.sin(g.t0)], center: [g.c[0], g.c[1]], direction: g.sweep > 0 ? 'ccw' : 'cw' };
  throw new CadPartError('CAPABILITY', 'shell', 'a section with curves other than lines and arcs');
});
/** A profile's segments as a tagged section ring (`side<i>`, as the body's faces are named), and the loop. */
type LineArc = Extract<CurveSegment2, { kind: 'line' } | { kind: 'arc' }>;
function sectionRing(profile: readonly ProfileSegmentInput[], sideTags?: readonly string[]): LineArc[] {
  const loop0 = buildProfileLoop(profile, { maximumSegments: 1024 }), built = loop0.segments;
  // (Tagged: `side[t]`, by the authored segment, as revolve names them; a circle's halves both its one tag.)
  const tagOf = (i: number) => sideTags ? `side[${sideTags[built.length > 1 ? (loop0.reversed ? built.length - 1 - i : i) : 0]}]` : `side${i}`;
  // A single circle is two halves (side0, side1), as the revolved body has it.
  const loop = built.length > 1 ? built : (() => { const a = built[0] as Extract<typeof built[number], { kind: 'arc' }>; return [{ ...a, sweep: a.sweep / 2 }, { ...a, startAngle: a.startAngle + a.sweep / 2, sweep: a.sweep / 2 }]; })();
  return loop.map((g, i): LineArc => g.kind === 'line' ? { kind: 'line', a: g.start, b: g.end, tag: tagOf(i) } : { kind: 'arc', c: g.center, r: g.radius, t0: g.startAngle, sweep: g.sweep, tag: tagOf(i) });
}
const ringsOfRegions = (rs: readonly CurveRegion2[]) => rs.flatMap(r => [r.outer, ...r.holes]);
/** Each body of a B-rep on its own: its shells, faces, loops, coedges, edges and vertices. */
export function brepBodies(b: Brep): Brep[] {
  return b.bodies.map(body => {
    const shells = new Set(body.shells), faces = b.faces.filter(x => shells.has(x.shell)), faceIds = new Set(faces.map(x => x.id));
    const loops = b.loops.filter(l => faceIds.has(l.face)), loopIds = new Set(loops.map(l => l.id));
    const coedges = b.coedges.filter(c => loopIds.has(c.loop)), edgeIds = new Set(coedges.map(c => c.edge));
    const edges = b.edges.filter(e => edgeIds.has(e.id)), vertexIds = new Set(edges.flatMap(e => e.vertices));
    return { ...b, bodies: [body], shells: b.shells.filter(x => shells.has(x.id)), faces, loops, coedges, edges, vertices: b.vertices.filter(v => vertexIds.has(v.id)) };
  });
}
const renamed = (b: Brep, from: string, to: string) => transformBrep(b, { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, 0] }, n => n.split(from).join(to));

/**
 * A body turned a full turn, hollowed: every point's nearest wall lies in its own meridian plane, so
 * the hollow is the meridian section (with its mirror across the axis) eroded, turned again — exact,
 * its mass the body's less the hollow's part inside it (also turned: closed form).
 */
function shellRevolved(part: Part, input: RevolveInput, t: number, open: string[], at: string, fail: Tools['fail']): Part {
  if (input.angle !== 360) fail('CAPABILITY', 'shell works on bodies turned a full turn yet (this one stops at its start and end faces)');
  const capsule = openRevolvedCapsuleShell(input, t, open, at, fail);
  if (capsule) return capsule;
  const id = input.id!, ring = sectionRing(input.profile, input.sideTags), tags = new Set(ring.map(g => g.tag!)), tol = curveTolerance([ring]);
  const openTags = new Set(open.map(n => { const tag = n.startsWith(id + '.') ? n.slice(id.length + 1).replace(/#\d+$/, '') : ''; if (!tags.has(tag)) fail('SELECTION', `no face named ${n} to open; faces: ${[...tags].map(x => `${id}.${x}`).slice(0, 12).join(', ')}`); return tag; }));
  // The axis, its side the profile is on, and the mirror across it.
  const [dx, dy] = input.axis.direction, dl = Math.hypot(dx, dy), d: XY = [dx / dl, dy / dl], A = input.axis.origin, nrm: XY = [-d[1], d[0]];
  const side = Math.sign(ring.reduce((acc, g) => { const p = g.kind === 'line' ? g.a : [g.c[0] + g.r * Math.cos(g.t0 + g.sweep / 2), g.c[1] + g.r * Math.sin(g.t0 + g.sweep / 2)]; return acc + (p[0] - A[0]) * nrm[0] + (p[1] - A[1]) * nrm[1]; }, 0)) || 1;
  const refl = (p: readonly number[]): XY => { const v = [p[0] - A[0], p[1] - A[1]], u = v[0] * d[0] + v[1] * d[1]; return [A[0] + 2 * u * d[0] - v[0], A[1] + 2 * u * d[1] - v[1]]; };
  const phi = Math.atan2(d[1], d[0]);
  const mirror: LineArc[] = [...ring].reverse().map((g): LineArc => g.kind === 'line' ? { kind: 'line', a: refl(g.b), b: refl(g.a), tag: g.tag } : { kind: 'arc', c: refl(g.c), r: g.r, t0: 2 * phi - g.t0 - g.sweep, sweep: g.sweep, tag: g.tag });
  const whole = booleanCurveRegions([ring], [mirror], 'union', tol);
  let inner: CurveRegion2[] = [];
  try { inner = erodeSection(whole, t, tag => !!tag && openTags.has(tag), () => 'wall', tol); }
  catch (cause) { if (cause instanceof Error && /only straight walls/.test(cause.message)) fail('CAPABILITY', cause.message); throw cause; }
  // The profile's half of it.
  const L = 4 * Math.max(1, ...ring.flatMap(g => g.kind === 'line' ? [...g.a, ...g.b].map(Math.abs) : [Math.abs(g.c[0]) + g.r, Math.abs(g.c[1]) + g.r]), Math.abs(A[0]), Math.abs(A[1]));
  const at2 = (u: number, w: number): XY => [A[0] + u * d[0] + w * side * nrm[0], A[1] + u * d[1] + w * side * nrm[1]];
  const corners = [at2(-L, 0), at2(L, 0), at2(L, L), at2(-L, L)], halfPlane: CurveSegment2[] = corners.map((p, k) => ({ kind: 'line', a: p, b: corners[(k + 1) % 4] }));
  const area = (rs: CurveRegion2[]) => rs.reduce((a, r) => a + regionMoments(r)[0], 0);
  const orient = (ring: readonly CurveSegment2[]): CurveSegment2[] => area([{ outer: ring, holes: [] }]) < 0 ? [...ring].reverse().map(segReverse) : [...ring];
  const half = booleanCurveRegions(ringsOfRegions(inner), [orient(halfPlane)], 'intersection', tol);
  if (!half.length || area(half) <= tol * tol) fail('PARAMETER', `a wall of ${t} mm leaves no hollow inside this body`);
  if (half.some(r => r.holes.length)) fail('CAPABILITY', 'shell of a revolved body whose hollow section has islands is not supported yet');
  const pieces = half.map((r, k) => ({ id: `${at}_in${k}`, profile: profileOfRing(r.outer), axis: input.axis, angle: 360 }));
  const hollow = mergeBreps(pieces.map(pc => renamed(revolveProfile(pc), `${at}_in`, `${at}.in`)), { family: 'revolve', id: `${at}_hollow` });
  // The hollow inside the body: the eroded half within the profile (an opening runs out past it).
  const inside = booleanCurveRegions(ringsOfRegions(half), [orient(ring)], 'intersection', tol).map((r, k) => ({ id: `${at}_m${k}`, profile: profileOfRing(r.outer), axis: input.axis, angle: 360 }));
  // Nothing opened: the hollow lies inside, apart from the walls — a cavity, no Boolean needed.
  const solid: Solid = openTags.size ? boolean(part.solid, { kind: 'brep', brep: hollow }, 'difference', at) : { kind: 'brep', brep: withCavities(brepOf(part, 'target'), hollow, { family: 'shell', id: at }) };
  return { solid, mass: d => massLess(revolveMassProperties(input, d), inside.map(pc => revolveMassProperties(pc, d))) };
}

/**
 * A swept body hollowed: its walls' normals lie in the path's cross-sections, so the hollow is the
 * section eroded, swept along the same path (through the same point) — run out past an open end,
 * started a wall's thickness into a closed one (on a straight run); exact, mass included.
 */
function shellSwept(part: Part, swept: NonNullable<Part['swept']>, t: number, open: string[], at: string, fail: Tools['fail']): Part {
  const steps = [...swept.steps], last = steps.length - 1, brep = brepOf(part, 'target');
  const names = new Set(brep.faces.map(f => f.name ?? '')), startName = [`${at}`].length ? [...names].find(n => /\.s0\.(bottom|start)$/.test(n)) : undefined, endName = [...names].find(n => new RegExp(`\\.s${last}\\.(top|end)$`).test(n));
  for (const n of open) if (n !== startName && n !== endName) fail(names.has(n) ? 'CAPABILITY' : 'SELECTION', names.has(n) ? `only a swept body's end faces can be opened yet (${startName}, ${endName})` : `no face named ${n} to open; faces: ${[startName, endName].join(', ')}`);
  const openStart = !!startName && open.includes(startName), openEnd = !!endName && open.includes(endName);
  const ring = sectionRing(swept.profile, swept.sideTags), tol = curveTolerance([ring]), centre = buildProfileLoop(swept.profile, { maximumSegments: 1024 }).centroid;
  const inner = erodeSection([{ outer: ring, holes: [] }], t, () => false, () => 'wall', tol);
  if (!inner.length) fail('PARAMETER', `a wall of ${t} mm leaves no hollow inside this section`);
  if (inner.length > 1 || inner[0].holes.length) fail('CAPABILITY', 'shell of a swept body whose hollow section falls apart is not supported yet');
  const profile = profileOfRing(inner[0].outer);
  // Its ends: a closed end on a straight run starts the hollow a wall into it.
  const trim = (k: number) => { const st = steps[k]; if (st.kind !== 'straight' || !(st.length > t)) fail('CAPABILITY', 'a closed end of a swept body must be a straight run longer than the wall yet (open it, or start with a run)'); return st.length - t; };
  const inside = steps.map(s => ({ ...s }));
  let lift = 0;
  if (!openStart) { inside[0] = { kind: 'straight', length: trim(0) }; lift = t; }
  if (!openEnd) { const k = last; const base = inside[k] as SweepStep; if (k === 0 && !openStart) { if (!(base.kind === 'straight' && base.length > t)) fail('CAPABILITY', 'the run is too short for both closed ends'); inside[0] = { kind: 'straight', length: (base as { length: number }).length - t }; } else inside[k] = { kind: 'straight', length: trim(k) }; }
  const run = 1 + t, path: SweepStep[] = [...(openStart ? [{ kind: 'straight' as const, length: run }] : []), ...inside, ...(openEnd ? [{ kind: 'straight' as const, length: run }] : [])];
  const shift = openStart ? -run : lift;
  const made = sweepBrep(profile, path, `${at}_in`, fail, centre), hollow = transformBrep(renamed(made.brep, `${at}_in`, `${at}.in`), { matrix: [1, 0, 0, 0, 1, 0, 0, 0, 1], offset: [0, 0, shift] });
  const within = sweepBrep(profile, inside, `${at}_m`, fail, centre);
  const solid: Solid = openStart || openEnd ? boolean(part.solid, { kind: 'brep', brep: hollow }, 'difference', at) : { kind: 'brep', brep: withCavities(brep, hollow, { family: 'shell', id: at }) };
  return { solid, mass: d => { const m = within.mass(d); return massLess(part.mass!(d), [movedMass(m, [1, 0, 0, 0, 1, 0, 0, 0, 1], [0, 0, lift])]); } };
}

/**
 * The hollow of an upright body (one section, or sections stacked): a point is hollow when it is at
 * least the wall from every wall at its height and at the heights within the wall above and below it
 * — the section at z is the intersection of the sections over [z − t, z + t], eroded (exact for lines
 * and arcs); offset walls and ledges meet sharply, as offset faces do. It runs on through open faces.
 */
function hollowOf(solid: PrismaticSolid, t: number, open: string[], at: string, fail: Tools['fail'], floorThickness?: number): { hollow: PrismaticSolid; sides: Set<string>; tops: Set<string>; bottoms: Set<string> } {
  const slabs = [...solid.slabs].sort((a, b) => a.z0 - b.z0), rings = slabs.flatMap(s => s.regions.flatMap(r => [r.outer, ...r.holes])), tol = curveTolerance(rings);
  for (let k = 1; k < slabs.length; k++) if (slabs[k].z0 > slabs[k - 1].z1 + tol) fail('CAPABILITY', 'shell works on one body at a time (this one has pieces apart along its height)');
  const zmin = slabs[0].z0, zmax = slabs[slabs.length - 1].z1;
  const sides = new Set(rings.flatMap(r => r.map(g => g.tag).filter((x): x is string => !!x)));
  const capAt = (z: number) => (solid.caps ?? []).filter(c => Math.abs(c.z - z) <= tol).map(c => c.tag);
  const tops = new Set(capAt(zmax)), bottoms = new Set(capAt(zmin)), ledges = new Set((solid.caps ?? []).map(c => c.tag).filter(x => !tops.has(x) && !bottoms.has(x)));
  for (const name of open) {
    if (ledges.has(name)) fail('CAPABILITY', `${name} is a step between sections: only the top, the bottom and sides can be opened yet`);
    if (!sides.has(name) && !tops.has(name) && !bottoms.has(name)) fail('SELECTION', `no face named ${name} to open; faces: ${[...tops, ...bottoms, ...sides].slice(0, 12).join(', ')}`);
  }
  const openTop = open.some(n => tops.has(n)), openBottom = open.some(n => bottoms.has(n)), openSides = new Set(open.filter(n => sides.has(n)));
  const lo = openBottom ? zmin - 1 : zmin + (floorThickness ?? t), hi = openTop ? zmax + 1 : zmax - t;
  if (!(hi > lo + tol)) fail('PARAMETER', `a wall of ${t} mm leaves no hollow between the top and the bottom`);
  // Heights where the window [z − t, z + t] takes in another section.
  const cuts = [...new Set([lo, hi, ...slabs.slice(1).flatMap(s => [s.z0 - t, s.z0 + t])].filter(z => z >= lo - tol && z <= hi + tol))].sort((a, b) => a - b);
  const pieces: { z0: number; z1: number; regions: CurveRegion2[] }[] = [];
  for (let k = 0; k + 1 < cuts.length; k++) {
    const z0 = cuts[k], z1 = cuts[k + 1]; if (z1 - z0 <= tol) continue;
    const m = (z0 + z1) / 2, inWindow = slabs.filter(s => s.z0 < m + t - tol && s.z1 > m - t + tol);
    if (!inWindow.length) continue;
    let section: CurveRegion2[] = inWindow[0].regions as CurveRegion2[];
    for (const s of inWindow.slice(1)) section = booleanCurveRegions(section.flatMap(r => [r.outer, ...r.holes]), s.regions.flatMap(r => [r.outer, ...r.holes]), 'intersection', tol);
    let inner: CurveRegion2[] = [];
    try { inner = section.length ? erodeSection(section, t, tag => !!tag && openSides.has(tag), tag => `${at}.in.${tag ?? 'wall'}`, tol) : []; }
    catch (cause) { if (cause instanceof Error && /only straight walls/.test(cause.message)) fail('CAPABILITY', cause.message); throw cause; }
    if (inner.length) pieces.push({ z0, z1, regions: inner });
  }
  if (!pieces.length) fail('PARAMETER', `a wall of ${t} mm leaves no hollow inside this body`);
  let hollow = prismaticExtrude(pieces[0].regions.flatMap(r => [r.outer, ...r.holes]), pieces[0].z0, pieces[0].z1);
  for (const p of pieces.slice(1)) hollow = booleanPrismatic(hollow, prismaticExtrude(p.regions.flatMap(r => [r.outer, ...r.holes]), p.z0, p.z1), 'union');
  // Its floor and ceiling, and the steps between (the offset ledges), are named after the shell.
  const levels = [...new Set(hollow.slabs.flatMap(s => [s.z0, s.z1]))].sort((a, b) => a - b), all = pieces.flatMap(p => p.regions);
  const caps = levels.map((z, k) => ({ z, regions: all, tag: k === 0 ? `${at}.floor` : k === levels.length - 1 ? `${at}.ceiling` : `${at}.step${k}` }));
  return { hollow: { ...hollow, caps }, sides, tops, bottoms };
}
