import assert from 'node:assert/strict';
import test from 'node:test';
import { isEditableBox } from '../src/app/editCommand';
import { acceptProposal, dispatchTool, previewProposal } from '../src/chat/tools';
import { emptyDoc, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc, partBreps } from '../src/engine/evaluate';
import { revisionOf } from '../src/util/revision';

const evaluate = async (doc: StudioDoc) => evaluateDoc(doc, 1);
async function originalBox() {
  const result = await dispatchTool({doc:emptyDoc(),bodies:[]}, 'features', {
    action:'command', command:'box', values:{x:2.25,y:-4.5,z:2.125,w:12,d:8,h:6},
  }, evaluate);
  assert.ok(result.changed && !result.isError, result.content);
  assert.ok(isEditableBox(result.state.doc.nodes,0));
  return result.state;
}
const values = { boxVertexEdge:'n1.side0|n1.side1', boxVertexEndpoint:'to', boxMaxX:20.75 };
const edit = (doc: StudioDoc) => ({action:'edit',index:0,expectedRevision:revisionOf(doc),values});
const propose = (args: ReturnType<typeof edit> | Record<string, unknown>) => ({
  action:'propose',title:'Set the width at the original +X vertex',ops:[{tool:'features',args}],
});

test('an exact original +X vertex produces an explicitly approved Box width edit', async () => {
  const state = await originalBox();
  const outcome = await dispatchTool(state,'proposals',propose(edit(state.doc)),evaluate);
  assert.ok(!outcome.isError && outcome.changed,outcome.content);
  assert.deepEqual(outcome.state.doc.nodes,state.doc.nodes);
  const acceptedByAgent = await acceptProposal(outcome.state,'P1',evaluate,{by:{agent:'chat'}});
  assert.ok('error' in acceptedByAgent);
  const preview = await previewProposal(outcome.state,'P1',evaluate);
  assert.ok(!('error' in preview));
  const excluded = await acceptProposal(outcome.state,'P1',evaluate,{leaveOut:['n1']});
  assert.ok(!('error' in excluded));
  assert.deepEqual(excluded.state.doc.nodes,state.doc.nodes);
  const accepted = await acceptProposal(outcome.state,'P1',evaluate);
  assert.ok(!('error' in accepted));
  const {doc} = accepted.state;
  assert.deepEqual(doc.nodes,preview.doc.nodes);
  assert.deepEqual(doc.nodes.map(n=>n.id),state.doc.nodes.map(n=>n.id));
  assert.ok(isEditableBox(doc.nodes,0));
  const [{brep}] = partBreps(doc);
  const xmin = brep.vertices.filter(v=>v.point[0]===2.25), xmax = brep.vertices.filter(v=>v.point[0]===20.75);
  assert.equal(xmin.length,4);
  assert.equal(xmax.length,4);
  const volume = accepted.state.bodies[0].volume;
  assert.ok(typeof volume === 'number' && Math.abs(volume - 888) < 1e-9);
  assert.equal(doc.history?.at(-1)?.by?.agent,'user');
});

test('a box vertex edit refuses direct, stale, non-native, wrong side and no-op requests', async () => {
  const state = await originalBox(), request = edit(state.doc);
  const neverEvaluate = () => assert.fail('An invalid vertex width edit must refuse before evaluation.');
  const direct = await dispatchTool(state,'features',request,neverEvaluate);
  assert.ok(direct.isError);
  for (const replacement of [
    {...request,expectedRevision:undefined},
    {...request,expectedRevision:'0000000000000000'},
    {...request,values:{...values,boxVertexEdge:'not-an-edge'}},
    {...request,values:{...values,boxVertexEdge:'n1.bottom|n1.side0',boxVertexEndpoint:'from'}},
    {...request,values:{...values,boxVertexEndpoint:'midpoint'}},
    {...request,values:{...values,boxMaxX:14.25}},
    {...request,values:{...values,boxMaxX:2.75}},
    {...request,values:{...values,h:8}},
  ]) {
    const result = await dispatchTool(state,'proposals',propose(replacement),neverEvaluate);
    assert.ok(result.isError && !result.changed,JSON.stringify(replacement));
    assert.equal(result.state.doc,state.doc);
  }
});

async function independentBoxes() {
  const first = await originalBox();
  const second = await dispatchTool(first, 'features', {
    action: 'command', command: 'box', values: { x: 32.75, y: 9, z: -2, w: 7, d: 5, h: 4 },
  }, evaluate);
  assert.ok(second.changed && !second.isError, second.content);
  return second.state;
}

const referenceValues = {
  boxVertexEdge: values.boxVertexEdge, boxVertexEndpoint: values.boxVertexEndpoint,
  boxTargetVertexEdge: 'n3.bottom|n3.side0', boxTargetVertexEndpoint: 'from',
};

