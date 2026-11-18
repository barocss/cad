import type { SketchShape } from '@barocss/cad-model/sketch/types';
type Slot = Extract<SketchShape, { kind: 'slot' }>;
/** Rebuild only the second centre, without rounding authored geometry. The caller owns Length's minimum. */
export function slotEndpoint(shape: Slot, length: number, degrees: number): Slot {
 if (!Number.isFinite(length) || !Number.isFinite(degrees)) return shape;
 const angle = degrees * Math.PI / 180;
 const b: [number, number] = [shape.a[0] + length * Math.cos(angle), shape.a[1] + length * Math.sin(angle)];
 if (!b.every(Number.isFinite)) return shape;
 return b[0] === shape.b[0] && b[1] === shape.b[1] ? shape : { ...shape, b };
}
