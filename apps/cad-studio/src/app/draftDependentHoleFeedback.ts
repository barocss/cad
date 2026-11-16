import { DRAFT_EDIT } from '@barocss/cad-model/app/draftEdit';
import { nodeIndexOf } from '@barocss/cad-model/engine/ids';
import { usesOf } from '@barocss/cad-model/engine/doc';
import type { Active } from './commandState';
import type { FeatureFailure } from './failedFeature';

/** Keep downstream-hole recovery actionable in the current Draft editor. */
export function draftDependentHoleFeedback(active: Active): FeatureFailure | undefined {
  const error = active.error;
  if (active.cmd.id !== DRAFT_EDIT || active.preview !== 'error' || !error?.feature || !active.cmd.build) return;
  try {
    const candidate = active.cmd.build(active.ctx, active.values);
    const changes = candidate.nodes.flatMap((node, i) => node === active.ctx.doc.nodes[i] ? [] : [i]);
    if (changes.length !== 1 || candidate.nodes[changes[0]]?.kind !== 'draft') return;
    const failed = nodeIndexOf(candidate.nodes, error.feature);
    if (candidate.nodes[failed]?.kind !== 'hole' || failed <= changes[0]) return;
    const pending = [failed], seen = new Set<number>();
    for (const index of pending) {
      if (index === changes[0]) return { ...error,
        title: 'This Draft change prevents the later Hole',
        hint: 'Restore the previous Pull or Angle, or cancel this edit. To move the Hole centre, cancel first and edit that Hole in History.' };
      if (seen.has(index) || !candidate.nodes[index]) continue;
      seen.add(index); pending.push(...usesOf(candidate.nodes[index], candidate.nodes));
    }
  } catch { /* Keep the original diagnostic if the candidate cannot be resolved. */ }
}
