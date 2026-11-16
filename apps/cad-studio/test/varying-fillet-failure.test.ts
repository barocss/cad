import test from 'node:test';
import assert from 'node:assert/strict';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { varyingFilletFailure } from '../src/app/varyingFilletFailure';
const nodes: ModelNode[] = [{ id: 'n0', kind: 'fillet', parent: { node: 0, side: 'solid' }, edges: ['rim'], radius: 1, radii: [{ at: [0, 0, 0], fraction: 0, radius: 1 }, { at: [1, 0, 0], fraction: .25, radius: 14 }, { at: [4, 0, 0], fraction: 1, radius: 2 }] }];
const error = { title: 'The fillet runs off its faces', hint: 'round that edge first', detail: 'CONTACT_LEAVES_FACE', feature: 'n0' };
test('varying contact refusal offers honest multi-radius and Reset recovery, retaining kernel evidence', () => {
  const result = varyingFilletFailure(error, nodes, 0);
  assert.match(result.hint, /does not identify a single radius/);
  assert.match(result.hint, /Start, End and interior radii and their positions/);
  assert.match(result.hint, /Reset/);
  assert.equal(result.detail, error.detail); assert.equal(result.feature, error.feature);
});
test('unrelated errors, downstream failures and constant fillets are not rewritten', () => {
  for (const other of [{ ...error, detail: 'OTHER_FAILURE' }, { ...error, feature: 'n1' }]) assert.equal(varyingFilletFailure(other, nodes, 0), other);
  const constant = [{ ...nodes[0], radii: undefined }] as ModelNode[];
  assert.equal(varyingFilletFailure(error, constant, 0), error);
});
