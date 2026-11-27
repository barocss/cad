import { checkBrep, faceGeometry, type CadPartOutput } from '@barocss/cad';
import type { Vec3 } from './vec3';

/** A convex vertical Fillet face bound to one original edge on the unplaced solid. */
export interface NativeVerticalFillet {
  edge: string;
  faceId: string;
  centre: Vec3;
  radius: number;
  bottom: number;
  top: number;
}

export function nativeVerticalFilletsOf(output: CadPartOutput): NativeVerticalFillet[] | undefined {
  const { brep, filletTargets: targets } = output;
  if (targets?.length !== 3 || new Set(targets).size !== 3 || output.bodyCount !== 1 ||
    brep.bodies.length !== 1 || brep.bodies[0].kind !== 'solid' || brep.shells.length !== 1 || !brep.shells[0].closed) return;
  const prefix = output.feature + '.face#';
  const blends = brep.faces.filter(face => face.name?.startsWith(output.feature + '.'));
  if (blends.length !== 3 || blends.some(face => !face.name?.startsWith(prefix) || face.loops.length !== 1)) return;

  const loops = new Map(brep.loops.map(loop => [loop.id, loop]));
  const coedges = new Map(brep.coedges.map(use => [use.id, use]));
  const faces = new Map(brep.faces.map(face => [face.id, face]));
  const witnesses: NativeVerticalFillet[] = [];
  try {
    for (const face of blends) {
      const cylinder = faceGeometry(face), loop = loops.get(face.loops[0]);
      if (cylinder.kind !== 'cylinder' || cylinder.out !== 1 || cylinder.r <= 0 ||
        ![...cylinder.c, ...cylinder.a, cylinder.r].every(Number.isFinite) ||
        Math.hypot(cylinder.a[0], cylinder.a[1]) > 1e-9 || Math.abs(Math.abs(cylinder.a[2]) - 1) > 1e-9 ||
        loop?.kind !== 'outer' || loop.face !== face.id || loop.coedges.length !== 4) return;
      const neighbours = loop.coedges.map(id => {
        const use = coedges.get(id), twin = use?.twin && coedges.get(use.twin);
        const neighbour = twin && twin.twin === id && twin.edge === use?.edge && loops.get(twin.loop);
        return neighbour ? faces.get(neighbour.face) : undefined;
      });
      if (neighbours.some(neighbour => !neighbour?.name) || new Set(neighbours).size !== 4) return;
      const edge = targets.find(target => {
        const sides = target.split('|');
        return sides.length === 2 && sides[0] !== sides[1] && sides.every(side => neighbours.some(neighbour => neighbour?.name === side));
      });
      if (!edge) return;
      const owner = edge.slice(0, edge.indexOf('.'));
      const bottom = neighbours.find(neighbour => neighbour?.name === owner + '.bottom');
      const top = neighbours.find(neighbour => neighbour?.name === owner + '.top');
      if (!bottom || !top) return;
      const lower = faceGeometry(bottom), upper = faceGeometry(top);
      if (lower.kind !== 'plane' || upper.kind !== 'plane' ||
        lower.n[0] !== 0 || lower.n[1] !== 0 || lower.n[2] !== -1 ||
        upper.n[0] !== 0 || upper.n[1] !== 0 || upper.n[2] !== 1 ||
        !Number.isFinite(lower.o[2]) || !Number.isFinite(upper.o[2]) || lower.o[2] >= upper.o[2]) return;
      witnesses.push({ edge, faceId: face.id, centre: [...cylinder.c], radius: cylinder.r, bottom: lower.o[2], top: upper.o[2] });
    }
    if (new Set(witnesses.map(witness => witness.edge)).size === 3 && checkBrep(brep, { strict: true }).valid) return witnesses;
  } catch {
    // Native topology that cannot be read does not authorize an original-edge handle.
  }
}
