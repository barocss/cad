import type { PrismaticSolid } from '../features/prismatic-solid.js';
import type { Brep } from './brep-core.js';

export interface AuthoredCircle {
  readonly center: readonly [number, number];
  readonly radius: number;
}

// The receipt belongs to the original evaluated objects. Copies and new geometry have their own identities.
export const authoredPrismaticRadii = new WeakMap<PrismaticSolid, number>();
export const authoredBrepEdgeRadii = new WeakMap<Brep, ReadonlyMap<string, number>>();

export function bindAuthoredPrismaticCircle(solid: PrismaticSolid, circle: AuthoredCircle): void {
  const [slab] = solid.slabs;
  const region = slab?.regions[0];
  if (solid.slabs.length !== 1 || !region || slab.regions.length !== 1 || region.holes.length || !region.outer.length) return;
  const [x, y] = circle.center;
  if (region.outer.every(edge => edge.kind === 'arc' && edge.r === circle.radius && edge.c[0] === x && edge.c[1] === y))
    authoredPrismaticRadii.set(solid, circle.radius);
}
