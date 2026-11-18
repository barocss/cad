import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBrep,evaluateCadPart,massPropertiesOf} from '@barocss/cad';
import {booleanHistoryEdit} from '../src/app/booleanHistoryEdit';
import type {Ctx} from '../src/app/commands';
import {emptyDoc,withNode,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {toPartDocument} from '../src/engine/part';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
function fixture():StudioDoc{
 let d=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]}),{kind:'extrude',sketch:0,height:10});
 d=withNode(withNode(d,{kind:'sketch',profile:'rectangle',min:[20,0],max:[50,30]}),{kind:'extrude',sketch:2,height:10});
 return withNode(d,{kind:'union',left:{node:1,side:'solid'},right:{node:3,side:'solid'}});
}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
function build(d:StudioDoc,operation='intersect'){const c=booleanHistoryEdit(d,4);assert.ok(c?.build);return c.build(ctx(d),{operation});}
const patch=(d:StudioDoc,i:number,p:object):StudioDoc=>({...d,nodes:d.nodes.map((n,j)=>i===j?{...n,...p} as ModelNode:n)});
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function oracle(d:StudioDoc,intersection:boolean){
 const outputs=evaluateCadPart(toPartDocument(d)).outputs;assert.equal(outputs.length,1);const o=outputs[0];assert.equal(o.brep.bodies.length,1);assert.equal(o.brep.bodies[0].kind,'solid');assert.equal(checkBrep(o.brep,{strict:true}).valid,true);
 const m=massPropertiesOf(o);near(m.volume,intersection?6000:15000);[intersection?30:25,15,5].forEach((v,i)=>near(m.centroid[i],v));
 const xs=intersection?[20,40]:[0,20,50],remaining=new Set(o.brep.vertices);assert.equal(remaining.size,xs.length*4);
 for(const x of xs)for(const y of [0,30])for(const z of [0,10]){const v=[...remaining].find(v=>Math.hypot(v.point[0]-x,v.point[1]-y,v.point[2]-z)<1e-7);assert.ok(v,'unique independent boundary vertex');remaining.delete(v);}assert.equal(remaining.size,0);
}
test('operation changes only kind, preserves source identity, and roundtrips both modes',async()=>{
 const d=fixture(),before=structuredClone(d),next=build(d);assert.equal(build(d,'union'),d);assert.equal(build(next),next);
 assert.deepEqual(next.nodes[4],{...d.nodes[4],kind:'intersect'});for(let i=0;i<4;i++)assert.equal(next.nodes[i],d.nodes[i]);assert.equal(next.outputs,d.outputs);assert.equal(next.nextId,d.nextId);assert.deepEqual(build(next,'union'),d);assert.deepEqual(d,before);
 for(const doc of [d,next]){const open=await readStudioFile(encodeStudioFile(doc));assert.ok('doc'in open);assert.deepEqual(open.doc,JSON.parse(JSON.stringify(doc)));oracle(open.doc,doc.nodes[4].kind==='intersect');}
});
test('independent native union and intersection volume centroid and all boundary vertices',()=>{const d=fixture();oracle(d,false);oracle(build(d),true);});
test('tangent valid Union refuses empty intersection without changing accepted document',()=>{
 const d=patch(fixture(),2,{min:[40,0],max:[50,30]}),before=structuredClone(d);const o=evaluateCadPart(toPartDocument(d)).outputs[0];assert.equal(checkBrep(o.brep,{strict:true}).valid,true);near(massPropertiesOf(o).volume,15000);
 const vertices=new Set(o.brep.vertices);assert.equal(vertices.size,12);for(const x of [0,40,50])for(const y of [0,30])for(const z of [0,10]){const v=[...vertices].find(v=>Math.hypot(v.point[0]-x,v.point[1]-y,v.point[2]-z)<1e-7);assert.ok(v);vertices.delete(v);}assert.equal(vertices.size,0);assert.throws(()=>build(d));assert.deepEqual(d,before);
});
test('captured command rejects foreign documents, changed content and unsupported operation',()=>{
 const d=fixture(),c=booleanHistoryEdit(d,4);assert.ok(c?.build&&c.available);const before=structuredClone(d);
 assert.equal(c.available(ctx(structuredClone(d))).ok,false);assert.throws(()=>c.build!(ctx(structuredClone(d)),{operation:'intersect'}));assert.throws(()=>build(d,'difference'));assert.deepEqual(d,before);
 d.parameters.changed=1;assert.equal(c.available(ctx(d)).ok,false);assert.throws(()=>c.build!(ctx(d),{operation:'intersect'}));
});
test('metadata, nonplain source geometry, invalid references and downstream nodes are excluded',()=>{
 const d=fixture();const cases:StudioDoc[]=[{...d,instances:[]},{...d,direct:{} as StudioDoc['direct']},{...d,drawing:{} as StudioDoc['drawing']},{...d,nodes:[...d.nodes,d.nodes[0]]},
 patch(d,0,{plane:{}}),patch(d,0,{min:[0,0],max:[0,30]}),patch(d,0,{association:{}}),patch(d,0,{max:[Infinity,30]}),patch(d,1,{height:{parameter:'H'}}),patch(d,1,{height:0}),patch(d,1,{draft:2}),patch(d,3,{from:NaN}),patch(d,3,{sketch:0}),
 patch(d,4,{made:{}}),patch(d,4,{held:{}}),patch(d,4,{suppressed:true}),patch(d,4,{id:'n0'}),patch(d,4,{left:{node:1,side:'negative'}}),patch(d,4,{right:{node:1,side:'solid'}}),patch(d,4,{right:{node:2,side:'solid'}}),{...d,outputs:{Body:{node:1,side:'solid'}}}];
 for(const bad of cases)assert.equal(booleanHistoryEdit(bad,4),null,JSON.stringify(bad));assert.ok(booleanHistoryEdit({...d,direct:undefined},4));assert.equal(booleanHistoryEdit(d,3),null);
});
test('explicit output refs and operand order survive conversion',()=>{
 const d={...fixture(),outputs:{Body:{node:4,side:'solid' as const}}},next=build(d);assert.equal(next.outputs,d.outputs);const n=d.nodes[4];assert.ok(n.kind==='union');assert.ok(next.nodes[4].kind==='intersect');assert.equal(next.nodes[4].left,n.left);assert.equal(next.nodes[4].right,n.right);oracle(next,true);
});
