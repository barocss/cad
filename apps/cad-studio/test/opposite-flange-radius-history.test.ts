import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { prefixDoc } from '@barocss/cad-model/engine/doc';
import { isOppositeFlangeRadiusMutation, proveOppositeFlangeRadiusMutation, checkOppositeFlangeRadiusApply, oppositeFlangeOwnRadiusField } from '../src/state/oppositeFlangeRadiusHistory';

const before: StudioDoc = {format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
  { id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50] },
  { id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44 },
  { id:'n2',kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],length:20,bendRadius:2 },
  { id:'n3',kind:'sheet-flange',parent:{node:2,side:'solid'},edges:['n1.side2|n1.top'],length:20,bendRadius:2 },
],outputs:{b3:{node:3,side:'solid'}},nextId:4};
const current = before.nodes[3];
assert.equal(current.kind,'sheet-flange');
if (current.kind !== 'sheet-flange') throw Error('terminal fixture');
const after: StudioDoc = { ...before, nodes: [...before.nodes.slice(0,3),{...current,bendRadius:3}] };
const p = evaluatePart(prefixDoc(before,3),10,8,'refs'), a = evaluatePart(prefixDoc(before,4),11,8,'refs'), b = evaluateDoc(after,12);
assert.ok(p.ok); assert.ok(a.ok); assert.ok(b.ok);
if (!p.ok || !a.ok || !b.ok) throw Error('native fixture');
const parent=p.bodies, original=a.bodies, candidate=b.bodies;

test('exact native prefix and original/candidate own-radius packet', () => {
  assert.equal(isOppositeFlangeRadiusMutation(before,after,3),true);
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,parent,original,candidate),true);
});
test('scope refuses no-ops, unknown owner/output, alternate edge, stale prefix and mixed changes', () => {
  const nonRadius = [{ angle:45 }, { length:21 }, { edges:['n1.side1|n1.top'] }, { bendRadius:undefined }, { position:'material-outside' }];
  for (const change of nonRadius)
    assert.equal(isOppositeFlangeRadiusMutation(before,{...after,nodes:[...after.nodes.slice(0,3),{...current,bendRadius:3,...change} as typeof current]},3),false);
  assert.equal(isOppositeFlangeRadiusMutation(before, before,3),false);
  assert.equal(isOppositeFlangeRadiusMutation(before, structuredClone(after),3),false);
  assert.equal(isOppositeFlangeRadiusMutation(before, {...after,outputs:{alt:{node:3,side:'solid'}}},3),false);
});
test('native proof rejects stale/wrong prefixes, empty results, changed ownership and earlier bend geometry', () => {
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,original,original,candidate),false);
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,parent,original,[]),false);
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,parent,original,original),false);
  const own = candidate[0].sheetBendOwners!;
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,parent,original,[{...candidate[0],sheetBendOwners:[own[0],own[0]]}]),false);
  const flat = candidate[0].flat!;
  const bends = flat.bends.map(r=>r.faces[0]===own[0].faces[0]?{...r,centre:[[0,0],[1,1]] as typeof r.centre}:r);
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,parent,original,[{...candidate[0],flat:{...flat,bends}}]),false);
  const mesh=parent[0].mesh, index=mesh.edges.findIndex(e=>e.names.includes('n1.side2|n1.top'));
  const edges=mesh.edges.map((e,i)=>i===index?{...e,nativeJoint:undefined}:e);
  assert.equal(proveOppositeFlangeRadiusMutation(before,after,3,[{...parent[0],mesh:{...mesh,edges}}],original,candidate),false);
});

