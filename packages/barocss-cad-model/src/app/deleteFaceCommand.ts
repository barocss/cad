import { isBoredPlateHealSource, isDeleteFaceFilletSource, planarDeleteFaceDirection, planarDeleteFaceTarget, withNode } from '../engine/doc';
import { featureId } from '../engine/ids';
import { toSig } from '../engine/references';
import { signaturesOf } from '../engine/rematch';
import { refusal } from '../engine/refusal';
import type { Command, Ctx } from './commands';

const PICK_FACE = 'Select the cylindrical wall of a supported through hole, a supported cylindrical boss top, one full-span box chamfer or fillet, or one full-height chamfer or fillet of a straight L-bracket.';

function pickedHealFace(ctx: Ctx) {
  const selection = ctx.selection;
  if (selection.faces.length !== 1 || selection.edges.length || selection.bodies.length ||
      selection.sketches?.length || selection.vertices?.length || selection.profileRegions || ctx.direct?.length) return;
  const pick = selection.faces[0], body = ctx.bodies[pick.body], parent = body?.ref, face = body?.mesh.faces[pick.face];
  if (!parent || parent.side !== 'solid' || !face || face.facet) return;
  if (face.kind === 'plane') {
    const name = face.nativePlaneName;
    if (!name) return;
    const target = planarDeleteFaceTarget(ctx.doc.nodes, parent.node, name);
    if (target?.name !== name) return;
    const signature = signaturesOf(body, 'plane').faces.get(name);
    if (signature?.kind !== 'plane' || !signature.dir || !planarDeleteFaceDirection(signature.dir, target.role) ||
        !Number.isFinite(signature.size) || signature.size <= 0) return;
    return { parent, name, signature: toSig(signature) };
  }
  if (face.kind !== 'curved') return;
  if (isDeleteFaceFilletSource(ctx.doc.nodes, parent.node)) {
    if (face.name !== featureId(ctx.doc.nodes, parent.node) + '.face' || !face.radius ||
        !Number.isFinite(face.radius) || !Number.isFinite(face.area) || face.area <= 0) return;
    return { parent, name: face.name,
      signature: toSig({ kind: 'curved', at: face.centroid, dir: null, size: face.area, radius: face.radius }) };
  }
  if (!isBoredPlateHealSource(ctx.doc.nodes, parent.node)) return;
  const members = face.nativeFaces ?? [];
  if (members.length !== 2 || members[0].name === members[1].name ||
      members.some(member => member.kind !== 'curved' || !member.name || /[+\0]/.test(member.name) ||
        !Number.isFinite(member.radius) || !Number.isFinite(member.area) || member.area <= 0)) return;
  const member = members[0].name < members[1].name ? members[0] : members[1];
  return { parent, name: member.name,
    signature: toSig({ kind: 'curved', at: member.centroid, dir: null, size: member.area, radius: member.radius }) };
}

export const deleteFaceCommand: Command = {
  id: 'delete-face', label: 'Delete face', icon: 'delete', group: 'modify',
  hint: 'Heal a supported through hole, cylindrical boss, box chamfer or fillet, or full-height L-bracket chamfer or fillet.',
  keywords: 'delete remove heal fill bore hole boss chamfer fillet direct edit',
  available: ctx => pickedHealFace(ctx) ? { ok: true } : { ok: false, reason: PICK_FACE },
  fields: () => [],
  build(ctx) {
    const picked = pickedHealFace(ctx);
    if (!picked) throw refusal('BAD_REFERENCE', PICK_FACE);
    const { parent, name, signature } = picked;
    return withNode(ctx.doc, { kind: 'delete-face', parent, faces: [name], sigs: { [name]: signature } });
  },
};
