import type { Dispatch, RefObject, SetStateAction } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';
import type { Problem as RefProblem } from '@barocss/cad-model/engine/references';
import type { ReplacementIntent } from '../app/documentReplacement';
import { curvePatternDocumentProblem } from '../app/directCurveCandidate';
import { changesBeyondVariability } from '../app/documentChanges';
import type { StudioNotice } from '../app/studioNotice';
import type { RouteEvaluationHandoff, StudioParameterEdit } from './useStudioModelEvaluation';
import { reserveAcceptedChange, workEditRefusal, type WorkHistory, type WorkOwnership } from './workOwnership';

export interface StudioDocumentUndo {
  entry: WorkHistory<StudioDoc>;
  scope: object;
  base: StudioDoc;
  beforeInput: StudioDoc;
}

interface ChangeOwner {
  doc: StudioDoc;
  docNow: RefObject<StudioDoc>;
  acceptanceScope: object;
  replacement: RefObject<ReplacementIntent | null>;
  workOwnership: RefObject<WorkOwnership<StudioDoc, StudioDoc>>;
  workCompletion: RefObject<object | null>;
  undoFor: RefObject<StudioDocumentUndo | null>;
  setToast(notice: StudioNotice): void;
}

function changeRefusal(owner: ChangeOwner, intent?: StudioDocumentUndo | null) {
  const { doc, docNow, replacement, workOwnership, workCompletion, acceptanceScope } = owner;
  if (!replacement.current && (intent?.base ?? doc) !== docNow.current) return 'stale';
  return workEditRefusal(workOwnership.current, replacement.current?.scope ?? intent?.scope ?? acceptanceScope, workCompletion.current);
}

function refusedChange(owner: ChangeOwner, reason: 'stale' | 'pending'): false {
  owner.setToast({ title: 'Change not applied', hint: reason === 'pending' ? 'Wait for the computation to finish, or stop it, before changing the document.' : 'The document or operation changed. Try this edit again.', detail: '' });
  return false;
}

export function canChangeStudioDocument(owner: ChangeOwner): boolean {
  const why = changeRefusal(owner);
  if (!why) return true;
  owner.undoFor.current = null;
  return refusedChange(owner, why);
}

interface Adoption {
  edit: {
    parameterEdit: RefObject<StudioParameterEdit | null>;
    shownVariant: RefObject<string | null>;
    discardRoute: RefObject<() => void>;
    routeAcceptedHandoff: RefObject<RouteEvaluationHandoff | null>;
  };
  history: {
    clipboard: RefObject<{ key: string; featureId: string } | null>;
    clearBodyClipboard(): void;
    setUndo: Dispatch<SetStateAction<WorkHistory<StudioDoc>[]>>;
    setRedo: Dispatch<SetStateAction<WorkHistory<StudioDoc>[]>>;
  };
  install: {
    referenceProblems: RefObject<WeakMap<StudioDoc, RefProblem[]>>;
    setDocState(doc: StudioDoc): void;
  };
}

export function adoptStudioDocument(owner: ChangeOwner, { edit, history, install }: Adoption, next: StudioDoc, whole: boolean): boolean {
  const { docNow, undoFor, replacement, workCompletion, workOwnership, setToast } = owner;
  const intent = undoFor.current;
  undoFor.current = null;
  const why = changeRefusal(owner, intent);
  if (why) return refusedChange(owner, why);
  const insetEdit = edit.parameterEdit.current;
  const acceptsInsetEdit = !whole && workCompletion.current !== null && insetEdit?.roundedInset
    && insetEdit.base === docNow.current && insetEdit.next === next;
  if (!replacement.current && !acceptsInsetEdit && (docNow.current.nodes.some(node => node.kind === 'rounded-rectangle-inset')
    || next.nodes.some(node => node.kind === 'rounded-rectangle-inset'))) {
    setToast({ title: 'Change not applied', hint: 'Use the Extrude editor to change the inset distance or detach it.', detail: 'The document is unchanged.' });
    return false;
  }
  const pathProblem = curvePatternDocumentProblem(next);
  if (pathProblem) {
    setToast({ title: 'Change not applied', hint: pathProblem, detail: 'The document is unchanged.' });
    return false;
  }
  const variant = edit.shownVariant.current;
  if (!whole && variant && changesBeyondVariability(docNow.current, next)) {
    setToast({ title: 'Can’t change the part now', hint: `Showing ${variant}: show the master to edit.`, detail: '' });
    return false;
  }
  if (next !== docNow.current) edit.discardRoute.current();
  if (edit.routeAcceptedHandoff.current?.doc !== next) edit.routeAcceptedHandoff.current = null;
  if (intent) {
    const copied = history.clipboard.current;
    const current = docNow.current;
    // Undo may restore the earlier ID counter. A new edit can then reuse the absent producer's ID.
    if (copied && !Object.hasOwn(current.outputs, copied.key)
      && !current.nodes.some((_, i) => featureId(current.nodes, i) === copied.featureId)
      && next.nodes.some((_, i) => featureId(next.nodes, i) === copied.featureId)) {
      history.clearBodyClipboard();
    }
    const identity = replacement.current?.identity;
    const entry: WorkHistory<StudioDoc> = replacement.current
      ? { ...intent.entry, documentBoundary: true, ...(identity ? { documentIdentity: identity } : {}) } : intent.entry;
    history.setUndo(u => [...u.slice(-49), entry]);
    history.setRedo([]);
    workOwnership.current = reserveAcceptedChange(workOwnership.current, entry, next, intent.beforeInput);
  }
  const previous = docNow.current;
  const problems = install.referenceProblems.current.get(previous);
  if (!whole && problems?.length && next.nodes === previous.nodes && next.drawing === previous.drawing
    && next.mates === previous.mates && next.bodies === previous.bodies) install.referenceProblems.current.set(next, problems);
  docNow.current = next;
  install.setDocState(next);
  return true;
}
