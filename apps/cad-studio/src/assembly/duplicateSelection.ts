import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { nextInstanceId } from '@barocss/cad-model/assembly/takenIds';
import { translateSelection } from './translateSelection';

/** Duplicate free static occurrences, retaining their definitions and occurrence appearance. */
export function duplicateSelection(doc: StudioDoc, selected: readonly string[], delta: readonly number[]): { instances: PartInstance[]; ids: string[]; error?: never } | { error: string; instances?: never; ids?: never } {
  if (!Array.isArray(delta) || delta.length !== 3 || ![0, 1, 2].every(k => Number.isFinite(delta[k]))) return { error: 'Enter finite X, Y and Z offsets in mm.' };
  const moved = translateSelection(doc, selected, delta);
  if (moved.error !== undefined) return { error: moved.error };
  const instances = [...(doc.instances ?? [])], ids: string[] = [], selection = new Set(selected);
  const names = new Set(instances.map(i => i.name));
  for (const source of moved.instances.filter(i => selection.has(i.id))) {
    const id = nextInstanceId({ ...doc, instances }, 'inst');
    const base = `${source.name} copy`;
    let name = base, suffix = 2;
    while (names.has(name)) name = `${base} ${suffix++}`;
    names.add(name);
    instances.push({ ...source, id, name, position: [...source.position] });
    ids.push(id);
  }
  return { instances, ids };
}
