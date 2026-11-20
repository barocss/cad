import assert from 'node:assert/strict';
import test from 'node:test';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { evaluateDoc, evaluatePart } from '@barocss/cad-model/engine/evaluate';
import { createHistoryFeatureApply } from '../src/state/historyFeatureApply';
function model(four=true): StudioDoc {
  const nodes: StudioDoc['nodes']=[
    {id:'n0',kind:'sketch',profile:'rectangle',min:[0,0],max:[80,50]},
    {id:'n1',kind:'sheet-base',sketch:0,thickness:1.5,bendRadius:1.5,kFactor:.44},
    {id:'n2',kind:'sheet-flange',parent:{node:1,side:'solid'},edges:['n1.side0|n1.top'],length:20,bendRadius:2},
  ];
  if(four)nodes.push({id:'n3',kind:'sheet-flange',parent:{node:2,side:'solid'},edges:['n1.side2|n1.top'],length:20,bendRadius:2});
  return{format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes,outputs:{['b'+(nodes.length-1)]:{node:nodes.length-1,side:'solid'}},nextId:nodes.length};
}
function harness(doc:StudioDoc, step?: (phase:string, stage:number)=>void) {
  let revision=0, stage=0, liveDoc=doc, evaluated=doc, scope={}, worker=1, open={}, draftLive=true;
  let marker:number|null=null, variant:string|null=null;
  const calls:string[]=[], commits:StudioDoc[]=[];
  const editNode=doc.nodes.length-1;
  const apply=createHistoryFeatureApply({model:{doc,evaluated:doc,editNode,fresh:true,busy:false},
    owner:{document:()=>liveDoc,evaluated:()=>evaluated,scope:()=>scope,worker:()=>worker,open:()=>open,marker:()=>marker,variant:()=>variant},
    worker:{nextRevision:()=>++revision,engine:{
      part:async(input,r,slot)=>{assert.equal(slot,'refs');calls.push('refs'+input.nodes.length);step?.('refs',++stage);return evaluatePart(input,r,8,'refs');},
      evaluate:async(input,r)=>{calls.push('candidate');step?.('candidate',++stage);return evaluateDoc(input,r);},
    }},changes:{canChangeDocument:()=>true,commit:(next)=>{commits.push(next);return true;},
    applyRoundedInsetEdit:()=>assert.fail('unexpected path'),stageFeatureCandidate:()=>assert.fail('unexpected generic staging')}});
  return { calls, commits, invoke:(radius:number,patch:object={})=>apply(doc.nodes.map((n,i)=>i===editNode?{...n,bendRadius:radius,...patch}:n),()=>draftLive),
    retire:(part:string)=>{if(part==='worker')worker++;if(part==='open')open={};if(part==='document')liveDoc={...doc};
      if(part==='evaluated')evaluated={...doc};if(part==='draft')draftLive=false;if(part==='scope')scope={};if(part==='marker')marker=3;if(part==='variant')variant='alternate';} };
}
test('strict caller commits the exact original-prefix and candidate proof',async()=>{
  const h=harness(model()); await h.invoke(3);
  assert.deepEqual(h.calls,['refs3','refs4','candidate']);assert.equal(h.commits.length,1);
});
test('mixed radius never falls through to generic Apply, nor evaluates a candidate',async()=>{
  const h=harness(model()); const result=await h.invoke(3,{length:21});
  assert.equal(result?.title,'Bend radius not applied'); assert.deepEqual(h.calls,[]);assert.deepEqual(h.commits,[]);
});
test('worker/reset/document/marker/variant/draft invalidation at any reply prevents commit',async()=>{
  for(const phase of [1,2,3])for(const part of ['worker','open','scope','document','evaluated','marker','variant','draft']){
    const h=harness(model(),(_role,stage)=>{if(stage===phase)h.retire(part);}); await h.invoke(3);
    assert.equal(h.calls.length,phase); assert.deepEqual(h.commits,[]);
  }
});
test('legacy three-node own radius edit keeps previous single-evaluate behavior',async()=>{
  const h=harness(model(false)); await h.invoke(3);
  assert.deepEqual(h.calls,['candidate']); assert.equal(h.commits.length,1);
});
