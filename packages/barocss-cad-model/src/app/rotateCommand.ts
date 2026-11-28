import { withNode, type Axis } from '../engine/doc';
import { refusal } from '../engine/refusal';
import { centreOf, refOf, selectedBodies } from './bodyRef';
import type { Command, Ctx } from './commands';

const selectSource = 'Select one body or one native vertex to rotate.';
const axes: readonly Axis[] = ['x', 'y', 'z'];

type RotationSelection = Pick<Ctx, 'bodies' | 'selection' | 'direct'>;

/** Resolve one unambiguous complete native line on the current standalone solid. */
function rotationLine({ bodies, selection, direct }: RotationSelection) {
  const { edges, faces, bodies: selected, vertices, sketches, profileRegions } = selection;
  if (bodies.length !== 1 || edges.length !== 1 || faces.length || selected.length
    || vertices?.length || sketches?.length || profileRegions || direct?.length) return;
  const [pick] = edges;
  const body = bodies[pick.body];
  if (!body || body.ref?.side !== 'solid' || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const edge = body.mesh.edges[pick.edge];
  if (!edge?.nativeLine || !edge.nativeVertices || !edge.nativeJoint || edge.names.length !== 1
    || edge.nativeVertices[0] === edge.nativeVertices[1] || edge.nativeJoint.faces[0] === edge.nativeJoint.faces[1]) return;
  const { edgeId } = edge.nativeJoint;
  if (body.mesh.edges.some(other => other !== edge && (other.nativeJoint?.edgeId === edgeId || other.names.includes(edge.names[0])))) return;
  if (![...edge.a, ...edge.b].every(Number.isFinite)) return;
  return edge;
}

/** The initial Rotate values from one complete, axis-aligned native edge. */
export function cardinalEdgeRotation(ctx: RotationSelection) {
  const edge = rotationLine(ctx);
  if (!edge) return;
  const varying = axes.filter((_, index) => edge.a[index] !== edge.b[index]);
  if (varying.length !== 1) return;
  const [px, py, pz] = edge.a;
  return { axis: varying[0], angle: 0, px, py, pz };
}

/** Use the exact vertex behind the named edge endpoint reported by the part summary. */
export function edgeEndpointRotation(ctx: RotationSelection, endpoint: 'from' | 'to', axis: Axis) {
  const edge = rotationLine(ctx);
  if (!edge || edge.a.every((coordinate, index) => coordinate === edge.b[index])) return;
  const [px, py, pz] = endpoint === 'from' ? edge.a : edge.b;
  return { axis, angle: 0, px, py, pz };
}

function rotationVertex({ rotateVertex, selection, direct }: Ctx) {
  const { bodies, faces, edges, vertices, sketches, profileRegions } = selection;
  return rotateVertex && vertices?.length === 1 && vertices[0] === rotateVertex
    && !bodies.length && !faces.length && !edges.length && !sketches?.length && !profileRegions && !direct?.length
    ? rotateVertex : undefined;
}

export function rotateBodyIndex(ctx: Ctx): number | undefined {
  const vertex = rotationVertex(ctx);
  if (vertex) return ctx.bodies[vertex.body]?.ref ? vertex.body : undefined;
  const bodies = selectedBodies(ctx.selection);
  return bodies.length === 1 && ctx.bodies[bodies[0]] ? bodies[0] : undefined;
}

export const rotateCommand: Command = {
  id: 'rotate', label: 'Rotate', icon: 'cad-rotate', hint: 'Turn a body about its centre or a selected native vertex',
  shortcut: 'R', group: 'modify', keywords: 'turn spin pivot',
  available: ctx => rotateBodyIndex(ctx) === undefined ? { ok: false, reason: selectSource } : { ok: true },
  fields: () => [{ key: 'axis', label: 'Axis', kind: 'choice', options: [{ value: 'z', label: 'Z' }, { value: 'x', label: 'X' }, { value: 'y', label: 'Y' }] },
    { key: 'angle', label: 'Angle', kind: 'deg', min: -360, max: 360, step: 15 },
    { key: 'px', label: 'Pivot X', kind: 'mm' }, { key: 'py', label: 'Pivot Y', kind: 'mm' }, { key: 'pz', label: 'Pivot Z', kind: 'mm' }],
  defaults: ctx => {
    const index = rotateBodyIndex(ctx);
    const [px, py, pz] = rotationVertex(ctx)?.at ?? centreOf(index === undefined ? null : ctx.bodies[index]);
    return { axis: 'z', angle: 0, px, py, pz };
  },
  build: (ctx, values) => {
    const index = rotateBodyIndex(ctx);
    if (index === undefined) throw refusal('BAD_REFERENCE', selectSource);
    return withNode(ctx.doc, { kind: 'rotate', parent: refOf(ctx.bodies[index]), axis: values.axis as Axis,
      angle: Number(values.angle), pivot: [Number(values.px), Number(values.py), Number(values.pz)] });
  },
};
