import type { RefObject } from 'react';
import { lookOf } from '@barocss/cad-model/app/bodies';
import type { Selection } from '@barocss/cad-model/app/commands';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { candidatesFor, confirmReference, referencesOf, verifyReferences, type Problem } from '@barocss/cad-model/engine/references';
import type { StudioNotice } from '../app/studioNotice';
import type { DrawingReferencePreview } from '../ui/DrawingWorkspace';
import type { ReferenceFocusReceipt } from '../ui/referenceFocus';
import type { OpenScope } from './openOwnership';

export interface ReferenceChoices {
  doc: StudioDoc;
  index: number;
  names: string[];
}

interface ReferenceDecisionOptions {
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; problems: readonly Problem[] };
  owner: {
    document: RefObject<StudioDoc>;
    open: RefObject<OpenScope>;
    dispatch: RefObject<object>;
    canSettle(): boolean;
  };
  focus: {
    request: RefObject<number>;
    receipt: RefObject<ReferenceFocusReceipt<StudioDoc, OpenScope> | null>;
  };
  readPart(doc: StudioDoc): Promise<EvalResult>;
  changes: {
    pushUndo(): void;
    setDoc(doc: StudioDoc): boolean;
    remember(doc: StudioDoc, problems: Problem[]): void;
    setChoices(choices: ReferenceChoices | null): void;
    setDirty(dirty: boolean): void;
    notice(notice: StudioNotice): void;
  };
}

/** Refresh downstream held feature candidates after releasing an earlier held feature, without mutating `doc`. */
export async function refreshDownstreamProblems(
  doc: StudioDoc,
  releasedNode: number,
  remaining: readonly Problem[],
  bodies: readonly BodyResult[],
  readPart: (doc: StudioDoc) => Promise<EvalResult>,
): Promise<Problem[]> {
  if (!remaining.some(value => value.node !== null && value.node > releasedNode)) return [...remaining];
  const verified = await verifyReferences(doc, bodies, readPart);
  return remaining.map(value => {
    if (value.node === null || value.node <= releasedNode) return value;
    const fresh = verified.problems.find(item => item.index === value.index);
    if (fresh) return fresh;
    if (!verified.changes.some(change => change.where === value.where && change.was === value.name)) {
      return { ...value, candidates: [value.name], reason: undefined };
    }
    return value;
  });
}

export function createReferenceDecisions({ model, owner, focus, readPart, changes }: ReferenceDecisionOptions) {
  const { doc, bodies, problems } = model;

  async function settleRef(index: number, to?: string, keyboardButton?: HTMLButtonElement): Promise<boolean> {
    const focusRequest = ++focus.request.current;
    focus.receipt.current = null;
    const open = owner.open.current;
    const current = () => owner.open.current === open && owner.canSettle();
    const problem = problems.find(value => value.index === index);
    const held = problem?.node == null ? undefined : doc.nodes[problem.node];
    const heldNode = held?.held ? held : undefined;
    const heldFinish = heldNode && (heldNode.kind === 'fillet' || heldNode.kind === 'chamfer') ? heldNode : undefined;
    if (heldFinish && to !== undefined && to !== problem?.name && heldFinish.edges.includes(to)) {
      changes.notice({ title: 'Reference not applied', hint: 'This feature already uses that edge.', detail: to });
      return false;
    }

    const remaining = problems.filter(value => value.index !== index);
    const pending = heldNode && problem ? remaining.find(value => value.node === problem.node) : undefined;
    const next = await confirmReference(doc, index, bodies, readPart, to, undefined, pending);
    if (!current() || next === doc) return false;
    let nextProblems = remaining;
    if (heldNode && !pending) {
      const result = await readPart(prefixDoc(next, next.nodes.length));
      if (!current()) return false;
      if (!result.ok) { changes.notice({ ...result.error, title: 'Reference not applied' }); return false; }
      if (problem?.node != null) {
        nextProblems = await refreshDownstreamProblems(next, problem.node, remaining, result.bodies, readPart);
        if (!current()) return false;
      }
    }

    changes.pushUndo();
    if (!changes.setDoc(next)) return false;
    if (keyboardButton && focusRequest === focus.request.current)
      focus.receipt.current = { doc: next, scope: owner.open.current, button: keyboardButton };
    changes.remember(next, nextProblems);
    changes.setChoices(null);
    changes.setDirty(true);
    return true;
  }

  async function showRefChoices(index: number): Promise<void> {
    const open = owner.open.current, dispatch = owner.dispatch.current;
    const names = await candidatesFor(doc, index, bodies, readPart);
    if (owner.open.current === open && owner.dispatch.current === dispatch && owner.document.current === doc)
      changes.setChoices({ doc, index, names });
  }

  return { settleRef, showRefChoices };
}

export interface ReferencePreviewOptions {
  edge?: string;
  candidateNumber?: number;
  shellCandidate?: { problem: Problem; name: string };
  inModel?: boolean;
}

