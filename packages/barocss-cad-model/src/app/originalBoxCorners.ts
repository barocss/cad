import { isEditableBox } from './editCommand';
import type { ModelNode } from '../engine/doc';

export function originalBox(nodes: readonly ModelNode[], index: number) {
  const sketch = nodes[index], extrusion = nodes[index + 1];
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle' || extrusion?.kind !== 'extrude'
    || !isEditableBox(nodes, index)) return;
  return { sketch, extrusion };
}

export type OriginalBox = NonNullable<ReturnType<typeof originalBox>>;

/** Confirm that an already-bound native point is one of the eight authored corners. */
export function isOriginalBoxCorner({ sketch, extrusion }: OriginalBox, point: readonly [number, number, number]): boolean {
  const [minX, minY] = sketch.min, [maxX, maxY] = sketch.max, bottom = extrusion.from ?? 0;
  return (point[0] === minX || point[0] === maxX) && (point[1] === minY || point[1] === maxY)
    && typeof bottom === 'number' && typeof extrusion.height === 'number'
    && (point[2] === bottom || point[2] === bottom + extrusion.height);
}
