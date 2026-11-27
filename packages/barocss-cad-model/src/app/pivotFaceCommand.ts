import { withNode } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { pivotStockEdge, pivotStockMode } from '../engine/pivotStock';
import { captureSignatures } from '../engine/references';
import { refusal } from '../engine/refusal';
import type { Command, Ctx } from './commands';
import type { DraftPull } from './draftInputs';
import { bodyKeyFor } from '../engine/ids';
import { pivotFaceAngleHandle } from './pivotFaceHandle';

export const PIVOT_FACE = 'pivot-face';

const selectionReason = 'Select one planar face of a rectangular extrusion, with or without Move and Rotate features, and Shift-select one straight edge on that face.';
const angleField = { key: 'deg', label: 'Angle', kind: 'deg', min: -45, max: 45, step: 1 } as const;

export function pivotStockHinge(body: BodyResult, faceIndex: number, edgeIndex: number, followStock: boolean) {
  const target = pivotStockEdge(body, faceIndex, edgeIndex);
  if (!target) return;
  const { faceName, supportName, face, edge, other } = target;
  const names = { face: faceName, edge: edge.names[0] };
  if (followStock) {
    const label = supportName.endsWith('.top') ? 'Original top' : supportName.endsWith('.bottom') ? 'Original bottom' : supportName;
    return { ...names, pull: undefined, label };
  }
  const start = other.nativeAlignFace;
  if (!start || !face.nativeAxisPlane || !edge.axis || start.axis === face.nativeAxisPlane.axis || start.axis === edge.axis) return;
  const pull: DraftPull = start.sign === -1 ? start.axis : `-${start.axis}`;
  return { ...names, pull, label: `${start.axis.toUpperCase()} ${start.sign === -1 ? 'min' : 'max'}` };
}

function pivotSelection(ctx: Ctx) {
  const { faces, edges, bodies, sketches, vertices, profileRegions } = ctx.selection;
  if (faces.length !== 1 || edges.length !== 1 || bodies.length || sketches?.length || vertices?.length
    || profileRegions || ctx.direct?.length || faces[0].body !== edges[0].body) return;
  const body = ctx.bodies[faces[0].body], parent = body?.ref;
  if (!parent || parent.side !== 'solid') return;
  const mode = pivotStockMode(ctx.doc.nodes, parent.node);
  if (!mode) return;
  const hinge = pivotStockHinge(body, faces[0].face, edges[0].edge, mode === 'rotated');
  return hinge && { parent, body, ...hinge };
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
  handles: ctx => {
    const pick = pivotSelection(ctx);
    if (!pick || pick.body.key !== bodyKeyFor(ctx.doc.nodes, pick.parent.node, pick.parent.side)) return [];
    const handle = pivotFaceAngleHandle(pick.body, pick.face, pick.edge);
    return handle ? [handle] : [];
  },
  steps: ctx => {
    const pick = pivotSelection(ctx);
    return pick ? [{ label: 'Face', text: pick.face, done: true }, { label: 'Fixed edge', text: pick.edge, done: true }] : [];
  },
  build: (ctx, values) => {
    const pick = pivotSelection(ctx);
    if (!pick) throw refusal('BAD_REFERENCE', selectionReason);
    return captureSignatures(withNode(ctx.doc, { kind: 'draft', parent: pick.parent, angle: pivotAngle(values.deg),
      faces: [pick.face], ...(pick.pull === undefined ? {} : { pull: pick.pull }), hingeEdge: pick.edge }), ctx.bodies);
  },
};
