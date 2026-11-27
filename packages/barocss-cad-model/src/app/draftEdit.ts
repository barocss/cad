import type { Command, Values } from './commands';
import { draftBodyEnd, draftInputs, draftNeutral, draftNeutralDefault, draftNeutralStep, isDraftPull, type DraftPull } from './draftInputs';
import { prefixDoc, type StudioDoc } from '../engine/doc';
import type { BodyResult } from '../engine/evaluate';
import { bodyKeyFor } from '../engine/ids';
import { toSig } from '../engine/references';
import { refusal } from '../engine/refusal';
import { signaturesOf } from '../engine/rematch';
import { isPivotStock, pivotAngle, pivotFaceCommand, pivotStockHinge } from './pivotFaceCommand';

export const DRAFT_EDIT = 'draft-history-edit';

function editableDraft(doc: StudioDoc, index: number) {
  const node = doc.nodes[index];
  if (node?.kind !== 'draft' || node.held || node.suppressed || node.rematched) return null;
  return node;
}

export function savedPivotStock(doc: StudioDoc, index: number) {
  const node = editableDraft(doc, index);
  if (!node || node.hingeEdge === undefined || node.faces.length !== 1 || node.parent.side !== 'solid'
    || node.parent.node >= index || !isPivotStock(doc.nodes, node.parent.node)) return null;
  return node.parent;
}

/** Bind each offered hinge to the exact original face and edge in the feature's input. */
export function editSavedPivotFaceCommand(doc: StudioDoc, index: number, stock: BodyResult): Command | null {
  const parent = savedPivotStock(doc, index), node = editableDraft(doc, index);
  if (!parent || !node || stock.ref?.node !== parent.node || stock.ref.side !== parent.side
    || stock.key !== bodyKeyFor(doc.nodes, parent.node, parent.side)) return null;
  const original = node.hingeEdge!, face = node.faces[0];
  const faceIndex = stock.mesh.faces.findIndex(candidate => candidate.nativePlaneName === face);
  const sigs = signaturesOf(stock, 'plane');
  const faceSig = sigs.faces.get(face);
  if (!faceSig) return null;
  const choices = stock.mesh.edges.flatMap((_edge, edgeIndex) => {
    const hinge = pivotStockHinge(stock, faceIndex, edgeIndex);
    const sig = hinge && sigs.edges.get(hinge.edge);
    return hinge && sig ? [{ ...hinge, sig }] : [];
  });
  if (!choices.some(choice => choice.edge === original && choice.pull === (node.pull ?? 'z'))) return null;
  return {
    ...pivotFaceCommand, id: DRAFT_EDIT, label: 'Edit Pivot face',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Pivot face in History again.' },
    fields: ctx => [
      { key: 'hingeEdge', label: 'Fixed edge', kind: 'choice', options: choices.map(({ edge, support }) => ({
        value: edge, label: `${support.axis.toUpperCase()} ${support.sign === -1 ? 'min' : 'max'}`,
      })) },
      ...pivotFaceCommand.fields!(ctx),
    ],
    defaults: () => ({ deg: node.angle, hingeEdge: original }),
    steps: () => [{ label: 'Face', text: face, done: true }],
    build: (ctx, values) => {
      if (ctx.doc !== doc) throw refusal('BAD_REFERENCE', 'Open the current Pivot face in History again.');
      const hinge = choices.find(choice => choice.edge === values.hingeEdge);
      if (!hinge) throw refusal('BAD_REFERENCE', 'Choose a fixed edge on the original Pivot face.');
      const angle = pivotAngle(values.deg);
      const replacesEdge = hinge.edge !== original;
      if (!replacesEdge && angle === node.angle) return doc;
      const next = { ...node, angle };
      if (replacesEdge) {
        next.hingeEdge = hinge.edge;
        next.pull = hinge.pull;
        next.sigs = { ...node.sigs, [face]: node.sigs?.[face] ?? toSig(faceSig), [hinge.edge]: toSig(hinge.sig) };
        delete next.sigs[original];
      }
      return { ...doc, nodes: doc.nodes.map((feature, i) => i === index ? next : feature) };
    },
  };
}

export function editSavedDraftCommand(doc: StudioDoc, index: number): Command | null {
  const node = editableDraft(doc, index);
  if (!node || node.hingeEdge !== undefined) return null;
  const pull = node.pull ?? 'z', storedNeutral = node.neutral;
  const coordinate = typeof storedNeutral === 'number' ? storedNeutral : storedNeutral && doc.parameters[storedNeutral.parameter];
  if (!isDraftPull(pull) || storedNeutral !== undefined && !Number.isFinite(coordinate)) return null;
  let prefix: StudioDoc | undefined;
  const ends = new Map<DraftPull, number | undefined>();
  const automatic = (axis: DraftPull) => {
    if (!ends.has(axis)) {
      const key = bodyKeyFor(doc.nodes, node.parent.node, node.parent.side);
      let end: number | undefined;
      try { end = draftBodyEnd(prefix ??= prefixDoc(doc, index), key, axis); } catch { /* Historical prefix cannot be evaluated. */ }
      ends.set(axis, end);
    }
    return ends.get(axis);
  };
  const defaults = (): Values => ({
    deg: node.angle, pull, neutralMode: storedNeutral === undefined ? 'auto' : 'fixed',
    ...(coordinate === undefined ? {} : { neutral: coordinate }),
  });
  return {
    id: DRAFT_EDIT, label: 'Edit Draft', icon: 'cad-draft', group: 'modify',
    available: ctx => ctx.doc === doc ? { ok: true } : { ok: false, reason: 'Open the current Draft in History again.' },
    fields: draftInputs, defaults,
    derive: (_ctx, values, changed) => draftNeutralDefault(values, changed, automatic),
    steps: (_ctx, values) => [{ label: 'Faces', text: node.faces.join(', '), done: true }, draftNeutralStep(values, automatic)],
    build: (ctx, values) => {
      if (ctx.doc !== doc) throw refusal('BAD_REFERENCE', 'Open the current Draft in History again.');
      const { deg, pull: selected } = values;
      if (!isDraftPull(selected)) throw refusal('VALUE', 'Choose a signed Draft pull axis.');
      if (typeof deg !== 'number' || !Number.isFinite(deg) || deg === 0 || Math.abs(deg) >= 45)
        throw refusal('DRAFT_ANGLE', 'Draft angle must be nonzero and below 45° in size.');
      const neutral = draftNeutral(values);
      if (deg === node.angle && selected === pull && neutral === coordinate) return doc;
      const next = { ...node, angle: deg };
      if (selected !== pull) {
        if (selected === 'z') delete next.pull;
        else next.pull = selected;
      }
      if (neutral === undefined) delete next.neutral;
      else if (neutral !== coordinate) next.neutral = neutral;
      return { ...doc, nodes: doc.nodes.map((feature, i) => i === index ? next : feature) };
    }
  };
}
