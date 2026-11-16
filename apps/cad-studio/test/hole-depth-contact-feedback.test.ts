import assert from 'node:assert/strict';
import test from 'node:test';
import type { ModelNode } from '@barocss/cad-model/engine/doc';
import { holeDepthContactFailure, type FeatureFailure } from '../src/app/failedFeature';
const base: ModelNode[] = [{kind:'sketch',id:'n0',profile:'rectangle',min:[0,0],max:[40,30]},
  {kind:'extrude',id:'n1',sketch:0,height:20},
  {kind:'hole',id:'n2',parent:{node:1,side:'solid'},radius:2,center:[20,15],depth:12.8}];
const hole = base[2] as Extract<ModelNode,{kind:'hole'}>;
const candidate: ModelNode[] = [...base.slice(0,2), {...hole,depth:13}];
const error: FeatureFailure = {title:'original',hint:'original hint',code:'GEOMETRY',feature:'n2',failedFeature:'Hole Ø4 (n2)',
  detail:"B-rep: analytic Boolean: the result's boundary touches itself at (45, 5, 13), where one surface only touches another: not a manifold solid (the inputs touch along an edge or at a vertex)"};
test('only the depth-only Hole contact gets guidance; native attribution and inputs remain exact',()=>{
 const snapshot=JSON.stringify({base,candidate,error});const result=holeDepthContactFailure(error,base,candidate,2);
 assert.ok(result);assert.equal(result.title,'Hole depth creates a point contact');assert.match(result.hint,/\(45, 5, 13\) mm.*Change Depth or select Reset/);
 assert.deepEqual({...result,title:error.title,hint:error.hint},error);assert.equal(JSON.stringify({base,candidate,error}),snapshot);
});
test('other failures, owners, malformed contact locations and non-depth edits remain generic',()=>{
 for(const patch of [{code:'TOPOLOGY'},{feature:'n1'},{feature:undefined},{detail:error.detail+' extra'},
  {detail:error.detail.replace('45, 5, 13','NaN, 5, 13')},{detail:error.detail.replace('45, 5, 13','1e999, 5, 13')},
  {detail:"B-rep: analytic Boolean: the result is not a manifold solid"}])
  assert.equal(holeDepthContactFailure({...error,...patch},base,candidate,2),undefined);
 for(const next of [base,[...base.slice(0,2),{...hole,depth:NaN}], [...base.slice(0,2),{...hole,depth:{parameter:'D'}}],
  [...base.slice(0,2),{...hole,depth:13,radius:3}], [...base.slice(0,2),{...hole,depth:13,id:'other'}],
  [{...base[0]},base[1],candidate[2]], [...candidate,candidate[2]]])
  assert.equal(holeDepthContactFailure(error,base,next,2),undefined);
 assert.equal(holeDepthContactFailure(error,[...base.slice(0,2),{...hole,depth:{parameter:'D'}}],candidate,2),undefined);
 assert.equal(holeDepthContactFailure(error,[base[0],{...base[1],id:'n2'},hole],[base[0],{...base[1],id:'n2'},candidate[2]],2),undefined);
 assert.equal(holeDepthContactFailure(error,base,candidate,1),undefined);
});
