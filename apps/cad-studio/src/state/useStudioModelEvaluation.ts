import { useEffect, type Dispatch, type RefObject, type SetStateAction } from 'react';
import { carrySelection, type Selection } from '@barocss/cad-model/app/commands';
import { resolveNames, type NameSelection } from '@barocss/cad-model/chat/names';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluationKey } from '@barocss/cad-model/engine/evalMemo';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import { routeBundleDocumentIdentity } from '@barocss/cad-model/engine/routeBundle';
import type { StudioNotice } from '../app/studioNotice';
import type { EngineClient } from '../engine/client';
import { candidateReferenceProblem, refreshCandidateReferences } from './candidateReferences';
import type { createEvaluationEvidence } from './evaluationEvidence';
import { prepareParameterHeightFinish } from './parameterHeightFinish';
import { prepareParameterPatternHoleSpacing } from './parameterPatternHoleSpacing';
import { beginWork, finishWork, settleWorkReservation, type WorkOwnership } from './workOwnership';

export interface StudioParameterEdit {
  kind?: 'direct';
  failureTitle?: string;
  roundedInset?: 'create' | 'edit' | 'detach';
  request: number;
  base: StudioDoc;
  baseInput: StudioDoc;
  input: StudioDoc;
  next: StudioDoc;
  accept(next: StudioDoc): void;
}

export interface RouteEvaluationHandoff {
  doc: StudioDoc;
  identity: string;
  evaluatedIdentity: string;
  revision: number;
  result: Extract<EvalResult, { ok: true }>;
}

interface ModelEvaluationOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; marker: number | null; variantShown: boolean };
  owner: { docNow: RefObject<StudioDoc>; readEvaluated(): StudioDoc; readBodies(): BodyResult[]; shownVariant: RefObject<string | null> };
  work: { workOwnership: RefObject<WorkOwnership<StudioDoc, StudioDoc>>; workCompletion: RefObject<object | null>; acceptanceScope: object; workFinished(): void };
  params: { parameterEdit: StudioParameterEdit | null; parameterEditNow: RefObject<StudioParameterEdit | null>; parameterRequest: RefObject<number>; setParameterEdit(edit: null): void };
  worker: { engine: Pick<EngineClient, 'evaluate' | 'part' | 'verifyStoredInsets'>; revision: RefObject<number>; importWorkerRecovery: number };
  evidence: {
    evaluationEvidence: ReturnType<typeof createEvaluationEvidence>;
    routeAcceptedHandoff: RefObject<RouteEvaluationHandoff | null>;
    claimBodies: RefObject<boolean>;
  };
  install: {
    setBusy(value: boolean): void;
    reportDuration(ms: number): void;
    rebuildStore: { set(value: { doc: StudioDoc; result: EvalResult }): void };
    setBodies(bodies: BodyResult[]): void;
    setBodiesFor(doc: StudioDoc): void;
    chatSelection: RefObject<NameSelection | null>;
    setSelection: Dispatch<SetStateAction<Selection>>;
    repeatCommand(): void;
    clearFailedInspection(): void;
    setToast(notice: StudioNotice): void;
  };
}

