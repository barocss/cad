import type { StudioDoc } from '../engine/doc';
import { nextFreeId } from '../util/ids';

type MateOwner = Pick<StudioDoc, 'mates' | 'variability'>;
/** Current-document mate ids, including missing mates still named by an input.
 * Child assemblies own separate namespaces. Never retarget or remove a held binding. */
export function takenMateIds(doc: MateOwner): Set<string> {
  const used = new Set((doc.mates ?? []).map(m => m.id));
  for (const input of doc.variability?.inputs ?? []) for (const binding of input.bindings) {
    if (binding.to === 'mate') used.add(binding.mate);
  }
  return used;
}
/** Preserve each caller's historical starting number while avoiding retained references. */
export const nextMateId = (doc: MateOwner, from = 1): string => nextFreeId('m', takenMateIds(doc), from);
