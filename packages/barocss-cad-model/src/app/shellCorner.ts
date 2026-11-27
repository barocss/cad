import { closedLShellWallLimit } from '@barocss/cad/internal/closed-l-shell-profile';
import type { BodyRef, Dim, ModelNode } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { featureId } from '../engine/ids';
import type { Ctx } from './commands';

export const shellCornerOptions = [
  { value: 'default', label: 'Default' },
  { value: 'sharp', label: 'Sharp' },
  { value: 'arc', label: 'Round' },
];

export function shellOpenFaces(ctx: Ctx, body: BodyResult): string[] {
  const index = ctx.bodies.indexOf(body);
  return [...new Set(ctx.selection.faces.filter(face => face.body === index)
    .flatMap(face => body.mesh.faces[face.face].name.split('+')))];
}

function isOriginalShellCap(nodes: readonly ModelNode[], parent: BodyRef, name: string): boolean {
  const owner = featureId(nodes, parent.node);
  return name === owner + '.top' || name === owner + '.bottom';
}

export function canSetShellCorner(nodes: readonly ModelNode[], parent: BodyRef, open: readonly string[]): boolean {
  return (open.length === 0 || open.length === 1 && isOriginalShellCap(nodes, parent, open[0]))
    && canSetClosedShellCorner(nodes, parent);
}

/** An explicit Agent corner needs one literal original body or one unique literal original end cap. */
export function canSetAgentShellCorner(ctx: Ctx, bodyInput: unknown, faceInput: unknown): boolean {
  const { doc, bodies, selection } = ctx;
  if (selection.edges.length) return false;
  if (Array.isArray(bodyInput) && bodyInput.length === 1 && selection.bodies.length === 1 && !selection.faces.length) {
    const body = bodies[selection.bodies[0]], parent = body?.ref;
    return !!parent && bodyInput[0] === body.key && canSetClosedShellCorner(doc.nodes, parent);
  }
  if (bodyInput !== undefined || !Array.isArray(faceInput) || faceInput.length !== 1 || typeof faceInput[0] !== 'string'
    || selection.bodies.length || selection.faces.length !== 1) return false;
  const name = faceInput[0], pick = selection.faces[0], body = bodies[pick.body], parent = body?.ref;
  const face = body?.mesh.faces[pick.face];
  return !!parent && face?.name === name && face.nativePlaneName === name
    && isOriginalShellCap(doc.nodes, parent, name) && canSetClosedShellCorner(doc.nodes, parent)
    && bodies.flatMap(candidate => candidate.mesh.faces.filter(member => member.nativePlaneName === name)).length === 1;
}

export function canSetClosedShellCorner(nodes: readonly ModelNode[], parent: BodyRef): boolean {
  const source = nodes[parent.node];
  if (parent.side !== 'solid' || source?.kind !== 'extrude' || source.cutDepth !== undefined
    || (source.draft !== undefined && source.draft !== 0) || typeof source.height !== 'number') return false;
  const sketch = nodes[source.sketch];
  if (sketch?.kind !== 'sketch' || sketch.plane || sketch.on || sketch.association || sketch.pocketFloor
    || sketch.regions?.length || sketch.holes?.length) return false;
  let points: readonly (readonly [Dim, Dim])[];
  if (sketch.profile === 'polygon') points = sketch.points;
  else if (sketch.profile === 'loop' && sketch.segments.every(segment => segment.kind === 'line')) points = sketch.segments.map(segment => segment.start);
  else return false;
  const numeric: [number, number][] = [];
  for (const [x, y] of points) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    numeric.push([x, y]);
  }
  return closedLShellWallLimit(numeric, source.height) !== undefined;
}
