import test from 'node:test';
import assert from 'node:assert/strict';
import { commitDrag, connectedSelection, emptyCageSel, redoSession, runOp, select, startSession, undoSession, type CageSession, type StudioCage } from '../src/subd/cageEdit';

// Three edge-adjacent quads and a disconnected, spatially overlapping quad. IDs, not distance, connect them.
const cage: StudioCage = {
  positions: [0,0,0, 1,0,0, 2,0,0, 3,0,0, 0,1,0, 1,1,0, 2,1,0, 3,1,0, 0,0,0, 1,0,0, 1,1,0, 0,1,0],
  faces: [[0,1,5,4], [1,2,6,5], [2,3,7,6], [8,9,10,11]], creases: [[1,5]],
};
const session = () => startSession(0, cage);
const edgeKeys = (s: CageSession) => s.sel.edges.map(([a,b]) => [Math.min(a,b),Math.max(a,b)].join(':')).sort();

test('vertex grow is exactly one edge step, shrink erodes only unpicked neighbours', () => {
  const s = select(session(), {kind:'vertex',v:1}, false);
  const grown = runOp(s, 'select-grow');
  assert.deepEqual(grown.sel.vertices, [0,1,2,5]);
  assert.deepEqual(runOp(grown,'select-shrink').sel.vertices,[1]);
  assert.deepEqual(runOp(s,'select-shrink').sel.vertices,[]);
  assert.equal(grown.cage,s.cage); assert.equal(grown.undo,s.undo); assert.equal(grown.redo,s.redo);
});

test('face growth uses shared edges, linked crosses creases but never spatially overlapping components', () => {
  const s = select(session(), {kind:'face',f:0}, false);
  assert.deepEqual(runOp(s,'select-grow').sel.faces,[0,1]);
  const linked=runOp(s,'select-linked');
  assert.deepEqual(linked.sel.faces,[0,1,2]);
  assert.equal(runOp(linked,'select-shrink'),linked,'whole component has no unpicked neighbour');
  const cornerOnly = startSession(0,{positions:[0,0,0,1,0,0,0,1,0,-1,0,0,0,-1,0],faces:[[0,1,2],[0,3,4]]});
  assert.deepEqual(runOp(select(cornerOnly,{kind:'face',f:0},false),'select-linked').sel.faces,[0]);
});

test('Linked within creases only floods from face seeds across smooth shared edges', () => {
  const s = startSession(0, {...cage, creases: [[5,1]]});
  const first = select(s,{kind:'face',f:0},false);
  assert.equal(runOp(first,'select-linked-within-creases'),first);
  const middle = select(s,{kind:'face',f:1},false);
  const picked = runOp(middle,'select-linked-within-creases');
  assert.deepEqual(picked.sel.faces,[1,2]);
  assert.deepEqual(runOp(middle,'select-linked').sel.faces,[0,1,2]);
  assert.equal(picked.cage,middle.cage);
  assert.equal(picked.undo,middle.undo);
  assert.equal(picked.redo,middle.redo);
  const both = select(middle,{kind:'face',f:0},true);
  assert.deepEqual(runOp(both,'select-linked-within-creases').sel.faces,[0,1,2]);
  const detached = select(middle,{kind:'face',f:3},true);
  assert.deepEqual(runOp(detached,'select-linked-within-creases').sel.faces,[1,2,3]);
  const smooth = select(startSession(0,{...cage,creases:[]}),{kind:'face',f:0},false);
  assert.deepEqual(runOp(smooth,'select-linked-within-creases').sel.faces,[0,1,2]);
  const empty = {...s, mode:'face' as const};
  assert.equal(runOp(empty,'select-linked-within-creases'),empty);
  const edge = select(s,{kind:'edge',a:1,b:5},false);
  assert.throws(()=>runOp(edge,'select-linked-within-creases'),/pick faces/);
  assert.throws(()=>runOp({...middle,sel:{...emptyCageSel,faces:[4]}},'select-linked-within-creases'),/pick current cage/);
});

test('edge growth uses shared vertices and canonicalizes reverse seed orientation', () => {
  const s=select(session(),{kind:'edge',a:5,b:1},false);
  assert.deepEqual(edgeKeys(runOp(s,'select-grow')),['0:1','1:2','1:5','4:5','5:6']);
  const linked=runOp(s,'select-linked');
  assert.equal(linked.sel.edges.length,10);
  assert.ok(linked.sel.edges.every(([a,b])=>a<8&&b<8));
  assert.deepEqual(edgeKeys(runOp(runOp(s,'select-grow'),'select-shrink')),['1:5']);
});

test('multiple seeds flood their union; empty and isolated selections are stable', () => {
  let s=select(session(),{kind:'vertex',v:0},false); s=select(s,{kind:'vertex',v:8},true);
  assert.deepEqual(runOp(s,'select-linked').sel.vertices,Array.from({length:12},(_,i)=>i));
  for(const op of ['select-grow','select-shrink','select-linked'] as const) assert.equal(runOp(session(),op).undo.length,0);
  const isolated=startSession(0,{positions:[0,0,0],faces:[]});
  const picked=select(isolated,{kind:'vertex',v:0},false);
  for(const action of ['grow','shrink','linked'] as const) assert.equal(connectedSelection(picked,action),picked);
});

test('invalid current IDs and malformed topology are refused without editing state', () => {
  const s=session(), before=JSON.stringify(s);
  for(const [mode,sel] of [['vertex',{...emptyCageSel,vertices:[100]}],['edge',{...emptyCageSel,edges:[[0,7]]}],['face',{...emptyCageSel,faces:[4]}]] as const) {
    assert.throws(()=>connectedSelection({...s,mode,sel},'grow'),/pick current cage/);
  }
  assert.throws(()=>connectedSelection({...s,cage:{positions:[0,0,0],faces:[[0,1,2]]}},'linked'),/invalid cage/);
  assert.equal(JSON.stringify(s),before);
});

test('following move adds one undo step and restores the expanded selection', () => {
  const selected=runOp(select(session(),{kind:'vertex',v:1},false),'select-grow');
  const moved=commitDrag(selected,[0,0,2],false);
  assert.equal(moved.undo.length,1);
  for(let i=0;i<12;i++) assert.equal(moved.cage.positions[3*i+2],selected.sel.vertices.includes(i)?2:0);
  const undone=undoSession(moved); assert.deepEqual(undone.cage,selected.cage); assert.deepEqual(undone.sel,selected.sel);
  assert.deepEqual(redoSession(undone).cage,moved.cage);
  assert.equal(runOp(undone,'select-linked').redo,undone.redo,'selection preserves redo history');
});
