import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

function stock(height: number) {
  const sketch = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  return withNode(sketch, { kind: 'extrude', sketch: 0, height });
}

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const evaluated = await evaluate(doc);
  assert.ok(evaluated.ok);
  return { doc, bodies: evaluated.bodies };
}

const hole = { action: 'command', command: 'hole', faces: ['n1.top'], values: { type: 'through', x: 11, y: 9, d: 6 } };

test('a stale command pin refuses even when the selected face name is present in both revisions', async () => {
  const current = await stateOf(stock(10));
  const stale = revisionOf(stock(8));
  for (const faces of [hole.faces, ['unknown']]) {
    const refused = await dispatchTool(current, 'features', { ...hole, faces, expectedRevision: stale }, () => {
      assert.fail('a stale command must refuse before candidate evaluation');
    });
    assert.ok(refused.isError && !refused.changed, refused.content);
    assert.equal(refused.state, current);
    const { code, expectedRevision, revision } = JSON.parse(refused.content);
    assert.deepEqual([code, expectedRevision, revision], ['COMMAND_STALE', stale, revisionOf(current.doc)]);
  }
  for (const expectedRevision of [null, 0, 'bad-pin', 'FFFFFFFFFFFFFFFF']) {
    const malformed = await dispatchTool(current, 'features', { ...hole, expectedRevision }, evaluate);
    assert.ok(malformed.isError && !malformed.changed, malformed.content);
    assert.equal(JSON.parse(malformed.content).code, 'COMMAND_INPUT');
    assert.equal(malformed.state, current);
  }
  const accepted = await dispatchTool(current, 'features', { ...hole, expectedRevision: revisionOf(current.doc) }, evaluate);
  const unpinned = await dispatchTool(current, 'features', hole, evaluate);
  assert.ok(accepted.changed && !accepted.isError, accepted.content);
  assert.deepEqual(accepted.state.doc, unpinned.state.doc);
  const node = accepted.state.doc.nodes[2];
  assert.ok(node?.kind === 'hole' && node.radius === 3);
  assert.deepEqual(node.center, [11, 9]);
  const volume = accepted.state.bodies[0].volume;
  assert.ok(volume !== null && Math.abs(volume - (12000 - 90 * Math.PI)) < 1e-7);
});

test('a command pin is checked against the addressed part and the current batch position', async () => {
  const child = stock(10);
  const parent = await stateOf({
    ...stock(5),
    instances: [{ id: 'p1', name: 'Plate', doc: child, position: [50, 0, 0], rotation: [0, 0, 0] }],
  });
  const wrongScope = await dispatchTool(parent, 'features', { ...hole, part: 'p1', expectedRevision: revisionOf(parent.doc) }, evaluate);
  assert.equal(JSON.parse(wrongScope.content).code, 'COMMAND_STALE');
  assert.equal(wrongScope.state, parent);
  const correctScope = await dispatchTool(parent, 'features', { ...hole, part: 'p1', expectedRevision: revisionOf(child) }, evaluate);
  assert.ok(correctScope.changed && !correctScope.isError, correctScope.content);
  assert.equal(correctScope.state.doc.instances?.[0].doc.nodes[2].kind, 'hole');
  assert.deepEqual(correctScope.state.doc.nodes, parent.doc.nodes);

  const current = await stateOf(child);
  const rejected = await dispatchTool(current, 'features', { action: 'batch', ops: [
    { tool: 'features', args: { action: 'edit', index: 1, values: { h: 12 } } },
    { tool: 'features', args: { ...hole, expectedRevision: revisionOf(child) } },
  ] }, evaluate);
  assert.ok(rejected.isError && !rejected.changed, rejected.content);
  assert.equal(rejected.state, current);
  assert.equal(JSON.parse(rejected.content).failed_op, 1);
  assert.match(JSON.parse(rejected.content).error, /op 1 .*The part changed since the requested revision/);
});
