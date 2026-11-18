import test from 'node:test';
import assert from 'node:assert/strict';
import { rectanglePart, type StudioDoc } from '../src/engine/doc';
import { evaluateDoc } from '../src/engine/evaluate';
import { signaturesOf } from '../src/engine/rematch';
import { toSig } from '../src/engine/references';
import { filletRadiusMode, setFilletRadiusMode } from '../src/app/filletRadiusMode';
function fixture(fractional = false): StudioDoc {
  const doc = rectanglePart(40,30,10);
  if (fractional) { const sk = doc.nodes[0], ex = doc.nodes[1]; assert.ok(sk.kind === 'sketch' && sk.profile === 'rectangle' && ex.kind === 'extrude'); sk.min = [-0,0.123456789]; sk.max = [40.234567891,30.876543219]; ex.from = 0.345678912; }
  const result = evaluateDoc(doc,0); assert.ok(result.ok);
  const name = 'n1.side0|n1.top', sig = signaturesOf(result.bodies[0]).edges.get(name)!;
  return {...doc,nodes:[...doc.nodes,{id:'finish',kind:'fillet',parent:{node:1,side:'solid'},edges:[name],radius:2,sigs:{[name]:toSig(sig)}}]};
}
function change(doc:StudioDoc, mutate:(f:Record<string,any>)=>void) {const nodes=structuredClone(doc.nodes); mutate(nodes[2]); return nodes;}
test('constant and exact equal varying round trip preserves native volume, original document and edge signatures',()=>{
 const doc=fixture(), original=structuredClone(doc), info=filletRadiusMode(doc.nodes,2); assert.equal(info?.mode,'constant');
 const nodes=setFilletRadiusMode(doc.nodes,2,'varying'), f=nodes[2]; assert.ok(f.kind==='fillet'); assert.equal(filletRadiusMode(nodes,2)?.mode,'varying');
 assert.deepEqual(f.radii?.map(p=>p.radius),[2,2]); assert.deepEqual(f.radii?.map(p=>p.at),info?.ends);
 for(const n of [doc.nodes,nodes,setFilletRadiusMode(nodes,2,'constant')]) {const r=evaluateDoc({...doc,nodes:n},1);assert.ok(r.ok);assert.ok(Math.abs(r.bodies[0].volume!-(12000-40*4*(1-Math.PI/4)))<1e-7);}
 assert.deepEqual(setFilletRadiusMode(nodes,2,'constant'),doc.nodes);assert.deepEqual(doc,original);assert.equal(nodes[0],doc.nodes[0]);assert.equal(f.sigs,(doc.nodes[2] as typeof f).sigs);
});
test('fractional endpoints are exact box corners, not rounded signature reconstruction; reversed endpoints and JSON zero work',()=>{
 const doc=fixture(true), nodes=setFilletRadiusMode(doc.nodes,2,'varying'), f=nodes[2];assert.ok(f.kind==='fillet'&&f.radii);
 assert.ok(f.radii[0].at.some(v=>v!==Math.round(v*1e6)/1e6)); f.radii.reverse();assert.equal(filletRadiusMode(nodes,2)?.mode,'varying');
 assert.deepEqual(setFilletRadiusMode(nodes,2,'constant'),doc.nodes);assert.ok(filletRadiusMode(JSON.parse(JSON.stringify(nodes)),2));
 const result=evaluateDoc({...doc,nodes},1);assert.ok(result.ok);
});
test('invalid choices and stale setters preserve nodes; numeric binding and special features excluded',()=>{
 const doc=fixture();for(const value of ['bad',undefined,null,0,'constant'])assert.deepEqual(setFilletRadiusMode(doc.nodes,2,value),doc.nodes);
 for(const mutate of [(f:any)=>f.radius={parameter:'R'},(f:any)=>f.radius=0,(f:any)=>f.radius=NaN,(f:any)=>f.radius=Infinity,(f:any)=>f.radius=10001,(f:any)=>f.held=true,(f:any)=>f.made={},(f:any)=>f.section={kind:'conic',rho:.5},(f:any)=>f.edges.push('other'),(f:any)=>f.parent.node=0]) {
  const nodes=change(doc,mutate), before=structuredClone(nodes);assert.equal(filletRadiusMode(nodes,2),undefined);assert.deepEqual(setFilletRadiusMode(nodes,2,'varying'),before);
 }
 assert.equal(filletRadiusMode(doc.nodes,1),undefined);assert.equal(filletRadiusMode([...doc.nodes,doc.nodes[0]],2),undefined);
});
test('missing, malformed, shared, stale or nonaxis signatures fail closed',()=>{
 const doc=fixture();for(const mutate of [(f:any)=>delete f.sigs,(f:any)=>f.sigs={},(f:any)=>f.sigs.extra=f.sigs[f.edges[0]],(f:any)=>f.sigs[f.edges[0]].n=1,(f:any)=>f.sigs[f.edges[0]].p=null,(f:any)=>f.sigs[f.edges[0]].p[0]+=1,(f:any)=>f.sigs[f.edges[0]].d=[.5,.5,0],(f:any)=>f.sigs[f.edges[0]].s=Infinity])assert.equal(filletRadiusMode(change(doc,mutate),2),undefined);
});
test('unequal, zero, bound, interior, malformed and off-edge stations cannot collapse into constant',()=>{
 const doc=fixture();doc.nodes=setFilletRadiusMode(doc.nodes,2,'varying');
 for(const mutate of [(f:any)=>f.radii[1].radius=3,(f:any)=>f.radii[1].radius=0,(f:any)=>f.radii[1].radius={parameter:'R'},(f:any)=>f.radii.push(f.radii[0]),(f:any)=>f.radii[0].fraction=.2,(f:any)=>delete f.radii[0].atEnd,(f:any)=>f.radii[0].at[0]+=.001,(f:any)=>f.radii[0]=null,(f:any)=>f.radii[1].at=[...f.radii[0].at]]){
 const nodes=change(doc,mutate);assert.equal(filletRadiusMode(nodes,2),undefined);assert.deepEqual(setFilletRadiusMode(nodes,2,'constant'),nodes);
 }
});
test('rounded ambiguity, collapsed and nonfinite boxes are refused; negative direction orders exact endpoints',()=>{
 const doc=fixture(); const nodes=structuredClone(doc.nodes), sk=nodes[0], f=nodes[2];assert.ok(sk.kind==='sketch'&&sk.profile==='rectangle'&&f.kind==='fillet');
 sk.max[1]=1e-8; sk.min[1]=0;assert.equal(filletRadiusMode(nodes,2),undefined);
 const reversed=change(doc,f=>f.sigs[f.edges[0]].d=f.sigs[f.edges[0]].d.map((v:number)=>-v));const a=filletRadiusMode(doc.nodes,2)!,b=filletRadiusMode(reversed,2)!;assert.deepEqual(b.ends,[a.ends[1],a.ends[0]]);
 for(const value of [0,NaN,Infinity]) {const n=structuredClone(doc.nodes);const s=n[0];assert.ok(s.kind==='sketch'&&s.profile==='rectangle');s.max[0]=value;assert.equal(filletRadiusMode(n,2),undefined);}
 const bound=structuredClone(doc.nodes);(bound[1] as any).height={parameter:'H'};assert.equal(filletRadiusMode(bound,2),undefined);
});

