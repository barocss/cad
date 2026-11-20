import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyDoc,withNode,type ModelNode} from '@barocss/cad-model/engine/doc';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {profileOf} from '@barocss/cad-model/sketch/loops';
import {editFields} from '@barocss/cad-model/app/editFields';
import type {Polygon} from '@barocss/cad-model/sketch/rules';
import {brepMassProperties,checkBrep} from '@barocss/cad';
import {editExtrudeTriangleLength as edit,type FeatureTriangleRecoveries} from '../src/sketch/fixedTriangleEditor';

const originalLength=131.95, recoveredLength=124.05, nearLength=131.9499;
function upper(a:number):[number,number] {
  const x=(a*a+16-128**2)/8;return [x,Math.sqrt(a*a-x*x)];
}
function fixture() {
  const shape:Polygon={kind:'polygon',closed:true,points:[[0,0],[4,0],upper(originalLength)],
    lengths:{1:128,2:originalLength},hv:{h:[],v:[]},rules:[{kind:'fix',point:1,at:[4,0]}]};
  const profile=profileOf([shape]);assert.ok('node' in profile);
  return withNode(withNode(emptyDoc(),profile.node),{kind:'extrude',sketch:0,height:6});
}
function stage(doc:ReturnType<typeof fixture>) {
  const original=doc.nodes, proof:FeatureTriangleRecoveries=new WeakMap();
  const first=edit(original,original,1,recoveredLength,{},proof);assert.ok(first && 'nodes' in first);
  const sketch=first.nodes[0];assert.ok(sketch.kind==='sketch');assert.deepEqual(proof.get(sketch),{original,index:1});
  const field=editFields(original,1,{}).find(f=>f.key==='olen2');assert.ok(field?.kind==='number');
  return {original,proof,first,field};
}
test('exact original scalar returns to the original node array, but near-distinct History remains a real native edit',()=>{
  const doc=fixture(),{original,proof,first,field}=stage(doc);
  assert.notEqual(first.nodes,original);assert.equal(field.get(first.nodes),recoveredLength);
  const invalid=edit(original,first.nodes,1,132.05,{},proof);assert.ok(invalid && 'reason' in invalid);
  const back=edit(original,first.nodes,1,originalLength,{},proof);assert.ok(back && 'nodes' in back);
  assert.equal(back.nodes,original);assert.equal(back.nodes[0],original[0]);
  const near=edit(original,first.nodes,1,nearLength,{},proof);assert.ok(near && 'nodes' in near);
  assert.notEqual(near.nodes,original);assert.equal(field.get(near.nodes),nearLength);
  const [native]=partBreps({...doc,nodes:near.nodes});assert.ok(native && checkBrep(native.brep,{strict:true}).valid);
  assert.ok(Math.abs(brepMassProperties(native.brep,1).volume-12*upper(nearLength)[1])<1e-6);
  const again=edit(original,back.nodes,1,recoveredLength,{},proof);
  assert.ok(again && 'nodes' in again);assert.equal(field.get(again.nodes),recoveredLength);
});

test('restore only the owned sketch: unrelated feature changes survive, another owner or clone cannot reconverge',()=>{
  const doc=fixture(),{original,proof,first}=stage(doc);
  const h=editFields(original,1,{}).find(f=>f.key==='h');assert.ok(h?.kind==='number');
  const unrelated=h.set(first.nodes,7);
  const partial=edit(original,unrelated,1,originalLength,{},proof);
  assert.ok(partial && 'nodes' in partial);
  assert.notEqual(partial.nodes,original);
  assert.equal(partial.nodes[0],original[0]);assert.equal(partial.nodes[1],unrelated[1]);assert.equal(h.get(partial.nodes),7);
  const foreign=[...original], clone=[structuredClone(first.nodes[0]),first.nodes[1]] as ModelNode[];
  for(const [source,draft] of [[foreign,first.nodes],[original,clone]]){
    const attempted=edit(source,draft,1,originalLength,{},proof);
    if(attempted && 'nodes' in attempted){
      assert.notEqual(attempted.nodes,source);assert.notEqual(attempted.nodes[0],original[0]);
    }
  }
});
