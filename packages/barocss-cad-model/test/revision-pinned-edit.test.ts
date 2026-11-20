import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

function stock(height = 8) {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 20] });
  return withNode(sketch, { kind: 'extrude', sketch: 0, height });
}

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const edit = (state: ChatState, input: Record<string, unknown>, read = evaluate) =>
  dispatchTool(state, 'features', { action: 'edit', index: 1, values: { h: 12 }, ...input }, read);

async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  return { doc, bodies: evaluated.bodies };
}

test('a revision pin guards both value edits and whole-node replacement before evaluating', async () => {
  const first = await stateOf(stock());
  const pin = revisionOf(first.doc);
  const updated = await edit(first, { expectedRevision: pin });
  assert.ok(updated.changed && !updated.isError, updated.content);
  const volume = updated.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - 9600) < 1e-7);
  const next = updated.state;
  const neverEvaluate = async (): Promise<never> => assert.fail('a rejected revision never evaluates the candidate');
  for (const input of [{ values: { from: 2 } }, { feature: { kind: 'extrude', sketch: 0, height: 10 } }]) {
    const result = await edit(next, { ...input, expectedRevision: pin }, neverEvaluate);
    assert.ok(result.isError && !result.changed);
    assert.equal(result.state, next);
    const { code, expectedRevision, revision } = JSON.parse(result.content);
    assert.deepEqual([code, expectedRevision, revision], ['EDIT_STALE', pin, revisionOf(next.doc)]);
  }
  for (const expectedRevision of [null, 0, 'bad-pin', 'FFFFFFFFFFFFFFFF']) {
    const invalid = await edit(next, { expectedRevision }, neverEvaluate);
    assert.ok(invalid.isError && !invalid.changed);
    assert.equal(JSON.parse(invalid.content).code, 'EDIT_INPUT');
  }
  const unpinned = await edit(first, {});
  assert.ok(unpinned.changed && !unpinned.isError, unpinned.content);
  assert.deepEqual(unpinned.state.doc, next.doc);
});

test('a placed-part edit compares to rebuild in the same part scope', async () => {
  const child = stock();
  const parent = await stateOf({
    ...stock(5),
    instances: [{ id: 'p1', name: 'Plate', doc: child, position: [50, 0, 0], rotation: [0, 0, 0] }],
  });
  const rebuild = await dispatchTool(parent, 'query', { action: 'rebuild', part: 'p1' }, evaluate);
  assert.ok(!rebuild.isError, rebuild.content);
  const { revision: partPin } = JSON.parse(rebuild.content);
  assert.notEqual(partPin, revisionOf(parent.doc));
  const wrongScope = await edit(parent, { part: 'p1', expectedRevision: revisionOf(parent.doc) });
  assert.equal(JSON.parse(wrongScope.content).code, 'EDIT_STALE');
  assert.equal(JSON.parse(wrongScope.content).revision, partPin);
  assert.equal(wrongScope.state, parent);
  const correctScope = await edit(parent, { part: 'p1', expectedRevision: partPin });
  assert.ok(correctScope.changed && !correctScope.isError, correctScope.content);
  const extrusion = correctScope.state.doc.instances?.[0].doc.nodes[1];
  assert.ok(extrusion?.kind === 'extrude');
  assert.equal(extrusion.height, 12);
  assert.deepEqual(correctScope.state.doc.nodes, parent.doc.nodes);
  assert.deepEqual(parent.doc.instances?.[0].doc, child);
});

test('a pin at a stale batch position leaves earlier staged edits unapplied', async () => {
  const before = await stateOf(stock());
  const pin = revisionOf(before.doc);
  const rejected = await dispatchTool(before, 'features', { action: 'batch', ops: [
    { tool: 'features', args: { action: 'edit', index: 1, values: { h: 12 }, expectedRevision: pin } },
    { tool: 'features', args: { action: 'edit', index: 1, values: { from: 2 }, expectedRevision: pin } },
  ] }, evaluate);
  assert.ok(rejected.isError && !rejected.changed, rejected.content);
  assert.equal(rejected.state, before);
  assert.equal(JSON.parse(rejected.content).failed_op, 1);
});
