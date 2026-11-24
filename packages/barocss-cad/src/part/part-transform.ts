import { planarScaleSliver } from '../brep/brep-check-geometry.js';
import { checkBrep, BrepError } from '../brep/brep-core.js';
// Transform and pattern operation cases. Shared geometry/state stays with part-model.ts.
import { fillCutSnapshot, fillCutPlacements } from '../features/fill-cut-pattern.js';
import { curveCutOffsets } from '../features/curve-cut-pattern.js';
import { certifyPriorCutPlacements, certifyPriorRectangularCut } from './part-prior-rectangular-cut.js';
import { certifyPriorCircularCut } from './part-prior-circular-cut.js';
import { faceGeometry } from '../brep/analytic-boolean.js';
import type { Brep, BrepFace } from '../brep/brep-core.js';
import type { BrepAffine } from '../brep/brep-transform.js';
import { add } from '../core/vec3.js';
import type { SheetReport } from '../frame-sheet/sheet-metal.js';
import type { Point } from '../types.js';
import type { CadPartAxis, CadPartDim, CadPartFeature, CadPartPoint3, Part, Result, Solid } from './part-types.js';
import type { Tools } from './part-model.js';

// Private structural dependency contract; the evaluator passes one module-level frozen bag.
interface TransformHelpers {
  readonly boolean: (a: Solid, b: Solid, op: 'union' | 'difference' | 'intersection', at: string, edgeFitTolerance?: number) => Solid;
  readonly affine: (s: Solid, m: BrepAffine['matrix'], o: readonly number[], rename?: ((n: string) => string) | string) => Solid;
  readonly rotation: (axis: CadPartAxis, deg: number, pivot: Point) => { m: BrepAffine['matrix']; o: Point };
  readonly moveAll: (parts: readonly Part[], m: BrepAffine['matrix'], o: Point, preserveNativeSI?: boolean) => Result;
  readonly brepOf: (part: Part, id: string) => Brep;
  readonly unionAll: (list: Solid[], at: string) => Solid;
  readonly rotate: (s: Solid, axis: CadPartAxis, deg: number, pivot: Point, rename?: (n: string) => string) => Solid;
  readonly CadPartLimits: { readonly copies: number; readonly length: number };
}
const one = (s: Solid): Result => ({ kind: 'solid', parts: [{ solid: s }] });
const many = (parts: Solid[]): Result => ({ kind: 'solid', parts: parts.map(solid => ({ solid })) });
const identity: BrepAffine['matrix'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];

