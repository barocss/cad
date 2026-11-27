import type { Ctx, Values } from './commands';
import { boxShellOpeningWalls, sameWallNormal } from '../engine/shellWalls';
import { withNode } from '../engine/doc';
import type { Sig } from '../engine/references';
import type { Vec3 } from '../engine/mesh';
import { refusal } from '../engine/refusal';

/** Every opening and kept direction must have one original native face. */
export function boxShellSelection(ctx: Ctx) {
  const { faces, edges, bodies } = ctx.selection;
  if (faces.length < 1 || faces.length > 2 || edges.length || bodies.length) return;
  const pick = faces[0], body = ctx.bodies[pick.body], parent = body?.ref;
  if (!parent || parent.side !== 'solid' || body.mesh.faces.length !== 6 ||
    body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1 || faces.some(face => face.body !== pick.body)) return;
  const source = ctx.doc.nodes[parent.node];
  if (source?.kind !== 'extrude') return;
  const sketch = ctx.doc.nodes[source.sketch];
  if (sketch?.kind !== 'sketch' || (faces.length === 2 && (sketch.profile !== 'rectangle' || source.draft))) return;
  const planes = body.mesh.faces.flatMap(face => {
    const { nativePlaneName: name, nativeAlignFace: frame } = face;
    if (!name || !frame) return [];
    const d: Vec3 = [0, 0, 0];
    d['xyz'.indexOf(frame.axis)] = frame.sign;
    const sig: Sig = { k: 'plane', p: face.centroid, d, s: face.area };
    return [{ name, sig }];
  });
  if (planes.length !== 6 || new Set(planes.map(plane => plane.name)).size !== 6) return;
  const [first, second] = faces.map(({ face }) => planes.find(plane => plane.name === body.mesh.faces[face]?.nativePlaneName));
  if (!first || faces.length === 2 && !second) return;
  const sides = boxShellOpeningWalls(first.sig.d, second?.sig.d);
  if (!sides) return;
  const [opening, secondOpening] = second && sameWallNormal(second.sig.d, [0, 0, 1]) ? [second.name, first.name] : [first.name, second?.name];
  const walls = sides.map(side => {
    const face = planes.find(plane => sameWallNormal(plane.sig.d, side.normal));
    return face && { ...side, name: face.name };
  });
  if (walls.every(wall => !!wall)) return {
    parent, opening, secondOpening, walls, sigs: Object.fromEntries(planes.map(plane => [plane.name, plane.sig])),
  };
}

export function buildBoxWallShell(ctx: Ctx, values: Values) {
  const target = boxShellSelection(ctx);
  if (!target) throw refusal('BAD_REFERENCE', 'Select one original box face, or select its original top and one vertical face.');
  const { parent, opening, secondOpening, sigs } = target;
  const walls = Object.fromEntries(target.walls.map(face => [face.name, Number(values[face.key])]));
  return withNode(ctx.doc, { kind: 'shell-walls', parent, opening, ...(secondOpening === undefined ? {} : { secondOpening }), walls, sigs });
}
