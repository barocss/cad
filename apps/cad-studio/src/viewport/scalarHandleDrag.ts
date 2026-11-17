import { GIZMO_PX, type FeatureHandle, type Projector } from './gizmo';
type XY = [number, number];
export interface ScalarHandleDrag {
  id: string; owner: unknown; session: object; start: number;
  coefficient: XY; fallback: boolean; toValue: FeatureHandle['toValue'];
}
/** Opt-in scalar control, not a world-axis movement. Freeze the complete conversion at pointer-down. */
export function captureScalarHandleDrag(handle: FeatureHandle, projector: Projector): ScalarHandleDrag | null {
  if (!handle.scalarDragSession || handle.arc || handle.plane || !Number.isFinite(handle.value)
    || !Number.isFinite(projector.size) || projector.size <= 0
    || ![...handle.at, ...handle.dir].every(Number.isFinite) || Math.hypot(...handle.dir) === 0) return null;
  const a = projector.project(handle.at), b = projector.project(handle.at.map((v, i) => v + handle.dir[i] * projector.size) as [number, number, number]);
  if (![...a, ...b].every(Number.isFinite)) return null;
  const x = b[0] - a[0], y = b[1] - a[1], length = Math.hypot(x, y), fallback = length < 4;
  if (!Number.isFinite(length)) return null;
  const coefficient: XY = fallback ? [0, -projector.size / GIZMO_PX] : [x * projector.size / length ** 2, y * projector.size / length ** 2];
  if (!coefficient.every(Number.isFinite)) return null;
  return { id: handle.id, owner: handle.owner, session: handle.scalarDragSession, start: handle.value, coefficient, fallback, toValue: handle.toValue };
}
/** A replacement command, even another Fillet, cannot inherit this pointer's captured conversion. */
export function scalarHandleDragValue(frame: ScalarHandleDrag | null, handle: FeatureHandle | undefined, from: XY, to: XY): number | null {
  if (!frame || !handle || handle.id !== frame.id || handle.owner !== frame.owner || handle.scalarDragSession !== frame.session
    || ![...from, ...to].every(Number.isFinite)) return null;
  const mm = (to[0] - from[0]) * frame.coefficient[0] + (to[1] - from[1]) * frame.coefficient[1];
  if (!Number.isFinite(mm)) return null;
  const value = frame.toValue(frame.start, mm);
  return Number.isFinite(value) ? value : null;
}
