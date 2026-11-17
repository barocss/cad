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
test('numeric move uses baseline mm, ignores pivot, retains redo on invalid and zero moves',()=>{
 const move:CageTransformInput={...input,kind:'move',axis:0,vertex:'invalid'};
 for(const value of ['-2','1','3']){
  const r=previewCageTransform(s,{...move,value});assert.equal(r.error,null);assert.equal(r.pivot,null);
  assert.deepEqual(r.session.cage.positions,[10+Number(value),20,30,14+Number(value),20,30,14,24,30,10,24,30]);assert.equal(r.session.undo.length,1);
 }
 const base=undoSession(previewCageTransform(s,{...move,value:'2'}).session);
 for(const value of ['','NaN','Infinity']){const r=previewCageTransform(base,{...move,value});assert.ok(r.error);assert.equal(r.session,base);}
 assert.equal(previewCageTransform(base,{...move,value:'0'}).session,base);
});
test('local move frames use immutable edge direction and quad normal; invalid frame selection retains baseline',()=>{
 const move:CageTransformInput={...input,kind:'move',frame:'edge',value:'2',vertex:'ignored'};
 const edge=previewCageTransform(s,move);assert.equal(edge.error,null);assert.deepEqual(edge.session.cage.positions,[12,20,30,16,20,30,14,24,30,10,24,30]);
 const face=select(startSession(0,cage),{kind:'face',f:0},false);
 const normal=previewCageTransform(face,{...move,frame:'face'});assert.equal(normal.error,null);assert.deepEqual(normal.session.cage.positions,[10,20,32,14,20,32,14,24,32,10,24,32]);
 const invalid=previewCageTransform(s,{...move,frame:'face'});assert.ok(invalid.error);assert.equal(invalid.session,s);
 assert.equal(previewCageTransform(s,{...move,frame:'world',value:'0'}).session,s);
});
test('proportional numeric preview keeps original graph distances and Off behaviour',()=>{
 const seed=select(startSession(0,cage),{kind:'vertex',v:0},false);
 const move:CageTransformInput={...input,kind:'move',axis:2,value:'2',frame:'world',proportional:true,radius:'8'};
 const r=previewCageTransform(seed,move);assert.equal(r.error,null);assert.deepEqual(r.session.cage.positions,[10,20,32,14,20,31,14,24,30,10,24,31]);
 const small=previewCageTransform(seed,{...move,radius:'4'});assert.equal(small.error,null);assert.deepEqual(small.session.cage.positions,[10,20,32,14,20,30,14,24,30,10,24,30]);
 assert.deepEqual(previewCageTransform(seed,{...move,proportional:false}).session.cage,small.session.cage);
 for(const patch of [{radius:''},{radius:'0'},{radius:'-1'},{radius:'Infinity'},{frame:'face' as const}]){const bad=previewCageTransform(seed,{...move,...patch});assert.ok(bad.error);assert.equal(bad.session,seed);}
 assert.equal(previewCageTransform(seed,{...move,value:'0'}).session,seed);
 assert.ok(previewCageTransform(s,move).error);
});
test('quad plane U/V move independently from baseline and reject proportional combination',()=>{
 const face=select(startSession(0,cage),{kind:'face',f:0},false);
 const move:CageTransformInput={...input,kind:'move',frame:'face-u',value:'2'};
 assert.deepEqual(previewCageTransform(face,move).session.cage.positions,[12,20,30,16,20,30,16,24,30,12,24,30]);
 assert.deepEqual(previewCageTransform(face,{...move,frame:'face-v'}).session.cage.positions,[10,22,30,14,22,30,14,26,30,10,26,30]);
 const bad=previewCageTransform(face,{...move,proportional:true,radius:'10'});assert.ok(bad.error);assert.equal(bad.session,face);
 assert.equal(previewCageTransform(face,{...move,value:'0'}).session,face);
});
