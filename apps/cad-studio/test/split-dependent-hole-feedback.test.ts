import assert from 'node:assert/strict';
import test from 'node:test';
import { evaluateDoc } from '@barocss/cad-model/engine/evaluate';
import type { StudioDoc } from '@barocss/cad-model/engine/doc';
import { splitDependentHoleFailure, failedFeatureText } from '../src/app/failedFeature';
const doc: StudioDoc = { format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
  {kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[40,30]},
  {kind:'extrude',id:'n1',sketch:0,height:10},
  {kind:'split',id:'n2',parent:{node:1,side:'solid'},axis:'x',normal:[2,2,0],at:70},
  {kind:'hole',id:'n3',parent:{node:2,side:'negative'},axis:'z',side:'max',center:[10,10],radius:2,depth:4}],
  outputs:{b2_positive:{node:2,side:'positive'},b3:{node:3,side:'solid'}},nextId:4};
test('real Split-dependent Hole miss keeps native attribution and offers recovery in the active editor',()=>{
  assert.ok(evaluateDoc(doc,0).ok);
  const nodes=doc.nodes.map((n,i)=>i===2&&n.kind==='split'?{...n,at:30}:n),result=evaluateDoc({...doc,nodes},1);
  assert.equal(result.ok,false); if(result.ok)return;
  const error={...result.error,failedFeature:failedFeatureText(result.error.feature,nodes,doc.nodes)},feedback=splitDependentHoleFailure(error,doc.nodes,nodes,2);
  assert.ok(feedback);assert.equal(feedback.title,error.title);assert.equal(feedback.detail,error.detail);assert.equal(feedback.failedFeature,error.failedFeature);assert.match(feedback.hint,/Split At or Normal/);
  assert.equal(splitDependentHoleFailure({...error,feature:'n1'},doc.nodes,nodes,2),undefined);
  assert.equal(splitDependentHoleFailure({...error,detail:'different failure'},doc.nodes,nodes,2),undefined);
  assert.equal(splitDependentHoleFailure(error,doc.nodes,nodes,1),undefined);
  const changed=nodes.map((n,i)=>i===3&&n.kind==='hole'?{...n,radius:3}:n);
  assert.equal(splitDependentHoleFailure(error,doc.nodes,changed,2),undefined);
});
