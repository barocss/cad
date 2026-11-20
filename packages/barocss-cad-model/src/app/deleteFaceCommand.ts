import { isBoredPlateHealSource, isDeleteFaceFilletSource, withNode } from '../engine/doc';
import { featureId } from '../engine/ids';
import { toSig } from '../engine/references';
import { refusal } from '../engine/refusal';
import type { Command, Ctx } from './commands';

const PICK_FACE = 'Select the cylindrical wall of a supported through hole or the inside fillet of a straight L-bracket.';

function pickedHealFace(ctx: Ctx) {
  const selection = ctx.selection;
  if (selection.faces.length !== 1 || selection.edges.length || selection.bodies.length ||
      selection.sketches?.length || selection.vertices?.length || selection.profileRegions || ctx.direct?.length) return;
  const pick = selection.faces[0], body = ctx.bodies[pick.body], parent = body?.ref, face = body?.mesh.faces[pick.face];
  if (!parent || parent.side !== 'solid' || !face || face.kind !== 'curved' || face.facet) return;
  if (isDeleteFaceFilletSource(ctx.doc.nodes, parent.node)) {
    if (face.name !== featureId(ctx.doc.nodes, parent.node) + '.face' || !face.radius ||
        !Number.isFinite(face.radius) || !Number.isFinite(face.area) || face.area <= 0) return;
    return { parent, member: face };
  }
  if (!isBoredPlateHealSource(ctx.doc.nodes, parent.node)) return;
  const members = face.nativeFaces ?? [];
  if (members.length !== 2 || members[0].name === members[1].name ||
      members.some(member => member.kind !== 'curved' || !member.name || /[+\0]/.test(member.name) ||
        !Number.isFinite(member.radius) || !Number.isFinite(member.area) || member.area <= 0)) return;
  const member = members[0].name < members[1].name ? members[0] : members[1];
  return { parent, member };
}

export const deleteFaceCommand: Command = {
  id: 'delete-face', label: 'Delete face', icon: 'delete', group: 'modify',
  hint: 'Heal a supported through hole or a straight L-bracket’s inside fillet.',
  keywords: 'delete remove heal fill bore hole fillet direct edit',
  available: ctx => pickedHealFace(ctx) ? { ok: true } : { ok: false, reason: PICK_FACE },
  fields: () => [],
  build(ctx) {
    const picked = pickedHealFace(ctx);
    if (!picked) throw refusal('BAD_REFERENCE', PICK_FACE);
    const { parent, member } = picked, { name } = member;
    const sig = toSig({ kind: 'curved', at: member.centroid, dir: null, size: member.area, radius: member.radius });
    return withNode(ctx.doc, { kind: 'delete-face', parent, faces: [name], sigs: { [name]: sig } });
  },
};
