import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { featureId } from '@barocss/cad-model/engine/ids';
import type { FeatureFailure } from './failedFeature';
import type { Active } from './commandState';

export function extrudeDraftFailure(error: FeatureFailure, nodes: readonly ModelNode[], index: number): FeatureFailure | undefined {
  const node = nodes[index];
  if (node?.kind !== 'extrude' || error.feature !== featureId(nodes, index)) return;
  if (/draft closes/i.test(error.detail)) return { ...error, historyField: 'draft',
    hint: 'Reduce Draft or Distance so the walls stay apart, or Reset this edit to restore the accepted values.' };
  const sketch = nodes[node.sketch];
  if (typeof node.draft !== 'number' || node.draft >= 0 || typeof node.height !== 'number' || node.height <= 0
    || !/joint.*between a curve and another wall is not tangent/.test(error.detail)
    || sketch?.kind !== 'sketch' || sketch.profile !== 'loop' || sketch.segments.length !== 2) return;
  const arc = sketch.segments.find(s => s.kind === 'arc'), line = sketch.segments.find(s => s.kind === 'line');
  if (!arc || arc.kind !== 'arc' || !line || arc.direction !== 'ccw') return;
  const [x, y] = arc.start, [cx, cy] = arc.center;
  if (typeof x !== 'number' || typeof y !== 'number' || typeof cx !== 'number' || typeof cy !== 'number') return;
  if (!((x === cx) !== (y === cy)) || line.start[0] !== 2 * cx - x || line.start[1] !== 2 * cy - y) return;
  return { ...error, title: 'Outward Draft is not supported for this half-disk', historyField: 'draft',
    hint: 'Use a positive inward Draft angle, or 0 for straight walls. Reduce the angle or Distance if the inward walls close.' };
}

export function extrudeDraftFeedback(active: Active): FeatureFailure | undefined {
  if (active.cmd.id !== 'extrude' || active.preview !== 'error' || !active.error || !active.cmd.build) return;
  try {
    const candidate = active.cmd.build(active.ctx, active.values);
    const feedback = extrudeDraftFailure(active.error, candidate.nodes, candidate.nodes.length - 1);
    return feedback && { ...feedback, hint: feedback.hint.replace(', or Reset this edit to restore the accepted values.', '.') };
  } catch { return; }
}
