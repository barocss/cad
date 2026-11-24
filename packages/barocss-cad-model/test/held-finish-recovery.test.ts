import test from 'node:test';
import assert from 'node:assert/strict';
import { lookKey } from '../src/app/lookKey';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, type StudioDoc } from '../src/engine/doc';
import { evaluatePart } from '../src/engine/evaluate';
import { toSig, captureSignatures, verifyReferences } from '../src/engine/references';
import { signaturesOf } from '../src/engine/rematch';
import { revisionOf } from '../src/util/revision';

const names = ['n1.side1|n1.side2', 'n1.side0|n1.side1', 'n1.side2|n1.side3'];
const parent = { node: 1, side: 'solid' } as const;
const evaluate = async (doc: StudioDoc) => evaluatePart(doc, 1);
async function fixture() {
  const original = [[0,-12], [20,-12], [20,20], [15,20], [15,15], [5,15], [5,20], [0,20]] as [number, number][];
  const changed = [[0,0], [20,0], [20,5], [5,5], [5,20], [0,20]] as [number, number][];
  const stock = withNode(withNode(emptyDoc(), { kind: 'sketch', profile: 'polygon', points: original }), { kind: 'extrude', sketch: 0, height: 3 });
  const old = await evaluate(stock);
  assert.ok(old.ok);
  const signed = captureSignatures(withNode(stock, { kind: 'fillet', parent, edges: names, radius: 2 }), old.bodies);
  const sketch = signed.nodes[0];
  assert.ok(sketch.kind === 'sketch' && sketch.profile === 'polygon');
  const doc = { ...signed, nodes: [{ ...sketch, points: changed }, ...signed.nodes.slice(1)] };
  const checked = await verifyReferences(doc, [], evaluate);
  assert.equal(checked.problems.length, 3);
  const current = await evaluate(checked.doc);
  assert.ok(current.ok);
  return { state: { doc: checked.doc, bodies: current.bodies }, problems: checked.problems, signed };
}
async function summary(state: ChatState, args: Record<string, unknown> = {}) {
  const result = await dispatchTool(state, 'query', { action: 'summary', ...args }, evaluate);
  assert.equal(result.isError, false, result.content);
  assert.equal(result.changed, false);
  assert.equal(result.state, state);
  return JSON.parse(result.content).held_finish_recovery;
}

test('summary keeps authored slot order and reports only the current native pick page', async () => {
  const { state, problems } = await fixture();
  const before = structuredClone(state);
  const recovery = await summary(state);
  assert.deepEqual([recovery.feature, recovery.body, recovery.revision, recovery.mode, recovery.page, recovery.pages],
    ['n2', 'b2', revisionOf(state.doc), 'studio_history_review', 1, 1]);
  assert.deepEqual(recovery.slots, problems.map((problem, i) => ({
    slot: i + 1, authored_edge: names[i], signature_matches: problem.candidates,
  })));
  assert.equal(recovery.pick_edges.length, 18);
  const edge = recovery.pick_edges.find((pick: { name: string }) => pick.name === names[2]);
  assert.deepEqual([edge.from, edge.to].sort(), [[5,5,0], [5,5,3]]);
  const second = await summary(state, { body: 'b2', page: 2 });
  assert.equal(second.page, 2);
  assert.deepEqual(second.pick_edges, []);
  assert.deepEqual(second.slots, recovery.slots);
  assert.deepEqual(state, before);
});

test('summary omits recovery outside the current visible root-owned three-slot case', async () => {
  const { state, signed } = await fixture();
  const [body] = state.bodies;
  assert.equal(await summary(state, { response_format: 'concise' }), undefined);
  assert.equal(await summary({ ...state, partOf: 'p1' }), undefined);
  assert.equal(await summary({ ...state, bodies: [body, body] }), undefined);
  assert.equal(await summary({ ...state, bodies: [{ ...body, ref: parent }] }), undefined);
  assert.equal(await summary({ ...state, doc: { ...state.doc, bodies: { [lookKey(state.doc.nodes, body)]: { hidden: true } } } }), undefined);
  const finish = state.doc.nodes[2];
  assert.equal(finish.kind, 'fillet');
  if (finish.kind !== 'fillet') return;
  const retained = signaturesOf(body).edges.get(names[0]);
  assert.ok(retained);
  const partial = { ...state.doc, nodes: [...state.doc.nodes.slice(0, 2),
    { ...finish, sigs: { ...finish.sigs, [names[0]]: toSig(retained) } }] };
  assert.equal((await verifyReferences(partial, state.bodies, evaluate)).problems.length, 2);
  assert.equal(await summary({ ...state, doc: partial }), undefined);
  const current = await evaluate(signed);
  assert.ok(current.ok);
  assert.equal(await summary({ doc: signed, bodies: current.bodies }), undefined);
});
