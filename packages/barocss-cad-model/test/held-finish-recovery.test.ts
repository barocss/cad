import test from 'node:test';
import assert from 'node:assert/strict';
import { lookKey } from '../src/app/lookKey';
import { dispatchTool, type ChatState } from '../src/chat/tools';
import { emptyDoc, withNode, rectanglePart, type StudioDoc } from '../src/engine/doc';
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
async function summary(state: ChatState, args: Record<string, unknown> = {}, read = evaluate) {
  const result = await dispatchTool(state, 'query', { action: 'summary', ...args }, read);
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

const retired = 'n1.side[retired]|n1.top';
async function chamferFixture(center: [number, number], depth?: number) {
  const stock = rectanglePart(60, 40, 10);
  const chamfer = withNode(stock, {
    kind: 'chamfer', parent, edges: [retired], distance: 3, suppressed: true, held: 'Missing Chamfer edge',
    sigs: { [retired]: { k: 'line', p: [30, -4, 10], d: [1, 0, 0], s: 60 } },
  });
  const doc = withNode(chamfer, {
    kind: 'hole', parent: { node: 2, side: 'solid' }, face: 'n1.top', center, radius: 2, depth,
  });
  const current = await evaluate(doc);
  assert.ok(current.ok);
  return { doc, bodies: current.bodies };
}

test('summary diagnoses only complete original top edges clear of a downstream Through Hole', async () => {
  const state = await chamferFixture([20, 20]);
  const before = structuredClone(state);
  const recovery = await summary(state, { body: 'b3', response_format: 'detailed' });
  assert.deepEqual([recovery.feature, recovery.body, recovery.source_body, recovery.downstream_feature,
    recovery.revision, recovery.mode, recovery.page, recovery.pages],
    ['n2', 'b3', 'b1', 'n3', revisionOf(state.doc), 'studio_history_review', 1, 1]);
  assert.deepEqual(recovery.slots, [{ slot: 1, authored_edge: retired, signature_matches: ['n1.side0|n1.top'] }]);
  assert.equal(recovery.pick_edges.length, 4);
  assert.ok(recovery.pick_edges.every((edge: { from: number[]; to: number[]; name: string }) =>
    edge.name.endsWith('|n1.top') && edge.from[2] === 10 && edge.to[2] === 10));
  assert.ok(recovery.pick_edges.some((edge: { from: number[]; to: number[] }) => edge.from[1] === 0 && edge.to[1] === 0));
  const second = await summary(state, { page: 2 });
  assert.equal(second.page, 2);
  assert.deepEqual(second.slots, recovery.slots);
  assert.deepEqual(second.pick_edges, []);
  assert.deepEqual(state, before);

  const nearRim = await summary(await chamferFixture([20, 4]));
  assert.equal(nearRim.pick_edges.length, 3);
  assert.ok(nearRim.pick_edges.every((edge: { from: number[]; to: number[] }) => edge.from[1] !== 0 || edge.to[1] !== 0));
});

test('downstream Chamfer diagnosis requires live root and prefix ownership and an unresolved original edge', async () => {
  const state = await chamferFixture([20, 20]);
  const [body] = state.bodies;
  const { doc } = state;
  const hidden = { ...doc, bodies: { [lookKey(doc.nodes, body)]: { hidden: true } } };
  const geometrySources = [
    { ...state, partOf: 'p1' }, { ...state, bodies: [body, body] },
    { ...state, bodies: [{ ...body, ref: parent }] }, { ...state, doc: hidden },
    await chamferFixture([20, 20], 3),
  ];
  for (const source of geometrySources) assert.equal(await summary(source), undefined);
  assert.equal(await summary(state, { response_format: 'concise' }), undefined);

  const finish = doc.nodes[2];
  assert.ok(finish.kind === 'chamfer');
  const live = signaturesOf(body).edges;
  const name = [...live.keys()].find(name => name.endsWith('|n1.top'));
  assert.ok(name);
  const sig = live.get(name);
  assert.ok(sig);
  const resolved: StudioDoc = { ...doc, nodes: [...doc.nodes.slice(0, 2),
    { ...finish, edges: [name], sigs: { [name]: toSig(sig) } }, doc.nodes[3]] };
  assert.equal(await summary({ ...state, doc: resolved }), undefined);
  assert.equal(await summary(state, {}, async source => {
    const result = await evaluate(source);
    if (source.nodes.length === 2 && result.ok) return { ...result, bodies: [result.bodies[0], result.bodies[0]] };
    return result;
  }), undefined);
});

test('summary diagnoses a held paired Constant Fillet (one or both slots) before an independent Through Hole', async () => {
  const stock = rectanglePart(60, 40, 10);
  const stockEval = await evaluate(stock);
  assert.ok(stockEval.ok);
  const [stockBody] = stockEval.bodies;
  const stockSigs = signaturesOf(stockBody).edges;
  const vertical = stockBody.mesh.edges.filter(edge => edge.nativeLine && edge.a[2] !== edge.b[2]);
  const [targetEdge, keepEdge] = vertical;
  assert.ok(targetEdge && keepEdge);
  const targetName = targetEdge.names[0], keepName = keepEdge.names[0];
  const keepSig = toSig(stockSigs.get(keepName)!);
  const hole = { kind: 'hole' as const, parent: { node: 2, side: 'solid' as const }, face: 'n1.top', center: [30, 20] as [number, number], radius: 2 };

  const oneRetiredDoc = withNode(withNode(stock, {
    kind: 'fillet', parent, edges: ['retired-slot', keepName], radius: 2, suppressed: true, held: 'Missing Fillet edge',
    sigs: { 'retired-slot': { k: 'line', p: [-4, -4, 5], d: [0.6, 0.8, 0], s: 10 }, [keepName]: keepSig },
  }), hole);
  const oneEval = await evaluate(oneRetiredDoc);
  assert.ok(oneEval.ok);
  const oneState: ChatState = { doc: oneRetiredDoc, bodies: oneEval.bodies };
  const oneBefore = structuredClone(oneState);
  const oneRecovery = await summary(oneState, { body: 'b3', response_format: 'detailed' });
  assert.deepEqual([oneRecovery.feature, oneRecovery.body, oneRecovery.source_body, oneRecovery.downstream_feature,
    oneRecovery.revision, oneRecovery.mode, oneRecovery.page, oneRecovery.pages],
    ['n2', 'b3', 'b1', 'n3', revisionOf(oneRetiredDoc), 'studio_history_review', 1, 1]);
  assert.deepEqual(oneRecovery.slots, [{ slot: 1, authored_edge: 'retired-slot', signature_matches: [] }]);
  assert.equal(oneRecovery.pick_edges.length, 11);
  assert.equal(oneRecovery.pick_edges.some((edge: { name: string }) => edge.name === keepName), false);
  assert.equal(oneRecovery.pick_edges.some((edge: { name: string }) => edge.name === targetName), true);
  assert.equal(await summary(oneState, { response_format: 'concise' }), undefined);
  assert.deepEqual(oneState, oneBefore);

  const staleKeepDoc = withNode(withNode(stock, {
    kind: 'fillet', parent, edges: ['retired-slot', keepName], radius: 2, suppressed: true, held: 'Missing Fillet edge',
    sigs: { 'retired-slot': { k: 'line', p: [-4, -4, 5], d: [0.6, 0.8, 0], s: 10 }, [keepName]: { ...keepSig, s: 99 } },
  }), hole);
  assert.equal(await summary({ doc: staleKeepDoc, bodies: oneEval.bodies }), undefined);

  const twoRetiredDoc = withNode(withNode(stock, {
    kind: 'fillet', parent, edges: ['retired-a', 'retired-b'], radius: 2, suppressed: true, held: 'Missing Fillet edges',
    sigs: {
      'retired-a': { k: 'line', p: [-4, -4, 5], d: [0.6, 0.8, 0], s: 10 },
      'retired-b': { k: 'line', p: [64, 44, 5], d: [-0.6, 0.8, 0], s: 10 },
    },
  }), hole);
  const twoEval = await evaluate(twoRetiredDoc);
  assert.ok(twoEval.ok);
  const twoRecovery = await summary({ doc: twoRetiredDoc, bodies: twoEval.bodies }, { body: 'b3', response_format: 'detailed' });
  assert.deepEqual(twoRecovery.slots, [
    { slot: 1, authored_edge: 'retired-a', signature_matches: [] },
    { slot: 2, authored_edge: 'retired-b', signature_matches: [] },
  ]);
  assert.equal(twoRecovery.pick_edges.length, 12);
});
