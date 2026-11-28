import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { extrudeDraftFailure, extrudeDraftDependentFilletFailure } from '../src/app/extrudeDraftFailure';
const nodes: ModelNode[] = [
  { id: 'n0', kind: 'sketch', profile: 'loop', segments: [{ kind: 'line', start: [-10, 0] }, { kind: 'arc', start: [10, 0], center: [0, 0], direction: 'ccw' }] },
  { id: 'n1', kind: 'extrude', sketch: 0, height: 10, draft: -10 },
];
const error = { title: 'Kernel error', hint: 'Undo', feature: 'n1', detail: 'drafted extrusion: the joint at (10, 0) between a curve and another wall is not tangent (not supported yet)' };
test('range refusal names the draft profile and preserves the native diagnostic', () => {
  for (const shape of ['half-disk', 'circular segment']) {
    const range = { ...error, detail: `drafted extrusion: the drafted ${shape} exceeds the ±10000 mm modeling coordinate range` };
    const result = extrudeDraftFailure(range, nodes, 1);
    assert.ok(result);
    assert.equal(result.title, `The drafted ${shape} exceeds the modeling range`);
    assert.equal(result.historyField, 'draft');
    assert.match(result.hint, /Draft or Distance/);
    assert.equal(result.detail, range.detail);
  }
});
test('collapse points to Draft, Distance and Reset without changing kernel evidence', () => {
  const collapse = { ...error, detail: 'draft closes the half-disk at or before the top' };
  assert.match(extrudeDraftFailure(collapse, nodes, 1)!.hint, /Draft or Distance/);
  assert.match(extrudeDraftFailure(collapse, nodes, 1)!.hint, /Reset/);
});
test('annular Extrude attributes its own angle and collapse errors to Draft', () => {
  const bounds = { ...error, detail: 'Annular Extrude Draft must be below 45 degrees in size.' };
  assert.deepEqual(extrudeDraftFailure(bounds, nodes, 1), { ...bounds, historyField: 'draft' });
  for (const detail of [
    'B-rep: annular walls draft: the drafted inner and outer walls reach or cross each other',
    'B-rep: annular walls draft: the draft reaches or crosses the bore axis',
  ]) {
    const failure = { ...error, detail };
    const displayed = extrudeDraftFailure(failure, nodes, 1);
    assert.ok(displayed);
    assert.equal(displayed.historyField, 'draft');
    assert.equal(displayed.detail, detail);
    assert.match(displayed.hint, /Draft or Distance/);
    assert.equal(extrudeDraftFailure({ ...failure, feature: 'n2' }, nodes, 1), undefined);
  }
});
test('unsupported joints and unrelated errors keep their original feedback', () => {
  assert.equal(extrudeDraftFailure(error, nodes, 1), undefined);
  assert.equal(extrudeDraftFailure({ ...error, feature: 'n2' }, nodes, 1), undefined);
  assert.equal(extrudeDraftFailure({ ...error, detail: 'unrelated' }, nodes, 1), undefined);
  const other: ModelNode[] = [{ id: 'n0', kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [20, 20] }, nodes[1]];
  assert.equal(extrudeDraftFailure(error, other, 1), undefined);
});

test('Draft-only edits identify a dependent Fillet and preserve its diagnostic', () => {
  const accepted: ModelNode[] = [...nodes, { kind: 'fillet', id: 'n2', parent: { node: 1, side: 'solid' }, edges: [], radius: 2 }];
  const candidate: ModelNode[] = [accepted[0], { ...nodes[1], draft: 35 } as ModelNode, accepted[2]];
  const failure = { ...error, feature: 'n2', failedFeature: 'Fillet (n2)', detail: 'actual kernel evidence' };
  const result = extrudeDraftDependentFilletFailure(failure, accepted, candidate, 1)!;
  assert.equal(result.historyField, 'draft'); assert.match(result.hint, /Reset.*another angle/);
  assert.equal(result.detail, failure.detail); assert.equal(result.failedFeature, failure.failedFeature);
  assert.equal(extrudeDraftDependentFilletFailure(failure, accepted, accepted, 1), undefined);
  assert.equal(extrudeDraftDependentFilletFailure({ ...failure, feature: 'n1' }, accepted, candidate, 1), undefined);
  const both = [...candidate]; both[1] = { ...candidate[1], height: 20 } as ModelNode;
  assert.equal(extrudeDraftDependentFilletFailure(failure, accepted, both, 1), undefined);
  const unrelated = [...candidate]; unrelated[2] = { ...accepted[2], parent: { node: 0, side: 'solid' } } as ModelNode;
  assert.equal(extrudeDraftDependentFilletFailure(failure, accepted, unrelated, 1), undefined);
});
