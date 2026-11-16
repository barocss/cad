import test from 'node:test';
import assert from 'node:assert/strict';
import {boxCage} from '../src/app/primitives';
import {commitDrag,runOp,startSession,undoSession} from '../src/subd/cageEdit';
test('mirror-plane constrained drag preserves Undo and Redo; tangential drag remains a real step',()=>{
 let s=runOp(startSession(0,boxCage(30,20,16,4,[0,0,0])),'mirror-x');
 const vertex=s.cage.positions.findIndex((v,i)=>i%3===0&&v===0)/3;assert.ok(vertex>=0);
 s={...s,sel:{vertices:[vertex],edges:[],faces:[]}};
 assert.equal(commitDrag(s,[5,0,0],false),s);
 const moved=commitDrag(s,[0,2,0],false);assert.equal(moved.undo.length,s.undo.length+1);
 const undone=undoSession(moved);assert.equal(undone.redo.length,1);assert.equal(commitDrag(undone,[5,0,0],false),undone);
});
test('Weld near distinguishes missing selection from selected vertices outside tolerance',()=>{
 const s=startSession(0,boxCage(30,20,16,2,[0,0,0]));
 assert.throws(()=>runOp(s,'weld-near'),/pick at least two vertices/);
 assert.throws(()=>runOp({...s,sel:{vertices:[0],edges:[],faces:[]}},'weld-near'),/pick at least two vertices/);
 assert.throws(()=>runOp({...s,sel:{vertices:[0,1],edges:[],faces:[]}},'weld-near'),/within|close|tolerance/i);
});
