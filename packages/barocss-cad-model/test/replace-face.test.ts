import assert from 'node:assert/strict';
import test from 'node:test';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { directFaceDocumentProblem, emptyDoc, parentsOf, usesOf, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart, partBreps } from '../src/engine/evaluate';
import { readStudioDoc } from '../src/engine/migrate';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 0);
async function stateOf(doc: StudioDoc): Promise<ChatState> {
  const result = await evaluate(doc);
  assert.ok(result.ok);
  return { doc, bodies: result.bodies };
}

function witness() {
  const footprint = withNode(emptyDoc(), { kind: 'sketch', profile: 'rectangle', min: [0, 0], max: [40, 30] });
  const stock = withNode(footprint, { kind: 'extrude', sketch: 0, height: 10 });
  const profile = withNode(stock, { kind: 'sketch', profile: 'polygon', points: [[28, 0], [37, 0], [42, 10], [32, 10]],
    plane: { origin: [0, 70, 0], normal: [0, -1, 0], xAxis: [1, 0, 0] } });
  const donor = withNode(profile, { kind: 'extrude', sketch: 2, height: 10 });
  return withNode(donor, { kind: 'translate', parent: { node: 3, side: 'solid' }, offset: [0, 0, 0] });
}

const command = { action: 'command', command: 'replace-face', faces: ['n1.side1', 'n3.side1'] };
const near = (value: number | null | undefined, expected: number) =>
  assert.ok(typeof value === 'number' && Math.abs(value - expected) < 1e-7, String(value));

test('Replace face reads the tilted donor without consuming it and keeps the authored reference across Open', async () => {
  const doc = witness(), original = await stateOf(doc), before = partBreps(doc);
  const reply = await dispatchTool(original, 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
  assert.ok(!reply.isError && reply.changed, reply.content);
  const candidate = reply.state.doc, node = candidate.nodes[5];
  assert.ok(node?.kind === 'replace-face' && node.sigs);
  assert.deepEqual(node.faces, ['n1.side1']);
  assert.deepEqual(parentsOf(node), [1]);
  assert.deepEqual(usesOf(node), [1, 4]);
  assert.equal(node.target.feature, 'n4');
  assert.equal(node.target.face, 'n3.side1');
  assert.deepEqual(candidate.nodes.slice(0, 5), doc.nodes);
  const reopened = readStudioDoc(JSON.stringify(candidate));
  assert.ok('doc' in reopened);
  const after = await stateOf(reopened.doc);
  near(after.bodies.find(body => body.key === 'b5')?.volume, 11850);
  assert.deepEqual(partBreps(reopened.doc).find(body => body.key === 'b4'), before.find(body => body.key === 'b4'));

  const moved = structuredClone(candidate), translate = moved.nodes[4];
  assert.ok(translate.kind === 'translate');
  translate.offset[0] = 2;
  const updated = await stateOf(moved);
  near(updated.bodies.find(body => body.key === 'b5')?.volume, 12450);
  assert.deepEqual(moved.nodes[5], node);
  const stale = await dispatchTool(updated, 'features', { ...command, expectedRevision: revisionOf(doc) }, evaluate);
  assert.equal(JSON.parse(stale.content).code, 'COMMAND_STALE');
  assert.equal(stale.state.doc, moved);
});

test('Replace face refuses either-end collapse and a changed or missing saved reference', async () => {
  const start = await stateOf(witness());
  const reply = await dispatchTool(start, 'features', command, evaluate);
  assert.ok(!reply.isError && reply.changed, reply.content);
  const accepted = reply.state.doc;
  const collapsed = structuredClone(accepted), move = collapsed.nodes[4];
  assert.ok(move.kind === 'translate');
  move.offset[0] = -37;
  const refused = await evaluate(collapsed);
  assert.ok(!refused.ok);
  assert.match(refused.error.detail, /reach or cross the opposite wall/);
  const reshaped = structuredClone(accepted), sketch = reshaped.nodes[2];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  sketch.points[2] = [43, 10];
  const reshapedResult = await evaluate(reshaped);
  assert.ok(!reshapedResult.ok);
  assert.match(reshapedResult.error.detail, /original reference face changed/);
  const malformed = structuredClone(accepted), node = malformed.nodes[5];
  assert.ok(node.kind === 'replace-face');
  node.target.feature = 'missing';
  assert.match(directFaceDocumentProblem(malformed) ?? '', /reference feature identity/);
  const bad = await dispatchTool(start, 'features', { ...command, faces: ['n1.side1', 'n1.side3'] }, evaluate);
  assert.ok(bad.isError && !bad.changed);
  assert.equal(bad.state.doc, start.doc);
});
