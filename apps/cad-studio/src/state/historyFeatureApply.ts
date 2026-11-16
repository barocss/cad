import { holeResultPieces } from '../app/holeResultPieces';
import type { StudioNotice } from '../app/studioNotice';
import type { ComponentProps } from 'react';
import { dropStaleMade, prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { holePatternEditProblem } from '@barocss/cad-model/app/holePatternInput';
import type { NodeEditor } from '../ui/NodeEditor';
import type { EngineClient } from '../engine/client';
import { prepareLinearPatternHoleEdit } from '../app/patternHoleSpacing';
import { rectangularCutEditProblem } from '../app/rectangularCutEdit';
import { preparePatternNodeCandidate } from '../app/directCurveCandidate';
import { linkedInsetHistoryFailure, failedFeatureText, loftHistoryFailure, splitDependentHoleFailure, holeDepthContactFailure } from '../app/failedFeature';
import { isRectangleFinishResize, proveRectangleFinishResize } from './rectangleFinishResize';

type Apply = ComponentProps<typeof NodeEditor>['onApply'];
interface Options {
  model: { doc: StudioDoc; evaluated: StudioDoc; editNode: number; fresh: boolean; busy: boolean };
  owner: { document(): StudioDoc; evaluated(): StudioDoc; marker(): number | null; variant(): string | null;
    scope(): object; worker(): number; open(): object };
  worker: { engine: Pick<EngineClient, 'evaluate' | 'part'>; nextRevision(): number };
  changes: { onNotice?(notice: StudioNotice): void; canChangeDocument(): boolean; commit(next: StudioDoc): unknown;
    applyRoundedInsetEdit(nodes?: StudioDoc['nodes'], sourceWidth?: number): void;
    stageFeatureCandidate(candidate: NonNullable<ReturnType<typeof preparePatternNodeCandidate>>): void };
}
/** History edit admission; central commit remains in App and is called only for an owned accepted result. */
export function createHistoryFeatureApply({ model, owner, worker, changes }: Options): Apply {
  const { doc, evaluated, editNode, fresh, busy } = model;
  const { engine, nextRevision } = worker;
  const { canChangeDocument, commit, applyRoundedInsetEdit, stageFeatureCandidate } = changes;
  return (nodes, ownsDraft, sourceWidth) => {
    if (doc.nodes[1]?.kind === 'rounded-rectangle-inset') { applyRoundedInsetEdit(nodes, sourceWidth); return; }
    if (!canChangeDocument()) return;
    if (doc.nodes[editNode]?.kind === 'face-end-extrude' && nodes[editNode]?.kind === 'extrude'
      && (owner.marker() !== null || owner.variant() || owner.evaluated() !== evaluated || !fresh || busy)) {
      return Promise.resolve({ title: 'Distance not applied', hint: 'Show the master at the latest History and wait for the model before detaching.', detail: '' });
    }
    const scope = owner.scope();
    const patternEdit = prepareLinearPatternHoleEdit(doc, nodes, editNode);
    if ('error' in patternEdit) return Promise.resolve(patternEdit.error);
    const cutProblem = rectangularCutEditProblem(doc, patternEdit.nodes, editNode);
    if (cutProblem) return Promise.resolve(cutProblem);
    const hint = holePatternEditProblem(doc.nodes[editNode], patternEdit.nodes[editNode], doc.parameters);
    if (hint) return Promise.resolve({ title: 'The Hole pattern is invalid', hint, detail: '' });
    const editedNodes = dropStaleMade(doc.nodes, patternEdit.nodes);
    const previousSplit = doc.nodes[editNode], nextSplit = editedNodes[editNode];
    const splitOutputChanged = previousSplit?.kind === 'split' && nextSplit?.kind === 'split'
      && previousSplit.outputSide !== nextSplit.outputSide;
    const rawNext = { ...doc, nodes: editedNodes };
    const next = splitOutputChanged ? prefixDoc(rawNext, rawNext.nodes.length) : rawNext;
    const candidate = preparePatternNodeCandidate(doc, next, editNode);
    if (candidate) { stageFeatureCandidate(candidate); return; }
    const request = nextRevision();
    const resize = isRectangleFinishResize(doc,next,editNode), worker = owner.worker(), open = owner.open();
    const current = () => ownsDraft() && owner.document() === doc && owner.scope() === scope
      && owner.worker() === worker && owner.open() === open;
    return engine.evaluate(next, request).then(async reply => {
      if (!reply || !current()) return;
      if (reply.ok) {
        if (!resize) {
          const notice = reply.revision === request && fresh && !busy && owner.evaluated() === evaluated
            && owner.marker() === null && !owner.variant() ? holeResultPieces(next, editNode, reply.bodies) : undefined;
          if (commit(next) === true && notice) changes.onNotice?.({ ...notice, documentSource: { doc: owner.document() } });
          return;
        }
        const failure = {title:'Size not applied',hint:`The original ${next.nodes[2].kind === 'chamfer' ? 'Chamfer' : 'Fillet'} edge could not be verified. Keep the current size or explicitly replace its edge first.`,detail:'No reference was renamed or refreshed.'};
        try {
          const before = await engine.part(prefixDoc(doc,2),nextRevision(),'refs');
          if (!current()) return;
          const after = await engine.part(prefixDoc(next,2),nextRevision(),'refs');
          if (!current() || owner.marker() !== null || owner.variant()) return;
          const refreshed = before.ok && after.ok ? proveRectangleFinishResize(doc,next,before.bodies,after.bodies) : null;
          if (!refreshed) return failure;
          commit(refreshed); return;
        } catch { if (current()) return failure; return; }
      }
      const insetFailure = reply.revision === request ? linkedInsetHistoryFailure(reply.error, doc.nodes, next.nodes, editNode) : undefined;
      if (insetFailure) return insetFailure;
      const failedFeature = reply.revision === request ? failedFeatureText(reply.error.feature, next.nodes, doc.nodes) : undefined;
      const failure = { ...reply.error, failedFeature };
      return (reply.revision === request ? holeDepthContactFailure(failure, doc.nodes, next.nodes, editNode) : undefined)
        ?? (reply.revision === request ? splitDependentHoleFailure(failure, doc.nodes, next.nodes, editNode) : undefined)
        ?? loftHistoryFailure(failure, doc.nodes, next.nodes, editNode) ?? failure;
    });
  };
}
