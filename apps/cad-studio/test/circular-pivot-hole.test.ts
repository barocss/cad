import test from 'node:test';
import assert from 'node:assert/strict';
import type {StudioDoc,ModelNode} from '@barocss/cad-model/engine/doc';
import {evaluateCadPart,checkBrep,massPropertiesOf,faceGeometry} from '@barocss/cad';
import {toPartDocument} from '@barocss/cad-model/engine/part';
import {prepareCircularPatternHolePivot} from '../src/app/circularPatternHolePivot';
import {prepareLinearPatternHoleEdit} from '../src/app/patternHoleSpacing';
const source=():StudioDoc=>({format:'barocss-cad-model',schema:3,units:'mm',parameters:{},nodes:[
 {id:'n0',kind:'sketch',profile:'rectangle',min:[10,20],max:[14,26]},
 {id:'n1',kind:'extrude',sketch:0,height:8},
 {id:'n2',kind:'circular-pattern',parent:{node:1,side:'solid'},axis:'z',count:4,angle:90,span:360},
 {id:'n3',kind:'hole',parent:{node:2,side:'solid'},center:[-12,-23],radius:1,face:'n1.top@2'},
],outputs:{b3:{node:3,side:'solid'}},nextId:4});
const patch=(doc:StudioDoc,i:number,changes:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,j)=>i===j?{...n,...changes} as ModelNode:n)});
const draft=(doc:StudioDoc,pivot:number[])=>patch(doc,2,{pivot}).nodes;
function accepted(doc:StudioDoc,nodes:ModelNode[]){const result=prepareLinearPatternHoleEdit(doc,nodes,2);assert.ok('nodes'in result);if(!('nodes'in result))throw Error('rejected');return {...doc,nodes:result.nodes};}
function native(doc:StudioDoc,px:number,py:number){
 const [o]=evaluateCadPart(toPartDocument(doc)).outputs;assert.equal(o.bodyCount,4);assert.ok(checkBrep(o.brep,{strict:true}).valid);
 const hole=doc.nodes[3];assert.equal(hole.kind,'hole');if(hole.kind!=='hole')throw Error('kind');
 assert.deepEqual(hole.center,[-12+2*px,-23+2*py]);
 const walls=o.brep.faces.filter(f=>f.name?.startsWith('n3.')).map(faceGeometry);assert.equal(walls.length,2);
 for(const g of walls){assert.equal(g.kind,'cylinder');if(g.kind!=='cylinder')throw Error('kind');assert.ok(Math.abs(g.c[0]-Number(hole.center[0]))<1e-8);assert.ok(Math.abs(g.c[1]-Number(hole.center[1]))<1e-8);assert.ok(Math.abs(g.r-1)<1e-12);}
 const m=massPropertiesOf(o),removed=8*Math.PI,v=768-removed;
 assert.ok(Math.abs(m.volume-v)<1e-7);assert.ok(Math.abs(m.centroid[0]-(768*px-removed*Number(hole.center[0]))/v)<1e-8);assert.ok(Math.abs(m.centroid[1]-(768*py-removed*Number(hole.center[1]))/v)<1e-8);assert.ok(Math.abs(m.centroid[2]-4)<1e-8);
}
test('quarter-turn pivot X/Y keeps the complete bore on copy 2 and roundtrips',()=>{
 const doc=source(),saved=structuredClone(doc);
 for(const pivot of [[.25,0,0],[2,0,0],[-.5,1.25,0],[2,-1,0]]){
  const next=accepted(doc,draft(doc,pivot));native(next,pivot[0],pivot[1]);
  assert.deepEqual(next.nodes.slice(0,2),doc.nodes.slice(0,2));assert.deepEqual(next.outputs,doc.outputs);
  const restored=accepted(next,draft(next,[0,0,0]));assert.deepEqual(restored,patch(doc,2,{pivot:[0,0,0]}));native(restored,0,0);
  assert.deepEqual(JSON.parse(JSON.stringify(next)),next);
 }
 assert.deepEqual(doc,saved);
});
test('mixed changes and unsupported source/reference fail atomically',()=>{
 const doc=source(),saved=structuredClone(doc);
 for(const changes of [{count:3},{angle:45},{span:180},{axis:'x'}])assert.ok('error'in prepareCircularPatternHolePivot(doc,patch(patch(doc,2,{pivot:[.25,0,0]}),2,changes).nodes,2));
 const variants=[patch(doc,3,{face:'n1.top@1'}),patch(doc,3,{sigs:{}}),patch(doc,3,{depth:2}),patch(doc,3,{radius:10}),patch(doc,3,{center:[-100,-23]}),patch(doc,1,{draft:1}),patch(doc,0,{min:[0,0]}),{...doc,direct:[]} as unknown as StudioDoc,{...doc,nodes:[...doc.nodes,doc.nodes[3]]}];
 for(const old of variants){const snapshot=structuredClone(old);assert.ok('error'in prepareCircularPatternHolePivot(old,draft(old,[.25,0,0]),2));assert.deepEqual(old,snapshot);}
 assert.deepEqual(doc,saved);
});
test('overlap, nonfinite/range and Z pivot changes preserve source',()=>{
 const doc=source();for(const pivot of [[12,23,0],[Infinity,0,0],[NaN,0,0],[1e12,0,0],[.25,0,1]])assert.ok('error'in prepareCircularPatternHolePivot(doc,draft(doc,pivot),2));
 for(const pivot of [[NaN,0,0],[0,0],['bad',0,0]]){const old=patch(doc,2,{pivot}),saved=structuredClone(old);assert.ok('error'in prepareCircularPatternHolePivot(old,draft(old,[.25,0,0]),2));assert.deepEqual(old,saved);}
});
test('unrelated changes, inactive dependency and absent Hole retain existing paths',()=>{
 const doc=source();for(const nodes of [doc.nodes,patch(doc,2,{count:3}).nodes,patch(doc,2,{angle:120}).nodes])assert.deepEqual(prepareCircularPatternHolePivot(doc,nodes,2),{nodes});
 const plain={...doc,nodes:doc.nodes.slice(0,3),outputs:{b2:{node:2,side:'solid' as const}},nextId:3};const nodes=draft(plain,[2,0,0]);assert.deepEqual(prepareCircularPatternHolePivot(plain,nodes,2),{nodes});
 for(const change of [{suppressed:true},{held:'test'}]){const inactive=patch(doc,3,change),nodes=draft(inactive,[2,0,0]);assert.deepEqual(prepareCircularPatternHolePivot(inactive,nodes,2),{nodes});}
});
