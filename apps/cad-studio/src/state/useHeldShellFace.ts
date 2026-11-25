import { useCallback, useLayoutEffect, useRef, useState } from 'react';
import type { Selection } from '@barocss/cad-model/app/commands';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult, EvalResult } from '@barocss/cad-model/engine/evaluate';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { Problem } from '@barocss/cad-model/engine/references';
import {
  heldShellFaceProblem,
  pickHeldShellFace,
  replaceHeldShellFace,
  type HeldShellFaceHit,
  type HeldShellFaceTarget,
} from './heldShellFaceReplacement';

export interface HeldShellFaceDraft {
  doc: StudioDoc;
  index: number;
  name: string | null;
  faceIndex: number | null;
  target?: HeldShellFaceTarget;
  error?: string;
  pending?: boolean;
}

export interface HeldShellFaceEditor {
  start(): void;
  cancel(): void;
  apply(): void;
  draft: Pick<HeldShellFaceDraft, 'name' | 'error' | 'pending'> | null;
}

export interface HeldShellFaceOptions {
  doc: StudioDoc;
  index: number | null;
  problems: readonly Problem[];
  bodies: readonly BodyResult[];
  enabled: boolean;
  ownsSource(): boolean;
  evaluate(doc: StudioDoc): Promise<EvalResult>;
  refreshProblems(doc: StudioDoc, releasedNode: number, remaining: readonly Problem[], bodies: readonly BodyResult[]): Promise<Problem[]>;
  accept(doc: StudioDoc, resolved: readonly Problem[], nextProblems: readonly Problem[]): boolean;
  notice(value: FriendlyError): void;
  retireNotice(value: FriendlyError): void;
}

export function useHeldShellFace({
  doc, index, problems, bodies, enabled, ownsSource, evaluate, refreshProblems, accept, notice, retireNotice,
}: HeldShellFaceOptions) {
  const scope = enabled && index !== null ? heldShellFaceProblem(doc, index, problems, bodies) : undefined;
  const [draft, setDraft] = useState<HeldShellFaceDraft | null>(null);
  const ticket = useRef<object | null>(null);
  const failureNotice = useRef<FriendlyError | null>(null);

  const clearFailure = useCallback(() => {
    const owned = failureNotice.current;
    failureNotice.current = null;
    if (owned) retireNotice(owned);
  }, [retireNotice]);

  const reportFailure = useCallback((failure: FriendlyError) => {
    failureNotice.current = failure;
    notice(failure);
  }, [notice]);

  useLayoutEffect(() => {
    ticket.current = null;
    setDraft(null);
    clearFailure();
    return () => { ticket.current = null; };
  }, [doc, index, scope?.body, scope?.problem, enabled, clearFailure]);

  const current = enabled && draft?.doc === doc && draft.index === index && scope ? draft : null;

  const cancel = useCallback(() => {
    ticket.current = null;
    setDraft(null);
    clearFailure();
  }, [clearFailure]);

  const start = useCallback(() => {
    if (!enabled || !scope || index === null) return;
    clearFailure();
    setDraft({ doc, index, name: null, faceIndex: null });
  }, [enabled, scope, index, doc, clearFailure]);

  const pick = useCallback((hit: HeldShellFaceHit) => {
    if (!current || !scope || index === null) return;
    if (current.pending) return;
    const picked = pickHeldShellFace(doc, index, problems, bodies, hit);
    if (picked.ok) {
      clearFailure();
      setDraft({
        doc,
        index,
        name: picked.target.name,
        faceIndex: picked.target.faceIndex,
        target: picked.target,
      });
    } else {
      setDraft({ doc, index, name: null, faceIndex: null, error: picked.reason });
      reportFailure({ title: 'Face not selected', hint: picked.reason, detail: '' });
    }
  }, [current, scope, index, doc, problems, bodies, clearFailure, reportFailure]);

  const apply = useCallback(async () => {
    if (!current || current.pending || !current.target || !scope || !ownsSource()) return;
    const next = replaceHeldShellFace(doc, current.index, current.target);
    if (!next) return;
    const request = {};
    ticket.current = request;
    setDraft({ ...current, pending: true });
    try {
      const result = await evaluate(next);
      if (ticket.current !== request || !ownsSource()) return;
      if (!result.ok) {
        reportFailure({ ...result.error, title: 'Face replacement not applied' });
        return;
      }
      const remaining = problems.filter(value => value !== scope.problem);
      const nextProblems = await refreshProblems(next, current.index, remaining, result.bodies);
      if (ticket.current !== request || !ownsSource()) return;
      if (accept(next, [scope.problem], nextProblems)) cancel();
    } catch (error) {
      if (ticket.current === request && ownsSource()) {
        reportFailure({ title: 'Face replacement not applied', hint: 'The feature is unchanged.', detail: String(error) });
      }
    } finally {
      if (ticket.current === request) {
        ticket.current = null;
        setDraft(previous => previous?.doc === doc && previous.index === current.index ? { ...previous, pending: false } : previous);
      }
    }
  }, [current, scope, doc, problems, ownsSource, evaluate, refreshProblems, accept, cancel, reportFailure]);

  const previewSelection: Selection | undefined = current
    ? { faces: current.faceIndex === null ? [] : [{ body: 0, face: current.faceIndex }], edges: [], bodies: [] }
    : undefined;

  return {
    available: !!scope,
    current,
    start,
    cancel,
    pick,
    apply,
    previewSelection,
  };
}
