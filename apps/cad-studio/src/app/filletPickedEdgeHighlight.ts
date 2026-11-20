import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { Vec3 } from '@barocss/cad-model/engine/vec3';
import type { Active } from './commandState';

export type FilletPickedEdgeRequest = {
  owner: Active; doc: StudioDoc; evaluated: StudioDoc;
  edge: Active['ctx']['selection']['edges'][number];
};
export type FilletPickedEdgeSource = {
  active: Active | null; doc: StudioDoc; evaluated: StudioDoc; commandDoc: StudioDoc;
  bodies: Active['ctx']['bodies']; available: boolean;
};
export type FilletPickedEdgeHighlight = [Vec3, Vec3][];

/** Read one original edge. Preview ordinals never enter this lookup. */
export function readFilletPickedEdgeHighlight(request: FilletPickedEdgeRequest | null, source: FilletPickedEdgeSource): FilletPickedEdgeHighlight | null {
  const active = source.active;
  if (!request || !source.available || !active || active.cmd.id !== 'fillet' || active.fillet?.type !== 'edge' || active.historyFilletRadius
    || request.owner.cmd !== active.cmd || request.owner.ctx !== active.ctx
    || request.doc !== source.doc || request.evaluated !== source.evaluated
    || active.ctx.doc !== source.commandDoc || active.ctx.bodies !== source.bodies
    || !active.ctx.selection.edges.some(edge => edge.body === request.edge.body && edge.edge === request.edge.edge)) return null;
  const mesh = source.bodies[request.edge.body]?.mesh, edge = mesh?.edges[request.edge.edge];
  if (!mesh || !edge?.straight || edge.nativeCircle || !edge.names.length
    || ![...edge.a, ...edge.b].every(Number.isFinite)
    || Math.hypot(...edge.a.map((value, index) => value - edge.b[index])) <= 1e-9) return null;
  if (mesh.edgeLines.length % 6 || mesh.edgeOfSegment.length !== mesh.edgeLines.length / 3) return null;
  const segments: [Vec3, Vec3][] = [];
  for (let vertex = 0; vertex < mesh.edgeOfSegment.length; vertex += 2) {
    if (mesh.edgeOfSegment[vertex] !== request.edge.edge || mesh.edgeOfSegment[vertex + 1] !== request.edge.edge) continue;
    const offset = vertex * 3;
    const a: Vec3 = [mesh.edgeLines[offset], mesh.edgeLines[offset + 1], mesh.edgeLines[offset + 2]];
    const b: Vec3 = [mesh.edgeLines[offset + 3], mesh.edgeLines[offset + 4], mesh.edgeLines[offset + 5]];
    if (![...a, ...b].every(Number.isFinite) || Math.hypot(...a.map((value, index) => value - b[index])) <= 1e-9) return null;
    segments.push([a, b]);
  }
  return segments.length ? segments : null;
}
