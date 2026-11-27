import { isBoxReplacementSource, withNode, type ModelNode } from '../engine/doc';
import { captureSignatures } from '../engine/references';
import { refusal } from '../engine/refusal';
import type { Command, Ctx } from './commands';
import type { DraftPull } from './draftInputs';

export const PIVOT_FACE = 'pivot-face';

const selectionReason = 'Select one planar face of a rectangular extrusion, with or without Move features, and Shift-select one straight edge on that face.';
const angleField = { key: 'deg', label: 'Angle', kind: 'deg', min: -45, max: 45, step: 1 } as const;

function isPivotStock(nodes: readonly ModelNode[], index: number): boolean {
  let at = index;
  for (;;) {
    const node = nodes[at];
    if (!node || node.suppressed || node.held) return false;
    if (node.kind !== 'translate') return isBoxReplacementSource(nodes, at);
    const { side, node: parent } = node.parent;
    if (side !== 'solid' || !Number.isSafeInteger(parent) || parent < 0 || parent >= at) return false;
    at = parent;
  }
}

function pivotSelection(ctx: Ctx) {
  const { faces, edges, bodies, sketches, vertices, profileRegions } = ctx.selection;
  if (faces.length !== 1 || edges.length !== 1 || bodies.length || sketches?.length || vertices?.length
    || profileRegions || ctx.direct?.length || faces[0].body !== edges[0].body) return;
  const body = ctx.bodies[faces[0].body], parent = body?.ref;
  if (!parent || parent.side !== 'solid' || !isPivotStock(ctx.doc.nodes, parent.node)
    || body.topology?.kind !== 'solid' || body.topology.bodyCount !== 1) return;
  const faceIndex = faces[0].face, face = body.mesh.faces[faceIndex], edge = body.mesh.edges[edges[0].edge];
  if (!face?.nativePlaneName || !face.nativeAxisPlane || !edge?.nativeLine || !edge.nativeJoint
    || !edge.axis || edge.names.length !== 1 || !edge.faces.includes(faceIndex)) return;
  const otherIndex = edge.faces.find(index => index !== faceIndex);
  const other = otherIndex === undefined ? undefined : body.mesh.faces[otherIndex];
  const start = other?.nativeAlignFace;
  if (!start || !other?.nativePlaneName || start.axis === face.nativeAxisPlane.axis || start.axis === edge.axis) return;
  const pull: DraftPull = start.sign === -1 ? start.axis : `-${start.axis}`;
  return { parent, face: face.nativePlaneName, edge: edge.names[0], pull };
}

export function pivotAngle(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value === 0 || Math.abs(value) >= 45)
    throw refusal('DRAFT_ANGLE', 'Enter a nonzero angle between −45° and 45°.');
  return value;
}

export const pivotFaceCommand: Command = {
  id: PIVOT_FACE, label: 'Pivot face', icon: 'cad-draft', group: 'modify',
  hint: 'Tilt a planar stock face about its selected edge.',
  keywords: 'pivot face hinge tilt fixed edge draft rotate',
  available: ctx => pivotSelection(ctx) ? { ok: true } : { ok: false, reason: selectionReason },
  fields: () => [angleField],
  defaults: () => ({ deg: 5 }),
  steps: ctx => {
    const pick = pivotSelection(ctx);
    return pick ? [{ label: 'Face', text: pick.face, done: true }, { label: 'Fixed edge', text: pick.edge, done: true }] : [];
  },
  build: (ctx, values) => {
    const pick = pivotSelection(ctx);
    if (!pick) throw refusal('BAD_REFERENCE', selectionReason);
    return captureSignatures(withNode(ctx.doc, { kind: 'draft', parent: pick.parent, angle: pivotAngle(values.deg),
      faces: [pick.face], pull: pick.pull, hingeEdge: pick.edge }), ctx.bodies);
  },
};
