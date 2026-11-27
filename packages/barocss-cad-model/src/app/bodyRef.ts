// A body's place in the history: the feature that made it and which side (`ref`, set when the body is
// evaluated: its key is by that feature's stable id, see engine/ids.ts).
import type { BodyRef, Side } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import type { Ctx, Selection } from './commands';

export function refOf(body: BodyResult): BodyRef {
  if (body.ref) return body.ref;
  // (A body made without its nodes at hand: its key read as an index.)
  const m = /^b(\d+)(?:_(.+))?$/.exec(body.key);
  return { node: Number(m?.[1] ?? 0), side: (m?.[2] ?? 'solid') as Side };
}

export function selectedBodies(sel: Selection): number[] {
  const set = new Set<number>(sel.bodies);
  sel.faces.forEach(f => set.add(f.body)); sel.edges.forEach(e => set.add(e.body));
  return [...set];
}

export function oneBody(ctx: Pick<Ctx, 'selection' | 'bodies'>) {
  const list = selectedBodies(ctx.selection);
  return list.length === 1 ? ctx.bodies[list[0]] : null;
}

/** A body's box centre, to 0.001 mm (the origin when there is none). */
export function centreOf(b: BodyResult | null | undefined): [number, number, number] {
  if (!b) return [0, 0, 0];
  const { min, max } = b.mesh.bounds; return [0, 1, 2].map(k => Math.round((min[k] + max[k]) / 2 * 1000) / 1000) as [number, number, number];
}
