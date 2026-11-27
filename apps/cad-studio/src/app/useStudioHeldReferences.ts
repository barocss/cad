import type { RefObject } from 'react';
import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import type { FriendlyError } from '@barocss/cad-model/engine/errors';
import type { Problem } from '@barocss/cad-model/engine/references';
import type { EngineClient } from '../engine/client';
import type { OpenScope } from '../state/openOwnership';
import { refreshDownstreamProblems } from '../state/referenceDecisions';
import { useHeldFinishEdge, type HeldFinishEdgeEditor } from '../state/useHeldFinishEdge';
import { useHeldShellFace, type HeldShellFaceEditor } from '../state/useHeldShellFace';

interface Options {
  model: { doc: StudioDoc; index: number | null; problems: readonly Problem[]; bodies: readonly BodyResult[] };
  owner: {
    open: RefObject<OpenScope>;
    problemsByDoc: RefObject<WeakMap<StudioDoc, Problem[]>>;
    enabled: boolean;
    shellEnabled: boolean;
    current(): boolean;
    shellCurrent(): boolean;
  };
  worker: { engine: Pick<EngineClient, 'part'>; nextRevision(): number };
  changes: { commit(doc: StudioDoc): boolean; notice(value: FriendlyError): void; retireNotice(value: FriendlyError): void };
}

export function useStudioHeldReferences({ model, owner, worker, changes }: Options) {
  const { doc, problems } = model;
  const open = owner.open.current;
  const ownsSource = () => open === owner.open.current && owner.current()
    && owner.problemsByDoc.current.get(doc) === problems;
  const readPart = (next: StudioDoc) => worker.engine.part(next, worker.nextRevision(), 'refs');
  const evaluate = (next: StudioDoc, marker = next.nodes.length) => readPart(prefixDoc(next, marker));
  const refreshProblems = (next: StudioDoc, releasedNode: number, remaining: readonly Problem[], bodies: readonly BodyResult[]) =>
    refreshDownstreamProblems(next, releasedNode, remaining, bodies, readPart);
  const common = { ...model, refreshProblems, notice: changes.notice, retireNotice: changes.retireNotice };

  const finishEdgeEditor = useHeldFinishEdge({
    ...common, enabled: owner.enabled, ownsSource, evaluate,
    accept: (next, resolved, nextProblems) => {
      if (!changes.commit(next)) return false;
      owner.problemsByDoc.current.set(next, nextProblems ? [...nextProblems] : problems.filter(value => !resolved.includes(value)));
      return true;
    },
  });
  const shellFaceEditor = useHeldShellFace({
    ...common, enabled: owner.enabled && owner.shellEnabled,
    ownsSource: () => ownsSource() && owner.shellCurrent(),
    evaluate: next => evaluate(next),
    accept: (next, _resolved, nextProblems) => {
      if (!changes.commit(next)) return false;
      owner.problemsByDoc.current.set(next, [...nextProblems]);
      return true;
    },
  });

  const shellFaceReplacement: HeldShellFaceEditor | undefined = shellFaceEditor.available ? {
    start: shellFaceEditor.start, cancel: shellFaceEditor.cancel, apply: shellFaceEditor.apply, draft: shellFaceEditor.current,
  } : undefined;
  const edgeReplacement: HeldFinishEdgeEditor | undefined = finishEdgeEditor.available ? {
    start: finishEdgeEditor.start, cancel: finishEdgeEditor.cancel, apply: finishEdgeEditor.apply, draft: finishEdgeEditor.current,
    grouped: finishEdgeEditor.grouped, group: finishEdgeEditor.groupReview, selectSlot: finishEdgeEditor.selectSlot,
  } : undefined;

  return { finishEdgeEditor, shellFaceEditor, edgeReplacement, shellFaceReplacement };
}
