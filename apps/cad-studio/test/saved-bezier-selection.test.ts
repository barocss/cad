import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart } from '@barocss/cad-model/engine/doc';
import { xyPlane } from '@barocss/cad-model/sketch/plane';
import type { SketchState, SketchShape } from '@barocss/cad-model/sketch/types';
import { activateDraftBezier, activateDraftOutline, draftShapeOrder, sketchCutInputs, sketchFinishInputs } from '../src/app/sketchControls';
import { createDraftHistory, draftHistoryState, outlineHistoryState, restoreDraftHistory } from '../src/sketch/draftHistory';
const doc=rectanglePart(10,6,2),plane=xyPlane();
const main:SketchShape={kind:'polygon',closed:true,points:[[0,0],[10,0],[10,6],[0,6]],ids:['a','b','c','d']};
const q:SketchShape={kind:'bezier',poles:[[0,0],[2,4],[4,0]]};
const c:SketchShape={kind:'bezier',poles:[[0,0],[1,3],[3,3],[4,0]]};
const draft=():SketchState=>({tool:'select',shape:main,done:[q,c],plane,editNode:0,mainIds:main.ids});
const order=(s:SketchState)=>sketchCutInputs(s).shapes;
function pick(s:SketchState,target:SketchShape){const r=activateDraftBezier(s,target);assert.ok(r);return r;}
function replay(h:ReturnType<typeof createDraftHistory>,s:SketchState,redo=false){const step=redo?h.redo(draftHistoryState(doc,s)):h.undo(draftHistoryState(doc,s));assert.ok(step);return restoreDraftHistory(s,step);}
test('explicit curve selection only repartitions original objects and keeps Finish order/main ownership',()=>{
 const original=draft(),before=structuredClone(original),saved=JSON.stringify(doc);let current=original;
 for(const curve of [q,c,q]){current=pick(current,curve);assert.equal(current.shape,curve);assert.deepEqual(order(current),[main,q,c]);assert.deepEqual(sketchFinishInputs(current).authored,[main,q,c]);assert.deepEqual(sketchFinishInputs(current).joined,[main,q,c]);assert.equal(current.mainIds,original.mainIds);assert.equal(current.plane,plane);assert.equal(activateDraftBezier(current,curve),current);}
 const returned=activateDraftOutline(current,draftShapeOrder(current).indexOf(main));assert.ok(returned);assert.equal(returned.shape,main);assert.deepEqual(order(returned),[main,q,c]);assert.deepEqual(original,before);assert.equal(JSON.stringify(doc),saved);
});
test('rejects unknown/cloned/duplicate references, malformed/degenerate curves and unsupported draft modes',()=>{
 const s=draft();assert.equal(activateDraftBezier(s,structuredClone(q)),null);assert.equal(activateDraftBezier({...s,done:[q,c,q]},q),null);
 for(const patch of [{editNode:undefined},{tool:'bezier' as const},{tool:'trim' as const}])assert.equal(activateDraftBezier({...s,...patch},q),null);
 for(const source of [{kind:'bezier',poles:[[0,0]]},{kind:'bezier',poles:[[0,0],[0,0],[0,0]]}] as SketchShape[])assert.equal(activateDraftBezier({...s,done:[source]},source),null);
 const hidden:SketchShape={...q,construction:true};assert.equal(activateDraftBezier({...s,hideConstruction:true,done:[hidden]},hidden),null);
 assert.equal(activateDraftBezier(s,main),null);
});
test('edited Q parked behind C or main retains first Undo/Redo without changing selected owner or order',()=>{
 for(const target of [c,main]){
  const selected=pick(draft(),q);assert.ok(q.kind==='bezier');const edited:SketchShape={...q,poles:[[0,0],[2,5],[4,0]]};const after={...selected,shape:edited};const h=createDraftHistory();h.push(outlineHistoryState(q),outlineHistoryState(edited));
  const current:SketchState=target===main?activateDraftOutline(after,draftShapeOrder(after).indexOf(main))!:pick(after,target);
  assert.deepEqual(h.available(draftHistoryState(doc,current)),{undo:true,redo:false});const undo=replay(h,current);assert.equal(undo.shape,target);assert.deepEqual(order(undo),[main,q,c]);const redo=replay(h,undo,true);assert.equal(redo.shape,target);assert.deepEqual(order(redo),[main,edited,c]);assert.equal(redo.mainIds,selected.mainIds);
 }
});
test('parked undo rejects equal-coordinate replacements and duplicate exact owners, active or parked',()=>{
 const selected=pick(draft(),q),edited:SketchShape={kind:'bezier',poles:[[0,0],[2,5],[4,0]]},after={...selected,shape:edited},parked=pick(after,c);
 for(const current of [{...parked,done:parked.done!.map(s=>s===edited?structuredClone(edited):s)},{...parked,done:[...parked.done!,edited]},{...after,done:[...after.done!,edited]}]){
  const h=createDraftHistory();h.push(outlineHistoryState(q),outlineHistoryState(edited));assert.equal(h.available(draftHistoryState(doc,current)).undo,false);assert.equal(h.undo(draftHistoryState(doc,current)),null);
 }
});
