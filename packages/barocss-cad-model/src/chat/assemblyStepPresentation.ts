import type { StepState } from '../assembly/steps';
import type { StudioDoc } from '../engine/doc';
import { requirementEvidenceRevision, digestOf } from '../util/digest';
import { isObj } from '../util/guards';
import type { JsonSchema } from './contract';

export const stepDigestSchema = { type: 'string', pattern: '^[a-f0-9]{64}$' } satisfies JsonSchema;
export const stepPresentationInput = {
  type: 'object',
  description: 'Read a static presentation for step_index with include_steps true. Caller-supplied evidence digests pin that context.',
  properties: {
    reference_digest: { ...stepDigestSchema, description: 'SHA-256 of the reference evidence supplied by the caller.' },
    checklist_digest: { ...stepDigestSchema, description: 'SHA-256 of the review checklist supplied by the caller.' },
    expected_revision: { ...stepDigestSchema, description: 'Prior presentation revision. A different revision returns STEP_PRESENTATION_STALE.' },
  },
  additionalProperties: false,
} satisfies JsonSchema;

export function readStepPresentation(doc: StudioDoc, state: StepState, input: unknown) {
  if (!isObj(input)) return { error: 'step_presentation must be an object.', code: 'VALUE' };
  for (const [key, value] of Object.entries(input)) {
    if (!Object.hasOwn(stepPresentationInput.properties, key)
      || typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) {
      return { error: 'step_presentation accepts reference_digest, checklist_digest and expected_revision as lowercase SHA-256 digests.', code: 'VALUE' };
    }
  }
  const parts = doc.instances ?? [];
  const included = new Set([...state.installed, ...state.active]);
  const saved = {
    scope: 'saved-static-assembly-step',
    step: { index: state.index, id: state.step.id, name: state.step.name },
    camera: state.step.view ?? null,
    explode_scale: state.step.explode ?? 0,
    visibility: {
      waiting_policy: 'hide',
      shown: parts.filter(part => !part.hidden && included.has(part.id)).map(part => part.id),
      hidden_by_document: parts.filter(part => part.hidden).map(part => part.id),
    },
    installed: state.installed,
    active: state.active,
    waiting: state.waiting,
    unresolved: state.unresolved,
    evidence: { reference_digest: input.reference_digest ?? null, checklist_digest: input.checklist_digest ?? null },
    model_revision: requirementEvidenceRevision({ ...doc, assemblySteps: undefined }),
  };
  const revision = digestOf(saved);
  if (input.expected_revision !== undefined && input.expected_revision !== revision)
    return { error: 'The saved assembly presentation or its evidence changed. Read it again before reusing the review.', code: 'STEP_PRESENTATION_STALE' };
  return { presentation: { ...saved, revision } };
}
