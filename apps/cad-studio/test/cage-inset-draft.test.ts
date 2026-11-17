import test from 'node:test';
import assert from 'node:assert/strict';
import { previewCageInset } from '../src/subd/cageInsetDraft';
import { select, startSession, undoSession } from '@barocss/cad-model/subd/cageEdit';
const base=select(startSession(0,{positions:[0,0,0,10,0,0,10,8,0,0,8,0],faces:[[0,1,2,3]]}),{kind:'face',f:0},false);
test('inset previews always use baseline and keep one history step',()=>{
 for(const d of [.5,1,2]){
  const r=previewCageInset(base,String(d));assert.equal(r.error,null);assert.equal(r.session.cage.faces.length,5);assert.equal(r.session.cage.positions.length,24);assert.equal(r.session.undo.length,1);
  assert.deepEqual(r.session.cage.positions.slice(12),[d,d,0,10-d,d,0,10-d,8-d,0,d,8-d,0]);assert.deepEqual(undoSession(r.session).cage,base.cage);
 }
});
test('empty, endpoints, collapse and nonfinite input retain baseline and redo',()=>{
 const s=undoSession(previewCageInset(base,'1').session);
 for(const v of ['', ' ', '0','-1','4','5','NaN','Infinity']){const r=previewCageInset(s,v);assert.ok(r.error);assert.equal(r.session,s);assert.equal(r.session.redo,s.redo);}
});
