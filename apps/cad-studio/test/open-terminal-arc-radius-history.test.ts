import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {xyPlane} from '@barocss/cad-model/sketch/plane';
import type {SketchShape,SketchState} from '@barocss/cad-model/sketch/types';
import {canRecordOpenArcRadiusDraft as allowed,isOpenArcRadiusChange as change} from '../src/sketch/openArcRadiusHistory';
import {createDraftHistory,draftHistoryState,restoreDraftHistory} from '../src/sketch/draftHistory';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const shape=(b=.5):Polygon=>({kind:'polygon',closed:false,points:[[10,10],[30,10],[30,30],[10,30]],bulges:[0,0,b,0]});
const draft=(s:Polygon=shape()):SketchState=>({plane:xyPlane(),tool:'arc',shape:s});
const radiusEdit=(s:Polygon,b:number):Polygon=>({...s,bulges:[0,0,b,0]});
test('only terminal bulge changes on four-point chain while authored endpoint and metadata identities remain untouched',()=>{
 for(const [old,next] of [[.5,.4],[-.5,-.4],[2,3],[-2,-3]]){
  const s=shape(old);s.ids=['e1','e2','e3','e4'];s.construction=true;const original=structuredClone(s);
  s.points.forEach(Object.freeze);Object.freeze(s.points);Object.freeze(s.bulges);Object.freeze(s.ids);Object.freeze(s);
  const n=radiusEdit(s,next);assert.ok(allowed(draft(s)));assert.ok(change(s,n));assert.equal(n.points,s.points);assert.equal(n.ids,s.ids);assert.deepEqual({...n,bulges:s.bulges},s);assert.deepEqual(s,original);
 }
});
test('event proof rejects no-op, branch/sign changes, invalid bulges and any other authored change',()=>{
 const s=shape(),n=radiusEdit(s,.4);assert.equal(change(s,s),false);assert.equal(change(s,radiusEdit(s,.5)),false);assert.equal(change(null,n),false);assert.equal(change(s,null),false);
 for(const b of [0,NaN,Infinity,-Infinity,-.4,2])assert.equal(change(s,radiusEdit(s,b)),false,`bulge ${b}`);
 const variants:Polygon[]=[{...n,points:[...s.points]},{...n,points:s.points.map(p=>[...p])},{...n,points:[s.points[0],s.points[1],s.points[2],[10,31]]},{...n,ids:['e1','e2','e3','e4']},{...n,construction:true},{...n,bulges:[.1,0,.4,0]},{...n,bulges:[0,0,.4,.1]},{...n,bulges:[0,0,.4]},{...n,closed:true},{...n,pending:true}];
 for(const bad of variants)assert.equal(change(s,bad),false);
 const major=shape(2);assert.equal(change(major,radiusEdit(major,.5)),false);
});
test('only completed unconstrained four-point two-Line plus terminal Arc is newly admitted',()=>{
 const s=shape();const variants:Partial<Polygon>[]=[{pending:true},{closed:true},{points:[[0,0],[1,1]]},{points:[...s.points,[0,10]],bulges:[0,0,0,.5,0]},
 {points:[[10,10],[10,10],[30,30],[10,30]]},{points:[[10,10],[30,10],[30,10],[10,30]]},{points:[[10,10],[30,10],[30,30],[30,30]]},
 {points:[[10,10],[30,10],[30,30],[10,10]]},{points:[[10,10],[30,10],[30,30],[10,10.00005]]},
 {points:[[10,10],[30,10],[30,30],[NaN,30]]},{points:[[10,10],[30,10],[30,30],[Infinity,30]]},
 {bulges:[0,0,0,0]},{bulges:[.2,0,.5,0]},{bulges:[0,.2,.5,0]},{bulges:[0,0,.5,1]},
 {lengths:{0:20}},{radii:{2:12.5}},{hv:{h:[0],v:[]}},{rules:[{kind:'fix',point:1,at:[30,10]}] as Polygon['rules']},
 {tangents:[2]},{equalRadii:[[0,2]]},{concentric:[[0,2]]},{circles:[{c:[0,0],r:2}]},{fromRectangle:true},{fromSpline:true},{fromEllipse:true}];
 for(const patch of variants)assert.equal(allowed(draft({...s,...patch})),false,JSON.stringify(patch));
 const unknown={...s,foreignOwner:true};assert.equal(allowed(draft(unknown)),false);
 assert.equal(allowed(null),false);
 const empty={...s,lengths:{},radii:{},rules:[],tangents:[],equalRadii:[],concentric:[],circles:[],circleIds:[],hv:{h:[],v:[]}};assert.ok(allowed(draft(empty)));assert.ok(change(empty,radiusEdit(empty,.4)));
 const sparse=new Array(4);sparse[0]=s.points[0];sparse[2]=s.points[2];sparse[3]=s.points[3];
 for(const points of [[s.points[0],null,s.points[2],s.points[3]],sparse]){const malformed={...s,points} as unknown as Polygon;assert.doesNotThrow(()=>allowed(draft(malformed)));assert.equal(allowed(draft(malformed)),false);}
});
test('shared draft admission excludes another outline, reopened and linked owners',()=>{
 const s=draft();assert.ok(allowed(s));assert.ok(allowed({...s,done:[]}));
 const variants:SketchState[]=[{...s,done:[shape()]},{...s,editNode:0},{...s,association:{} as NonNullable<SketchState['association']>},{...s,band:{} as NonNullable<SketchState['band']>},{...s,anchor:{kind:'face',offset:0,face:{plane:xyPlane(),base:null,linkSource:{} as NonNullable<NonNullable<SketchState['anchor']>['face']>['linkSource']}}}];
 for(const candidate of variants)assert.equal(allowed(candidate),false);
});
test('explicitly recorded whole-draft replay preserves radius edits and rejects foreign owners',()=>{
 // This exercises draftHistory ownership, not the App callback or its generation guard.
 const doc=emptyDoc(),history=createDraftHistory(),a=draft(),b={...a,shape:radiusEdit(a.shape as Polygon,.4)},c={...b,shape:radiusEdit(b.shape,.3)};
 history.push(draftHistoryState(doc,a),draftHistoryState(doc,b));history.push(draftHistoryState(doc,b),draftHistoryState(doc,c));
 // A foreign owner intentionally clears history; isolate each negative from positive replay.
 for(const foreign of [draftHistoryState(emptyDoc(),c),draftHistoryState(doc,{...c,shape:structuredClone(c.shape)})]){
  const isolated=createDraftHistory();isolated.push(draftHistoryState(doc,b),draftHistoryState(doc,c));assert.equal(isolated.undo(foreign),null);assert.equal(isolated.undo(draftHistoryState(doc,c)),null);
 }
 let current:SketchState=c;
 for(const expected of [b,a]){const entry=history.undo(draftHistoryState(doc,current));assert.ok(entry);current=restoreDraftHistory(current,entry);assert.equal(current.shape,expected.shape);}
 for(const expected of [b,c]){const entry=history.redo(draftHistoryState(doc,current));assert.ok(entry);current=restoreDraftHistory(current,entry);assert.equal(current.shape,expected.shape);}
 assert.equal(current.shape?.kind,'polygon');assert.equal((current.shape as Polygon).points,(a.shape as Polygon).points);
});

test('sparse bulges, metadata changes and nonterminal arc migration cannot masquerade as radius changes',()=>{
 const s=shape(),after=radiusEdit(s,.4),sparse=new Array<number>(4);sparse[0]=0;sparse[2]=.4;sparse[3]=0;
 for(const bulges of [sparse,[0,NaN,.4,0],[0,Infinity,.4,0],[0,.4,0,0]])assert.equal(change(s,{...after,bulges}),false);
 assert.equal(change(s,{...after,lengths:{}}),false);assert.equal(change(s,{...after,ids:['new1','new2','new3','new4']}),false);
 assert.equal(change(s,{...after,points:[...s.points]}),false);
});
