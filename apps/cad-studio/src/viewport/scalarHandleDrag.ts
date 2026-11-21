import { GIZMO_PX, type FeatureHandle, type Projector } from './gizmo';
type XY = [number, number];
export interface ScalarHandleDrag {
  id: string; owner: unknown; session: object; start: number;
  unit: XY; projectedScale: number; screenScale: number; blend: number;
  fallback: boolean; toValue: FeatureHandle['toValue'];
}
/** Opt-in scalar control, not a world-axis movement. Freeze the complete conversion at pointer-down. */
export function captureScalarHandleDrag(handle: FeatureHandle, projector: Projector): ScalarHandleDrag | null {
  if (!handle.scalarDragSession || handle.arc || handle.plane || !Number.isFinite(handle.value)
    || !Number.isFinite(projector.size) || projector.size <= 0
    || ![...handle.at, ...handle.dir].every(Number.isFinite) || Math.hypot(...handle.dir) === 0) return null;
  const a = projector.project(handle.at), b = projector.project(handle.at.map((v, i) => v + handle.dir[i] * projector.size) as [number, number, number]);
  if (![...a, ...b].every(Number.isFinite)) return null;
  const x = b[0] - a[0], y = b[1] - a[1], length = Math.hypot(x, y), fallback = length < 24;
  if (!Number.isFinite(length)) return null;
  const t = Math.max(0, Math.min(1, (length - 8) / 16)), blend = t * t * (3 - 2 * t);
  const unit: XY = length > 8 ? [x / length, y / length] : [0, 0];
  const projectedScale = length > 8 ? projector.size / length : 0, screenScale = projector.size / GIZMO_PX;
  if (![...unit, projectedScale, screenScale].every(Number.isFinite)) return null;
  return { id: handle.id, owner: handle.owner, session: handle.scalarDragSession, start: handle.value,
    unit, projectedScale, screenScale, blend, fallback, toValue: handle.toValue };
}
/** A replacement command, even another Fillet, cannot inherit this pointer's captured conversion. */
export function scalarHandleDragValue(frame: ScalarHandleDrag | null, handle: FeatureHandle | undefined, from: XY, to: XY): number | null {
  if (!frame || !handle || handle.id !== frame.id || handle.owner !== frame.owner || handle.scalarDragSession !== frame.session
    || ![...from, ...to].every(Number.isFinite)) return null;
  const dx = to[0] - from[0], dy = to[1] - from[1], distance = Math.hypot(dx, dy);
  if (!Number.isFinite(distance)) return null;
  const along = dx * frame.unit[0] + dy * frame.unit[1];
  const alignment = distance > 0 ? Math.min(1, (along / distance) ** 2) : 0;
  // Keep more screen-up response for transverse motion. A fixed vector blend can cancel at every direction.
  const weight = frame.blend ** 2 + (frame.blend - frame.blend ** 2) * alignment;
  const mm = (1 - weight) * -dy * frame.screenScale + weight * along * frame.projectedScale;
  if (!Number.isFinite(mm)) return null;
  const value = frame.toValue(frame.start, mm);
  return Number.isFinite(value) ? value : null;
}

/** Until its own proof is ready, block History Fillet for screen-up and blended scalar conversion. */
export function historyFilletEndOnBlocked(handle:FeatureHandle|undefined,projector:Projector):boolean {
  if(!handle?.historyFilletProofPending || handle.scalarDragSession) return false;
  if(handle.historyFilletProofPending === 'circular') return true;
  return captureScalarHandleDrag({...handle,scalarDragSession:handle},projector)?.fallback!==false;
}

/** A pending end-on press may keep the legacy Shift pick, but may never become a radius drag. */
export function historyFilletPendingPress(handle:FeatureHandle|undefined,projector:Projector,shiftPickArmed:boolean):
  'consume' | 'shift-pick-only' | undefined {
  if (!historyFilletEndOnBlocked(handle,projector)) return;
  return shiftPickArmed ? 'shift-pick-only' : 'consume';
}
