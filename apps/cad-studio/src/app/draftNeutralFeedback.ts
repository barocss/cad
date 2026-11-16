import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import { featureId } from '@barocss/cad-model/engine/ids';
import type { Active } from './commandState';
import type { FeatureFailure } from './failedFeature';

/** A kernel refusal, not a speculative restriction on otherwise valid neutral planes. */
export function draftNeutralFeedback(active: Active): FeatureFailure | undefined {
  const error = active.error;
  if (active.preview !== 'error' || !error || error.code !== 'CAPABILITY'
    || error.detail !== 'Draft on adjacent box sides needs the neutral plane at the start of the pull'
    || !['draft', DRAFT_EDIT].includes(active.cmd.id) || active.values.neutralMode !== 'fixed'
    || !active.cmd.build || !error.feature) return;
  try {
    const candidate = active.cmd.build(active.ctx, active.values);
    const changes = candidate.nodes.flatMap((node, i) => node === active.ctx.doc.nodes[i] ? [] : [i]);
    if (changes.length !== 1) return;
    const index = changes[0], node = candidate.nodes[index];
    if (node.kind !== 'draft' || node.faces.length !== 2 || featureId(candidate.nodes, index) !== error.feature) return;
    return { ...error, title: 'This neutral coordinate cannot draft the adjacent faces',
      hint: 'Choose Body end under Neutral plane to place it at the start of the pull. Your selected faces and saved model are unchanged.', historyField: 'neutral' };
  } catch { return; }
}
