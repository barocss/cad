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

export function canSetShellCorner(nodes: readonly ModelNode[], parent: BodyRef, open: readonly string[]): boolean {
  const top = featureId(nodes, parent.node) + '.top';
  return (open.length === 0 || open.length === 1 && open[0] === top) && canSetClosedShellCorner(nodes, parent);
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