test('a second native Box corner supplies the width plane and the reference stays unchanged', async () => {
  const state = await independentBoxes();
  const result = await dispatchTool(state, 'proposals', propose({ ...edit(state.doc), values: referenceValues }), evaluate);
  assert.ok(!result.isError && result.changed, result.content);
  assert.deepEqual(result.state.doc.nodes, state.doc.nodes);
  assert.ok('error' in await acceptProposal(result.state, 'P1', evaluate, { by: { agent: 'chat' } }));
  const preview = await previewProposal(result.state, 'P1', evaluate);
  assert.ok(!('error' in preview));
  const skipped = await acceptProposal(result.state, 'P1', evaluate, { leaveOut: ['n1'] });
  assert.ok(!('error' in skipped));
  assert.deepEqual(skipped.state.doc.nodes, state.doc.nodes);
  const accepted = await acceptProposal(result.state, 'P1', evaluate);
  assert.ok(!('error' in accepted));
  const { doc, bodies } = accepted.state;
  assert.deepEqual(doc.nodes, preview.doc.nodes);
  assert.deepEqual(doc.nodes.map(node => node.id), state.doc.nodes.map(node => node.id));
  assert.deepEqual(doc.nodes.slice(2), state.doc.nodes.slice(2));
  assert.equal(JSON.stringify(partBreps(doc)[1]), JSON.stringify(partBreps(state.doc)[1]));
  assert.ok(isEditableBox(doc.nodes, 0) && isEditableBox(doc.nodes, 2));
  assert.equal(partBreps(doc)[0].brep.vertices.filter(v => v.point[0] === 32.75).length, 4);
  assert.equal(partBreps(doc)[0].brep.vertices.filter(v => v.point[0] === 2.25).length, 4);
  const source = bodies.find(body => body.ref?.node === 1);
  assert.ok(typeof source?.volume === 'number' && Math.abs(source.volume - 1464) < 1e-9);
});

test('a Box target rejects ambiguous modes, stale revisions and both incorrect owners', async () => {
  const state = await independentBoxes();
  const request = { ...edit(state.doc), values: referenceValues };
  const neverEvaluate = () => assert.fail('Invalid endpoint requests must refuse before evaluation.');
  const direct = await dispatchTool(state, 'features', request, neverEvaluate);
  assert.ok(direct.isError && !direct.changed);
  const incomplete = { ...referenceValues, boxTargetVertexEndpoint: undefined };
  for (const replacement of [
    { ...request, index: 2 }, { ...request, expectedRevision: '0000000000000000' },
    { ...request, values: { ...referenceValues, boxMaxX: 32.75 } }, { ...request, values: incomplete },
    { ...request, values: { ...referenceValues, boxVertexEdge: referenceValues.boxTargetVertexEdge } },
    { ...request, values: { ...referenceValues, boxTargetVertexEdge: referenceValues.boxVertexEdge } },
    { ...request, values: { ...referenceValues, boxTargetVertexEndpoint: 'midpoint' } },
  ]) {
    const result = await dispatchTool(state, 'proposals', propose(replacement), neverEvaluate);
    assert.ok(result.isError && !result.changed, JSON.stringify(replacement));
    assert.equal(result.state.doc, state.doc);
  }
  const lone = await originalBox();
  const missing = await dispatchTool(lone, 'proposals', propose({ ...request, expectedRevision: revisionOf(lone.doc) }), neverEvaluate);
  assert.ok(missing.isError && !missing.changed);
});

const depthValues = {
  boxVertexAxis: 'y',
  boxVertexEdge: 'n1.side2|n1.side3', boxVertexEndpoint: 'to',
  boxTargetVertexEdge: 'n3.side0|n3.top', boxTargetVertexEndpoint: 'from',
};

test('a two-Box depth proposal retains the source footprint and requires user approval', async () => {
  const state = await independentBoxes();
  const result = await dispatchTool(state, 'proposals', propose({ ...edit(state.doc), values: depthValues }), evaluate);
  assert.ok(!result.isError && result.changed, result.content);
  assert.deepEqual(result.state.doc.nodes, state.doc.nodes);
  assert.deepEqual(result.state.doc.proposals?.[0].risk.approval, ['Box vertex depth edit']);
  const auto = await acceptProposal(result.state, 'P1', evaluate, { by: { agent: 'chat' } });
  assert.ok('error' in auto && /Box vertex depth proposal needs approval/.test(auto.error));
  const preview = await previewProposal(result.state, 'P1', evaluate);
  assert.ok(!('error' in preview));
  const skipped = await acceptProposal(result.state, 'P1', evaluate, { leaveOut: ['n1'] });
  assert.ok(!('error' in skipped));
  assert.deepEqual(skipped.state.doc.nodes, state.doc.nodes);
  const accepted = await acceptProposal(result.state, 'P1', evaluate);
  assert.ok(!('error' in accepted));
  assert.deepEqual(accepted.state.doc.nodes, preview.doc.nodes);
  const original = partBreps(state.doc), changed = partBreps(accepted.state.doc);
  assert.deepEqual(changed[1], original[1]);
  const expected = original[0].brep.vertices.map(({ point: [x, y, z] }) => [x, y === 3.5 ? 9 : y, z]);
  for (const at of expected) {
    assert.equal(changed[0].brep.vertices.filter(({ point }) => point.every((value, i) => value === at[i])).length, 1);
  }
  assert.ok(Math.abs(accepted.state.bodies[0].volume! - 972) < 1e-9);
  assert.ok(isEditableBox(accepted.state.doc.nodes, 0));
});

test('a depth edit refuses absent or mismatched native owners and mixed scalar input', async () => {
  const state = await independentBoxes(), request = { ...edit(state.doc), values: depthValues };
  const neverEvaluate = () => assert.fail('An invalid vertex depth edit must refuse before evaluation.');
  assert.ok((await dispatchTool(state, 'features', request, neverEvaluate)).isError);
  for (const patch of [
    { boxVertexAxis: 'x' }, { boxMaxX: 9 }, { boxTargetVertexEndpoint: undefined },
    { boxVertexEdge: 'n1.side0|n1.side1', boxVertexEndpoint: 'to' },
    { boxTargetVertexEdge: depthValues.boxVertexEdge, boxTargetVertexEndpoint: depthValues.boxVertexEndpoint },
  ]) {
    const result = await dispatchTool(state, 'proposals', propose({ ...request, values: { ...depthValues, ...patch } }), neverEvaluate);
    assert.ok(result.isError && !result.changed, JSON.stringify(patch));
    assert.equal(result.state.doc, state.doc);
  }
});
