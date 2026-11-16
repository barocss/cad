import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { extrudeDraftFailure } from '../src/app/extrudeDraftFailure';
const nodes: ModelNode[] = [
  { id: 'n0', kind: 'sketch', profile: 'loop', segments: [{ kind: 'line', start: [-10, 0] }, { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' }] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 10, draft: -10 },
];
const error = { title: 'Kernel error', hint: 'Undo', feature: 'n1', detail: 'drafted extrusion: the joint at (10, 0) between a curve and another wall is not tangent (not supported yet)' };
test('recognized outward half-disk explains supported inward/straight recovery', () => {
  const result = extrudeDraftFailure(error, nodes, 1)!;
  assert.equal(result.historyField, 'draft'); assert.match(result.hint, /positive inward/); assert.match(result.hint, /0 for straight/); assert.equal(result.detail, error.detail);
});
test('collapse points to Draft, Distance and Reset without changing kernel evidence', () => {
  const collapse = { ...error, detail: 'draft closes the half-disk at or before the top' };
  assert.match(extrudeDraftFailure(collapse, nodes, 1)!.hint, /Draft or Distance/);
  assert.match(extrudeDraftFailure(collapse, nodes, 1)!.hint, /Reset/);
});
test('unknown profiles, wrong feature and unrelated errors receive no inward-support promise', () => {
  assert.equal(extrudeDraftFailure({ ...error, feature: 'n2' }, nodes, 1), undefined);
  assert.equal(extrudeDraftFailure({ ...error, detail: 'unrelated' }, nodes, 1), undefined);
  const other: ModelNode[] = [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] }, nodes[1]];
  assert.equal(extrudeDraftFailure(error, other, 1), undefined);
});
