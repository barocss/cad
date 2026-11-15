import test from 'node:test';
import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToString } from 'react-dom/server.edge';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { editFields } from '@barocss/cad-model/app/editFields';
import { countersinkHistoryProblem } from '../src/app/countersinkHistoryInput';
import { NodeEditor } from '../src/ui/NodeEditor';

test('equal and smaller countersinks refuse; larger values recover without rounding', () => {
  for (const value of ['4', '3.75', '-1', 'Infinity', 'NaN']) assert.match(countersinkHistoryProblem(4, value)!, /greater than Diameter \(4 mm\)/);
  for (const value of [4.000000000000001, 6, 8]) assert.equal(countersinkHistoryProblem(4, value), null);
  assert.equal(countersinkHistoryProblem('', 4), null);
  assert.equal(countersinkHistoryProblem(4, ''), null);
  assert.ok(countersinkHistoryProblem('8', '6'));
});
test('real History setters preserve centre, array and source while the relation recovers', () => {
  const nodes: ModelNode[] = [{ kind: 'hole', parent: { node: 0, side: 'solid' }, radius: 2, center: [8, 12], countersink: 6, pattern: { count: 3, step: [10, 0] } }];
  const original = JSON.stringify(nodes);
  const fields = editFields(nodes, 0, {}), csk = fields.find(f => f.key === 'csk'), dia = fields.find(f => f.key === 'dia');
  assert.ok(csk?.kind === 'number' && dia?.kind === 'number');
  const refused = csk.set(nodes, 3.75);
  assert.ok(countersinkHistoryProblem(dia.get(refused), csk.get(refused)));
  const repaired = csk.set(refused, 8);
  assert.equal(countersinkHistoryProblem(dia.get(repaired), csk.get(repaired)), null);
  assert.deepEqual(repaired[0], { ...nodes[0], countersink: 8 });
  assert.equal(JSON.stringify(nodes), original);
});
test('the existing csk field exposes one associated local error and Apply remains disabled', () => {
  const nodes: ModelNode[] = [{ kind: 'hole', parent: { node: 0, side: 'solid' }, radius: 2, center: [8, 12], countersink: 4 }];
  const html = renderToString(createElement(NodeEditor, { nodes, index: 0, parameters: {}, onApply() {}, onClose() {}, onRefuse() {} }));
  assert.equal(html.split('Countersink Ø must be greater').length - 1, 1);
  assert.match(html, /aria-label="Countersink Ø"[^>]*aria-describedby="[^"]+"[^>]*aria-invalid="true"/);
  assert.match(html, /<button[^>]*disabled=""[^>]*>Apply<\/button>/);
});
