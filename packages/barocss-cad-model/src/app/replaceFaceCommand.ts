import {
  exactSemicylinderCapAfterWall, exactSemicylinderCapSource, isAnnularReplacementSource, isBoredPlateReplacementSource, isBoxReplacementSource, isCylinderReplacementSource, isDraftedFaceReplacementSource, isPairedFiveSpanOutletPlaneSource,
  isStraightPolygonReplacementSource, withNode, type StudioDoc,
} from '../engine/doc';
import { captureSignatures } from '../engine/references';
import { refusal } from '../engine/refusal';
import type { Command, Ctx } from './commands';
import { captureOffsetPlane, offsetPlaneStep, pickReferencePlane, restoreOffsetPlaneValues } from './offsetPlanePick';

const SOURCE = 'Select a supported extrusion face, through-bore cap, original Exact semicylinder upper cap, or original five-span paired sweep outlet.';
const REFERENCE = 'Pick a tilted face on another solid.';

function pickedFace(ctx: Ctx) {
  const { selection } = ctx;
  if (selection.faces.length !== 1 || selection.edges.length || selection.bodies.length || selection.sketches?.length ||
      selection.vertices?.length || selection.profileRegions || ctx.direct?.length) return;
  const pick = selection.faces[0], body = ctx.bodies[pick.body], parent = body?.ref, face = body?.mesh.faces[pick.face];
  if (!parent || parent.side !== 'solid' ||
      !face?.name || face.nativePlaneName !== face.name || face.exact?.kind !== 'plane') return;
  const boxFace = face.nativeAxisPlane && isBoxReplacementSource(ctx.doc.nodes, parent.node);
  const polygonFace = isStraightPolygonReplacementSource(ctx.doc.nodes, ctx.doc.nodes[parent.node]);
  const circularCap = face.nativeAxisPlane?.axis === 'z' &&
    (isBoredPlateReplacementSource(ctx.doc.nodes, parent.node) || isCylinderReplacementSource(ctx.doc.nodes, parent.node) ||
     isAnnularReplacementSource(ctx.doc.nodes, parent.node));
  const semicylinderCap = exactSemicylinderCapSource(ctx.doc.nodes, parent.node, ctx.doc.parameters)?.upperFace === face.name
    || exactSemicylinderCapAfterWall(ctx.doc.nodes, parent.node, ctx.doc.parameters, face.name) !== undefined;
  const sweepOutlet = isPairedFiveSpanOutletPlaneSource(ctx.doc.nodes, parent.node, face.name);
  if (!boxFace && !polygonFace && !circularCap && !semicylinderCap && !sweepOutlet && !isDraftedFaceReplacementSource(ctx.doc.nodes, parent.node)) return;
  return { parent, face: face.name };
}

export const replaceFaceCommand: Command = {
  id: 'replace-face', label: 'Replace face', icon: 'cad-offset-face', group: 'modify',
  hint: 'Replace a supported planar face with a tilted plane.',
  keywords: 'replace face plane tilt wall cap reextend direct edit',
  available: ctx => pickedFace(ctx) ? { ok: true } : { ok: false, reason: SOURCE },
  fields: () => [],
  steps: (ctx, values) => {
    const picked = pickedFace(ctx);
    return [{ label: 'Face', text: picked?.face ?? SOURCE, done: !!picked }, offsetPlaneStep(values, undefined, ctx, REFERENCE)];
  },
  onPick: (ctx, values, hit) => pickReferencePlane(ctx, values, hit.face, pickedFace(ctx)?.parent, ctx.doc.nodes.length),
  build(ctx, values) {
    const picked = pickedFace(ctx);
    if (!picked) throw refusal('BAD_REFERENCE', SOURCE);
    const { parent, face } = picked;
    const target = captureOffsetPlane(ctx, values, parent, ctx.doc.nodes.length, 'Replace face');
    return captureSignatures(withNode(ctx.doc, { kind: 'replace-face', parent, faces: [face], target }), ctx.bodies);
  },
};

export function editSavedReplaceFaceCommand(doc: StudioDoc, index: number): Command | null {
  const node = doc.nodes[index];
  if (node?.kind !== 'replace-face' || node.suppressed || node.held || Object.keys(node.rematched ?? {}).length) return null;
  return {
    id: 'replace-face-edit', label: 'Edit Replace face', icon: 'cad-offset-face', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Replace face in History again.' },
    fields: () => [],
    defaults: ctx => restoreOffsetPlaneValues(ctx, {}, node.target),
    steps: (ctx, values) => [{ label: 'Face', text: node.faces[0], done: true }, offsetPlaneStep(values, node.target, ctx, REFERENCE)],
    onPick: (ctx, values, hit) => pickReferencePlane(ctx, values, hit.face, node.parent, index),
    build(ctx, values) {
      if (ctx.doc !== doc) throw refusal('BAD_REFERENCE', 'Open the current Replace face in History again.');
      if (values.keepPlane === 1) return doc;
      const target = captureOffsetPlane(ctx, values, node.parent, index, 'Replace face');
      const nodes = [...doc.nodes];
      nodes[index] = { ...node, target };
      return { ...doc, nodes };
    },
  };
}
