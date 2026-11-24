import { prefixDoc, type StudioDoc } from '@barocss/cad-model/engine/doc';
import type { BodyResult } from '@barocss/cad-model/engine/evaluate';
import { isRefusal } from '@barocss/cad-model/engine/refusal';
import { resolveSkeletons, SKELETON_CODES } from '@barocss/cad-model/frames/skeleton';
import type { createEvaluationEvidence } from '../state/evaluationEvidence';
import type { StudioParameterEdit } from '../state/useStudioModelEvaluation';
import type { WorkOwnership } from '../state/workOwnership';
import type { StudioNotice } from './studioNotice';

type ParameterPatch = Pick<StudioDoc, 'parameters' | 'nodes' | 'configurations'>;

interface StudioParameterOptions {
  model: { doc: StudioDoc; evaluated: StudioDoc; bodies: BodyResult[]; fresh: boolean; massReady: boolean; hasReferenceProblems: boolean };
  owner: { scope: object; document(): StudioDoc; work(): WorkOwnership<StudioDoc, StudioDoc>; showingVariant(): boolean };
  edit: { current: StudioParameterEdit | null; nextRequest(): number; stage(edit: StudioParameterEdit | null): void };
  evidence: Pick<ReturnType<typeof createEvaluationEvidence>, 'restoreAccepted' | 'retainAcceptedBodies' | 'discardUninstalled'>;
  canChangeDocument(): boolean;
  commit(next: StudioDoc): void;
  notice(next: StudioNotice): void;
}

export function createStudioParameterActions({ model, owner, edit, evidence, canChangeDocument, commit, notice }: StudioParameterOptions) {
  const { doc, evaluated, bodies, fresh, massReady, hasReferenceProblems } = model;
  const cancelCandidate = () => {
    if (edit.current?.base === doc) evidence.restoreAccepted(doc, bodies);
    evidence.discardUninstalled();
    edit.stage(null);
  };
  return {
    submit(patch: ParameterPatch) {
      const work = owner.work();
      const ownCandidate = work.run?.candidate && edit.current?.base === doc && edit.current.baseInput === evaluated
        && owner.document() === doc && owner.scope === work.scope;
      if (!ownCandidate && !canChangeDocument()) return;
      const request = edit.nextRequest();
      let resolved: StudioDoc;
      try {
        ({ doc: resolved } = resolveSkeletons({ ...doc, ...patch, configurations: patch.configurations || undefined }));
      } catch (error) {
        cancelCandidate();
        if (!isRefusal(error, ...SKELETON_CODES)) throw error;
        notice({ title: 'That value does not hold', hint: error.message.replace(/^\[\w+\] /, ''), detail: 'The parameters are as they were.' });
        return;
      }
      if (!fresh || !massReady || owner.showingVariant() || hasReferenceProblems) {
        cancelCandidate();
        const hint = hasReferenceProblems ? 'Choose the unresolved references first.'
          : !massReady ? 'Wait for the accepted part’s mass results before changing parameters.'
            : 'Wait for the accepted part to finish evaluating.';
        notice({ title: 'Parameters not changed', hint, detail: '' });
        return;
      }
      // The accepted result still owns deferred mass updates if the candidate is refused.
      evidence.retainAcceptedBodies(bodies);
      evidence.discardUninstalled();
      edit.stage({ request, base: doc, baseInput: evaluated, input: prefixDoc(resolved, resolved.nodes.length), next: resolved, accept: commit });
    },
    invalidInput(hint: string) {
      notice({ title: 'Parameters', hint, detail: '' });
    },
  };
}