import { editFields } from '../src/app/editFields';
import { editCommand } from '../src/app/editCommand';
import type { Ctx } from '../src/app/commands';
test('History offers mode only in base scope; HUD excludes mode display and injected mode changes',()=>{
 const doc=fixture(),f=editFields(doc.nodes,2).find(f=>f.key==='filletRadiusMode');assert.ok(f?.kind==='choice');if(f?.kind!=='choice')throw Error('field');assert.equal(f.get(doc.nodes),'constant');
 assert.deepEqual(f.set(doc.nodes,'varying'),setFilletRadiusMode(doc.nodes,2,'varying'));
 for(const scope of [{direct:{}},{instances:[{}]}])assert.equal(editFields(doc.nodes,2,{},undefined,{doc:scope as StudioDoc}).some(f=>f.key==='filletRadiusMode'),false);
 const command=editCommand(2,doc.nodes,doc);assert.ok(command?.build&&command.fields&&command.defaults);if(!command?.build||!command.fields||!command.defaults)throw Error('command');
 const ctx:Ctx={doc,bodies:[],selection:{faces:[],edges:[],bodies:[]}};assert.equal(command.fields(ctx).some(f=>f.key==='filletRadiusMode'),false);
 assert.deepEqual(command.build(ctx,{...command.defaults(ctx),filletRadiusMode:'varying',r:3}).nodes[2],{...doc.nodes[2],radius:3});
});
