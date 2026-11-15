import { isOffsetToPlane } from '@barocss/cad-model/app/offsetPlanePick';
import type { Active } from './commandState';

/** An invalid repick discards only the target, never the source or distance draft. */
export function refuseOffsetPlanePick(active: Active, hint: string): Active {
  if (!isOffsetToPlane(active.cmd.id, active.values)) return active;
  const values = { ...active.values };
  delete values.endBody; delete values.endFace; delete values.keepPlane;
  return { ...active, values, preview: 'input', error: undefined,
    offsetPlanePickIssue: { cmd: active.cmd, ctx: active.ctx, values, hint } };
}
export function offsetPlanePickFeedback(active: Active): string | undefined {
  const issue = active.offsetPlanePickIssue;
  return isOffsetToPlane(active.cmd.id, active.values) && issue?.cmd === active.cmd && issue.ctx === active.ctx && issue.values === active.values
    ? issue.hint : undefined;
}
