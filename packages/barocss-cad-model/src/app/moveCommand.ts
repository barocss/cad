import { withNode } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { refusal } from '../engine/refusal';
import { refOf, selectedBodies } from './bodyRef';
import type { Command, Ctx } from './commands';

const selectSource = 'Select a body, or pick a source vertex and Shift-select a destination vertex on a different body.';

/** The current display bounds corner; Move arithmetic must not quantize authored coordinates. */
export function cornerOf(b: BodyResult | null | undefined): [number, number, number] {
  return b ? [...b.mesh.bounds.min] as [number, number, number] : [0, 0, 0];
}

export function moveVertexPair({ moveVertices, bodies, selection, direct }: Ctx) {
  if (!moveVertices || selection.vertices?.length !== 2 || selection.bodies.length || selection.faces.length
    || selection.edges.length || selection.sketches?.length || selection.profileRegions || direct?.length) return;
  const [source, destination] = moveVertices;
  if (selection.vertices[0] === source && selection.vertices[1] === destination && source.body !== destination.body
    && bodies[source.body]?.ref && bodies[destination.body]?.ref && source.at.some((value, axis) => value !== destination.at[axis])) return moveVertices;
}

export function moveBodyIndex(ctx: Ctx): number | undefined {
  const pair = moveVertexPair(ctx);
  if (pair) return pair[0].body;
  const bodies = selectedBodies(ctx.selection);
  return bodies.length === 1 && ctx.bodies[bodies[0]] ? bodies[0] : undefined;
}

function moveSource(ctx: Ctx): [number, number, number] {
  const pair = moveVertexPair(ctx), index = moveBodyIndex(ctx);
  return pair?.[0].at ?? cornerOf(index === undefined ? null : ctx.bodies[index]);
}

export const moveCommand: Command = {
  id: 'move', label: 'Move', icon: 'cad-move', hint: 'Move a body by distance or between two native vertices',
  shortcut: 'G', group: 'modify', keywords: 'translate position align point',
  available: ctx => moveBodyIndex(ctx) === undefined ? { ok: false, reason: selectSource } : { ok: true },
  fields: () => [{ key: 'x', label: 'ΔX', kind: 'mm' }, { key: 'y', label: 'ΔY', kind: 'mm' }, { key: 'z', label: 'ΔZ', kind: 'mm' },
    { key: 'ax', label: 'To X', kind: 'mm' }, { key: 'ay', label: 'To Y', kind: 'mm' }, { key: 'az', label: 'To Z', kind: 'mm' }],
  defaults: ctx => {
    const [sx, sy, sz] = moveSource(ctx);
    const [ax, ay, az] = moveVertexPair(ctx)?.[1].at ?? [sx, sy, sz];
    return { x: ax - sx, y: ay - sy, z: az - sz, ax, ay, az };
  },
  derive: (ctx, values, changed) => {
    const source = moveSource(ctx), next = { ...values };
    ['x', 'y', 'z'].forEach((axis, i) => {
      const target = 'a' + axis;
      if (changed.includes(target)) next[axis] = Number(values[target]) - source[i];
      else next[target] = source[i] + Number(values[axis]);
    });
    return next;
  },
  build: (ctx, values) => {
    const index = moveBodyIndex(ctx);
    if (index === undefined) throw refusal('BAD_REFERENCE', selectSource);
    return withNode(ctx.doc, { kind: 'translate', parent: refOf(ctx.bodies[index]), offset: [Number(values.x), Number(values.y), Number(values.z)] });
  },
};
