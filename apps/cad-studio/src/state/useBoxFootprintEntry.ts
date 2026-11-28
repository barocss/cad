import { useMemo, useRef } from 'react';
import type { Command, Values, VertexSel } from '@barocss/cad-model/app/commands';
import { updateBoxFootprint } from '@barocss/cad-model/app/editCommand';
import { isOriginalBoxCorner, originalBox, type OriginalBox } from '@barocss/cad-model/app/originalBoxCorners';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { refusal } from '@barocss/cad-model/engine/refusal';

const width = { axis: 0, key: 'w', name: 'width', title: 'Match Box Width', label: 'Width X' } as const;
const depth = { axis: 1, key: 'd', name: 'depth', title: 'Match Box Depth', label: 'Depth Y' } as const;
type FootprintDimension = typeof width | typeof depth;

function footprintCommand({ sketch }: OriginalBox, { axis, key, name, title, label }: FootprintDimension, dimension: number): Command {
  return {
    id: `match-box-${name}`, label: title, icon: 'cad-box', group: 'modify',
    available: () => ({ ok: true }),
    fields: () => [{ key, label, kind: 'mm', min: 1 }],
    defaults: () => ({ [key]: dimension }),
    build: ({ doc }, values) => {
      const min = sketch.min[axis], nextDimension = Number(values[key]);
      if (doc.nodes[0] !== sketch || typeof min !== 'number' || !Number.isFinite(nextDimension) || nextDimension < 1)
        throw refusal('VALUE', 'Keep the original Box and enter at least 1 mm.');
      const next = min + nextDimension;
      if (next === sketch.max[axis]) throw refusal('VALUE', `The Box already has this ${name}.`);
      const max = [...sketch.max] as typeof sketch.max;
      max[axis] = next;
      const candidate = [{ ...sketch, max }, ...doc.nodes.slice(1)];
      const nodes = updateBoxFootprint(doc.nodes, candidate, 0);
      if (nodes === candidate) throw refusal('VALUE', `Enter a ${name} within the original Box limits.`);
      return { ...doc, nodes };
    },
  };
}

function fromCorners(doc: StudioDoc, bodies: readonly BodyResult[], source?: VertexSel, target?: VertexSel) {
  if (!source || !target || source.body === target.body || doc.instances?.length || doc.nodes.length !== 4 || bodies.length !== 2) return;
  const owner = bodies[source.body]?.ref, reference = bodies[target.body]?.ref;
  if (owner?.side !== 'solid' || owner.node !== 1 || reference?.side !== 'solid' || reference.node !== 3) return;
  const box = originalBox(doc.nodes, 0), other = originalBox(doc.nodes, 2);
  if (!box || !other || !isOriginalBoxCorner(box, source.at) || !isOriginalBoxCorner(other, target.at)) return;

  const match = (dimension: FootprintDimension) => {
    const { axis } = dimension, min = box.sketch.min[axis], to = target.at[axis];
    if (source.at[axis] !== box.sketch.max[axis] || typeof min !== 'number' || to < min + 1 || to === source.at[axis]) return;
    const size = Math.max(1, to - min);
    if (Number.isFinite(size) && min + size === to) return footprintCommand(box, dimension, size);
  };
  return { width: match(width), depth: match(depth) };
}

interface BoxFootprintEntry {
  doc: StudioDoc;
  bodies: readonly BodyResult[];
  /** Ordered, current viewport native picks. */
  picks?: readonly [VertexSel, VertexSel];
  canOpen(): boolean;
  start(command: Command, initial?: Values): void;
}

/** Enter the ordinary preview session only for the current pair of authored Box corners. */
export function useBoxFootprintEntry({ doc, bodies, picks, canOpen, start }: BoxFootprintEntry) {
  const [source, target] = picks ?? [];
  const commands = useMemo(() => fromCorners(doc, bodies, source, target), [doc, bodies, source, target]);
  const latest = useRef(commands);
  latest.current = commands;
  const open = (command?: Command) => command && (() => {
    if (latest.current === commands && canOpen()) start(command);
  });
  return { width: open(commands?.width), depth: open(commands?.depth) };
}
