import { prefixDoc, type StudioDoc } from '../engine/doc';
import { evaluateDoc } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import { refusal } from '../engine/refusal';
import { replaceRange } from '../chat/features';
import { canonical } from '../util/revision';
import { appendMirrorRecipe, mirrorRecipeValues } from './mirrorRecipe';
import type { Command } from './commands';

/** Only a newly authored, untouched terminal group, never inferred from legacy transforms. */
export function mirrorHistoryEdit(doc: StudioDoc, index: number): Command | null {
  const end = doc.nodes.length - 1, last = doc.nodes[end];
  if (!last || (last.kind !== 'mirror' && last.kind !== 'translate')) return null;
  const made = last.made, count = made?.nodes;
  if (made?.command !== 'mirror' || (count !== 1 && count !== 3) || !made.values || typeof made.values !== 'object' || Array.isArray(made.values)) return null;
  const start = end - count + 1, group = doc.nodes.slice(start), first = group[0];
  if (!Number.isInteger(index) || start < 0 || index < start || index > end
    || !first || (first.kind !== 'mirror' && first.kind !== 'translate')) return null;
  if (group.some((node, i) => node.held || node.suppressed || node.rematched || !node.id
    || doc.nodes.filter(other => other.id === node.id).length !== 1 || (i < count - 1 && 'made' in node && node.made))) return null;
  const parent = first.parent;
  if (!Number.isInteger(parent.node) || parent.node < 0 || parent.node >= start
    || Object.values(doc.outputs).some(ref => ref.node >= start && ref.node !== end)) return null;
  const recipe = made.values;
  if (Object.keys(recipe).some(key => key !== 'plane' && key !== 'at') || typeof recipe.at !== 'number') return null;
  try {
    mirrorRecipeValues(recipe);
    const replay = replaceRange(doc, start, count, appendMirrorRecipe(prefixDoc(doc, start), parent, recipe).nodes.slice(start));
    if (canonical(replay.nodes.slice(start)) !== canonical(group)) return null;
  } catch { return null; }
  let proved = false;
  const prove = () => {
    if (proved) return;
    const prefix = prefixDoc(doc, start), result = evaluateDoc(prefix, 0);
    if (!result.ok) throw refusal('BAD_REFERENCE', 'The original Mirror source cannot be evaluated.');
    const key = bodyKeyFor(prefix.nodes, parent.node, parent.side);
    const bodies = result.bodies.filter(body => body.key === key && body.ref?.node === parent.node && body.ref.side === parent.side);
    if (bodies.length !== 1 || bodies[0].sheet) throw refusal('BAD_REFERENCE', 'The original non-sheet Mirror body is missing or ambiguous.');
    proved = true;
  };
  return {
    id: 'edit', label: 'Edit Mirror', icon: 'cad-mirror', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Mirror in History again.' },
    defaults: () => ({ ...recipe }),
    fields: () => [
      { key: 'plane', label: 'Plane', kind: 'choice', options: [{ value: 'yz', label: 'YZ (across X)' }, { value: 'xz', label: 'XZ (across Y)' }, { value: 'xy', label: 'XY (across Z)' }] },
      { key: 'at', label: 'Plane at', kind: 'mm' },
    ],
    steps: () => [{ label: 'Fixed plane', text: 'The saved numeric plane is not linked to a picked face. Both translations and the mirror change together.', done: true }],
    build: (ctx, values) => {
      if (ctx.doc !== doc) throw refusal('BAD_REFERENCE', 'Open the current Mirror in History again.');
      mirrorRecipeValues(values); prove();
      const next = replaceRange(doc, start, count, appendMirrorRecipe(prefixDoc(doc, start), parent, values).nodes.slice(start));
      if (canonical(next.nodes) === canonical(doc.nodes)) return doc;
      return { ...next, outputs: Object.fromEntries(Object.entries(doc.outputs).map(([key, ref]) =>
        [key, ref.node === end ? { ...ref, node: next.nodes.length - 1 } : ref])) };
    },
  };
}
