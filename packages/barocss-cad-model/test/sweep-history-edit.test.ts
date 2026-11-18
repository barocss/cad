import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep, evaluateCadPart, faceGeometry, massPropertiesOf } from '@barocss/cad';
import type { Ctx } from '../src/app/commands';
import { sweepHistoryEdit } from '../src/app/sweepHistoryEdit';
import { emptyDoc, withNode, type StudioDoc, type ModelNode } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile, readStudioFile } from '../src/engine/container';
function fixture(): StudioDoc {
 return withNode(withNode(emptyDoc(), {kind:'sketch',profile:'circle',center:[4,7],radius:2}),
 {kind:'sweep-curve',sketch:0,name:'Copied line',path:{degree:1,knots:[0,0,1,1],controlPoints:[[3,5,7],[3,5,27]],weights:[1,1]}});
}
const context=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
function build(doc:StudioDoc, representation:string):StudioDoc {
 const command=sweepHistoryEdit(doc,1);assert.ok(command?.build);return command.build(context(doc),{representation});
}
const patch=(doc:StudioDoc,index:number,props:object):StudioDoc=>({...doc,nodes:doc.nodes.map((n,i)=>i===index?{...n,...props} as ModelNode:n)});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
test('representation changes only mode and preserves the copied inputs and original source',()=>{
 const doc=fixture(),before=structuredClone(doc),next=build(doc,'exact-straight');
 assert.equal(next.nodes[0],doc.nodes[0]);assert.equal(next.outputs,doc.outputs);
 assert.ok(next.nodes[1].kind==='sweep-curve'&&doc.nodes[1].kind==='sweep-curve');
 assert.equal(next.nodes[1].path,doc.nodes[1].path);
 assert.deepEqual(next.nodes[1],{...doc.nodes[1],mode:'exact-straight'});assert.deepEqual(doc,before);
 assert.equal(build(next,'exact-straight'),next);assert.deepEqual(build(next,'faceted'),doc);
 assert.equal(build(doc,'faceted'),doc);
});
test('exact disk sweep is one strict native cylinder with independent mass and cap oracle; file roundtrip preserves it',async()=>{
 const next=build(fixture(),'exact-straight');
 const opened=await readStudioFile(encodeStudioFile(next));assert.ok('doc' in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(next)));
 for(const doc of [next,opened.doc]){
  assert.ok(doc);const result=evaluateCadPart(toPartDocument(doc));assert.equal(result.outputs.length,1);
  const out=result.outputs[0];assert.equal(checkBrep(out.brep,{strict:true}).valid,true);
  const mass=massPropertiesOf(out);near(mass.volume,Math.PI*4*20);[3,5,17].forEach((v,i)=>near(mass.centroid[i],v));
  const cylinders=out.brep.faces.map(faceGeometry).filter(g=>g.kind==='cylinder');assert.ok(cylinders.length>0);
  for(const c of cylinders){near(c.r,2);near(Math.abs(c.a[2]),1);}
  const points=out.brep.vertices.map(v=>v.point);
  assert.ok(points.some(p=>Math.abs(p[2]-7)<1e-7));assert.ok(points.some(p=>Math.abs(p[2]-27)<1e-7));
  for(const p of points){near(Math.hypot(p[0]-3,p[1]-5),2);assert.ok(Math.abs(p[2]-7)<1e-7||Math.abs(p[2]-27)<1e-7);}
 }
});
test('owner identity and in-place source changes invalidate captured commands',()=>{
 const doc=fixture(),cmd=sweepHistoryEdit(doc,1);assert.ok(cmd?.build&&cmd.available);
 const other=structuredClone(doc);assert.equal(cmd.available(context(other)).ok,false);
 assert.throws(()=>cmd.build!(context(other),{representation:'exact-straight'}));
 doc.parameters.changed=1;assert.equal(cmd.available(context(doc)).ok,false);
 assert.throws(()=>cmd.build!(context(doc),{representation:'exact-straight'}));
});
test('invalid choice and native refusals never mutate the accepted input',()=>{
 const base=fixture();const s=base.nodes[1];assert.ok(s.kind==='sweep-curve');
 const cases=[base,patch(base,1,{path:{degree:2,knots:[0,0,0,1,1,1],controlPoints:[[3,5,7],[8,5,17],[3,5,27]],weights:[1,1,1]}}),
 patch(base,1,{path:{...s.path,controlPoints:[[3,5,7],[3,5,7]]}}),patch(base,0,{radius:10001})];
 for(const [i,doc] of cases.entries()){
  const before=structuredClone(doc),command=sweepHistoryEdit(doc,1);assert.ok(command?.build);
  assert.throws(()=>command.build!(context(doc),{representation:i===0?'unknown':'exact-straight'}));assert.deepEqual(doc,before);
 }
});
test('metadata consumers, associated profiles, downstream nodes and nonunique identities are excluded',()=>{
 const base=fixture();
 const cases:StudioDoc[]=[{...base,drawing:{} as StudioDoc['drawing']},{...base,instances:[]},
  {...base,nodes:[...base.nodes,base.nodes[0]]},patch(base,1,{id:'n0'}),patch(base,1,{sketch:1}),
  patch(base,1,{mode:'exact'}),patch(base,1,{routeBundleMember:{bundleId:'route',memberId:'member'}}),
  patch(base,1,{made:{}}),patch(base,1,{held:{reason:'test'}}),patch(base,1,{suppressed:true}),
  patch(base,0,{association:{}}),patch(base,0,{on:{node:0,side:'solid'}}),patch(base,0,{pocketFloor:{}}),
  patch(base,0,{radius:{parameter:'Radius'}}),patch(base,0,{profile:'rectangle',min:[0,0],max:[4,4]}),
  patch(base,0,{holes:[]}),patch(base,0,{construction:true})];
 for(const doc of cases){assert.equal(sweepHistoryEdit(doc,1),null,JSON.stringify(doc));}
 assert.equal(sweepHistoryEdit(base,0),null);
});
test('Studio degree-two straight path and reversed direction retain exact independent mass',()=>{
 for(const reverse of [false,true]){
  const points:[number,number,number][]=[[3,5,7],[3,5,17],[3,5,27]];
  if(reverse)points.reverse();
  const doc=patch(fixture(),1,{path:{degree:2,knots:[0,0,0,1,1,1],controlPoints:points,weights:[1,1,1]}});
  const out=evaluateCadPart(toPartDocument(build(doc,'exact-straight'))).outputs[0];
  assert.equal(checkBrep(out.brep,{strict:true}).valid,true);const mass=massPropertiesOf(out);
  near(mass.volume,Math.PI*4*20);[3,5,17].forEach((v,i)=>near(mass.centroid[i],v));
 }
});
test('unequal weights refuse exact conversion; malformed knots are not offered; bent Faceted no-op stays unchanged',()=>{
 const path={degree:2,knots:[0,0,0,1,1,1],controlPoints:[[3,5,7],[3,5,17],[3,5,27]],weights:[1,2,1]};
 const unequal=patch(fixture(),1,{path}),before=structuredClone(unequal);
 assert.ok(sweepHistoryEdit(unequal,1));assert.throws(()=>build(unequal,'exact-straight'));assert.deepEqual(unequal,before);
 assert.equal(sweepHistoryEdit(patch(fixture(),1,{path:{...path,knots:[0,1]}}),1),null);
 const bent=patch(fixture(),1,{path:{...path,weights:[1,1,1],controlPoints:[[3,5,7],[8,5,17],[3,5,27]]}});
 assert.equal(build(bent,'faceted'),bent);
});
test('explicit solid output is preserved while foreign output references are excluded',()=>{
 const doc={...fixture(),outputs:{Body:{node:1,side:'solid' as const}}};
 const next=build(doc,'exact-straight');assert.equal(next.outputs,doc.outputs);assert.deepEqual(build(next,'faceted').outputs,doc.outputs);
 for(const ref of [{node:0,side:'solid'},{node:2,side:'solid'},{node:1,side:'other'}]){
  assert.equal(sweepHistoryEdit({...doc,outputs:{Body:ref}} as StudioDoc,1),null);
 }
});
