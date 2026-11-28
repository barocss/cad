import type { PrismaticSolid } from '../features/prismatic-solid.js';
import type { Brep } from './brep-core.js';

export interface AuthoredCircle {
  readonly center: readonly [number, number];
  readonly radius: number;
}

// The receipt belongs to the original evaluated objects. Copies and new geometry have their own identities.
export const authoredPrismaticCircles = new WeakMap<PrismaticSolid, AuthoredCircle>();
export const authoredBrepEdgeRadii = new WeakMap<Brep, ReadonlyMap<string, number>>();

export function bindAuthoredPrismaticCircle(solid: PrismaticSolid, circle: AuthoredCircle): void {
  const [slab] = solid.slabs;
  const region = slab?.regions[0];
  if (solid.slabs.length !== 1 || !region || slab.regions.length !== 1 || region.holes.length || !region.outer.length) return;
  const [x, y] = circle.center;
  if (region.outer.every(edge => edge.kind === 'arc' && edge.r === circle.radius && edge.c[0] === x && edge.c[1] === y))
    authoredPrismaticCircles.set(solid, circle);
}

/** Preserve one original through-bore only when the arrangement kept its exact circular support. */
export function bindAuthoredPrismaticHole(source: PrismaticSolid, result: PrismaticSolid, circle: AuthoredCircle): void {
  const [base] = source.slabs, [bored] = result.slabs;
  const prior = base?.regions[0], region = bored?.regions[0];
  if (source.slabs.length !== 1 || !prior || base.regions.length !== 1 || prior.holes.length
    || prior.outer.length !== 4 || !prior.outer.every(edge => edge.kind === 'line' && (edge.a[0] === edge.b[0] || edge.a[1] === edge.b[1]))
    || result.slabs.length !== 1 || !region || bored.regions.length !== 1 || region.holes.length !== 1
    || bored.z0 !== base.z0 || bored.z1 !== base.z1) return;
  const [hole] = region.holes, [x, y] = circle.center;
  if (hole.length && hole.every(edge => edge.kind === 'arc' && edge.r === circle.radius && edge.c[0] === x && edge.c[1] === y))
    authoredPrismaticCircles.set(result, circle);
}
