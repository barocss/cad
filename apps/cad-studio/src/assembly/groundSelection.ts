import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { hostOf } from '@barocss/cad-model/engine/occurrences';
import { drivenRefusal } from '@barocss/cad-model/assembly/patterns';

/** Validate every occurrence before changing any. Nested parts retain their own assembly owner. */
export function groundSelection(doc: StudioDoc, ids: readonly string[], on: boolean): { instances: PartInstance[]; error?: never } | { error: string; instances?: never } {
  const selected = new Set(ids), instances = doc.instances ?? [];
  if (!selected.size) return { error: 'Select the placed parts to change.' };
  for (const id of selected) {
    const instance = instances.find(i => i.id === id);
    if (id.includes('/') || !instance) return { error: 'Select existing top-level placed parts only.' };
    const pattern = drivenRefusal(doc, id, 'fix or unfix the seed instead.');
    if (pattern) return { error: pattern.message };
    const count = on ? (doc.mates ?? []).filter(m => hostOf(m.b.part) === id).length : 0;
    if (count) return { error: `${instance.name}: ${count} mate${count > 1 ? 's' : ''} move${count > 1 ? '' : 's'} this part. Delete ${count > 1 ? 'them' : 'it'} first, or fix the other part instead. Nothing was changed.` };
  }
  return { instances: instances.map(i => selected.has(i.id) && !!i.grounded !== on ? { ...i, grounded: on || undefined } : i) };
}

/** Additive outliner picking applies only within the top-level occurrence owner. */
export function pickPlacedPart(previous: readonly string[], id: string, additive = false): string[] {
  if (!additive || id.includes('/')) return [id];
  const top = previous.filter(value => !value.includes('/'));
  return top.includes(id) ? top.filter(value => value !== id) : [...top, id];
}
