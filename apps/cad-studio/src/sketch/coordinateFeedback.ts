import type { SketchShape } from '@barocss/cad-model/sketch/types';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
export interface CoordinateIntent { source: SketchShape; point: number; axis: 0 | 1; requested: number }
export interface CoordinateFeedback { doc: StudioDoc; shape: SketchShape; generation: number; message: string }
const shown = (value: number) => Math.round(value * 1e4) / 1e4;
/** Feedback only: use the panel's displayed precision, never modify coordinates or solver tolerances. */
export function coordinateMessage(intent: CoordinateIntent | undefined, source: SketchShape | null, settled: SketchShape | null, error: string | null): string | null {
  if (!intent || error || intent.source !== source || source?.kind !== 'polygon' || settled?.kind !== 'polygon'
    || !source.closed || source.pending || source.bulges?.some(Boolean) || source.points.length !== settled.points.length
    || !Number.isInteger(intent.point) || intent.point < 0 || ![0, 1].includes(intent.axis)) return null;
  const actual = settled.points[intent.point]?.[intent.axis], requested = intent.requested;
  if (!Number.isFinite(actual) || !Number.isFinite(requested)) return null;
  const a = shown(actual), r = shown(requested);
  if (!Number.isFinite(a) || !Number.isFinite(r) || a === r) return null;
  return `Point ${intent.point + 1} ${'XY'[intent.axis]} is ${a} mm, not the requested ${r} mm. The current constraints did not retain that coordinate.`;
}
export function currentCoordinateFeedback(receipt: CoordinateFeedback | null, doc: StudioDoc, shape: SketchShape | null, generation: number): string | null {
  return receipt?.doc === doc && receipt.shape === shape && receipt.generation === generation ? receipt.message : null;
}
