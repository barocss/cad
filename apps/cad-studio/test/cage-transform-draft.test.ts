import test from 'node:test';
import assert from 'node:assert/strict';
import { previewCageTransform, type CageTransformInput } from '../src/subd/cageTransformDraft';
import { select, startSession, undoSession } from '@barocss/cad-model/subd/cageEdit';
const cage={positions:[10,20,30,14,20,30,14,24,30,10,24,30],faces:[[0,1,2,3]]};
const s=select(startSession(0,cage),{kind:'edge',a:0,b:1},false);
const input:CageTransformInput={kind:'rotate',axis:2,value:'90',pivot:'vertex',vertex:'0'};
test('explicit vertex pivot and baseline previews produce independent coordinates, not accumulation',()=>{
 for(const [value,expected] of [['90',[10,24,30]],['180',[6,20,30]],['270',[10,16,30]]] as const){
  const r=previewCageTransform(s,{...input,value});assert.equal(r.error,null);assert.deepEqual(r.pivot,[10,20,30]);
  r.session.cage.positions.slice(3,6).forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<1e-12));
  assert.equal(r.session.undo.length,1);assert.deepEqual(undoSession(r.session).cage,s.cage);
 }
});
test('centre pivot scale is dimensionless, leaves unselected vertices untouched, no-op stays same session',()=>{
 const r=previewCageTransform(s,{...input,kind:'scale',pivot:'centre',value:'.5'});
 assert.equal(r.error,null);assert.deepEqual(r.pivot,[12,20,30]);assert.deepEqual(r.session.cage.positions,[11,20,30,13,20,30,14,24,30,10,24,30]);
 assert.equal(previewCageTransform(s,{...input,kind:'scale',value:'1'}).session,s);
 assert.equal(previewCageTransform(s,{...input,value:'0'}).session,s);
});
test('invalid values and explicit vertex IDs preserve baseline including redo',()=>{
 const base=undoSession(previewCageTransform(s,input).session);
 for(const patch of [{value:''},{value:'Infinity'},{kind:'scale' as const,value:'0'},{kind:'scale' as const,value:'-1'},{vertex:''},{vertex:'-1'},{vertex:'4'},{vertex:'1.5'}]){
  const r=previewCageTransform(base,{...input,...patch});assert.ok(r.error);assert.equal(r.session,base);assert.equal(r.session.redo,base.redo);
 }
});
