import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

function addBox(doc: StudioDoc, x: number, w: number, d: number, h: number): StudioDoc {
  return withNode(withNode(doc, { kind: 'sketch', profile: 'rectangle', min: [x, 0], max: [x + w, d] }),
    { kind: 'extrude', sketch: doc.nodes.length, height: h });
}

const boxes = () => addBox(addBox(addBox(emptyDoc(), 0, 40, 20, 8), 60, 20, 10, 5), 120, 15, 12, 10);
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
const remove = (state: ChatState, args: Record<string, unknown>, read = evaluate) =>
  dispatchTool(state, 'features', { action: 'delete', ...args }, read);
const neverEvaluate = async (): Promise<never> => assert.fail('a stale or malformed delete must refuse before evaluating');
const ids = (doc: StudioDoc) => doc.nodes.map(node => node.id);
const action = (index: number, expectedRevision?: string) =>
  ({ tool: 'features', args: { action: 'delete', index, ...(expectedRevision ? { expectedRevision } : {}) } });

async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

test('a stale delete cannot use a reused position and a fresh delete preserves other solids', async () => {
  const reviewed = await stateOf(boxes());
  const prior = revisionOf(reviewed.doc);
  const first = await remove(reviewed, { index: 1, expectedRevision: prior });
  assert.ok(first.changed && !first.isError, first.content);
  const current = first.state, revision = revisionOf(current.doc);
  assert.equal(reviewed.doc.nodes[3].id, 'n3');
  assert.equal(current.doc.nodes[3].id, 'n5');
  assert.notEqual(revision, prior);

  for (const index of [3, 99]) {
    const refusal = await remove(current, { index, expectedRevision: prior }, neverEvaluate);
    assert.ok(refusal.isError && !refusal.changed);
    assert.equal(refusal.state, current);
    assert.deepEqual(JSON.parse(refusal.content), {
      ok: false, error: 'The part changed since the requested revision. Review the current part again before deleting the feature.',
      code: 'DELETE_STALE', expectedRevision: prior, revision, kept: 'the part is unchanged',
    });
  }
  for (const expectedRevision of [null, false, 'bad-pin', 'FFFFFFFFFFFFFFFF']) {
    const refusal = await remove(current, { index: 3, expectedRevision }, neverEvaluate);
    assert.ok(refusal.isError && !refusal.changed);
    assert.equal(refusal.state, current);
    assert.equal(JSON.parse(refusal.content).code, 'DELETE_INPUT');
  }

  const accepted = await remove(current, { index: 1, expectedRevision: revision });
  const legacy = await remove(current, { index: 1 });
  assert.ok(accepted.changed && !accepted.isError && legacy.changed && !legacy.isError);
  assert.deepEqual(accepted.state.doc, legacy.state.doc);
  assert.deepEqual(ids(accepted.state.doc), ['n4', 'n5']);
  assert.deepEqual(ids(current.doc), ['n2', 'n3', 'n4', 'n5']);
  assert.deepEqual(Object.keys(accepted.state.doc.outputs ?? {}), ['b5']);
  assert.ok(Math.abs((accepted.state.bodies[0].volume ?? 0) - 1800) < 1e-7);
});

test('a pin resolves in the addressed part and at the current batch position', async () => {
  const child = boxes(), root = addBox(emptyDoc(), 0, 7, 6, 5);
  const parent = await stateOf({ ...root, instances: [{ id: 'p1', name: 'Stock', doc: child, position: [200, 0, 0], rotation: [0, 0, 0] }] });
  const rebuild = await dispatchTool(parent, 'query', { action: 'rebuild', part: 'p1' }, evaluate);
  assert.ok(!rebuild.isError, rebuild.content);
  const { revision: childPin } = JSON.parse(rebuild.content);
  const evaluated: (string | undefined)[][] = [];
  const wrongScope = await remove(parent, { part: 'p1', index: 3, expectedRevision: revisionOf(parent.doc) }, doc => {
    evaluated.push(ids(doc));
    return evaluate(doc);
  });
  assert.equal(JSON.parse(wrongScope.content).code, 'DELETE_STALE');
  assert.equal(JSON.parse(wrongScope.content).revision, childPin);
  assert.equal(wrongScope.state, parent);
  assert.deepEqual(evaluated, [ids(child)], 'the dispatcher reads the placed part without evaluating a delete');
  const correctScope = await remove(parent, { part: 'p1', index: 3, expectedRevision: childPin });
  assert.ok(correctScope.changed && !correctScope.isError, correctScope.content);
  assert.deepEqual(ids(correctScope.state.doc.instances![0].doc), ['n0', 'n1', 'n4', 'n5']);
  assert.deepEqual(correctScope.state.doc.nodes, root.nodes);

  const current = await stateOf(child), pin = revisionOf(child);
  const rejected = await dispatchTool(current, 'features', { action: 'batch', ops: [action(1, pin), action(3, pin)] }, evaluate);
  assert.ok(rejected.isError && !rejected.changed);
  assert.equal(rejected.state, current);
  assert.equal(JSON.parse(rejected.content).failed_op, 1);
  assert.match(JSON.parse(rejected.content).error, /part changed since the requested revision/);
  assert.deepEqual(ids(current.doc), ['n0', 'n1', 'n2', 'n3', 'n4', 'n5']);
});
