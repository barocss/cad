import type { SketchShape } from '@barocss/cad-model/sketch/types';

type Slot = Extract<SketchShape, { kind: 'slot' }>;

/** Width changes only the arc radius; both authored centres stay untouched. */
export function slotWidth(shape: Slot, width: number): Slot {
  if (!Number.isFinite(width)) return shape;
  const r = Math.max(0.25, width / 2);
  return r === shape.r ? shape : { ...shape, r };
}
