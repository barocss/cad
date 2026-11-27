import { isStraightHexagonalExtrusion } from '@barocss/cad-model/engine/doc';
import type { Ctx } from '@barocss/cad-model/app/commands';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { friendlyCause, type FriendlyError } from '@barocss/cad-model/engine/errors';
import { isRefusal } from '@barocss/cad-model/engine/refusal';
import { closedFilletPerimeter } from './closedFilletPerimeter';
import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import { PIVOT_FACE } from '@barocss/cad-model/app/pivotFaceCommand';

/** Explicit, named rows that the existing Edit picked edges list can remove. */
function removablePickedEdgeCount(ctx: Ctx): number | null {
  const picked = ctx.selection.edges;
  if (picked.length < 2 || ctx.selection.faces.length || ctx.direct?.length) return null;
  const bodyIndex = picked[0].body, body = ctx.bodies[bodyIndex], ref = body?.ref;
  const node = ref && ctx.doc.nodes[ref.node];
  if (!Number.isInteger(bodyIndex) || !body || !ref || !node || node.suppressed || node.held
    || bodyKeyFor(ctx.doc.nodes, ref.node, ref.side) !== body.key
    || picked.some(p => p.body !== bodyIndex || !Number.isInteger(p.edge) || !body.mesh.edges[p.edge])
    || new Set(picked.map(p => p.edge)).size !== picked.length) return null;
  for (const pick of picked) {
    const edge = body.mesh.edges[pick.edge];
    if (!edge.names.length || new Set(edge.names).size !== edge.names.length
      || edge.names.some(name => !name || body.mesh.edges.filter(e => e.names.includes(name)).length !== 1)) return null;
  }
  return picked.length;
}

/** Explain only owned build refusals whose command and selection prove the recovery. */
export function commandBuildFailure(command: string, cause: unknown, ctx?: Ctx): FriendlyError {
  if (command === 'fillet' && ctx && isRefusal(cause, 'FILLET_CHAIN')
    && cause.message === '[FILLET_CHAIN] An interior radius needs one original straight edge.') {
    const count = removablePickedEdgeCount(ctx);
    if (count !== null) return { title: 'An interior radius needs one original straight edge',
      hint: `${count} edges are picked. Open Edit picked edges and remove the extra edges, keeping one original straight edge.`,
      detail: cause.message, code: cause.code };
  }
  if (command === 'fillet' && ctx && isRefusal(cause, 'FILLET_CHAIN')
    && cause.message === '[FILLET_CHAIN] A varying radius needs the picked edges to form one open chain: its two ends take the two radii.') {
    const perimeter = closedFilletPerimeter(ctx);
    if (perimeter) return { title: 'The picked edges form a closed perimeter',
      hint: 'Switch to Edges and select an open chain, such as the arc without its closing edges.' + (perimeter.individuallyPicked
        ? ' Or open Edit picked edges and remove edges to open the perimeter.' : ''),
      detail: cause.message, code: cause.code };
  }
  if ((command === 'draft' || command === DRAFT_EDIT || command === PIVOT_FACE) && isRefusal(cause, 'DRAFT_ANGLE')) return friendlyCause(cause);
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
        hint: 'Changing Offset distance will not enable this face. Cancel Offset face and select a wall on a straight convex hexagonal prism.',
        detail: cause.message, code: cause.code };
    }
  }
  return { title: 'Invalid input', hint: String(cause), detail: '' };
}
