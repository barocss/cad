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

export function separateShellCap(nodes: readonly ModelNode[], parent: BodyRef, open: readonly string[]): 'floor' | 'ceiling' | undefined {
  if (open.length !== 1) return;
  const owner = featureId(nodes, parent.node);
  const cap = open[0] === owner + '.top' ? 'floor' : open[0] === owner + '.bottom' ? 'ceiling' : undefined;
  return cap && canSetClosedShellCorner(nodes, parent) ? cap : undefined;
}

export function canSetShellFloor(nodes: readonly ModelNode[], parent: BodyRef, open: readonly string[]): boolean {
  return separateShellCap(nodes, parent, open) === 'floor';
}

export function canSetAgentShellCap(ctx: Ctx, faceInput: unknown, cap: 'floor' | 'ceiling'): boolean {
  if (!canSetAgentShellCorner(ctx, undefined, faceInput)) return false;
  const pick = ctx.selection.faces[0], body = ctx.bodies[pick.body], parent = body.ref;
  return !!parent && separateShellCap(ctx.doc.nodes, parent, [body.mesh.faces[pick.face].name]) === cap;
}

export function canSetAgentShellFloor(ctx: Ctx, faceInput: unknown): boolean {
  return canSetAgentShellCap(ctx, faceInput, 'floor');
}

function agentClosedShellBody(ctx: Ctx, bodyInput: unknown): BodyRef | undefined {
  const { bodies, selection } = ctx;
  if (!Array.isArray(bodyInput) || bodyInput.length !== 1 || selection.bodies.length !== 1 || selection.faces.length || selection.edges.length) return;
  const body = bodies[selection.bodies[0]];
  return body?.key === bodyInput[0] ? body?.ref : undefined;
}

export function canSetAgentClosedShellCaps(ctx: Ctx, bodyInput: unknown): boolean {
  const parent = agentClosedShellBody(ctx, bodyInput);
  return !!parent && canSetClosedShellCaps(ctx.doc.nodes, parent);
}

/** An explicit Agent corner needs one literal original body or one unique literal original end cap. */
export function canSetAgentShellCorner(ctx: Ctx, bodyInput: unknown, faceInput: unknown): boolean {
  const { doc, bodies, selection } = ctx;
  if (selection.edges.length) return false;
  const parentBody = agentClosedShellBody(ctx, bodyInput);
  if (parentBody) return canSetClosedShellCorner(doc.nodes, parentBody);
  if (bodyInput !== undefined || !Array.isArray(faceInput) || faceInput.length !== 1 || typeof faceInput[0] !== 'string'
    || selection.bodies.length || selection.faces.length !== 1) return false;
  const name = faceInput[0], pick = selection.faces[0], body = bodies[pick.body], parent = body?.ref;
  const face = body?.mesh.faces[pick.face];
  return !!parent && face?.name === name && face.nativePlaneName === name
    && isOriginalShellCap(doc.nodes, parent, name) && canSetClosedShellCorner(doc.nodes, parent)
    && bodies.flatMap(candidate => candidate.mesh.faces.filter(member => member.nativePlaneName === name)).length === 1;
}

function originalUprightShellSketch(nodes: readonly ModelNode[], parent: BodyRef) {
  const source = nodes[parent.node];
  if (parent.side !== 'solid' || source?.kind !== 'extrude' || source.cutDepth !== undefined
    || (source.draft !== undefined && source.draft !== 0) || typeof source.height !== 'number') return;
  const sketch = nodes[source.sketch];
  if (sketch?.kind !== 'sketch' || sketch.plane || sketch.on || sketch.association || sketch.pocketFloor
    || sketch.regions?.length || sketch.holes?.length) return;
  return { sketch, height: source.height, from: source.from };
}

export function canSetClosedShellCaps(nodes: readonly ModelNode[], parent: BodyRef): boolean {
  const original = originalUprightShellSketch(nodes, parent);
  if (original?.sketch.profile === 'circle') {
    const { sketch, height, from } = original;
    return Number.isFinite(height) && height > 0 && (from === undefined || typeof from === 'number' && Number.isFinite(from))
      && typeof sketch.radius === 'number' && Number.isFinite(sketch.radius) && sketch.radius > 0
      && sketch.center.every(value => typeof value === 'number' && Number.isFinite(value));
  }
  return canSetClosedShellCorner(nodes, parent);
}

export function canSetClosedShellCorner(nodes: readonly ModelNode[], parent: BodyRef): boolean {
  const original = originalUprightShellSketch(nodes, parent);
  if (!original) return false;
  const { sketch, height } = original;
  let points: readonly (readonly [Dim, Dim])[];
  if (sketch.profile === 'polygon') points = sketch.points;
  else if (sketch.profile === 'loop' && sketch.segments.every(segment => segment.kind === 'line')) points = sketch.segments.map(segment => segment.start);
  else return false;
  const numeric: [number, number][] = [];
  for (const [x, y] of points) {
    if (typeof x !== 'number' || typeof y !== 'number') return false;
    numeric.push([x, y]);
  }
  return closedLShellWallLimit(numeric, height) !== undefined;
}
