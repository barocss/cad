import test from 'node:test';
import assert from 'node:assert/strict';
import { boxCage } from '../src/app/primitives';
import { emptyCageSel, redoSession, runOp, select, startSession, undoSession, validationOf } from '../src/subd/cageEdit';
const fixture=()=>{
  const base=startSession(0,boxCage(30,20,16,4,[0,0,0]));
  const top=base.cage.faces.findIndex(f=>f.every(v=>base.cage.positions[3*v+2]===16));
  const hole=runOp(select(base,{kind:'face',f:top},false),'delete');
  const [a,b]=validationOf(hole).boundaryEdges[0];
  return {base,hole,a,b};
};
test('Fill selects its new face in Face mode and can immediately delete it',()=>{
  const {hole,a,b}=fixture(),before=structuredClone(hole);
  const boundary=select(hole,{kind:'edge',a,b},false,'loop');
  assert.equal(boundary.mode,'edge');assert.equal(boundary.sel.edges.length,4);
  const filled=runOp(boundary,'fill');
  assert.equal(filled.mode,'face');assert.deepEqual(filled.sel.faces,[95]);assert.equal(filled.cage.faces.length,96);
  const deleted=runOp(filled,'delete');
  assert.equal(deleted.mode,'face');assert.deepEqual(deleted.sel,emptyCageSel);assert.deepEqual(deleted.cage,hole.cage);
  const restored=undoSession(deleted);
  assert.equal(restored.mode,'face');assert.deepEqual(restored.sel,filled.sel);assert.deepEqual(restored.cage,filled.cage);
  assert.deepEqual(hole,before);
});
test('Undo and Redo derive modes from restored selection, independently of current mode',()=>{
  const {hole,a,b}=fixture(),boundary=select(hole,{kind:'edge',a,b},false,'loop'),filled=runOp(boundary,'fill');
  const undone=undoSession({...filled,mode:'vertex'});
  assert.equal(undone.mode,'edge');assert.deepEqual(undone.sel,boundary.sel);assert.deepEqual(undone.cage,boundary.cage);
  const redone=redoSession({...undone,mode:'vertex'});
  assert.equal(redone.mode,'face');assert.deepEqual(redone.sel,filled.sel);assert.deepEqual(redone.cage,filled.cage);
  assert.equal(redone.undo.length,filled.undo.length);assert.equal(redone.redo.length,0);
});
test('Face-mode boundary double-click changes to Edge without a history edit',()=>{
  const {hole,a,b}=fixture();assert.equal(hole.mode,'face');
  const picked=select(hole,{kind:'edge',a,b},false,'loop');
  assert.equal(picked.mode,'edge');assert.equal(picked.sel.edges.length,4);
  assert.deepEqual(picked.cage,hole.cage);assert.deepEqual(picked.undo,hole.undo);assert.deepEqual(picked.redo,hole.redo);
  assert.equal(select(picked,{kind:'vertex',v:a},false).mode,'vertex');
  assert.equal(select(picked,{kind:'face',f:0},false).mode,'face');
});
test('empty selection from miss, toggle or history respects the current mode',()=>{
  const {base}=fixture();
  const selected=select(base,{kind:'vertex',v:0},false);
  assert.equal(select(selected,{kind:'vertex',v:0},true).mode,'vertex');
  const cleared=select({...selected,mode:'edge'},null,false);
  assert.equal(cleared.mode,'edge');assert.deepEqual(cleared.sel,emptyCageSel);
  const face=select(base,{kind:'face',f:0},false),deleted=runOp(face,'delete');
  const undone=undoSession(deleted);assert.equal(undone.mode,'face');
  const redone=redoSession({...undone,mode:'edge'});
  assert.deepEqual(redone.sel,emptyCageSel);assert.equal(redone.mode,'edge');
  assert.equal(undoSession(base),base);assert.equal(redoSession(base),base);
});
