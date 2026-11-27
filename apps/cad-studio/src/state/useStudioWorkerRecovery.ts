import { useCallback, useEffect, useState, type RefObject } from 'react';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { EngineClient } from '../engine/client';
import type { createEvaluationEvidence } from './evaluationEvidence';
import type { StudioParameterEdit } from './useStudioModelEvaluation';
import { invalidateWork, stopOwnedWork, type WorkHistory, type WorkOwnership } from './workOwnership';

interface Inputs {
  busy: boolean;
  setBusy(value: boolean): void;
  work: {
    ownership: RefObject<WorkOwnership<StudioDoc, StudioDoc>>;
    undoFor: RefObject<object | null>;
    completion: RefObject<object | null>;
    evidence: ReturnType<typeof createEvaluationEvidence>;
  };
  parameters: {
    request: RefObject<number>;
    edit: RefObject<StudioParameterEdit | null>;
    setEdit(value: null): void;
  };
  worker: {
    engine: Pick<EngineClient, 'restart'>;
    session: RefObject<number>;
    setSession(value: number): void;
    failureHandler: RefObject<((error: FriendlyError) => void) | null>;
    setFailure(value: FriendlyError | null): void;
    setImportRecovery(update: (value: number) => number): void;
  };
  view: {
    setCandidateReview(value: null): void;
    routeHandoff: RefObject<object | null>;
    claimBodies: RefObject<boolean>;
    setBodiesFor(value: null): void;
    discardRoute: RefObject<() => void>;
    clearInstances(): void;
    setPreviewBodies(value: null): void;
  };
  beginOpenIntent(): void;
  cancelStepExport: RefObject<() => void>;
  setNotice(value: null): void;
}

export function useStudioWorkerRecovery({ busy, setBusy, work, parameters, worker, view, beginOpenIntent, cancelStepExport, setNotice }: Inputs) {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    if (!busy) { setSlow(false); return; }
    const timeout = setTimeout(() => setSlow(true), 1000);
    return () => clearTimeout(timeout);
  }, [busy]);

  const { ownership, undoFor, completion, evidence } = work;
  const { request, edit, setEdit } = parameters;
  const invalidateDocumentWork = useCallback(() => {
    ownership.current = invalidateWork(ownership.current);
    undoFor.current = null;
    completion.current = null;
    request.current++;
    edit.current = null;
    setEdit(null);
    evidence.clearHandoff();
    evidence.discardUninstalled();
    setBusy(false);
  }, [ownership, undoFor, completion, request, edit, setEdit, evidence, setBusy]);

  // Pending work and cached geometry belong to the original worker session.
  const invalidateWorkerResults = () => {
    view.setCandidateReview(null);
    evidence.reset();
    view.routeHandoff.current = null;
    view.claimBodies.current = false;
    view.setBodiesFor(null);
    view.discardRoute.current();
    view.clearInstances();
    worker.session.current++;
    worker.setSession(worker.session.current);
    setBusy(false);
    setSlow(false);
    view.setPreviewBodies(null);
  };
  const restartWorker = () => {
    invalidateWorkerResults();
    const ready = worker.engine.restart();
    if (ready) worker.setFailure(null);
    return ready;
  };
  worker.failureHandler.current = error => {
    beginOpenIntent();
    invalidateDocumentWork();
    invalidateWorkerResults();
    cancelStepExport.current();
    worker.setFailure(error);
  };
  const retryWorker = () => {
    beginOpenIntent();
    invalidateDocumentWork();
    if (restartWorker()) {
      setNotice(null);
      worker.setImportRecovery(value => value + 1);
    }
  };
  const stopImport = () => {
    beginOpenIntent();
    invalidateDocumentWork();
    if (restartWorker()) worker.setImportRecovery(value => value + 1);
  };
  const stopDocumentWork = (doc: StudioDoc, evaluated: StudioDoc, top: WorkHistory<StudioDoc> | undefined) => {
    if (!ownership.current.run) { setBusy(false); setSlow(false); return; }
    const stopped = stopOwnedWork(ownership.current, doc, evaluated, top);
    ownership.current = stopped.state;
    undoFor.current = null;
    completion.current = null;
    // Retire the parameter edit before restart can settle its pending promises.
    request.current++;
    edit.current = null;
    setEdit(null);
    restartWorker();
    return stopped.target;
  };
  return { slow, invalidateDocumentWork, retryWorker, stopImport, stopDocumentWork };
}
