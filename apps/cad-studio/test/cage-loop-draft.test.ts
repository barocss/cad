import test from 'node:test';
import assert from 'node:assert/strict';
import { previewCageLoop } from '../src/subd/cageLoopDraft';
import { startSession, select, undoSession, redoSession } from '@barocss/cad-model/subd/cageEdit';
const cage = { positions: [0,0,0, 10,0,0, 0,4,0, 10,4,0, 0,8,0, 10,8,0], faces: [[0,1,3,2],[2,3,5,4]] };
const base = () => select(startSession(0,cage), {kind:'edge',a:0,b:1}, false);
test('ratio preview independently interpolates strip rails and never accumulates topology/history', () => {
  const s=base();
  for (const t of [.25,.5,.75]) {
    const r=previewCageLoop(s,String(t)); assert.equal(r.error,null);
    assert.deepEqual(r.session.cage.positions.slice(cage.positions.length),[10*t,0,0,10*t,4,0,10*t,8,0]);
    assert.equal(r.session.cage.faces.length,4); assert.equal(r.session.sel.edges.length,2); assert.equal(r.session.undo.length,1);
    assert.deepEqual(undoSession(r.session).cage,s.cage); assert.deepEqual(undoSession(r.session).sel,s.sel);
    assert.deepEqual(redoSession(undoSession(r.session)).cage,r.session.cage);
  }
  assert.deepEqual(s.cage,cage); assert.equal(s.undo.length,0);
});
test('reversed seed fixes t to the first selected endpoint', () => {
  const s=select(startSession(0,cage),{kind:'edge',a:1,b:0},false);
  assert.deepEqual(previewCageLoop(s,'0.25').session.cage.positions.slice(cage.positions.length),[7.5,0,0,7.5,4,0,7.5,8,0]);
});
test('empty, endpoints, out of range and non-finite ratios refuse without changing source or redo', () => {
  const s=undoSession(previewCageLoop(base(),'.5').session);
  for(const value of ['', ' ', '0','1','-1','2','NaN','Infinity','oops']) {
    const r=previewCageLoop(s,value); assert.ok(r.error); assert.equal(r.session,s); assert.equal(r.session.redo,s.redo);
  }
  const empty=startSession(0,cage); assert.equal(previewCageLoop(empty,'.5').session,empty);
  assert.match(previewCageLoop(startSession(0,cage),'.5').error!,/pick an edge/);
});
test('closed quad ring preserves oriented ratio around all four rails', () => {
  const box={positions:[0,0,0,10,0,0,10,4,0,0,4,0,0,0,8,10,0,8,10,4,8,0,4,8],faces:[[0,3,2,1],[4,5,6,7],[0,1,5,4],[1,2,6,5],[2,3,7,6],[3,0,4,7]]};
  const s=select(startSession(0,box),{kind:'edge',a:0,b:1},false);
  for(const t of [.25,.5,.75]) {
    const r=previewCageLoop(s,String(t));assert.equal(r.error,null);assert.equal(r.session.cage.faces.length,10);
    const pts=r.session.cage.positions.slice(box.positions.length);assert.equal(pts.length,12);
    assert.deepEqual([0,3,6,9].map(i=>pts.slice(i,i+3).join(',')).sort(),[[10*t,0,0],[10*t,4,0],[10*t,0,8],[10*t,4,8]].map(p=>p.join(',')).sort());
  }
});
test('mirror identity survives preview and zero-length rails refuse unchanged', () => {
  const s=select(startSession(0,cage,'x'),{kind:'edge',a:0,b:1},false);
  assert.equal(previewCageLoop(s,'.25').session.mirror,'x');
  const bad=structuredClone(cage);bad.positions.splice(3,3,0,0,0);
  const b=select(startSession(0,bad),{kind:'edge',a:0,b:1},false);
  const r=previewCageLoop(b,'.25');assert.equal(r.session,b);assert.match(r.error!,/zero-length/);
});