/** Evaluate the current Model or one owned edit, then install the result in the same run. */
export function useStudioModelEvaluation({ model, owner, work, params, worker, evidence, install }: ModelEvaluationOptions) {
  const { doc, evaluated, marker, variantShown } = model;
  const { docNow, readEvaluated, readBodies, shownVariant } = owner;
  const { workOwnership, workCompletion, acceptanceScope, workFinished } = work;
  const { parameterEdit, parameterEditNow, parameterRequest, setParameterEdit } = params;
  const { engine, revision, importWorkerRecovery } = worker;
  const { evaluationEvidence, routeAcceptedHandoff, claimBodies } = evidence;
  const { setBusy, reportDuration, rebuildStore, setBodies, setBodiesFor, chatSelection, setSelection, repeatCommand, clearFailedInspection, setToast } = install;

  // A display-only commit does not rerun the main effect: release its reservation on the same exact input.
  useEffect(() => { workOwnership.current = settleWorkReservation(workOwnership.current, doc, evaluated); }, [doc, evaluated, acceptanceScope]);
  // A parameter candidate and its BRep stay together. A refusal keeps the last accepted document and bodies.
  const parameterCurrent = !parameterEdit || (parameterEdit.base === doc && parameterEdit.baseInput === evaluated && !shownVariant.current);
  useEffect(() => {
    let live = true;
    if (parameterEdit && !parameterCurrent) {
      // A display-only edit cancels the candidate without evaluating the unchanged accepted model again.
      if (parameterEdit.baseInput === evaluated) evaluationEvidence.restoreAccepted(docNow.current, readBodies());
      evaluationEvidence.discardUninstalled(parameterEdit.request);
      if (parameterEdit.kind === 'direct') parameterEditNow.current = null;
      setParameterEdit(null); return;
    }
    const edit = parameterEdit;
    const input = edit?.input ?? evaluated;
    const started = beginWork(workOwnership.current, doc, input, !!edit || variantShown || marker !== null);
    workOwnership.current = started;
    const work = started.run!;
    const current = () => live && workOwnership.current.run?.token === work.token && (!edit || (parameterRequest.current === edit.request && docNow.current === edit.base && readEvaluated() === evaluated && !shownVariant.current));
    const refuse = (detail: string, hint = 'The accepted part and its references are unchanged.') => {
      if (!edit || !current()) return;
      evaluationEvidence.restoreAccepted(edit.base, readBodies());
      evaluationEvidence.discardUninstalled(edit.request);
      if (edit.kind === 'direct') parameterEditNow.current = null;
      setParameterEdit(null); setBusy(false);
      setToast({ title: edit.failureTitle ?? (edit.kind === 'direct' ? 'Direct geometry not changed' : 'Parameters not changed'), hint, detail,
        ...(!edit.kind && !edit.roundedInset ? { documentSource: { doc: edit.base } } : {}) });
    };
    setBusy(true);
    const run = async () => {
      if (edit?.roundedInset) {
        // Detach stores the exact profile used to build the linked base.
        const verified = await engine.verifyStoredInsets(edit.roundedInset === 'detach' ? edit.base : edit.next);
        if (!current()) return;
        if (!('ok' in verified)) {
          const recipe = edit.next.nodes[1];
          const hint = edit.roundedInset === 'edit' && verified.roundedInsetOpeningClosed && recipe?.kind === 'rounded-rectangle-inset'
            ? `A ${recipe.insetMM} mm inset closes the opening. Increase Source width or reduce Inset distance.` : undefined;
          refuse(verified.error, hint);
          return;
        }
      }
      // Only bounded parameter adapters may adjust dependent geometry/evidence before evaluation.
      const heightCandidate = edit && !edit.kind && !edit.roundedInset
        ? await prepareParameterHeightFinish({ before: edit.base, next: edit.next,
          evaluateParent: (part, request) => engine.part(part, request, 'refs'),
          nextRevision: () => revision.current++, isCurrent: current }) : edit?.next;
      if (!current()) return;
      const candidate = edit && !edit.kind && !edit.roundedInset
        ? prepareParameterPatternHoleSpacing(edit.base, heightCandidate!) : heightCandidate;
      const preparedParameter = !!edit && candidate !== edit.next;
      const candidateInput = preparedParameter ? prefixDoc(candidate!, candidate!.nodes.length) : input;
      const key = evaluationKey(candidateInput), handoff = !edit ? evaluationEvidence.takeHandoff() : null;
      const routeHandoff = !edit ? routeAcceptedHandoff.current : null;
      if (!edit) routeAcceptedHandoff.current = null;
      // Only the exact accepted route document can consume its final result, once.
      const routeResult = routeHandoff && routeHandoff.doc === doc && marker === null && !variantShown
        && routeHandoff.identity === routeBundleDocumentIdentity(doc) && routeHandoff.evaluatedIdentity === routeBundleDocumentIdentity(evaluated)
        && routeHandoff.result.revision === routeHandoff.revision ? routeHandoff.result : null;
      // A configuration-only parameter edit can keep the already fresh accepted result too.
      const accepted = evaluationEvidence.accepted();
      let evaluationRevision: number | undefined;
      const result = edit && !preparedParameter && accepted?.key === key ? accepted.result
        : handoff?.target === docNow.current && handoff.key === key ? handoff.result : routeResult ?? await engine.evaluate(candidateInput, evaluationRevision = revision.current++);
      if (!current()) return;
      if (preparedParameter && (evaluationRevision === undefined || result?.revision !== evaluationRevision)) {
        refuse('The dependent parameter evaluation could not be verified.'); return;
      }
      if (!result) { if (edit) refuse('The evaluation was superseded.'); else setBusy(false); return; }
      if (edit) {
        if (!result.ok) { refuse(result.error.detail || result.error.hint); return; }
        evaluationEvidence.stage(edit.request, result);
        const referenceProblem = candidateReferenceProblem(candidate!, readBodies(), result.bodies);
        if (referenceProblem) { refuse(referenceProblem); return; }
        const next = await refreshCandidateReferences({ candidate: candidate!, key, result,
          accepted: evaluationEvidence.accepted,
          evaluateParent: part => engine.part(part, revision.current++, 'refs'), isCurrent: current });
        if (!current()) return;
        // Compute the handoff key before accepting: a failed key cannot partially commit the candidate.
        const nextKey = evaluationKey(prefixDoc(next, next.nodes.length));
        // Reuse this exact result when installing the accepted document; do not evaluate it twice.
        workCompletion.current = work.token;
        try { edit.accept(next); } finally { workCompletion.current = null; }
        if (docNow.current === edit.base) { refuse('The parameter change was not accepted.'); return; }
        const installed = docNow.current;
        evaluationEvidence.accept(edit.request, installed, nextKey, result);
        if (edit.kind === 'direct') parameterEditNow.current = null;
        setParameterEdit(null);
        return;
      }
      setBusy(false); reportDuration(result.wallTime * 1000);
      rebuildStore.set({ doc: evaluated, result });
      if (result.ok) {
        evaluationEvidence.remember(key, result);
        const prev = readBodies();
        setBodies(result.bodies); setBodiesFor(evaluated); claimBodies.current = false;
        if (handoff) evaluationEvidence.markInstalled(result, docNow.current, evaluated);
        if (chatSelection.current) setSelection(resolveNames(result.bodies, chatSelection.current).selection); else setSelection(sel => carrySelection(sel, prev, result.bodies));
        repeatCommand();
        chatSelection.current = null;
      }
      else {
        clearFailedInspection();
        setToast({ ...result.error, documentSource: { doc: docNow.current, evaluated } });
      }
    };
    void run().catch(cause => { if (edit) refuse(cause instanceof Error ? cause.message : String(cause)); else if (current()) { setBusy(false); setToast({ title: 'Could not evaluate the part', hint: 'The previous part remains shown.', detail: String(cause), documentSource: { doc: docNow.current, evaluated } }); } }).finally(() => {
      const previous = workOwnership.current;
      workOwnership.current = finishWork(previous, work.token);
      // Cached accepted-result handoffs can settle without changing any React state.
      // Refresh handlers to the finished scope; never revive a superseded/unmounted run.
      if (live && previous !== workOwnership.current) workFinished();
    });
    return () => { live = false; workOwnership.current = finishWork(workOwnership.current, work.token); };
  }, [engine, evaluated, parameterEdit, parameterCurrent, importWorkerRecovery]);
  // (A command's preview is what the part becomes: its bodies belong to the document it commits.)
  useEffect(() => { if (claimBodies.current) { claimBodies.current = false; setBodiesFor(evaluated); } }, [evaluated]);
}
