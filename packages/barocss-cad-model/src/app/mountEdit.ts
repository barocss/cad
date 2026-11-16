import { prefixDoc, type StudioDoc } from '../engine/doc';
import { evaluateDoc } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import { refusal } from '../engine/refusal';
import { replaceRange } from '../chat/features';
import { canonical } from '../util/revision';
import type { Command, Ctx } from './commands';
import { mountCommand, mountNodes } from './mounts';

export const MOUNT_EDIT = 'edit';
const rejected = (message: string): never => { throw refusal('BAD_REFERENCE', `Mount: ${message}`); };

function savedMount(doc: StudioDoc, index: number) {
  if (!Number.isInteger(index) || index !== doc.nodes.length - 1) return;
  const owner = doc.nodes[index], made = owner && 'made' in owner ? owner.made : undefined;
  if (made?.command !== 'mount') return;
  const count = made.nodes ?? 2, start = index - count + 1;
  if (!Number.isInteger(count) || count < 1 || start < 0) return;
  const group = doc.nodes.slice(start), first = group[0];
  if (first.kind !== 'hole' || !Number.isInteger(first.parent.node) || first.parent.node < 0 || first.parent.node >= start) return;
  if (group.some((node, i) => node.held || node.suppressed || node.rematched || !node.id
    || doc.nodes.filter(other => other.id === node.id).length !== 1 || (i < count - 1 && 'made' in node && node.made))) return;
  const values = made.values;
  if (typeof values.face !== 'string' || !values.face || values.face.includes('+') || typeof values.row !== 'string'
    || !Number.isFinite(values.x) || !Number.isFinite(values.y) || !['0', '90', '180', '270'].includes(String(values.turn))
    || !['through', 'recess'].includes(String(values.pilot))) return;
  if (doc.mounts?.rows.filter(row => row.id === values.row).length !== 1) return;
  // No partially overlapping saved recipe may claim any of these operations.
  if (doc.nodes.slice(0, start).some((node, i) => 'made' in node && node.made && (!Number.isInteger(node.made.nodes ?? 2)
    || (node.made.nodes ?? 2) < 1 || i - (node.made.nodes ?? 2) + 1 < 0))) return;
  return { start, count, parent: first.parent, values, group };
}

/** Structural only: safe to call while rendering History. Native evaluation is lazy. */
export function canEditSavedMount(doc: StudioDoc, index: number): boolean {
  return !!savedMount(doc, index);
}

/** Rebuild a terminal mount only after proving its saved recipe against its exact source face. */
export function mountHistoryEdit(doc: StudioDoc, index: number): Command | null {
  const saved = savedMount(doc, index);
  if (!saved) return null;
  const { start, count, parent, values, group } = saved;
  let source: Ctx | undefined, checked = false;
  const getSource = (): Ctx => {
    if (source) return source;
    const prefix = prefixDoc(doc, start), result = evaluateDoc(prefix, 0);
    if (!result.ok) return rejected('the original History prefix cannot be evaluated.');
    const key = bodyKeyFor(prefix.nodes, parent.node, parent.side);
    const matches = result.bodies.flatMap((body, i) => body.key === key && body.ref?.node === parent.node && body.ref.side === parent.side ? [i] : []);
    if (matches.length !== 1) return rejected('the original parent is missing or ambiguous.');
    const body = matches[0], faces = result.bodies[body].mesh.faces.filter(face => face.name === values.face && face.kind === 'plane' && !face.facet);
    if (faces.length !== 1) return rejected('the exact original face is missing or ambiguous.');
    source = { doc: prefix, bodies: result.bodies, selection: { bodies: [], edges: [], faces: [{ body, face: faces[0].index }] } };
    return source;
  };
  return {
    id: MOUNT_EDIT, label: 'Edit Mount', icon: 'cad-hole', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Mount in History again.' },
    fields: ctx => (mountCommand.fields?.(ctx) ?? []).map(field => field.key === 'x' || field.key === 'y'
      ? { ...field, label: `Axis coordinate ${field.key === 'x' ? 1 : 2}` } : field),
    defaults: () => ({ ...values }),
    steps: (_ctx, next) => [{ label: 'Saved face', text: `${values.face} on feature ${parent.node + 1}; axis at (${next.x}, ${next.y}) in its two plane axes`, done: true }],
    build: (ctx, next) => {
      if (ctx.doc !== doc || doc.nodes[index] !== group[count - 1]) return rejected('open the current Mount in History again.');
      const original = getSource();
      if (!checked) {
        const replay = replaceRange(doc, start, count, mountNodes(original, values).nodes.slice(start));
        if (canonical(replay.nodes.slice(start)) !== canonical(group)) return rejected('the saved row, face or recipe changed. Recreate the Mount on the current face.');
        checked = true;
      }
      if (doc.mounts?.rows.filter(row => row.id === String(next.row)).length !== 1) return rejected('the selected row is missing or ambiguous.');
      const candidate = replaceRange(doc, start, count, mountNodes(original, next).nodes.slice(start));
      return canonical(candidate.nodes) === canonical(doc.nodes) ? doc : candidate;
    },
  };
}
