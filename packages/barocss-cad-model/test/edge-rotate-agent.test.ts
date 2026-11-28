import test from 'node:test';
import assert from 'node:assert/strict';
import { dispatchTool } from '../src/chat/tools';
import { cylinderPart, rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const edge = 'n1.side0|n1.side1';
const doc = rectanglePart(30, 20, 10);
const evaluate = async (next: StudioDoc) => evaluateDoc(next, 1);
const command = { action: 'command', command: 'rotate', edges: [edge], expectedRevision: revisionOf(doc),
  values: { about: 'edge', angle: -30 } };

async function stateOf(doc: StudioDoc) {
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

test('Agent Rotate uses the exact current edge only in edge mode', async () => {
  const state = await stateOf(doc);
  assert.deepEqual(state.bodies[0].mesh.edges.find(candidate => candidate.names.includes(edge))?.a, [30, 0, 0]);
  const aboutEdge = await dispatchTool(state, 'features', command, evaluate);
  const ordinary = await dispatchTool(state, 'features', { ...command, values: { angle: -30 } }, evaluate);
  for (const [outcome, pivot] of [[aboutEdge, [30, 0, 0]], [ordinary, [15, 10, 5]]] as const) {
    assert.ok(outcome.changed && !outcome.isError, outcome.content);
    const node = outcome.state.doc.nodes.at(-1);
    assert.equal(node?.kind, 'rotate');
    assert.deepEqual([node.axis, node.angle, node.pivot], ['z', -30, pivot]);
  }
  assert.match(aboutEdge.content, /side0\|n1\.side1/);
});

test('Agent edge Rotate refuses invalid input without evaluating or altering the document', async () => {
  const state = await stateOf(doc);
  const neverEvaluate = () => assert.fail('Invalid inputs must be refused before evaluation.');
  const invalid = [
    { expectedRevision: undefined }, { expectedRevision: '0000000000000000' },
    { edges: [edge, edge] }, { edges: ['missing'] }, { faces: ['n1.top'] },
    { bodies: [state.bodies[0].key] }, { point: [0, 0, 0] },
    ...[0, 360, -361, Infinity, NaN, '30'].map(angle => ({ values: { about: 'edge', angle } })),
    { values: { about: 'point', angle: 30 } }, { values: { ...command.values, px: 0 } },
    { values: { ...command.values, axis: 'x' } },
  ];
  for (const patch of invalid) {
    const result = await dispatchTool(state, 'features', { ...command, ...patch }, neverEvaluate);
    assert.ok(result.isError && !result.changed, JSON.stringify(patch));
    assert.equal(result.state.doc, doc);
  }

  const cylinder = await stateOf(cylinderPart(10, 20));
  const rim = cylinder.bodies[0].mesh.edges.find(candidate => !candidate.nativeLine && candidate.names.length);
  assert.ok(rim);
  const result = await dispatchTool(cylinder, 'features', { ...command, edges: [rim.names[0]],
    expectedRevision: revisionOf(cylinder.doc) }, neverEvaluate);
  assert.match(result.content, /straight X, Y or Z edge/);
  assert.equal(result.state.doc, cylinder.doc);
});
