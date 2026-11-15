import type { Ctx } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';
import { closedFilletPerimeter } from './closedFilletPerimeter';

/** Recovery for this owned mixed-perimeter preview failure, not a capability or cause claim. */
export function closedPerimeterFilletFailure(error: FriendlyError, ctx: Ctx, candidate: StudioDoc): FriendlyError | undefined {
  const feature = candidate.nodes.at(-1);
  if (candidate.nodes.length !== ctx.doc.nodes.length + 1
    || !ctx.doc.nodes.every((node, index) => candidate.nodes[index] === node)
    || feature?.kind !== 'fillet' || !feature.id || (error.feature !== undefined && error.feature !== feature.id)
    || candidate.nodes.filter(node => node.id === feature.id).length !== 1
    || feature.radii !== undefined || feature.section !== undefined
    || typeof feature.radius !== 'number' || !Number.isFinite(feature.radius) || feature.radius <= 0
    || error.code !== 'GEOMETRY'
    || !closedFilletPerimeter(ctx)) return;
  // Tessellation may omit error.feature. Only this appended feature's exact
  // generated carrier namespace can then prove ownership; never infer it from f6.
  const carrier = /^B-rep: tessellation: an edge of face (\S+) does not lie on its surface$/.exec(error.detail)?.[1];
  const carrierPrefix = `${feature.id}_body0/s0/f`;
  if (!carrier?.startsWith(carrierPrefix) || !/^\d+$/.test(carrier.slice(carrierPrefix.length))) return;
  const parent = feature.parent;
  if (parent.side !== 'solid' || !Number.isInteger(parent.node) || !ctx.doc.nodes[parent.node]) return;
  const matches = ctx.bodies.filter(body => body.ref?.node === parent.node && body.ref.side === parent.side
    && body.key === bodyKeyFor(ctx.doc.nodes, parent.node, parent.side));
  if (matches.length !== 1) return;
  const body = matches[0], selected = ctx.selection.edges.length ? ctx.selection.edges : ctx.selection.faces;
  if (ctx.bodies[selected[0]?.body] !== body) return;
  const faces = new Set(ctx.selection.faces.map(pick => pick.face));
  const edges = ctx.selection.edges.length ? ctx.selection.edges.map(pick => body.mesh.edges[pick.edge])
    : body.mesh.edges.filter(edge => edge.faces.some(face => faces.has(face)));
  const curved = edges.filter(edge => !edge.straight && edge.nativeCircle);
  const straight = edges.filter(edge => edge.straight && (edge.nativeLine || edge.nativeFinishLine));
  if (edges.length !== 3 || curved.length !== 1 || straight.length !== 2) return;
  const names = edges.flatMap(edge => edge.names), picked = new Set(names);
  if (picked.size !== names.length || feature.edges.length !== names.length
    || new Set(feature.edges).size !== feature.edges.length || !feature.edges.every(name => picked.has(name))) return;
  return { ...error, title: 'This perimeter fillet could not be built',
    hint: 'Switch to Edges and select only the curved rim, then try again.' };
}
