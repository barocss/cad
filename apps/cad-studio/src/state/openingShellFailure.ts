import type { Ctx } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import { bodyKeyFor } from '@barocss/cad-model/engine/ids';

/** Explain a temporary opening-extension boundary, never a named boundary of the source body. */
export function openingShellFailure(error: FriendlyError, ctx: Ctx, candidate: StudioDoc): FriendlyError | undefined {
  const feature = candidate.nodes.at(-1);
  if (error.code !== 'SHELL_REGIONS_SHARP' || feature?.kind !== 'shell' || !feature.id || error.feature !== feature.id
    || candidate.nodes.length !== ctx.doc.nodes.length + 1 || !ctx.doc.nodes.every((node, i) => candidate.nodes[i] === node)
    || candidate.nodes.filter(node => node.id === feature.id).length !== 1
    || !Array.isArray(feature.open) || feature.open.length !== 1 || typeof feature.open[0] !== 'string'
    || typeof feature.thickness !== 'number' || !Number.isFinite(feature.thickness) || feature.thickness <= 0
    || ctx.selection.faces.length !== 1 || ctx.selection.edges.length || ctx.selection.bodies.length) return;
  const selected = ctx.selection.faces[0], body = ctx.bodies[selected.body], face = body?.mesh.faces[selected.face], parent = feature.parent;
  if (!body || !face || face.facet || !face.nativePlaneName || face.nativePlaneName !== feature.open[0]
    || parent.side !== 'solid' || !Number.isInteger(parent.node) || !ctx.doc.nodes[parent.node]
    || body.ref?.node !== parent.node || body.ref.side !== parent.side || body.key !== bodyKeyFor(ctx.doc.nodes, parent.node, parent.side)
    || ctx.bodies.filter(b => b.key === body.key && b.ref?.node === parent.node && b.ref.side === parent.side).length !== 1) return;
  const sharp = /^\[SHELL_REGIONS_SHARP\] shell: faces (\S+) and (\S+) of two smooth regions meet at a sharp edge \(at ([^\r\n)]+)\): shelling there is not supported yet$/.exec(error.detail);
  if (sharp?.[0] !== error.detail) return;
  const coordinates = sharp[3].split(', ');
  if (coordinates.length !== 3 || coordinates.some(value => !/^-?\d+(?:\.\d+)?(?:e[+-]?\d+)?$/.test(value) || !Number.isFinite(Number(value)))) return;
  const prefix = `${feature.open[0]}.ext.side`, temporary = sharp.slice(1, 3).filter(name => name.startsWith(prefix) && /^\d+$/.test(name.slice(prefix.length)));
  if (temporary.length !== 1) return;
  const sourceNames = body.mesh.faces.flatMap(f => [f.name, ...(f.nativePlaneName ? [f.nativePlaneName] : []), ...(f.nativeFaces?.map(native => native.name) ?? [])]);
  sourceNames.push(...body.mesh.edges.flatMap(edge => edge.names));
  // Display names can join native aliases or omit a #piece suffix. Substring
  // rejection is deliberately conservative: an existing source name must win.
  if (sourceNames.some(name => typeof name !== 'string' || name.includes(temporary[0]))) return;
  return { ...error, title: 'This opening reaches a Shell limit',
    hint: 'Cancel Shell, then select another face to open or select the body to try a closed Shell.' };
}
