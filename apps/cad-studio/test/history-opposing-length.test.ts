import assert from 'node:assert/strict';
import test from 'node:test';
import {emptyDoc,withNode,type ModelNode} from '@barocss/cad-model/engine/doc';
import {partBreps} from '@barocss/cad-model/engine/evaluate';
import {checkBrep} from '@barocss/cad';
import {editFields} from '@barocss/cad-model/app/editFields';
import {profileOf} from '@barocss/cad-model/sketch/loops';
import type {Polygon} from '@barocss/cad-model/sketch/rules';
import {inspectHistoryOpposingLength as inspect} from '../src/sketch/historyOpposingLength';

type PolygonNode = Extract<ModelNode,{kind:'sketch';profile:'polygon'}>;
function nodes() {
  const shape:Polygon={kind:'polygon',closed:true,points:[[0,0],[40,0],[40,20],[0,20]],
    hv:{h:[0,2],v:[1,3]},lengths:{0:40,1:20,2:40}};
  const profile=profileOf([shape]);assert.ok('node' in profile);
  return withNode(withNode(emptyDoc(),profile.node),{kind:'extrude',sketch:0,height:2}).nodes;
}
test('same authored width witness survives real unrelated Distance, Draft and Start Z edits; explicit same number clears it',()=>{
  const original=nodes();
  const snapshot=JSON.stringify(original);
  const fields=editFields(original,1,{});
  const distance=fields.find(f=>f.key==='h'), taper=fields.find(f=>f.key==='draft'), start=fields.find(f=>f.key==='from');
  assert.ok(distance?.kind==='number' && taper?.kind==='number' && start?.kind==='number');
  assert.equal(fields.some(f=>f.key==='cutDepthMode'),false,'not an anchored cut: no Cut depth control on this recipe');
  const width=fields.find(f=>f.key==='olen0');assert.ok(width?.kind==='number');
  const heightDraft=distance.set(original,3), taperDraft=taper.set(original,1), startDraft=start.set(original,2);
  const mixed=start.set(taper.set(heightDraft,1),2);
  for(const next of [heightDraft,taperDraft,startDraft,mixed]) {
    assert.notEqual(next,original);assert.equal(next[0],original[0]);
  }
  // Both actor orders: width refusal before Draft 1 can never modify the owned source,
  // and attempting 42 from the new Draft 1 state is refused by the existing width setter.
  const widthFirst=width.set(original,42);
  assert.equal(widthFirst,original);assert.deepEqual(taper.set(widthFirst,1),taperDraft);
  assert.equal(width.set(taperDraft,42),taperDraft);
  for(const current of [original,heightDraft,taperDraft,startDraft,mixed]) {
    assert.deepEqual(inspect(original,current,1,'olen0',42),{kind:'conflict',opposite:2,locked:40});
    assert.deepEqual(inspect(original,current,1,'olen2',42),{kind:'conflict',opposite:0,locked:40});
    assert.deepEqual(inspect(original,current,1,'olen0',40),{kind:'same'});
    assert.equal(inspect(original,current,1,'olen1',21),undefined);
    assert.equal(inspect(original,current,1,'olen0',40+1e-8),undefined);
  }
  assert.equal(taper.get(taperDraft),1);
  const [native]=partBreps({...emptyDoc(),nodes:taperDraft});assert.ok(native);
  assert.equal(checkBrep(native.brep,{strict:true}).valid,true);
  assert.equal(width.get(taperDraft),40);
  assert.equal(JSON.stringify(original),snapshot);
});
test('no unsupported proof for mismatched ownership, unsupported geometry, or blank/invalid generic fields',()=>{
  const original=nodes();
  const sketch=original[0] as PolygonNode,feature=original[1] as Extract<ModelNode,{kind:'extrude'}>;
  const sideTags=sketch.sideTags!,outline=sketch.outline!;
  const drafts:ModelNode[][]=[
    [sketch,{...feature,sketch:2}],
    [sketch,{...feature,id:'other-extrusion'}],
    [{...sketch,id:'foreign'},feature],
    [{...sketch,sideTags:{outer:[...sideTags.outer].reverse()}},feature],
    [{...sketch,sideTags:{outer:[sideTags.outer[0]!,sideTags.outer[0]!,...sideTags.outer.slice(2)]}},feature],
    [{...sketch,outline:{...outline,bulges:[0,0,.1,0]}},feature],
    [{...sketch,outline:{...outline,hv:{h:[],v:[]}}},feature],
    [{...sketch,outline:{...outline,rules:[{kind:'fix',point:1,at:[40,0]}]}},feature],
    [{...sketch,points:[[1,0],...sketch.points.slice(1)]},feature],
  ];
  for(const draft of drafts) assert.equal(inspect(original,draft,1,'olen0',42),undefined);
  for(const disallowed of [{...feature,draft:1},{...feature,cutDepth:'through'} as const,{...feature,suppressed:true} as const]) {
    const foreign=[sketch,disallowed];
    assert.equal(inspect(foreign,foreign,1,'olen0',42),undefined);
  }
  for(const key of ['h','olen','olen4','len0','ccdist0_1']) assert.equal(inspect(original,original,1,key,42),undefined);
  for(const value of [NaN,0,-2,Infinity]) assert.equal(inspect(original,original,1,'olen0',value),undefined);
});
