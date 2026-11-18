import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {xyPlane} from '@barocss/cad-model/sketch/plane';
import type {SketchShape,SketchState} from '@barocss/cad-model/sketch/types';
import {canEditOpenLineLength,openLineLength,isOpenLineLengthChange} from '../src/sketch/openLineLength';
import {createDraftHistory,draftHistoryState,restoreDraftHistory} from '../src/sketch/draftHistory';
type Line=Extract<SketchShape,{kind:'polygon'}>;
const line=(a:[number,number]=[10,10],b:[number,number]=[30,10]):Line=>({kind:'polygon',points:[a,b],closed:false,bulges:[0,0]});
const near=(a:number,b:number)=>assert.ok(Number.isFinite(a)&&Math.abs(a-b)<=1e-10,`${a} != ${b}`);
function changed(shape:Line,length:number):Line {const next=openLineLength(shape,length);assert.ok(next?.kind==='polygon');return next;}
test('horizontal vertical and oblique length edits preserve first point direction and exact metadata',()=>{
 for(const shape of [line(),line([2.123456789,-3.987654321],[2.123456789,-23.987654321]),line([1.123456789,-2.234567891],[7.123456789,5.765432109])]){
  shape.ids=['e11','e12'];shape.construction=true;const before=structuredClone(shape),a=shape.points[0],b=shape.points[1],dx=b[0]-a[0],dy=b[1]-a[1],length=Math.hypot(dx,dy);
  Object.freeze(a);Object.freeze(b);Object.freeze(shape.points);Object.freeze(shape.ids);Object.freeze(shape);
  assert.ok(canEditOpenLineLength(shape));const next=changed(shape,17.123456789);
  assert.equal(next.points[0],a);assert.equal(next.ids,shape.ids);assert.equal(next.bulges,shape.bulges);assert.equal(next.construction,true);
  assert.deepEqual({...next,points:shape.points},shape);near(next.points[1][0],a[0]+17.123456789*dx/length);near(next.points[1][1],a[1]+17.123456789*dy/length);near(Math.hypot(next.points[1][0]-a[0],next.points[1][1]-a[1]),17.123456789);
  assert.ok(isOpenLineLengthChange(shape,next));assert.deepEqual(shape,before);
 }
});
test('same length keeps identity and invalid numbers or collapsed/overflowing geometry refuse',()=>{
 const shape=line();assert.equal(openLineLength(shape,20),shape);assert.equal(isOpenLineLengthChange(shape,shape),false);
 for(const value of [0,-1,NaN,Infinity,-Infinity,Number.MAX_VALUE,Number.MIN_VALUE])assert.equal(openLineLength(shape,value),null);
 for(const bad of [line([0,0],[0,0]),line([NaN,0],[10,0]),line([0,0],[Infinity,0]),line([-Number.MAX_VALUE,0],[Number.MAX_VALUE,0])]){assert.equal(canEditOpenLineLength(bad),false);assert.equal(openLineLength(bad,30),null);}
 assert.equal(canEditOpenLineLength(null),false);assert.equal(isOpenLineLengthChange(null,shape),false);
});
test('closed multi-point curved constrained and definition-owned shapes cannot use this direct edit',()=>{
 const s=line();const patches:Partial<Line>[]=[{closed:true},{pending:true},{points:[[0,0],[10,0],[10,10]]},{bulges:[.1,0]},
  {lengths:{0:20}},{radii:{0:10}},{hv:{h:[0],v:[]}},{rules:[{kind:'fix',point:0,at:[10,10]}] as Line['rules']},
  {tangents:[0]},{equalRadii:[[0,1]]},{concentric:[[0,1]]},{circles:[{c:[0,0],r:2}]},{circleIds:['c1']},{fromRectangle:true},{fromSpline:true},{fromEllipse:true}];
 for(const patch of patches){const bad={...s,...patch},before=structuredClone(bad);assert.equal(canEditOpenLineLength(bad),false,JSON.stringify(patch));assert.equal(openLineLength(bad,30),null);assert.deepEqual(bad,before);}
 const unknown={...s,foreignOwner:true};assert.equal(canEditOpenLineLength(unknown),false);
 assert.equal(openLineLength({kind:'circle',c:[0,0],r:3},30),null);
 const empty={...s,pending:false,lengths:{},radii:{},hv:{h:[],v:[]},rules:[],tangents:[],equalRadii:[],concentric:[],circles:[],circleIds:[]};assert.ok(canEditOpenLineLength(empty));assert.ok(openLineLength(empty,30));
});
test('tagged edit validation refuses moved origin changed direction or metadata and no-op',()=>{
 const source={...line(),ids:['e1','e2']},next=changed(source,30);assert.ok(isOpenLineLengthChange(source,next));
 const variants:Line[]=[{...next,points:[[11,10],next.points[1]]},{...next,points:[source.points[0],[40,11]]},{...next,points:[source.points[0],[0,10]]},{...next,construction:true},{...next,ids:['e3','e4']},{...next,lengths:{0:30}},{...next,closed:true}];
 for(const bad of variants)assert.equal(isOpenLineLengthChange(source,bad),false);
});
test('owned draft snapshots replay repeated length edits before original point placement without widening identity matching',()=>{
 const doc=emptyDoc(),history=createDraftHistory(),first:Line={kind:'polygon',points:[[10,10]],closed:false,bulges:[0]},original=line(),long=changed(original,30),short=changed(long,25);
 const a:SketchState={plane:xyPlane(),tool:'polygon',shape:first,clearedSideIds:['e9']},b={...a,shape:original},c={...b,shape:long},d={...c,shape:short};
 for(const [before,after] of [[a,b],[b,c],[c,d]])history.push(draftHistoryState(doc,before),draftHistoryState(doc,after));
 let current:SketchState=d;
 for(const expected of [long,original,first]){const step=history.undo(draftHistoryState(doc,current));assert.ok(step);current=restoreDraftHistory(current,step);assert.equal(current.shape,expected);assert.equal(current.clearedSideIds,a.clearedSideIds);}
 for(const expected of [original,long,short]){const step=history.redo(draftHistoryState(doc,current));assert.ok(step);current=restoreDraftHistory(current,step);assert.equal(current.shape,expected);}
 const other=createDraftHistory();other.push(draftHistoryState(doc,b),draftHistoryState(doc,c));assert.equal(other.undo(draftHistoryState(emptyDoc(),c)),null);
 const cloned=createDraftHistory();cloned.push(draftHistoryState(doc,b),draftHistoryState(doc,c));assert.equal(cloned.undo(draftHistoryState(doc,{...c,shape:structuredClone(long)})),null);
});
