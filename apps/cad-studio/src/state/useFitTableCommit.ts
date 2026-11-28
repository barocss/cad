import { useRef, type RefObject } from 'react';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { resolveShopRows } from '@barocss/cad-model/engine/shopRows';
import type { StudioNotice } from '../app/studioNotice';
import type { EngineClient } from '../engine/client';
import type { WorkOwnership } from './workOwnership';

interface FitTableCommitOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; workerSession: number; assembly?: StudioDoc };
  current: {
    doc: RefObject<StudioDoc>;
    evaluated: RefObject<StudioDoc>;
    workerSession: RefObject<number>;
    workOwnership: RefObject<Pick<WorkOwnership<StudioDoc, StudioDoc>, 'generation'>>;
    openIntent: RefObject<object>;
    variant: RefObject<string | null>;
  };
  worker: { engine: Pick<EngineClient, 'part'>; revision: RefObject<number> };
  opening(): boolean;
  canChangeDocument(): boolean;
  commit(next: StudioDoc, capture: false): boolean;
  setToast(notice: StudioNotice): void;
}

/** Check the full model with the candidate tables before changing the current document. */
export function useFitTableCommit({ model, current, worker, opening, canChangeDocument, commit, setToast }: FitTableCommitOptions) {
  const requestRef = useRef<object | null>(null);
  return async (next: StudioDoc) => {
    if (opening() || !canChangeDocument()) return;
    if (current.variant.current) {
      setToast({ title: 'Can’t change the part now', hint: `Showing ${current.variant.current}: show the master to edit.`, detail: '' });
      return;
    }
    const { doc, evaluated, workerSession, assembly } = model;
    const request = {};
    const open = current.openIntent.current;
    const generation = current.workOwnership.current.generation;
    requestRef.current = request;
    const ownsRequest = () => requestRef.current === request && current.doc.current === doc
      && current.openIntent.current === open && current.workOwnership.current.generation === generation
      && current.workerSession.current === workerSession && current.evaluated.current === evaluated;

    const candidate = assembly ? resolveShopRows(next, assembly).doc : next;
    try {
      const reply = await worker.engine.part(prefixDoc(candidate, candidate.nodes.length), worker.revision.current++, 'read');
      if (!ownsRequest()) return;
      if (!reply.ok) {
        setToast({ ...reply.error, documentSource: { doc } });
        return;
      }
      commit(next, false);
    } catch (cause) {
      if (ownsRequest()) setToast({ title: 'Fit tables not changed', hint: 'The current tables are still in use.', detail: String(cause), documentSource: { doc } });
    }
  };
}
