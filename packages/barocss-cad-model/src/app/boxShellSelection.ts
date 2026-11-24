import type { Ctx, Values } from './commands';
import { boxShellOpeningWalls, sameWallNormal } from '../engine/shellWalls';
import { withNode } from '../engine/doc';
import type { Sig } from '../engine/references';
import type { Vec3 } from '../engine/mesh';
import { refusal } from '../engine/refusal';

/** The opening and five kept directions must have unique native faces. */
export function boxShellSelection(ctx: Ctx) {
  const { faces, edges, bodies } = ctx.selection;
  if (faces.length !== 1 || edges.length || bodies.length) return;
  const pick = faces[0], body = ctx.bodies[pick.body], parent = body?.ref;
  if (!parent || parent.side !== 'solid' || body.mesh.faces.length !== 6 ||
    body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const source = ctx.doc.nodes[parent.node], opening = body.mesh.faces[pick.face];
  if (source?.kind !== 'extrude' || ctx.doc.nodes[source.sketch]?.kind !== 'sketch' ||
    !opening?.nativePlaneName) return;
  const planes = body.mesh.faces.flatMap(face => {
    const { nativePlaneName: name, nativeAlignFace: frame } = face;
    if (!name || !frame) return [];
    const d: Vec3 = [0, 0, 0];
    d['xyz'.indexOf(frame.axis)] = frame.sign;
    const sig: Sig = { k: 'plane', p: face.centroid, d, s: face.area };
    return [{ name, sig }];
  });
  if (planes.length !== 6 || new Set(planes.map(plane => plane.name)).size !== 6) return;
  const sides = boxShellOpeningWalls(planes.find(plane => plane.name === opening.nativePlaneName)?.sig.d);
  if (!sides) return;
  const walls = sides.map(side => {
    const face = planes.find(plane => sameWallNormal(plane.sig.d, side.normal));
    return face && { ...side, name: face.name };
  });
  if (walls.every(wall => !!wall)) return {
    parent, opening: opening.nativePlaneName, walls, sigs: Object.fromEntries(planes.map(plane => [plane.name, plane.sig])),
  };
}

export function buildBoxWallShell(ctx: Ctx, values: Values) {
  const target = boxShellSelection(ctx);
  if (!target) throw refusal('BAD_REFERENCE', 'Select the original upper or a side face of one upright box extrusion.');
  const { parent, opening, sigs } = target;
  const walls = Object.fromEntries(target.walls.map(face => [face.name, Number(values[face.key])]));
  return withNode(ctx.doc, { kind: 'shell-walls', parent, opening, walls, sigs });
}
