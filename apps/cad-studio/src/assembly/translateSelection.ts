import type { PartInstance, StudioDoc } from '@barocss/cad-model/engine/doc';
import { hostOf } from '@barocss/cad-model/engine/occurrences';

// Linked housing depends on both owner and target world poses, including unselected owners.
function hasLinkedHousing(doc: StudioDoc): boolean {
  return doc.nodes.some(n => n.kind === 'bearing' && !n.suppressed && n.housingRef !== undefined)
    || !!doc.instances?.some(i => hasLinkedHousing(i.doc));
}

/** A conservative rigid translation of free, ordinary occurrences, without invoking a constraint solver. */
export function translateSelection(doc: StudioDoc, ids: readonly string[], delta: readonly number[]): { instances: PartInstance[]; error?: never } | { error: string; instances?: never } {
  const instances = doc.instances ?? [], selected = new Set(ids);
  if (selected.size < 2) return { error: 'Select at least two top-level placed parts.' };
  if (delta.length !== 3 || !delta.every(Number.isFinite)) return { error: 'Enter finite X, Y and Z offsets in mm.' };
  if (hasLinkedHousing(doc)) return { error: 'Linked bearing housings require individual placement review before a group move.' };
  const positions = new Map<string, PartInstance['position']>();
  for (const id of selected) {
    const part = instances.find(i => i.id === id);
    if (id.includes('/') || !part || instances.filter(i => i.id === id).length !== 1) return { error: 'Select existing top-level placed parts only.' };
    if (part.savedPlacement) return { error: 'Posed occurrences cannot be moved in this editor.' };
    if (part.grounded || part.hidden) return { error: `${part.name} is fixed or hidden. Unfix and show it before moving this selection.` };
    if (part.pattern || doc.instancePatterns?.some(p => p.seed === id)) return { error: `${part.name} belongs to a pattern. Move its seed separately or edit the pattern.` };
    if (doc.mates?.some(m => hostOf(m.a.part) === id || hostOf(m.b.part) === id)) return { error: `${part.name} is connected by a mate. Move constrained parts separately.` };
    if (part.doc.instances?.length || part.doc.robot || part.joints || doc.robot) return { error: 'This move supports ordinary static parts, not sub-assemblies or jointed assemblies.' };
    if (doc.assemblyCuts?.some(c => c.targets.some(target => hostOf(target) === id))) return { error: `${part.name} has an assembly cut. Move cut targets separately.` };
    const position = part.position.map((v, k) => v + delta[k]) as PartInstance['position'];
    if (!position.every(Number.isFinite)) return { error: 'The requested position is outside the finite coordinate range. Nothing was changed.' };
    if (delta.some((v, k) => v !== 0 && position[k] === part.position[k])) return { error: 'The offset is too small at this coordinate magnitude. Nothing was changed.' };
    positions.set(id, position);
  }
  // A finite but enormous offset can collapse distinct occurrence positions through rounding.
  const first = instances.find(i => selected.has(i.id))!;
  const origin = positions.get(first.id)!;
  for (const part of instances.filter(i => selected.has(i.id))) {
    const moved = positions.get(part.id)!;
    if (part.position.some((v, k) => {
      const before = v - first.position[k], after = moved[k] - origin[k];
      return !Number.isFinite(before) || !Number.isFinite(after) || Math.abs(after - before) > Math.max(1e-9, Math.abs(before) * 1e-12);
    })) return { error: 'This offset cannot preserve the relative positions at the requested coordinate magnitude. Nothing was changed.' };
  }
  return { instances: instances.map(i => {
    const position = positions.get(i.id);
    return position && position.some((v, k) => v !== i.position[k]) ? { ...i, position } : i;
  }) };
}
