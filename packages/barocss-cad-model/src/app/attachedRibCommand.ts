import { CadNumericPolicy } from '@barocss/cad';
import { withNode } from '../engine/doc';
import type { Vec3 } from '../engine/mesh';
import { refusal } from '../engine/refusal';
import { boxShellSelection } from './boxShellSelection';
import type { Command, Ctx } from './commands';

const selectionReason = 'Select one original top or bottom face of a rectangular stock extrusion.';
const engagement = 1;

export function ribAttachment(ctx: Ctx) {
  if (ctx.selection.sketches?.length || ctx.selection.vertices?.length || ctx.direct?.length) return;
  const box = boxShellSelection(ctx);
  if (!box) return;
  const { parent, opening, sigs } = box;
  const source = ctx.doc.nodes[parent.node], signature = sigs[opening], sign = signature.d?.[2];
  if (box.secondOpening && sign !== 1) return;
  if (source?.kind !== 'extrude' || source.draft || source.from !== undefined || (sign !== 1 && sign !== -1)) return;
  const sketch = ctx.doc.nodes[source.sketch];
  if (sketch?.kind !== 'sketch' || sketch.profile !== 'rectangle') return;
  const picked = ctx.selection.faces[0], face = ctx.bodies[picked.body].mesh.faces[picked.face];
  if (face.nativeAxisPlane?.axis !== 'z') return;
  const z = face.nativeAxisPlane.at;
  const p: Vec3 = [signature.p[0], signature.p[1], z];
  return { parent, opening, sign, attachment: { ...signature, p } };
}

export const ATTACHED_RIB: Command = {
  id: 'rib', label: 'Rib', icon: 'cad-extrude', group: 'create', keywords: 'rib reinforce reinforcement top bottom',
  hint: 'Add a straight rib on the selected stock face.',
  available: ctx => ribAttachment(ctx) ? { ok: true } : { ok: false, reason: selectionReason },
  defaults: ctx => {
    const target = ribAttachment(ctx);
    return { length: 20, width: 2, height: 5, x: target?.attachment.p[0] ?? 0, y: target?.attachment.p[1] ?? 0 };
  },
  fields: () => [
    { key: 'length', label: 'Length', kind: 'mm', min: 0 },
    { key: 'width', label: 'Width', kind: 'mm', min: 0 },
    { key: 'height', label: 'Protrusion', kind: 'mm', min: 0 },
    { key: 'x', label: 'Centre X', kind: 'mm' },
    { key: 'y', label: 'Centre Y', kind: 'mm' },
  ],
  steps: ctx => {
    const target = ribAttachment(ctx);
    return target ? [{ label: 'Attachment', text: `${target.sign > 0 ? 'Top · +Z' : 'Bottom · −Z'} · ${target.opening}`, done: true }] : [];
  },
  build: (ctx, values) => {
    const target = ribAttachment(ctx);
    if (!target) throw refusal('BAD_REFERENCE', selectionReason);
    const { parent, opening, sign, attachment } = target;
    const [length, width, height, x, y] = [values.length, values.width, values.height, values.x, values.y].map(Number);
    if (![length, width, height].every(value => Number.isFinite(value) && value > CadNumericPolicy.linearTolerance)
      || !Number.isFinite(x) || !Number.isFinite(y))
      throw refusal('VALUE', 'Enter a positive length, width and protrusion, and a finite centre.');
    const z = attachment.p[2];
    const min: Vec3 = [x - length / 2, y - width / 2, z - (sign > 0 ? engagement : height)];
    const max: Vec3 = [x + length / 2, y + width / 2, z + (sign > 0 ? height : engagement)];
    if (![...min, ...max].every(value => Math.abs(value) <= CadNumericPolicy.coordinateAbs))
      throw refusal('VALUE', 'The rib must fit within the model coordinate range.');
    return withNode(ctx.doc, { kind: 'rib', parent, min, max, sigs: { [opening]: attachment } });
  },
};
