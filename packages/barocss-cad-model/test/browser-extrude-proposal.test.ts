import assert from 'node:assert/strict';
import test from 'node:test';
import { acceptProposal, previewProposal, proposeBrowserExtrude, runTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const neverEvaluate = async (): Promise<never> => assert.fail('A refused request must not evaluate a candidate');

async function stock(height = 10): Promise<ChatState> {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const doc = withNode(sketch, { kind: 'extrude', sketch: 0, height });
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

test('browser Extrude stages one exact value change for the user to approve', async () => {
  const state = await stock();
  const expectedRevision = revisionOf(state.doc), body = state.bodies[0].key;
  const args = { body, height: 15, expectedRevision };
  const outcome = await proposeBrowserExtrude(state, args, evaluate);
  assert.ok(outcome.changed && !outcome.isError, outcome.content);
  const waiting = outcome.state;
  const proposal = waiting.doc.proposals?.at(-1);
  assert.ok(proposal && proposal.status === 'open');
  assert.equal(proposal.by.agent, 'browser');
  assert.equal(waiting.doc.nodes, state.doc.nodes);
  assert.equal(waiting.bodies, state.bodies);
  assert.equal(revisionOf(waiting.doc), expectedRevision);
  for (const [version, fields] of [
    [waiting, args],
    [state, { ...args, body: 'other' }],
    [state, { ...args, height: 10 }],
    [state, { ...args, height: Infinity }],
    [state, { ...args, height: -1 }],
    [await stock(11), args],
  ] as const) {
    const refused = await proposeBrowserExtrude(version, fields, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.equal(refused.state, version);
  }
  const preview = await previewProposal(waiting, proposal.id, evaluate);
  assert.ok('bodies' in preview);
  assert.equal(preview.bodies[0].volume, 18000);
  assert.equal(waiting.bodies[0].volume, 12000);

  const prior = process.env.CAD_AUTONOMY;
  try {
    process.env.CAD_AUTONOMY = '4';
    const refused = await runTool(waiting, 'proposals', { action: 'accept', id: proposal.id }, neverEvaluate);
    assert.ok(refused.isError && !refused.changed);
    assert.match(refused.content, /browser proposal needs approval/);
    assert.deepEqual(await acceptProposal(waiting, proposal.id, neverEvaluate, { by: { agent: 'chat' } }),
      { error: 'A browser proposal needs approval by the user in Studio.' });
  } finally {
    if (prior === undefined) delete process.env.CAD_AUTONOMY;
    else process.env.CAD_AUTONOMY = prior;
  }
  const applied = await acceptProposal(waiting, proposal.id, evaluate);
  assert.ok('state' in applied);
  assert.equal(applied.state.bodies[0].volume, 18000);
  assert.equal(applied.state.doc.proposals?.at(-1)?.decided?.by, 'user');
});
