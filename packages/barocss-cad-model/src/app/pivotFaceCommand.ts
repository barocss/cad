import { withNode } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { pivotStockEdge, pivotStockMode, type PivotStockMode } from '../engine/pivotStock';
import { captureSignatures } from '../engine/references';
import { refusal } from '../engine/refusal';
import type { Command, Ctx } from './commands';
import type { DraftPull } from './draftInputs';
import { bodyKeyFor } from '../engine/ids';
import { pivotFaceAngleHandle } from './pivotFaceHandle';

export const PIVOT_FACE = 'pivot-face';

const selectionReason = 'Select a face and Shift-select its straight edge on rectangular stock, or select an upright hexagonal wall and its original cap edge.';
const angleField = { key: 'deg', label: 'Angle', kind: 'deg', min: -45, max: 45, step: 1 } as const;

export function pivotStockHinge(body: BodyResult, faceIndex: number, edgeIndex: number, mode: PivotStockMode) {
  const target = pivotStockEdge(body, faceIndex, edgeIndex);
  if (!target) return;
  const { faceName, supportName, face, edge, other } = target;
  const names = { face: faceName, edge: edge.names[0] };
  if (mode === 'rotated') {
    const label = supportName.endsWith('.top') ? 'Original top' : supportName.endsWith('.bottom') ? 'Original bottom' : supportName;
    return { ...names, pull: undefined, label };
  }
  if (mode === 'hexagonal') {
    if (other.nativeAxisPlane?.axis !== 'z' || other.exact?.kind !== 'plane' || face.exact?.kind !== 'plane'
      || Math.abs(face.exact.n[2]) > 1e-9 || Math.abs(other.exact.n[2]) < 1 - 1e-9) return;
    const bottom = other.exact.n[2] < 0;
    return { ...names, pull: bottom ? 'z' as const : '-z' as const, label: bottom ? 'Original bottom' : 'Original top' };
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
  const hinge = pivotStockHinge(body, faces[0].face, edges[0].edge, mode);
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
