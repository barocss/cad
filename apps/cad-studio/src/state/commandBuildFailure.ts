import { isStraightHexagonalExtrusion } from '@barocss/cad-model/engine/doc';
import type { Ctx } from '@barocss/cad-model/app/commands';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { friendlyCause, type FriendlyError } from '@barocss/cad-model/engine/errors';
import { isRefusal } from '@barocss/cad-model/engine/refusal';
import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';

/** Preserve legacy build errors except the owned Draft angle recovery shared with native evaluation. */
export function commandBuildFailure(command: string, cause: unknown, ctx?: Ctx): FriendlyError {
  if ((command === 'draft' || command === DRAFT_EDIT) && isRefusal(cause, 'DRAFT_ANGLE')) return friendlyCause(cause);
  if (command === 'offset-face' && ctx && isRefusal(cause, 'VALUE')
    && cause.message === '[VALUE] Offset face: the other cap is not a congruent native right-prism cap.'
    && ctx.selection.faces.length === 1) {
    const picked = ctx.selection.faces[0], body = ctx.bodies[picked.body], ref = body?.ref;
    const node = ref && ctx.doc.nodes[ref.node];
    if (ref?.side === 'solid' && node?.kind === 'extrude' && node.draft
      && bodyKeyFor(ctx.doc.nodes, ref.node, ref.side) === body.key) {
      return { title: 'Offset face does not support this tapered cap',
        hint: 'Changing Offset distance will not enable this face. Cancel Offset face, then open the original Extrude in History and edit Distance to change its height.',
        detail: cause.message, code: cause.code };
    }
  }
  if (command === 'offset-face' && ctx && isRefusal(cause, 'VALUE')
    && cause.message === '[VALUE] Offset face: the current native topology is outside the unpartitioned cap profile.'
    && ctx.selection.faces.length === 1) {
    const picked = ctx.selection.faces[0], body = ctx.bodies[picked.body], ref = body?.ref;
    const node = ref && ctx.doc.nodes[ref.node], face = body?.mesh.faces[picked.face];
    const sketch = node?.kind === 'extrude' ? ctx.doc.nodes[node.sketch] : undefined;
    if (ref?.side === 'solid' && node?.kind === 'extrude' && isStraightHexagonalExtrusion(ctx.doc.nodes, node)
      && sketch?.kind === 'sketch' && !sketch.plane && face?.nativeAxisPlane && face.nativeAxisPlane.axis !== 'z'
      && bodyKeyFor(ctx.doc.nodes, ref.node, ref.side) === body.key) {
      return { title: 'Offset face does not support this prism side',
        hint: 'Changing Offset distance will not enable this face. Cancel Offset face and select an oblique side face of this hexagonal prism instead.',
        detail: cause.message, code: cause.code };
    }
  }
  return { title: 'Invalid input', hint: String(cause), detail: '' };
}
