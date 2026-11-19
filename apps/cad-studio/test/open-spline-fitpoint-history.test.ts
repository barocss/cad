import test from 'node:test';
import assert from 'node:assert/strict';
import {emptyDoc} from '@barocss/cad-model/engine/doc';
import {xyPlane} from '@barocss/cad-model/sketch/plane';
import {splineShape,respline,type SplineDef} from '@barocss/cad-model/sketch/spline';
import type {SketchShape,SketchState} from '@barocss/cad-model/sketch/types';
import {canRecordOpenSplineFitPointDraft as allowed,isOpenSplineFitPointChange as change} from '../src/sketch/openSplineFitPointHistory';
import {createDraftHistory,draftHistoryState,restoreDraftHistory} from '../src/sketch/draftHistory';
type Polygon=Extract<SketchShape,{kind:'polygon'}>;
const shape=():Polygon=>splineShape({fit:[[10,10],[30,20],[50,10]],closed:false});
const draft=(s:Polygon=shape()):SketchState=>({plane:xyPlane(),tool:'select',shape:s});
function edit(s:Polygon,i:number,k:number,value:number):Polygon {
 assert.ok(s.spline);
 const fit=s.spline.fit.map((p,j):[number,number]=>j===i?(k===0?[value,p[1]]:[p[0],value]):p);
 return respline(s,{...s.spline,fit});
}
test('each single fit coordinate regenerates the existing spline without source or metadata mutation',()=>{
 for(let i=0;i<3;i++)for(let k=0;k<2;k++){
  const s=shape();s.ids=['a','b','c','d','e'];s.construction=true;const original=structuredClone(s);
  assert.ok(s.spline);const value=s.spline.fit[i][k]+2.125;
  const n=edit(s,i,k,value);assert.ok(allowed(draft(s)));assert.ok(change(s,n));
  assert.equal(n.ids,s.ids);assert.equal(n.construction,true);assert.deepEqual(s,original);
  assert.deepEqual(n.points[i*2],n.spline!.fit[i]);assert.equal(n.points.length,5);
  assert.equal(n.spline!.fit[i][k],value);
  for(let j=0;j<3;j++)for(let axis=0;axis<2;axis++)if(j!==i||axis!==k)assert.equal(n.spline!.fit[j][axis],s.spline.fit[j][axis]);
 }
 const s=shape();s.spline!.handles=[null,null,null];assert.ok(allowed(draft(s)));assert.ok(change(s,edit(s,1,1,25)));
});
test('no-op, multiple coordinates, explicit handles and foreign metadata cannot become a fit-coordinate step',()=>{
 const s=shape(),n=edit(s,1,1,25);assert.equal(change(s,s),false);assert.equal(change(s,edit(s,1,1,20)),false);
 assert.equal(change(s,edit(n,0,0,11)),false);assert.equal(change(null,n),false);assert.equal(change(s,null),false);
 const handle=respline(s,{...s.spline!,handles:[null,10,null]});assert.equal(change(s,handle),false);
 const variants:Polygon[]=[{...n,ids:['a','b','c','d','e']},{...n,construction:true},{...n,pending:true},{...n,closed:true},({...n,fromSpline:false} as unknown as Polygon),{...n,tangents:[1]},{...n,rules:[]}];
 for(const bad of variants)assert.equal(change(s,bad),false);
 const ids=shape();ids.ids=['a','b','c','d','e'];const idsNext=edit(ids,1,1,25);assert.equal(change(ids,{...idsNext,ids:[...ids.ids]}),false);
 const unknown={...n,foreignOwner:true};assert.equal(change(s,unknown),false);
});
test('exact derived geometry required, including sub-tolerance forged coordinates and sparse arrays',()=>{
 const s=shape(),n=edit(s,1,1,25);
 const points=n.points.map((p):[number,number]=>[...p]);points[1][0]+=1e-10;
 assert.equal(change(s,{...n,points}),false);
 const bulges=[...n.bulges!];bulges[0]+=1e-12;assert.equal(change(s,{...n,bulges}),false);
 const sparsePoints=new Array<[number,number]>(5);sparsePoints[0]=s.points[0];
 const sparseFit=new Array<[number,number]>(3);sparseFit[0]=[10,10];
 const malformed:unknown[]=[{...s,points:sparsePoints},{...s,points:[null,...s.points.slice(1)]},{...s,bulges:new Array(5)},
  {...s,spline:{fit:sparseFit,closed:false}},{...s,spline:{fit:[[10,10],null,[50,10]],closed:false}},
  {...s,spline:{...s.spline,handles:new Array(3)}},{...s,spline:{...s.spline,extra:true}},
  {...s,points:s.points.map((p,i)=>i===1?[NaN,p[1]]:p)}];
 for(const item of malformed){const bad=item as Polygon;assert.doesNotThrow(()=>allowed(draft(bad)));assert.equal(allowed(draft(bad)),false);assert.doesNotThrow(()=>change(s,bad));assert.equal(change(s,bad),false);}
});
test('closed, longer, constrained, incomplete or nonfinite definitions remain outside admission',()=>{
 const s=shape();const patches:Partial<Polygon>[]=[{closed:true},{pending:true},{spline:undefined},({fromSpline:false} as unknown as Partial<Polygon>),{fromEllipse:true},
 {lengths:{0:3}},{radii:{0:3}},{rules:[{kind:'fix',point:0,at:[10,10]}] as Polygon['rules']},{tangents:[1]},
 {equalRadii:[[0,1]]},{concentric:[[0,1]]},{circles:[{c:[0,0],r:1}]},{hv:{h:[0],v:[]}}];
 for(const patch of patches)assert.equal(allowed(draft({...s,...patch})),false);
 const defs:SplineDef[]=[{fit:[[10,10],[30,20],[50,10],[60,20]],closed:false},{fit:[[10,10],[30,20],[50,10]],closed:true}];
 for(const def of defs)assert.equal(allowed(draft(splineShape(def))),false);
 for(const v of [NaN,Infinity,-Infinity,10001]){
  const bad={...s,spline:{...s.spline!,fit:[[10,10],[30,v],[50,10]] as [number,number][]}};
  assert.doesNotThrow(()=>allowed(draft(bad)));assert.equal(allowed(draft(bad)),false);
 }
 assert.equal(allowed(draft({...s,spline:{...s.spline!,fit:[[10,10],[10,10],[50,10]]}})),false);
 assert.equal(allowed(null),false);
});
test('empty constraints removed by respline are allowed, but context owners remain bounded',()=>{
 const s={...shape(),lengths:{},radii:{},rules:[],equalRadii:[],concentric:[],hv:{h:[],v:[]}};
 const n=edit(s,1,1,25);assert.ok(allowed(draft(s)));assert.ok(change(s,n));
 const a=draft();assert.ok(allowed({...a,done:[]}));
 const variants:SketchState[]=[{...a,done:[shape()]},{...a,editNode:0},{...a,association:{} as NonNullable<SketchState['association']>},{...a,band:{} as NonNullable<SketchState['band']>},
 {...a,anchor:{kind:'face',offset:0,face:{plane:xyPlane(),base:null,linkSource:{} as NonNullable<NonNullable<SketchState['anchor']>['face']>['linkSource']}}}];
 for(const bad of variants)assert.equal(allowed(bad),false);
});
test('whole-draft coordinate replay owns the exact document and shape, without claiming App generation coverage',()=>{
 const doc=emptyDoc(),h=createDraftHistory(),a=draft();assert.ok(a.shape?.kind==='polygon');
 const b:SketchState={...a,shape:edit(a.shape,1,1,25)};assert.ok(b.shape?.kind==='polygon');
 const c:SketchState={...b,shape:edit(b.shape,1,1,30)};
 h.push(draftHistoryState(doc,a),draftHistoryState(doc,b));h.push(draftHistoryState(doc,b),draftHistoryState(doc,c));
 let current:SketchState=c;
 for(const expected of [b,a]){const entry=h.undo(draftHistoryState(doc,current));assert.ok(entry);current=restoreDraftHistory(current,entry);assert.equal(current.shape,expected.shape);}
 for(const expected of [b,c]){const entry=h.redo(draftHistoryState(doc,current));assert.ok(entry);current=restoreDraftHistory(current,entry);assert.equal(current.shape,expected.shape);}
 for(const owner of [draftHistoryState(emptyDoc(),c),draftHistoryState(doc,{...c,shape:structuredClone(c.shape)})]){
  const isolated=createDraftHistory();isolated.push(draftHistoryState(doc,b),draftHistoryState(doc,c));assert.equal(isolated.undo(owner),null);assert.equal(isolated.undo(draftHistoryState(doc,c)),null);
 }
});