/** Resolve each sheet face uniquely using the same piece suffix convention as the unfolder. */
function hasSheetFaces(brep: Brep, sheet: SheetReport): boolean {
  if (brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid') return false;
  const baseName = (name: string) => name.replace(/#\d+$/, '');
  const bendFaces = sheet.bends.flatMap(bend => [baseName(bend.inner), baseName(bend.outer)]);
  const fixed = baseName(sheet.fixedFace);
  const names = new Set([fixed, ...bendFaces]);
  if (names.size !== bendFaces.length + 1) return false;
  const faces = new Map<string, BrepFace>();
  for (const face of brep.faces) {
    if (!face.name) continue;
    const name = baseName(face.name);
    if (!names.has(name)) continue;
    if (faces.has(name) || face.surface.kind === 'facets') return false;
    faces.set(name, face);
  }
  const fixedFace = faces.get(fixed);
  return fixedFace !== undefined && faceGeometry(fixedFace).kind === 'plane' && bendFaces.every(name => {
    const face = faces.get(name);
    return face !== undefined && faceGeometry(face).kind === 'cylinder';
  });
}

/** Preserve sheet metadata after an admitted whole-body isometry. */
function carryRigidSheet(result: Result, brepOf: TransformHelpers['brepOf'], at: string): Result {
  if (result.kind !== 'solid' || result.parts.length !== 1) return result;
  const [part] = result.parts, move = part.moved, sheet = move?.from.sheet;
  if (!move || !sheet) return result;
  const { from, m, o } = move;
  const sourceBrep = from.brep ?? brepOf({ solid: from.solid }, at);
  if (!hasSheetFaces(sourceBrep, sheet) || !hasSheetFaces(brepOf(part, at), sheet)) return result;
  // An identity linear map preserves the source components, including signed zero.
  const orient = m.every((entry, index) => entry === identity[index])
    ? (point: Point): Point => [...point]
    : ([x, y, z]: Point): Point => [
      m[0] * x + m[1] * y + m[2] * z,
      m[3] * x + m[4] * y + m[5] * z,
      m[6] * x + m[7] * y + m[8] * z,
    ];
  const bends = sheet.bends.map(bend => {
    const carried = { ...bend, axis: { origin: add(orient(bend.axis.origin), o), direction: orient(bend.axis.direction) } };
    // Authored editing ownership is not a transformed-body editing contract.
    delete carried.authoredFlange;
    return carried;
  });
  return { kind: 'solid', parts: [{ ...part, sheet: { ...sheet, bends } }] };
}

/** Resolve the same inputs now and return the same deferred operation closure. */
export function transformOperation(f: CadPartFeature & Record<string, unknown>, t: Tools, k: TransformHelpers): () => Result {
  const { dim, xyz, integer, axisOf, solids, fail, at } = t;
  const { boolean, affine, rotation, moveAll, brepOf, unionAll, rotate, CadPartLimits } = k;
  switch (f.kind) {
    case 'translate': {
      const target = solids(f.target, 'target'), o = xyz(f.offset as CadPartPoint3, 'offset');
      return () => carryRigidSheet(moveAll(target, identity, o, true), brepOf, at);
    }
    case 'rotate': {
      const target = solids(f.target, 'target'), axis = axisOf(f.axis), deg = f.angle as number, pivot = f.pivot === undefined ? [0, 0, 0] as Point : xyz(f.pivot as CadPartPoint3, 'pivot');
      if (typeof deg !== 'number' || !Number.isFinite(deg) || Math.abs(deg) > 3600) fail('INPUT', 'angle must be a finite number of degrees');
      return () => {
        const { m, o } = rotation(axis, deg, pivot);
        return carryRigidSheet(moveAll(target, m, o), brepOf, at);
      };
    }
    case 'mirror': {
      const target = solids(f.target, 'target'), plane = f.plane;
      if (plane !== 'xy' && plane !== 'xz' && plane !== 'yz') fail('INPUT', 'plane must be xy, xz or yz');
      const m: BrepAffine['matrix'] = plane === 'xy' ? [1, 0, 0, 0, 1, 0, 0, 0, -1] : plane === 'xz' ? [1, 0, 0, 0, -1, 0, 0, 0, 1] : [-1, 0, 0, 0, 1, 0, 0, 0, 1];
      if (f.keep === false && plane === 'yz') return () => carryRigidSheet(moveAll(target, m, [0, 0, 0]), brepOf, at);
      if (!f.keep) return () => moveAll(target, m, [0, 0, 0]);
      return () => many(target.map(p => boolean(p.solid, affine(p.solid, m, [0, 0, 0], n => n + '@m'), 'union', at)));
    }
    case 'scale': {
      const target = solids(f.target, 'target'), k = f.factor as number, pivot = f.pivot === undefined ? [0, 0, 0] as Point : xyz(f.pivot as CadPartPoint3, 'pivot');
      if (typeof k !== 'number' || !(k > 0 && k <= 1000 && Number.isFinite(k))) fail('INPUT', 'factor must be a positive number at most 1000');
      return () => {
        const result = moveAll(target, [k, 0, 0, 0, k, 0, 0, 0, k], [pivot[0] * (1 - k), pivot[1] * (1 - k), pivot[2] * (1 - k)]);
        const reject = (why: string): never => fail('GEOMETRY', `Scale cannot preserve valid geometry for this body. Increase Factor and try again; the usable factor depends on the body and pivot. ${why}`);
        if (result.kind !== 'solid' || !result.parts.length) return reject('No output body.');
        for (const part of result.parts) {
          let brep: Brep;
          // Admission must not cache under the feature id: output pieces own distinct ids.
          try { brep = brepOf({ solid: part.solid }, at); }
          catch (error) {
            if (error instanceof BrepError || (error instanceof TypeError && /reading ['"]cap['"]/.test(error.message))) return reject('The scaled topology could not be constructed.');
            throw error;
          }
          if (!brep.bodies.length || !brep.faces.length || !brep.vertices.length) return reject('The scaled topology is empty.');
          const finite = (point: readonly number[]) => point.every(Number.isFinite);
          if (brep.vertices.some(v => !finite(v.point)) || brep.edges.some(e => e.curve.controlPoints.some(p => !finite(p)))
            || brep.faces.some(f => f.surface.kind === 'facets' ? !Array.from(f.surface.positions).every(Number.isFinite) : f.surface.controlPoints.some(row => row.some(p => !finite(p))))) return reject('The scaled coordinates are not finite.');
          const report = checkBrep(brep);
          if (!report.valid) return reject(report.issues[0] ?? 'The scaled topology is invalid.');
          const sliver = planarScaleSliver(brep); if (sliver) return reject(sliver);
        }
        return result;
      };
    }
    case 'linear-pattern': {
      // (A pattern of an empty result — an intersection that met nothing — is empty, as the Booleans take it: D190.)
      const target = solids(f.target, 'target', true), axis = axisOf(f.axis), spacing = dim(f.spacing as CadPartDim, 'spacing'), count = integer(f.count, 'count', 1, CadPartLimits.copies);
      if (spacing === 0) fail('PARAMETER', 'spacing must not be zero');
      return () => many(target.map(p => {
        const copies = Array.from({ length: count }, (_, k) => { if (!k) return p.solid; const o: Point = [0, 0, 0]; o['xyz'.indexOf(axis)] = spacing * k; return affine(p.solid, [1, 0, 0, 0, 1, 0, 0, 0, 1], o, n => `${n}@${k}`); });
        return unionAll(copies, at);
      }));
    }
    case 'linear-feature-pattern': {
      const { seed, tool, prior, priorCircular } = t.cutSource(f.target, f.source, 'linear'), axis = axisOf(f.axis), spacing = dim(f.spacing as CadPartDim, 'spacing'), count = integer(f.count, 'count', 1, CadPartLimits.copies);
      if (spacing === 0) fail('PARAMETER', 'spacing must not be zero');
      // One member in the unused direction reuses the exact same native interior/disjointness proof.
      if (prior) certifyPriorRectangularCut(prior, 'xyz'.indexOf(axis), spacing, count, axis === 'x' ? 1 : 0, 0, 1, fail, 'linear');
      if (priorCircular) certifyPriorCircularCut(priorCircular, 'xyz'.indexOf(axis), spacing, count, fail);
      return () => {
        if (count === 1 || !tool.length) return { kind: 'solid', parts: [seed] };
        const joined = tool.slice(1).reduce<Solid>((acc, p) => boolean(acc, p.solid, 'union', at), tool[0].solid);
        // The seed already contains the original cut. Translate only its tool for the remaining cuts.
        let cut = seed.solid;
        for (let k = 1; k < count; k++) {
          const offset: Point = [0, 0, 0]; offset['xyz'.indexOf(axis)] = spacing * k;
          cut = boolean(cut, affine(joined, [1, 0, 0, 0, 1, 0, 0, 0, 1], offset, n => `${n}@${k}`), 'difference', at);
        }
        return one(cut);
      };
    }
    case 'rectangular-feature-pattern': {
      const axis = axisOf(f.axis), axis2 = axisOf(f.axis2);
      if (axis === axis2) fail('INPUT', 'rectangular feature pattern axes must be distinct');
      const spacing = dim(f.spacing as CadPartDim, 'spacing'), spacing2 = dim(f.spacing2 as CadPartDim, 'spacing2');
      if (spacing === 0 || spacing2 === 0) fail('PARAMETER', 'rectangular feature pattern spacing must not be zero');
      const count = integer(f.count, 'count', 1, CadPartLimits.copies), count2 = integer(f.count2, 'count2', 1, CadPartLimits.copies);
      const cells = count * count2;
      if (!Number.isSafeInteger(cells) || cells > CadPartLimits.copies) fail('INPUT', `rectangular feature pattern must have at most ${CadPartLimits.copies} cells`);
      const { seed, tool, prior } = t.cutSource(f.target, f.source), first = 'xyz'.indexOf(axis), second = 'xyz'.indexOf(axis2);
      if (prior) certifyPriorRectangularCut(prior, first, spacing, count, second, spacing2, count2, fail);
      const matrix: BrepAffine['matrix'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      return () => {
        if (cells === 1 || !tool.length) return { kind: 'solid', parts: [seed] };
        const joined = unionAll(tool.map(p => p.solid), at);
        let cut = seed.solid;
        for (let j = 0; j < count2; j++) for (let i = 0; i < count; i++) {
          if (i === 0 && j === 0) continue;
          const offset: Point = [0, 0, 0]; offset[first] = spacing * i; offset[second] = spacing2 * j;
          cut = boolean(cut, affine(joined, matrix, offset, `@${i},${j}`), 'difference', at);
        }
        return one(cut);
      };
    }
    case 'fill-feature-pattern': {
      const spacing = dim(f.spacing as CadPartDim, 'spacing'), spacing2 = dim(f.spacing2 as CadPartDim, 'spacing2');
      if (spacing === 0 || spacing2 === 0) fail('PARAMETER', 'fill feature pattern spacing must not be zero');
      const count = integer(f.count, 'count', 1, CadPartLimits.copies), count2 = integer(f.count2, 'count2', 1, CadPartLimits.copies);
      if (count * count2 > CadPartLimits.copies) fail('INPUT', `fill feature pattern must have at most ${CadPartLimits.copies} candidate cells`);
      const snapshot = fillCutSnapshot(f.region, f.anchor, fail);
      const placements = fillCutPlacements(snapshot.region, snapshot.anchor, spacing, count, spacing2, count2);
      const { seed, tool, prior } = t.cutSource(f.target, f.source, 'fill');
      if (prior) certifyPriorCutPlacements(prior, placements.map(placement => placement.offset), fail);
      const matrix: BrepAffine['matrix'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      return () => {
        if (!placements.length || !tool.length) return { kind: 'solid', parts: [seed] };
        const joined = unionAll(tool.map(p => p.solid), at);
        let cut = seed.solid;
        for (const placement of placements) cut = boolean(cut, affine(joined, matrix, placement.offset, placement.suffix), 'difference', at);
        return one(cut);
      };
    }
    case 'curve-feature-pattern': {
      const spacing = dim(f.spacing as CadPartDim, 'spacing', true), count = integer(f.count, 'count', 1, CadPartLimits.copies);
      const source = f.source;
      const offsets = curveCutOffsets(f.path, spacing, count, CadPartLimits.length, fail, source === undefined ? undefined : 'prior-xy-linear');
      const { seed, tool, prior } = t.cutSource(f.target, source, 'path');
      if (prior) certifyPriorCutPlacements(prior, offsets.slice(1), fail, 'path');
      const matrix: BrepAffine['matrix'] = [1, 0, 0, 0, 1, 0, 0, 0, 1];
      return () => {
        if (count === 1 || !tool.length) return { kind: 'solid', parts: [seed] };
        const joined = unionAll(tool.map(p => p.solid), at);
        let cut = seed.solid;
        for (let k = 1; k < count; k++) cut = boolean(cut, affine(joined, matrix, offsets[k], `@${k}`), 'difference', at);
        return one(cut);
      };
    }
    case 'circular-pattern': {
      const target = solids(f.target, 'target', true), axis = axisOf(f.axis), deg = f.angle as number, count = integer(f.count, 'count', 1, CadPartLimits.copies);
      const pivot = f.pivot === undefined ? [0, 0, 0] as Point : xyz(f.pivot as CadPartPoint3, 'pivot');
      if (typeof deg !== 'number' || !Number.isFinite(deg) || deg === 0 || Math.abs(deg) > 360) fail('INPUT', 'angle must be a nonzero step of at most 360°');
      if (axis !== 'z' && Math.round(deg / 90) * 90 !== deg) fail('CAPABILITY', 'patterns about X or Y must step by multiples of 90°');
      return () => many(target.map(p => {
        return unionAll(Array.from({ length: count }, (_, k) => k ? rotate(p.solid, axis, deg * k, pivot, n => `${n}@${k}`) : p.solid), at);
      }));
    }
    default: return fail('INPUT', `unknown transform or pattern kind ${f.kind}`);
  }
}
