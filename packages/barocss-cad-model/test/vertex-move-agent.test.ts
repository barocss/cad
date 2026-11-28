import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTool } from '../src/chat/tools';
import type { StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const doc: StudioDoc = {
  format: 'barocss-cad-model', schema: 3, units: 'mm', nextId: 4, parameters: {},
  nodes: [
    { kind: 'sketch', id: 'n0', profile: 'rectangle', min: [2.25, -4.5], max: [14.25, 3.5] },
    { kind: 'extrude', id: 'n1', sketch: 0, from: 2.125, height: 6 },
    { kind: 'sketch', id: 'n2', profile: 'rectangle', min: [32.75, -9.25], max: [48.75, 0.75] },
    { kind: 'extrude', id: 'n3', sketch: 2, from: 11.625, height: 10 },
  ],
  outputs: { b1: { node: 1, side: 'solid' }, b3: { node: 3, side: 'solid' } },
};
const from = 'n1.side0|n1.side1', to = 'n3.bottom|n3.side0';
const values = { mode: 'vertex-to-vertex', sourceEndpoint: 'to', destinationEndpoint: 'from' };
const command = { action: 'command', command: 'move', edges: [from, to], expectedRevision: revisionOf(doc), values };
const evaluate = async (next: StudioDoc) => evaluateDoc(next, 1);

test('Agent Move reuses the authored endpoints and moves only the first solid', async () => {
  const initial = await evaluate(doc);
  assert.ok(initial.ok);
  const state = { doc, bodies: initial.bodies };
  const forward = await dispatchTool(state, 'features', command, evaluate);
  const reversed = await dispatchTool(state, 'features', { ...command, edges: [to, from],
    values: { ...values, sourceEndpoint: 'from', destinationEndpoint: 'to' } }, evaluate);
  const before = partBreps(doc);
  for (const [outcome, source, stationary, offset] of [
    [forward, 1, 'b3', [18.5, -4.75, 3.5]],
    [reversed, 3, 'b1', [-18.5, 4.75, -3.5]],
  ] as const) {
    assert.ok(outcome.changed && !outcome.isError, outcome.content);
    const node = outcome.state.doc.nodes.at(-1);
    assert.equal(node?.kind, 'translate');
    assert.deepEqual([node.parent.node, node.offset], [source, offset]);
    assert.deepEqual(partBreps(outcome.state.doc).find(body => body.key === stationary), before.find(body => body.key === stationary));
  }
});

test('Agent native vertex Move refuses invalid roles, stale revisions and coordinate overrides', async () => {
  const initial = await evaluate(doc);
  assert.ok(initial.ok);
  const state = { doc, bodies: initial.bodies };
  const neverEvaluate = () => assert.fail('The invalid Move must refuse before evaluation.');
  for (const patch of [
    { expectedRevision: undefined }, { expectedRevision: '0000000000000000' },
    { edges: [from, from] }, { edges: [from, 'n1.side0|n1.top'] }, { point: [0, 0, 0] },
    { values: { ...values, sourceEndpoint: 'middle' } }, { values: { ...values, destinationEndpoint: undefined } },
    { values: { ...values, x: 5 } }, { bodies: ['b1'] },
  ]) {
    const result = await dispatchTool(state, 'features', { ...command, ...patch }, neverEvaluate);
    assert.ok(result.isError && !result.changed, JSON.stringify(patch));
    assert.equal(result.state.doc, doc);
  }
});

test('Agent Move adds no history when the chosen native vertices already coincide', async () => {
  const touching: StudioDoc = { ...doc, nodes: doc.nodes.map(node => {
    if (node.kind === 'sketch' && node.id === 'n2') return { ...node, min: [14.25, -4.5], max: [30.25, 5.5] };
    if (node.kind === 'extrude' && node.id === 'n3') return { ...node, from: 8.125 };
    return node;
  }) };
  const evaluated = await evaluate(touching);
  assert.ok(evaluated.ok);
  const result = await dispatchTool({ doc: touching, bodies: evaluated.bodies }, 'features',
    { ...command, expectedRevision: revisionOf(touching) }, () => assert.fail('A coincident pair must refuse before evaluation.'));
  assert.ok(result.isError && !result.changed);
  assert.match(result.content, /already coincide/);
  assert.equal(result.state.doc, touching);
});
