import type { NurbsCurve } from '@barocss/cad-model/engine/curveSource';
import type { NativeEdgeCurveReply } from '@barocss/cad-model/engine/nativeEdgeCurve';
/** All-or-nothing read; obsolete results and errors cannot append geometry or show a stale refusal. */
export async function readOwnedNativeEdges<T>(picks: readonly T[], read: (pick: T) => Promise<NativeEdgeCurveReply>, owns: () => boolean): Promise<NurbsCurve[] | undefined> {
  if (!owns()) return;
  if (!picks.length || picks.length > 16) throw new Error('Select between 1 and 16 native edges.');
  const curves: NurbsCurve[] = [];
  for (const pick of picks) {
    let reply: NativeEdgeCurveReply;
    try { reply = await read(pick); } catch (error) { if (!owns()) return; throw error; }
    if (!owns()) return;
    if ('error' in reply) throw new Error(reply.error);
    curves.push(reply.curve);
  }
  return curves;
}

export interface NativeCopyOwner { doc: object; evaluated: object; bodies: object; selection: object; scope: object; fresh: boolean; busy: boolean }
export function ownsNativeEdgeCopy(before: NativeCopyOwner, current: NativeCopyOwner): boolean {
  return before.fresh && !before.busy && current.fresh && !current.busy
    && before.doc === current.doc && before.evaluated === current.evaluated && before.bodies === current.bodies
    && before.selection === current.selection && before.scope === current.scope;
}
