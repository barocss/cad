import { featureLabel, usesOf, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';
import { canonical } from '@barocss/cad-model/util/revision';
import type { Active } from './commandState';
import type { FeatureFailure } from './failedFeature';

/** Only a single native distance edit and its proven dependent Offset may own this recovery. */
export function offsetCollapseFailure(command: string, accepted: StudioDoc, candidate: StudioDoc, error: FeatureFailure): FeatureFailure | undefined {
  const side = error.detail === 'B-rep: drafted cap offset: the offset would close a section or cross the opposite wall';
  if (command !== 'offset-face-edit' || error.code !== 'GEOMETRY'
    || !side && error.detail !== 'B-rep: drafted cap offset: the offset would close a wall or cross the opposite cap'
    || accepted.nodes.length !== candidate.nodes.length
    || canonical({ ...accepted, nodes: [] }) !== canonical({ ...candidate, nodes: [] })) return;
  const changes = candidate.nodes.flatMap((n, i) => canonical(n) === canonical(accepted.nodes[i]) ? [] : [i]);
  if (changes.length !== 1) return;
  const index = changes[0], before = accepted.nodes[index], after = candidate.nodes[index];
  if (before.kind !== 'offset-face' || after.kind !== 'offset-face' || before.target || after.target
    || !Number.isFinite(before.distance) || !Number.isFinite(after.distance)
    || canonical({ ...before, distance: after.distance }) !== canonical(after)) return;
  const failed = candidate.nodes.flatMap((n, i) => featureId(candidate.nodes, i) === error.feature ? [i] : []);
  if (failed.length !== 1 || candidate.nodes[failed[0]].kind !== 'offset-face') return;
  const pending = [failed[0]], seen = new Set<number>();
  for (const i of pending) {
    if (seen.has(i) || i < index) continue;
    seen.add(i);
    pending.push(...usesOf(candidate.nodes[i], candidate.nodes));
  }
  if (!seen.has(index)) return;
  const parent = accepted.nodes[before.parent.node];
  if (!parent || before.faces.length !== 1) return;
  const basis = `${featureLabel(parent, before.parent.node, accepted.nodes)} (${featureId(accepted.nodes, before.parent.node)}) · ${before.faces[0]}`;
  const downstream = failed[0] !== index;
  return { ...error, title: downstream ? 'This edit closes a later Offset' : 'Offset reaches a geometry limit',
    hint: `${downstream ? 'Changing this distance makes the later Offset fail. ' : ''}${side ? 'The offset would close the section or cross the opposite wall.' : 'The offset would close a wall or cross the opposite cap.'} ${!downstream && typeof after.distance === 'number' && after.distance < 0 ? 'Reduce the inward move by using a less negative Offset. ' : ''}Distance starts at the original face of ${basis}, not the already offset face. Adjust Offset here or Cancel to keep the saved value (${before.distance} mm). The saved model has not changed.`, historyField: 'd' };
}
export function offsetCollapseFeedback(active: Active): FeatureFailure | undefined {
  const receipt = active.offsetCollapse;
  return active.preview === 'error' && receipt?.cmd === active.cmd && receipt.ctx === active.ctx
    && receipt.values === active.values && receipt.error === active.error ? receipt.error : undefined;
}
