import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {xyPlane} from '@barocss/cad-model/sketch/plane';
import type {SketchShape,SketchState} from '@barocss/cad-model/sketch/types';
import {canEditOpenPolylineTerminalLength as canEdit,canEditOpenPolylineTerminalDraft as draftCanEdit,openPolylineTerminalLength as edit,isOpenPolylineTerminalLengthChange as validChange} from '../src/sketch/openPolylineTerminalLength';
import {createDraftHistory,draftHistoryState,restoreDraftHistory} from '../src/sketch/draftHistory';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const shape=(points:[number,number][]=[[10,10],[40,10],[40,25]]):Polygon=>({kind:'polygon',points,closed:false,bulges:points.map(()=>0)});
function changed(s:Polygon,n:number):Polygon{const next=edit(s,n);assert.ok(next?.kind==='polygon');return next;}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-10,`${a} != ${b}`);
test('only terminal point moves, retaining every prior point and metadata for vertical oblique and negative directions',()=>{
 for(const s of [shape(),shape([[1.123456789,2],[3,4],[6.123456789,8.987654321]]),shape([[0,0],[20,0],[20,10],[5,10]])]){
  s.ids=s.points.map((_,i)=>`e${i}`);s.construction=true;const original=structuredClone(s),last=s.points.length-1,a=s.points[last-1],b=s.points[last],old=Math.hypot(b[0]-a[0],b[1]-a[1]);
  s.points.forEach(Object.freeze);Object.freeze(s.points);Object.freeze(s.ids);Object.freeze(s);
  assert.ok(canEdit(s));const n=changed(s,17.123456789);assert.ok(validChange(s,n));
  s.points.slice(0,last).forEach((p,i)=>assert.equal(n.points[i],p));assert.equal(n.ids,s.ids);assert.equal(n.bulges,s.bulges);assert.deepEqual({...n,points:s.points},s);
  near(n.points[last][0],a[0]+(b[0]-a[0])/old*17.123456789);near(n.points[last][1],a[1]+(b[1]-a[1])/old*17.123456789);assert.deepEqual(s,original);
 }
});
test('no-op identity and numeric bounds preserve source',()=>{const s=shape();assert.equal(edit(s,15),s);assert.equal(validChange(s,s),false);for(const n of [0,-1,NaN,Infinity,Number.MAX_VALUE,Number.MIN_VALUE])assert.equal(edit(s,n),null);assert.equal(canEdit(null),false);});
test('pending curved constrained defined malformed and degenerate shapes fail closed',()=>{
 const s=shape();const variants:Partial<Polygon>[]=[{closed:true},{pending:true},{points:[[0,0],[1,0]]},{points:[[0,0],[0,0],[1,1]]},{points:[[0,0],[1,1],[Infinity,3]]},{bulges:[0,0]},{bulges:[0,.1,0]}, {lengths:{1:15}},{radii:{1:3}},{hv:{h:[0],v:[]}},{rules:[{kind:'fix',point:0,at:[10,10]}] as Polygon['rules']},{tangents:[1]},{equalRadii:[[0,1]]},{concentric:[[0,1]]},{circles:[{c:[0,0],r:2}]},{circleIds:['c1']},{fromRectangle:true},{fromSpline:true},{fromEllipse:true}];
 for(const patch of variants){const bad={...s,...patch};assert.equal(canEdit(bad),false,JSON.stringify(patch));assert.equal(edit(bad,20),null);}
 const foreign={...s,foreignOwner:true};assert.equal(canEdit(foreign),false);
 const empty={...s,pending:false,lengths:{},radii:{},rules:[],tangents:[],equalRadii:[],concentric:[],circles:[],circleIds:[],hv:{h:[],v:[]}};assert.ok(canEdit(empty));assert.ok(edit(empty,20));
});
test('first-point join tolerance is excluded, without claiming a general intersection validator',()=>{
 const s=shape([[0,0],[20,0],[10,0]]);assert.equal(edit(s,20),null);assert.equal(edit(s,20-5e-5),null);assert.equal(edit(s,20+5e-5),null);assert.ok(edit(s,20-2e-4));assert.equal(canEdit(shape([[0,0],[20,0],[5e-5,0]])),false);
});
test('event proof rejects earlier cloned or moved points, count metadata direction and no-op changes',()=>{
 const s=shape(),n=changed(s,20);assert.ok(validChange(s,n));
 const variants:Polygon[]=[{...n,points:[[...s.points[0]],...n.points.slice(1)]},{...n,points:[s.points[0],[41,10],n.points[2]]},{...n,points:[...n.points,[10,30]]},{...n,points:[s.points[0],s.points[1],[41,30]]},{...n,points:[s.points[0],s.points[1],[40,0]]},{...n,ids:['foreign']},{...n,construction:true},{...n,lengths:{1:20}}];
 for(const bad of variants)assert.equal(validChange(s,bad),false);assert.equal(validChange(null,n),false);
});
test('whole-draft replay reaches original point placement and rejects foreign document or cloned shape',()=>{
 const doc=emptyDoc(),history=createDraftHistory(),a:SketchState={plane:xyPlane(),tool:'polygon',shape:shape([[10,10],[40,10]]),clearedSideIds:['e9']},b={...a,shape:shape()},c={...b,shape:changed(b.shape,20)},d={...c,shape:changed(c.shape,25)};
 for(const [before,after] of [[a,b],[b,c],[c,d]])history.push(draftHistoryState(doc,before),draftHistoryState(doc,after));let current:SketchState=d;
 for(const expected of [c,b,a]){const entry=history.undo(draftHistoryState(doc,current));assert.ok(entry);current=restoreDraftHistory(current,entry);assert.equal(current.shape,expected.shape);assert.equal(current.clearedSideIds,a.clearedSideIds);}
 for(const expected of [b,c,d]){const entry=history.redo(draftHistoryState(doc,current));assert.ok(entry);current=restoreDraftHistory(current,entry);assert.equal(current.shape,expected.shape);}
 assert.equal(history.undo(draftHistoryState(emptyDoc(),d)),null);assert.equal(history.undo(draftHistoryState(doc,{...d,shape:structuredClone(d.shape)})),null);
});

test('UI and Apply share optional-done, reopen and connected-owner admission',()=>{
 const draft:SketchState={plane:xyPlane(),tool:'polygon',shape:shape()};assert.ok(draftCanEdit(draft));assert.ok(draftCanEdit({...draft,done:[]}));assert.equal(draftCanEdit(null),false);
 const variants:SketchState[]=[{...draft,done:[shape()]},{...draft,editNode:0},{...draft,association:{} as NonNullable<SketchState['association']>},{...draft,band:{} as NonNullable<SketchState['band']>},{...draft,anchor:{kind:'face',offset:0,face:{plane:xyPlane(),base:null,linkSource:{} as NonNullable<NonNullable<SketchState['anchor']>['face']>['linkSource']}}}];
 for(const candidate of variants)assert.equal(draftCanEdit(candidate),false);
});
