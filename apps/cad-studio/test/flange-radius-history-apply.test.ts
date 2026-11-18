import test from 'node:test';
import assert from 'node:assert/strict';
import { emptyDoc, withNode, type StudioDoc } from '@barocss/cad-model/engine/doc';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
function fixture(){
 const sketch=withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]});
 const base=withNode(sketch,{kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44});
 return withNode(base,{kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side1|n1.top'],length:20,bendRadius:2});
}
function harness(doc:StudioDoc){
 const scope={},open={},commits:StudioDoc[]=[];let calls=0;
 const apply=createHistoryFeatureApply({model:{doc,evaluated:doc,editNode:2,fresh:true,busy:false},
  owner:{document:()=>doc,evaluated:()=>doc,scope:()=>scope,worker:()=>1,open:()=>open,marker:()=>null,variant:()=>null},
  worker:{engine:{evaluate:async()=>{calls++;return{ok:true,revision:1,bodies:[],wallTime:0};},part:async()=>{throw Error('No new reference evaluation');}},nextRevision:()=>1},
  changes:{canChangeDocument:()=>true,commit:next=>commits.push(next),applyRoundedInsetEdit:()=>assert.fail('Unexpected inset'),stageFeatureCandidate:()=>assert.fail('Unexpected pattern')}});
 return{apply:(nodes:StudioDoc['nodes'])=>apply(nodes,()=>true),commits,calls:()=>calls};
}
for(const patch of [{angle:45},{length:21},{length:{parameter:'L'}}])test(`radius plus ordinary ${JSON.stringify(patch)} is refused before evaluation`,async()=>{
 const doc=fixture(),snapshot=structuredClone(doc),h=harness(doc);
 const nodes=doc.nodes.map((n,i)=>i===2?{...n,bendRadius:3,...patch} as typeof n:n);
 const result=await h.apply(nodes);assert.equal(result?.title,'Bend radius not applied');assert.equal(h.calls(),0);assert.equal(h.commits.length,0);assert.deepEqual(doc,snapshot);
});
test('radius plus upstream change is refused',async()=>{
 const doc=fixture(),h=harness(doc),nodes=doc.nodes.map((n,i)=>i===1?{...n,thickness:2} as typeof n:i===2?{...n,bendRadius:3} as typeof n:n);
 assert.equal((await h.apply(nodes))?.title,'Bend radius not applied');assert.equal(h.calls(),0);assert.equal(h.commits.length,0);
});
test('radius-only candidate reaches the existing owned native evaluation and commit',async()=>{
 const doc=fixture(),h=harness(doc),nodes=doc.nodes.map((n,i)=>i===2?{...n,bendRadius:3} as typeof n:n);
 await h.apply(nodes);assert.equal(h.calls(),1);assert.equal(h.commits.length,1);assert.deepEqual(h.commits[0],{...doc,nodes});
});
for(const radius of [2,undefined])for(const patch of [{angle:45},{length:21}])test(`ordinary ${JSON.stringify(patch)} is preserved with radius ${radius}`,async()=>{
 const doc=fixture();if(radius===undefined){const flange=doc.nodes[2];assert.equal(flange.kind,'sheet-flange');if(flange.kind==='sheet-flange')delete flange.bendRadius;}
 const h=harness(doc),nodes=doc.nodes.map((n,i)=>i===2?{...n,...patch} as typeof n:n);await h.apply(nodes);assert.equal(h.calls(),1);assert.deepEqual(h.commits[0],{...doc,nodes});
});
