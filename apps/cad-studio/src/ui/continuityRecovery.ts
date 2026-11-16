import type { ContinuityReply } from '@barocss/cad-model/engine/edgeContinuity';
type Reason = Extract<Extract<ContinuityReply, { measurement: unknown }>['measurement'], { status: 'unsupported' }>['reason'];
export const stepContinuityNotice = 'Edge continuity inspection may be unavailable after reopening this STEP in Studio because native face parameter curves are not retained. Keep the original .bcad file and inspect its native edges instead. This inspection limit does not by itself mean the geometry changed.';
export function continuityRecovery(reason: Reason): string {
  return reason === 'missing-pcurve'
    ? 'This edge lacks the native face parameter curves needed for inspection. If this model came from STEP, reopen the original .bcad file and inspect its native edges. This inspection limit does not by itself mean the geometry changed.'
    : 'This edge cannot be measured. Select another native edge.';
}
