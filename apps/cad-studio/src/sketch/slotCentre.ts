import type { SketchShape } from '@barocss/cad-model/sketch/types';

type Slot = Extract<SketchShape, { kind: 'slot' }>;

/** Centre fields locate the first arc centre. Translate both centres, without
 * rebuilding the other centre through a rounded length/angle representation. */
export function slotCentre(shape: Slot, axis: 0 | 1, value: number): Slot {
  if (!Number.isFinite(value) || !Number.isFinite(shape.a[axis]) || !Number.isFinite(shape.b[axis])) return shape;
  const delta = value - shape.a[axis], end = shape.b[axis] + delta;
  if (!Number.isFinite(delta) || !Number.isFinite(end) || value === shape.a[axis]) return shape;
  const a: [number, number] = [...shape.a], b: [number, number] = [...shape.b];
  a[axis] = value; b[axis] = end;
  return { ...shape, a, b };
}
