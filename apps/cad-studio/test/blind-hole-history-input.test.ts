import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { editFields } from '@barocss/cad-model/app/editFields';
import { featureNumberInvalid, featureNumberRange, historyNumberRule } from '../src/app/featureNumberInput';
import { NodeEditor } from '../src/ui/NodeEditor';
const hole = (depth?: number): ModelNode => ({ kind: 'hole', parent: { node: 0, side: 'solid' }, center: [8, 36.125], radius: 2, ...(depth === undefined ? {} : { depth }) });

test('only a stored Hole depth gains positive admission, without a 0.5 mm floor', () => {
  const nodes = [hole(6)], original = JSON.stringify(nodes);
  const rule = historyNumberRule(nodes, 0, 'depth'); assert.equal(rule, 'positive');
  for (const value of [0, -1, NaN, Infinity, '0', '-1']) assert.equal(featureNumberInvalid(value, rule!), true);
  for (const value of [0.05, 0.499, 8.25]) assert.equal(featureNumberInvalid(value, rule!), false);
  assert.equal(historyNumberRule([hole()], 0, 'depth'), undefined);
  for (const key of ['dia', 'c0', 'c1', 'csk']) assert.equal(historyNumberRule(nodes, 0, key), undefined);
  assert.equal(featureNumberRange(rule!), 'Greater than 0 mm');
  assert.equal(JSON.stringify(nodes), original);
});
test('existing History setters retain centre and source while a valid depth recovers', () => {
  const nodes = [hole(6)], original = JSON.stringify(nodes);
  const field = editFields(nodes, 0, {}).find(f => f.key === 'depth'); assert.ok(field?.kind === 'number');
  const next = field.set(nodes, 8.25);
  assert.deepEqual(next[0], { ...nodes[0], depth: 8.25 });
  assert.equal(JSON.stringify(nodes), original);
});
test('existing depth input exposes the positive rule and through has no depth input', () => {
  const render = (nodes: ModelNode[]) => renderToString(createElement(NodeEditor, { nodes, index: 0, parameters: {}, onApply() {}, onClose() {}, onRefuse() {} }));
  const html = render([hole(6)]);
  assert.match(html, /aria-label="Depth"[^>]*aria-describedby="history-range-depth"/);
  assert.match(html, /Greater than 0 mm/);
  assert.doesNotMatch(render([hole()]), /aria-label="Depth"/);
});
