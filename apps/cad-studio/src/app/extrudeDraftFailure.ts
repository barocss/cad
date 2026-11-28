import { usesOf, type ModelNode } from '@barocss/cad-model/engine/doc';
import { featureId, nodeIndexOf } from '@barocss/cad-model/engine/ids';
import type { FeatureFailure } from './failedFeature';
import type { Active } from './commandState';

export function extrudeDraftFailure(error: FeatureFailure, nodes: readonly ModelNode[], index: number): FeatureFailure | undefined {
  const node = nodes[index];
  if (node?.kind !== 'extrude' || error.feature !== featureId(nodes, index)) return;
  if (error.detail === 'Annular Extrude Draft must be below 45 degrees in size.') return { ...error, historyField: 'draft' };
  const annularCollapse = /^(?:B-rep: )?annular walls draft: (?:the drafted inner and outer walls reach or cross each other|the draft reaches or crosses the bore axis)$/.test(error.detail);
  if (annularCollapse || /draft closes/i.test(error.detail)) return { ...error, historyField: 'draft',
    hint: 'Reduce Draft or Distance so the walls stay apart, or Reset this edit to restore the accepted values.' };
  const rangeShape = /drafted (half-disk|circular segment) exceeds.*modeling coordinate range/i.exec(error.detail)?.[1];
  if (rangeShape) return { ...error, title: `The drafted ${rangeShape} exceeds the modeling range`, historyField: 'draft',
    hint: 'Reduce Draft or Distance so the part fits inside the modeling range.' };
}

export function extrudeDraftFeedback(active: Active): FeatureFailure | undefined {
  if (active.cmd.id !== 'extrude' || active.preview !== 'error' || !active.error || !active.cmd.build) return;
  try {
    const candidate = active.cmd.build(active.ctx, active.values);
    const feedback = extrudeDraftFailure(active.error, candidate.nodes, candidate.nodes.length - 1);
    return feedback && { ...feedback, hint: feedback.hint.replace(', or Reset this edit to restore the accepted values.', '.') };
  } catch { return; }
}

/** Attribute downstream refusal only when Draft is the sole changed Extrude property. */
export function extrudeDraftDependentFilletFailure(error: FeatureFailure, accepted: readonly ModelNode[], candidate: readonly ModelNode[], index: number): FeatureFailure | undefined {
  const before = accepted[index], after = candidate[index];
  if (before?.kind !== 'extrude' || after?.kind !== 'extrude' || before.draft === after.draft
    || JSON.stringify({ ...before, draft: after.draft }) !== JSON.stringify(after) || !error.feature) return;
  const failed = nodeIndexOf(candidate, error.feature);
  if (failed <= index || candidate[failed]?.kind !== 'fillet') return;
  const pending = [failed], seen = new Set<number>();
  for (const i of pending) {
    if (i === index) return { ...error, title: 'This Draft change prevents the later Fillet', historyField: 'draft',
      hint: 'Reset to restore the accepted Draft angle, or try another angle. The later Fillet and its kernel diagnostic are shown below.' };
    if (seen.has(i) || !candidate[i]) continue;
    seen.add(i); pending.push(...usesOf(candidate[i], candidate));
  }
}
