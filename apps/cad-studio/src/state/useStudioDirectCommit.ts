import { useCallback, type RefObject } from 'react';
import type { DirectGeometry } from '@barocss/cad-model/engine/direct';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { assertRouteBundleDocument } from '@barocss/cad-model/engine/routeBundle';
import { prepareDirectCurveCandidate, type DirectCurveEdit } from '../app/directCurveCandidate';
import { routeMessage } from '../app/routeSession';
import type { StudioNotice } from '../app/studioNotice';
import type { StudioParameterEdit } from './useStudioModelEvaluation';
import { beginWork, type WorkOwnership } from './workOwnership';

type FeatureCandidate = Pick<StudioParameterEdit, 'next' | 'input' | 'failureTitle' | 'roundedInset'>;

interface StudioDirectCommitOptions {
  model: {
    doc: StudioDoc;
    marker: number | null;
    acceptanceScope: object;
    bodiesFor: StudioDoc | null;
    fresh: boolean;
    busy: boolean;
    massReady: boolean;
    workerFailure: unknown;
  };
  current: {
    doc: RefObject<StudioDoc>;
    evaluated: RefObject<StudioDoc>;
    shown: RefObject<StudioDoc>;
    marker: RefObject<number | null>;
    variant: RefObject<string | null>;
    inPlace: RefObject<unknown>;
    active(): unknown;
    opening(): boolean;
    ownsEvaluatedSource(): boolean;
    referenceProblems: Pick<WeakMap<StudioDoc, readonly unknown[]>, 'get'>;
  };
  work: {
    ownership: RefObject<WorkOwnership<StudioDoc, StudioDoc>>;
    request: RefObject<number>;
    edit: RefObject<StudioParameterEdit | null>;
    setEdit(edit: StudioParameterEdit): void;
    setBusy(busy: boolean): void;
  };
  changes: {
    canChangeDocument(): boolean;
    commit(next: StudioDoc, capture?: boolean, whole?: boolean, authored?: boolean): boolean;
    pushUndo(): void;
    setDoc(next: StudioDoc): boolean;
    setDirty(value: boolean): void;
    setDirectSel(ids: string[]): void;
    setToast(notice: StudioNotice): void;
  };
}

/** Commit unconsumed Direct inputs immediately and reserve evaluated candidates before the next render. */
export function useStudioDirectCommit({ model, current, work, changes }: StudioDirectCommitOptions) {
  const { doc, marker, acceptanceScope, bodiesFor, fresh, busy, massReady, workerFailure } = model;
  const { doc: docNow, evaluated, shown, marker: markerNow, variant, inPlace, active, opening, ownsEvaluatedSource, referenceProblems } = current;
  const { ownership, request, edit, setEdit, setBusy } = work;
  const { canChangeDocument, commit, pushUndo, setDoc, setDirty, setDirectSel, setToast } = changes;

  const stageFeatureCandidate = useCallback((candidate: FeatureCandidate, select?: string[]) => {
    if (bodiesFor !== evaluated.current || !massReady || variant.current) {
      setToast({ title: candidate.failureTitle ?? 'Direct geometry not changed',
        hint: 'Wait for the accepted part and its mass results to finish evaluating.', detail: '' });
      return;
    }
    const pending: StudioParameterEdit = { ...candidate, kind: 'direct', request: ++request.current, base: doc, baseInput: evaluated.current,
      accept: accepted => { if (commit(accepted, false, false, !!candidate.roundedInset) && select) setDirectSel(select); } };
    ownership.current = beginWork(ownership.current, doc, candidate.input, true);
    edit.current = pending;
    setEdit(pending);
    setBusy(true);
  }, [doc, bodiesFor, massReady, commit]);

  const commitDirect = useCallback((direct: DirectGeometry, select?: string[], action?: DirectCurveEdit) => {
    if (!canChangeDocument()) return false;
    try { assertRouteBundleDocument({ ...doc, direct }); }
    catch (error) {
      setToast({ title: 'Direct geometry not changed', hint: `${routeMessage(error)} Detach the route bundle before editing a bound member.`, detail: '' });
      return false;
    }
    try {
      const currentAction = action && fresh && !busy && !workerFailure && docNow.current === doc && shown.current === doc
        && ownsEvaluatedSource() && markerNow.current === null && !variant.current && !inPlace.current
        && !active() && !edit.current && !opening() && !referenceProblems.get(doc)?.length ? action : undefined;
      const candidate = prepareDirectCurveCandidate(doc, direct, currentAction);
      if (candidate) {
        stageFeatureCandidate(candidate, select);
        return false;
      }
    } catch (error) {
      setToast({ title: 'Direct geometry not changed', hint: routeMessage(error), detail: '' });
      return false;
    }
    pushUndo();
    if (!setDoc({ ...doc, direct })) return false;
    setDirty(true);
    if (select) setDirectSel(select);
    return true;
  }, [doc, marker, acceptanceScope, stageFeatureCandidate, fresh, busy, workerFailure, ownsEvaluatedSource, active, opening]);

  return { stageFeatureCandidate, commitDirect };
}