test('owned apply proof obtains refs for exact 3/4-node sources, then evaluates only the exact candidate', async () => {
  let revision=20;
  const seen: string[]=[];
  assert.equal(await checkOppositeFlangeRadiusApply(before,after,3,{
    current:()=>true, nextRevision:()=>++revision,
    refs:async (doc, rev)=>{seen.push(`refs:${doc.nodes.length}:${rev}`);return evaluatePart(doc,rev,8,'refs');},
    evaluate:async (doc,rev)=>{assert.equal(doc,after);seen.push(`candidate:${doc.nodes.length}:${rev}`);return evaluateDoc(doc,rev);},
  }),'proved');
  assert.deepEqual(seen,['refs:3:21','refs:4:22','candidate:4:23']);
});
test('stale ownership and returned-revision mismatch stop at each async phase', async () => {
  for (const retireAt of [1,2,3]) for (const mode of ['retire','wrong-revision']) {
    let rev=30,calls=0,owned=true;
    const read=async (doc:StudioDoc,requested:number)=>{
      calls++;
      if (calls===retireAt && mode==='retire') owned=false;
      const delivered=requested+(calls===retireAt && mode==='wrong-revision'?1:0);
      return calls===3?evaluateDoc(doc,delivered):evaluatePart(doc,delivered,8,'refs');
    };
    assert.equal(await checkOppositeFlangeRadiusApply(before,after,3,{
      current:()=>owned, nextRevision:()=>++rev,refs:read,evaluate:read,
    }),mode==='retire'?'stale':'refused');
    assert.equal(calls,retireAt);
  }
});
test('in-place draft modification during a pending request is stale without trusting the owner callback alone', async () => {
  const draft: StudioDoc={...after,nodes:[...after.nodes.slice(0,3), {...current,bendRadius:3}]};
  let calls=0;
  assert.equal(await checkOppositeFlangeRadiusApply(before,draft,3,{
    current:()=>true,nextRevision:()=>40,
    refs:async (doc,rev)=>{calls++;const end=draft.nodes[3];if(end.kind==='sheet-flange')end.bendRadius=4;return evaluatePart(doc,rev,8,'refs');},
    evaluate:async ()=>assert.fail('mutated draft must never evaluate'),
  }),'stale');
  assert.equal(calls,1);
});

test('editor projects only the scoped own Radius and rejects stale/set-invalid drafts', () => {
  const field=oppositeFlangeOwnRadiusField(before,before.nodes,3);
  assert.equal(field?.kind,'number');
  if(field?.kind!=='number') assert.fail('missing numeric field');
  assert.equal(field.key,'ownBendRadius');assert.equal(field.get(before.nodes),2);
  assert.deepEqual(field.set(before.nodes,3),after.nodes);
  for(const value of [0,-1,NaN,Infinity])assert.deepEqual(field.set(before.nodes,value),before.nodes);
  assert.deepEqual(field.set([...before.nodes],3),before.nodes);
  const later=oppositeFlangeOwnRadiusField(before,after.nodes,3);
  assert.equal(later?.kind,'number');
  if(later?.kind!=='number')assert.fail('missing changed numeric field');
  assert.deepEqual(later.set(after.nodes,2),before.nodes);
  assert.equal(oppositeFlangeOwnRadiusField(before,before.nodes,2),null);
  const mixed={...after,nodes:[...after.nodes.slice(0,3), {...current,bendRadius:3,length:19} as typeof current]};
  assert.equal(oppositeFlangeOwnRadiusField(before,mixed.nodes,3),null);
});
test('read-only preview packet requires proof before returning bodies and never calls final evaluate', async () => {
  for(const status of ['proved','refused','stale']) {
    let revision=60,retired=false,delivered=0;
    const result=await checkOppositeFlangeRadiusApply(before,after,3,{
      current:()=>!retired,nextRevision:()=>++revision,
      refs:async(doc,rev)=>evaluatePart(doc,rev,8,'refs'),
      evaluate:async(doc,rev)=>{ if(status==='stale')retired=true;return evaluatePart(doc,rev+(status==='refused'?1:0),8,'check'); },
      onProved:bodies=>{assert.equal(bodies[0].key,'b3');delivered++;},
    });
    assert.equal(result,status);
    assert.equal(delivered,status==='proved'?1:0);
  }
});
