import assert from 'node:assert/strict';
import test from 'node:test';
import {checkBrep,evaluateCadPart,faceGeometry,massPropertiesOf} from '@barocss/cad';
import {sweepPathHistoryEdit} from '../src/app/sweepPathHistoryEdit';
import type {Ctx} from '../src/app/commands';
import {emptyDoc,withNode,type StudioDoc,type ModelNode} from '../src/engine/doc';
import {emptyDirect,importSource} from '../src/engine/direct';
import {toPartDocument} from '../src/engine/part';
import {encodeStudioFile,readStudioFile} from '../src/engine/container';
const source=(x:number,h:number,unit='mm')=>`@model rail { version: 0; length-unit: ${unit}; @curve #line { type: nurbs; degree: 1; knots: [0,0,1,1]; control-points: [[${x},0,0],[${x},0,${h}]]; weights: [1,1]; } }`;
function fixture(){const direct=importSource(importSource(emptyDirect(),source(0,32),'Rail A'),source(30,22),'Rail B');return withNode(withNode({...emptyDoc(),direct},{kind:'sketch',profile:'circle',center:[9,7],radius:3}),{kind:'sweep-curve',sketch:0,name:'Saved A',mode:'exact-straight',path:{degree:1,knots:[0,0,1,1],controlPoints:[[0,0,0],[0,0,32]],weights:[1,1]}});}
const ctx=(doc:StudioDoc):Ctx=>({doc,bodies:[],selection:{bodies:[],faces:[],edges:[]}});
function command(d:StudioDoc){const c=sweepPathHistoryEdit(d,1);assert.ok(c?.build&&c.fields);return c;}
function build(d:StudioDoc,id=d.direct!.objects[1].id){return command(d).build!(ctx(d),{path:id});}
const near=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-7,`${a} != ${b}`);
function oracle(d:StudioDoc,x:number,h:number){const outputs=evaluateCadPart(toPartDocument(d)).outputs;assert.equal(outputs.length,1);const out=outputs[0];assert.equal(checkBrep(out.brep,{strict:true}).valid,true);assert.equal(out.brep.bodies.length,1);const mass=massPropertiesOf(out);near(mass.volume,9*Math.PI*h);[x,0,h/2].forEach((v,i)=>near(mass.centroid[i],v));const cylinders=out.brep.faces.map(faceGeometry).filter(g=>g.kind==='cylinder');assert.ok(cylinders.length);for(const c of cylinders){near(c.r,3);near(Math.abs(c.a[2]),1);}for(const p of out.brep.vertices.map(v=>v.point)){near(Math.hypot(p[0]-x,p[1]),3);assert.ok(Math.abs(p[2])<1e-7||Math.abs(p[2]-h)<1e-7);}}
test('path and name copy alone changes native placement and length; source stays untouched through file replay',async()=>{
 const d=fixture(),before=structuredClone(d),next=build(d);oracle(d,0,32);oracle(next,30,22);assert.equal(next.nodes[0],d.nodes[0]);assert.equal(next.direct,d.direct);assert.equal(next.outputs,d.outputs);assert.equal(next.nextId,d.nextId);const n=next.nodes[1],old=d.nodes[1];assert.ok(n.kind==='sweep-curve'&&old.kind==='sweep-curve');assert.deepEqual({...n,name:old.name,path:old.path},old);assert.notEqual(n.path,old.path);assert.deepEqual(d,before);assert.equal(build(d,''),d);
 const open=await readStudioFile(encodeStudioFile(next));assert.ok('doc'in open);assert.deepEqual(open.doc,JSON.parse(JSON.stringify(next)));oracle(open.doc,30,22);
});
test('saved path is independent when its original Direct source later changes',()=>{
 const d=fixture(),a=d.direct!.objects[0];d.direct!.sources[a.source]=source(10,45);const before=structuredClone(d);oracle(d,0,32);assert.equal(build(d,''),d);oracle(build(d),30,22);assert.deepEqual(d,before);
});
test('hidden, trimmed, ambiguous, non-mm candidates are excluded',()=>{
 for(const change of ['hidden','trim','duplicate','unit','metadata','missing']){
  const d=fixture(),b=d.direct!.objects[1];
  if(change==='hidden')b.hidden=true;
  if(change==='trim')b.trims=[];
  if(change==='duplicate')d.direct!.objects.push({...b});
  if(change==='unit')d.direct!.sources[b.source]=source(30,22,'cm');
  if(change==='metadata')Object.assign(b,{transform:{}});
  if(change==='missing')delete d.direct!.sources[b.source];
  const c=command(d),f=c.fields!(ctx(d))[0];assert.ok(f.kind==='choice');assert.equal(f.options.some(o=>o.value===b.id),false,change);assert.throws(()=>c.build!(ctx(d),{path:b.id}));
 }
});
test('captured owner and source revision, unknown choice and invalid original cannot change saved document',()=>{
 const d=fixture(),c=command(d),before=structuredClone(d);assert.throws(()=>c.build!(ctx(structuredClone(d)),{path:''}));assert.throws(()=>c.build!(ctx(d),{path:'missing'}));assert.deepEqual(d,before);d.direct!.objects[1].name='Changed';assert.throws(()=>c.build!(ctx(d),{path:''}));
 const invalid=fixture();const n=invalid.nodes[1];assert.ok(n.kind==='sweep-curve');n.path.controlPoints[1]=[0,0,0];const frozen=structuredClone(invalid);assert.throws(()=>build(invalid));assert.deepEqual(invalid,frozen);
});
test('metadata consumers and nonplain profiles or downstream nodes do not receive the command',()=>{
 const d=fixture(),patch=(i:number,p:object):StudioDoc=>({...d,nodes:d.nodes.map((n,j)=>i===j?{...n,...p} as ModelNode:n)});
 for(const bad of [{...d,instances:[]},{...d,drawing:{} as StudioDoc['drawing']},{...d,nodes:[...d.nodes,d.nodes[0]]},patch(0,{radius:{parameter:'R'}}),patch(0,{association:{}}),patch(0,{plane:{}}),patch(1,{made:{}}),patch(1,{mode:undefined}),patch(1,{routeBundleMember:{}}),patch(1,{id:'n0'})])assert.equal(sweepPathHistoryEdit(bad,1),null);
});
test('structurally safe nonstraight and zero-length curves stay selectable but native preview refuses without mutation',()=>{
 for(const text of [source(30,0),`@model bent { version: 0; length-unit: mm; @curve #line { type: nurbs; degree: 2; knots: [0,0,0,1,1,1]; control-points: [[30,0,0],[35,0,11],[30,0,22]]; weights: [1,1,1]; } }`]){
  const d=fixture(),b=d.direct!.objects[1];d.direct!.sources[b.source]=text;const before=structuredClone(d),c=command(d),f=c.fields!(ctx(d))[0];
  assert.ok(f.kind==='choice');assert.ok(f.options.some(o=>o.value===b.id));assert.throws(()=>c.build!(ctx(d),{path:b.id}));assert.deepEqual(d,before);
 }
});
