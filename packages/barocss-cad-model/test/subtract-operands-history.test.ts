import assert from 'node:assert/strict';
import test from 'node:test';
import { checkBrep,evaluateCadPart,massPropertiesOf } from '@barocss/cad';
import { subtractHistoryEdit } from '../src/app/subtractHistoryEdit';
import type { Ctx } from '../src/app/commands';
import { emptyDoc,withNode,type StudioDoc,type ModelNode } from '../src/engine/doc';
import { toPartDocument } from '../src/engine/part';
import { encodeStudioFile,readStudioFile } from '../src/engine/container';
function fixture():StudioDoc{
 let d=withNode(withNode(emptyDoc(),{kind:'sketch',profile:'rectangle',min:[0,0],max:[40,30]}),{kind:'extrude',sketch:0,height:10});
 d=withNode(withNode(d,{kind:'sketch',profile:'rectangle',min:[20,0],max:[50,30]}),{kind:'extrude',sketch:2,height:10});
 return withNode(d,{kind:'difference',parent:{node:1,side:'solid'},tool:{node:3,side:'solid'}});
}
const context=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
function build(d:StudioDoc,order='swap'){const c=subtractHistoryEdit(d,4);assert.ok(c?.build);return c.build(context(d),{order});}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function oracle(d:StudioDoc,lo:number,hi:number){
 const outputs=evaluateCadPart(toPartDocument(d)).outputs;assert.equal(outputs.length,1);const o=outputs[0];assert.equal(checkBrep(o.brep,{strict:true}).valid,true);
 const m=massPropertiesOf(o);near(m.volume,(hi-lo)*300);[(lo+hi)/2,15,5].forEach((v,i)=>near(m.centroid[i],v));
 assert.equal(o.brep.vertices.length,8);const remaining=new Set(o.brep.vertices);
 for(const x of [lo,hi])for(const y of [0,30])for(const z of [0,10]){const v=[...remaining].find(v=>Math.hypot(v.point[0]-x,v.point[1]-y,v.point[2]-z)<1e-7);assert.ok(v);remaining.delete(v);}assert.equal(remaining.size,0);
}
const patch=(d:StudioDoc,i:number,p:object):StudioDoc=>({...d,nodes:d.nodes.map((n,j)=>j===i?{...n,...p} as ModelNode:n)});
test('swap changes only operand references; keep and reverse swap preserve exact original data',()=>{
 const d=fixture(),before=structuredClone(d),next=build(d);assert.equal(build(d,'keep'),d);assert.equal(next.outputs,d.outputs);assert.equal(next.nextId,d.nextId);
 const old=d.nodes[4];assert.ok(old.kind==='difference');assert.deepEqual(next.nodes[4],{...old,parent:old.tool,tool:old.parent});
 for(let i=0;i<4;i++)assert.equal(next.nodes[i],d.nodes[i]);assert.deepEqual(build(next),d);assert.deepEqual(d,before);
});
test('independent A minus B and B minus A box oracles and file replay',async()=>{
 const d=fixture(),next=build(d);oracle(d,0,20);oracle(next,40,50);
 const opened=await readStudioFile(encodeStudioFile(next));assert.ok('doc'in opened);assert.deepEqual(opened.doc,JSON.parse(JSON.stringify(next)));oracle(opened.doc,40,50);oracle(build(opened.doc),0,20);
});
test('empty reverse is rejected without mutating a valid accepted subtraction',()=>{
 const d=patch(fixture(),2,{min:[10,10],max:[20,20]}),before=structuredClone(d);
 const output=evaluateCadPart(toPartDocument(d)).outputs[0];assert.equal(checkBrep(output.brep,{strict:true}).valid,true);
 assert.ok(subtractHistoryEdit(d,4));assert.throws(()=>build(d));assert.deepEqual(d,before);
});
test('foreign identity, changed content and invalid choice cannot use a captured command',()=>{
 const d=fixture(),c=subtractHistoryEdit(d,4);assert.ok(c?.build&&c.available);const before=structuredClone(d);
 assert.equal(c.available(context(structuredClone(d))).ok,false);assert.throws(()=>c.build!(context(structuredClone(d)),{order:'swap'}));
 assert.throws(()=>c.build!(context(d),{order:'other'}));assert.deepEqual(d,before);d.parameters.changed=1;
 assert.equal(c.available(context(d)).ok,false);assert.throws(()=>c.build!(context(d),{order:'swap'}));
});
test('nonplain operands, metadata consumers, references and downstream features are excluded',()=>{
 const d=fixture();const cases:StudioDoc[]=[{...d,instances:[]},{...d,drawing:{} as StudioDoc['drawing']},{...d,direct:{} as StudioDoc['direct']},{...d,nodes:[...d.nodes,d.nodes[0]]},
 patch(d,0,{plane:{}}),patch(d,0,{min:[0,0],max:[0,30]}),patch(d,0,{association:{}}),patch(d,0,{max:[Infinity,30]}),
 patch(d,1,{height:{parameter:'H'}}),patch(d,1,{height:0}),patch(d,1,{draft:1}),patch(d,1,{sketch:2}),patch(d,3,{from:NaN}),
 patch(d,4,{made:{}}),patch(d,4,{suppressed:true}),patch(d,4,{id:'n0'}),patch(d,4,{tool:{node:1,side:'solid'}}),patch(d,4,{parent:{node:0,side:'solid'}}),patch(d,4,{parent:{node:1,side:'negative'}}),
 {...d,outputs:{Body:{node:1,side:'solid'}}}];
 for(const bad of cases)assert.equal(subtractHistoryEdit(bad,4),null,JSON.stringify(bad));
 assert.ok(subtractHistoryEdit({...d,direct:undefined},4));assert.equal(subtractHistoryEdit(d,3),null);
});
test('explicit accepted output mapping stays exact across the swap',()=>{
 const d={...fixture(),outputs:{Body:{node:4,side:'solid' as const}}};const next=build(d);assert.equal(next.outputs,d.outputs);oracle(next,40,50);
});
