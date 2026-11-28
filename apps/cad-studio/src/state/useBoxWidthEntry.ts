import { useMemo, useRef } from 'react';
import type { Command, Values, VertexSel } from '@barocss/cad-model/app/commands';
import { updateBoxFootprint } from '@barocss/cad-model/app/editCommand';
import { isOriginalBoxCorner, originalBox, type OriginalBox } from '@barocss/cad-model/app/originalBoxCorners';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { refusal } from '@barocss/cad-model/engine/refusal';

function widthCommand({ sketch }: OriginalBox, width: number): Command {
  return {
    id: 'match-box-width', label: 'Match Box Width', icon: 'cad-box', group: 'modify',
    available: () => ({ ok: true }),
    fields: () => [{ key: 'w', label: 'Width X', kind: 'mm', min: 1 }],
    defaults: () => ({ w: width }),
    build: ({ doc }, values) => {
      const [minX] = sketch.min, [maxX, maxY] = sketch.max, nextWidth = Number(values.w);
      if (doc.nodes[0] !== sketch || typeof minX !== 'number' || !Number.isFinite(nextWidth) || nextWidth < 1)
        throw refusal('VALUE', 'Keep the original Box and enter at least 1 mm.');
      const newX = minX + nextWidth;
      if (newX === maxX) throw refusal('VALUE', 'The Box already has this width.');
      const candidate = [{ ...sketch, max: [newX, maxY] as typeof sketch.max }, ...doc.nodes.slice(1)];
      const nodes = updateBoxFootprint(doc.nodes, candidate, 0);
      if (nodes === candidate) throw refusal('VALUE', 'Enter a width within the original Box limits.');
      return { ...doc, nodes };
    },
  };
}

function fromCorners(doc: StudioDoc, bodies: readonly BodyResult[], source?: VertexSel, target?: VertexSel) {
  if (!source || !target || source.body === target.body || doc.instances?.length || doc.nodes.length !== 4 || bodies.length !== 2) return;
  const owner = bodies[source.body]?.ref, reference = bodies[target.body]?.ref;
  if (owner?.side !== 'solid' || owner.node !== 1 || reference?.side !== 'solid' || reference.node !== 3) return;
  const box = originalBox(doc.nodes, 0), other = originalBox(doc.nodes, 2);
  if (!box || !other || !isOriginalBoxCorner(box, source.at) || source.at[0] !== box.sketch.max[0]
    || !isOriginalBoxCorner(other, target.at)) return;
  const [minX] = box.sketch.min, [targetX] = target.at;
  if (typeof minX !== 'number' || targetX < minX + 1 || targetX === source.at[0]) return;
  const width = Math.max(1, targetX - minX);
  if (Number.isFinite(width) && minX + width === targetX) return widthCommand(box, width);
}

interface BoxWidthEntry {
  doc: StudioDoc;
  bodies: readonly BodyResult[];
  /** Ordered, current viewport native picks. */
  picks?: readonly [VertexSel, VertexSel];
  canOpen(): boolean;
  start(command: Command, initial?: Values): void;
}

/** Enter the ordinary preview session only for the current pair of authored Box corners. */
export function useBoxWidthEntry({ doc, bodies, picks, canOpen, start }: BoxWidthEntry) {
  const [source, target] = picks ?? [];
  const command = useMemo(() => fromCorners(doc, bodies, source, target), [doc, bodies, source, target]);
  const latest = useRef(command);
  latest.current = command;
  if (!command) return;
  return () => { if (latest.current === command && canOpen()) start(command); };
}
