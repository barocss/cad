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