interface ReferencePreviewRoute {
  model: { doc: StudioDoc; bodies: readonly BodyResult[]; ready: boolean; edgeBlocked(): boolean; faceReady?(): boolean };
  owner: { document: RefObject<StudioDoc>; switchDrawing(ready: () => void): void };
  changes: {
    setPreview(preview: (DrawingReferencePreview & { owner: StudioDoc }) | null): void;
    showDrawing(): void;
    showModel(edges: Selection['edges'], faces?: Selection['faces']): void;
    notice(notice: StudioNotice): void;
  };
}

/**
 * A held feature is a passthrough, not the source of replacement geometry.
 * Resolve one exact Shell/held-finish output, never by name across meshes or by slot order.
 * A second output is admitted only as an independent ordinary rectangular extrusion.
 */
export function heldShellCandidateFace(doc: StudioDoc, bodies: readonly BodyResult[], problem: Problem, name: string): Selection['faces'][number] | undefined {
  if (problem.node == null || doc.instances?.length || !problem.candidates.includes(name)) return;
  const shellIndex = problem.node;
  const shell = doc.nodes[shellIndex];
  if (shell?.kind !== 'shell' || !shell.held || shell.suppressed !== true || shell.parent.side !== 'solid' || shell.open.length !== 1 || shell.open[0] !== problem.name) return;
  const reference = referencesOf(doc, true).refs[problem.index];
  if (!reference || reference.node !== shellIndex || reference.edge || reference.name !== problem.name || reference.where !== problem.where) return;
  const entries = Object.entries(doc.outputs);
  if (!entries.length || entries.length > 2 || bodies.length !== entries.length || new Set(bodies.map(body => body.key)).size !== bodies.length) return;

  const followsShell = (tip: number) => {
    let index = tip;
    while (index > shellIndex) {
      const next = doc.nodes[index];
      if ((next?.kind !== 'chamfer' && next?.kind !== 'fillet') || !next.held || next.suppressed !== true
        || next.parent.side !== 'solid' || next.parent.node >= index) return false;
      index = next.parent.node;
    }
    return index === shellIndex;
  };
  const independentBox = (tip: number) => {
    const node = doc.nodes[tip];
    if (node?.kind !== 'extrude' || node.cutDepth || node.suppressed || node.draft || node.sketch >= tip) return false;
    const sketch = doc.nodes[node.sketch];
    return sketch?.kind === 'sketch' && sketch.profile === 'rectangle' && !sketch.on && !sketch.association
      && !sketch.suppressed && !sketch.regions?.length && !sketch.holes?.length;
  };

  let owner: Selection['faces'][number] | undefined;
  for (const [key, ref] of entries) {
    const slot = bodies.findIndex(body => body.key === key);
    const body = bodies[slot];
    if (!body || body.ref?.node !== ref.node || body.ref.side !== 'solid' || ref.side !== 'solid' || (body.pieces ?? 1) !== 1) return;
    if (!followsShell(ref.node)) {
      if (!independentBox(ref.node)) return;
      continue;
    }
    if (owner || lookOf(doc, body).hidden) return;
    const faces = body.mesh.faces.filter(face => face.name === name);
    if (faces.length !== 1 || faces[0].kind !== 'plane' || faces[0].facet) return;
    owner = { body: slot, face: faces[0].index };
  }
  return owner;
}

export function createReferencePreview({ model, owner, changes }: ReferencePreviewRoute) {
  const { doc, bodies, ready, edgeBlocked, faceReady } = model;
  return (where: string, { edge, candidateNumber, shellCandidate, inModel = false }: ReferencePreviewOptions = {}) => {
    const dimension = doc.drawing?.dimensions.find(value => where === `dimension ${value.id}`);
    if (dimension && !inModel) {
      if (!ready) {
        changes.setPreview(null);
        changes.notice({ title: 'Preview unavailable', hint: 'Wait for the current model before inspecting a drawing reference.', detail: '' });
        return;
      }
      owner.switchDrawing(() => {
        if (owner.document.current !== doc) return;
        changes.setPreview({ owner: doc, dimensionId: dimension.id, edge, candidateNumber });
        changes.showDrawing();
      });
      return;
    }
    if (shellCandidate) {
      const face = ready && faceReady?.() && owner.document.current === doc
        ? heldShellCandidateFace(doc, bodies, shellCandidate.problem, shellCandidate.name) : undefined;
      if (!face) {
        changes.notice({ title: 'Preview unavailable', hint: 'The held Shell candidate must belong to the current visible source solid.', detail: '' });
        return;
      }
      changes.setPreview(null);
      changes.showModel([], [face]);
      return;
    }
    if (!edge || !ready || edgeBlocked()) {
      changes.notice({ title: 'Preview unavailable', hint: 'Show the current model without a section or active tool first.', detail: '' });
      return;
    }
    const edges = bodies.flatMap((body, bodyIndex) => body.mesh.edges.flatMap((candidate, edgeIndex) =>
      candidate.names.includes(edge) ? [{ body: bodyIndex, edge: edgeIndex }] : []));
    if (edges.length !== 1) {
      changes.notice({ title: 'Preview unavailable', hint: edges.length ? 'This name covers more than one displayed edge.' : 'This edge is not present in the current displayed model.', detail: '' });
      return;
    }
    changes.setPreview(null);
    changes.showModel(edges);
  };
}
